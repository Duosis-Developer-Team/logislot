"""Musteri ticket akisi — tenant semasinda calisan servis katmani.

TEMEL SOZLESME: bu modul merkezi durumu (status/resolution) ASLA kendi
kararlariyla degistirmez. Kullanici komutlari yerel projeksiyon + outbox
satiri olarak AYNI transaction'da yazilir; merkezi sonuc, Hermes'in imzali
olayiyla veya snapshot ile geri gelir. "Iki veritabanini tek dagitik
transaction gibi kabul etmek" acikca yasak mimarilerdendir
(00_SHARED_PLATFORM/03, bolum 9).

Gorunurluk: varsayilan olarak kullanici YALNIZCA kendi actigi ticketlari
gorur. `ticket.view_all` izni olan tenant kullanicisi ayni tenant'in tum
ticketlarini gorur. Tedarikci HER ZAMAN yalnizca kendi taleplerini gorur —
karsiligi olan bir "view_all" izni bilerek YOKTUR.
"""

from __future__ import annotations

import logging
import time
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import get_settings
from app.core.enums import (
    ActorType,
    TicketCategory,
    TicketCommandType,
    TicketDeliveryStatus,
    TicketImpact,
    TicketMessageAuthorType,
    TicketOutboxStatus,
    TicketRequesterType,
    TicketStatus,
)
from app.core.errors import ApiError, ForbiddenError, NotFoundError
from app.integrations import hermes_contract as contract
from app.integrations.hermes_support_client import (
    PEER_SUPPORT_NOT_CONFIGURED,
    HermesApiError,
    get_hermes_client,
)
from app.models import (
    SupportTicketAttachmentProjection,
    SupportTicketMessageProjection,
    SupportTicketOutbox,
    SupportTicketProjection,
)
from app.services.audit import record_audit

logger = logging.getLogger("logislot.ticket")

#: Outbox geri cekilme merdiveni (00_SHARED_PLATFORM/06, bolum 2).
BACKOFF_SECONDS = (10, 30, 120, 600, 1800, 7200)


class TicketFeatureDisabledError(ApiError):
    def __init__(self) -> None:
        super().__init__(
            "TICKET_FEATURE_DISABLED",
            "Destek ticket ozelligi bu kurulumda kapali.",
            403,
        )


class TicketRouteNotReadyError(ApiError):
    def __init__(self, message: str) -> None:
        super().__init__("TICKET_ROUTE_NOT_READY", message, 409)


class TicketStateError(ApiError):
    def __init__(self, message: str) -> None:
        super().__init__("TICKET_STATE_INVALID", message, 409)


# ------------------------------------------------------------- yonlendirme


@dataclass(frozen=True)
class RouteSnapshot:
    """Ticket olusturulurken kullanilacak yonlendirme bilgisi.

    `group_id` ISTEMCIYE GONDERILMEZ; yalnizca gosterim adi paylasilir. Musteri
    grup secmedigi icin tarayicinin grup kimligini bilmesine gerek yoktur ve
    bilmemesi, uydurulmus bir grup ID'siyle istek yapilamamasini garanti eder.
    """

    ready: bool
    group_id: uuid.UUID | None = None
    group_name: str | None = None
    route_version: int | None = None
    verified_at: datetime | None = None
    reason: str | None = None


async def resolve_route(tenant_id: uuid.UUID) -> RouteSnapshot:
    """Tenant'in aktif yonlendirmesini control-plane'den okur."""
    from app.core.db import control_session
    from app.services.ticket_routing_service import get_route_config

    async with control_session() as control_db:
        config = await get_route_config(control_db, tenant_id)
        if config is None:
            return RouteSnapshot(ready=False, reason=contract.ERROR_ROUTE_MISSING)
        if not config.is_active:
            return RouteSnapshot(
                ready=False,
                group_id=config.hermes_group_id,
                group_name=config.hermes_group_name_snapshot,
                route_version=config.route_version,
                reason="route_disabled",
            )
        return RouteSnapshot(
            ready=True,
            group_id=config.hermes_group_id,
            group_name=config.hermes_group_name_snapshot,
            route_version=config.route_version,
            verified_at=config.last_verified_at,
        )


# --------------------------------------------------------------- gorunurluk


@dataclass(frozen=True)
class TicketRequester:
    """Ticket ucundaki kimlik — yonetim kullanicisi veya tedarikci hesabi."""

    type: TicketRequesterType
    id: uuid.UUID
    name: str | None
    email: str | None
    tenant_id: uuid.UUID
    facility_id: uuid.UUID
    can_view_all: bool = False
    can_create: bool = False
    can_comment: bool = False
    supplier_id: uuid.UUID | None = None
    supplier_name: str | None = None

    @property
    def actor_type(self) -> ActorType:
        return (
            ActorType.tenant_user
            if self.type is TicketRequesterType.tenant_user
            else ActorType.supplier_user
        )


def _visibility_filter(requester: TicketRequester):
    """Listelemede uygulanan sahiplik kisiti.

    `view_all` YALNIZCA tenant kullanicisi icindir; tedarikcinin bu izni
    olamaz. Ayrica tedarikci icin kisit `requester_id` degil `supplier_id`
    uzerinden kurulur: ayni firmanin ikinci portal hesabi acildiginda firmanin
    kendi talepleri gorunmez olmamali.
    """
    if requester.type is TicketRequesterType.supplier_user:
        return (
            SupportTicketProjection.requester_type == TicketRequesterType.supplier_user,
            SupportTicketProjection.supplier_id == requester.supplier_id,
        )
    if requester.can_view_all:
        return ()
    return (
        SupportTicketProjection.requester_type == TicketRequesterType.tenant_user,
        SupportTicketProjection.requester_id == requester.id,
    )


# ------------------------------------------------------------------ okuma


async def list_tickets(
    db: AsyncSession,
    requester: TicketRequester,
    *,
    status_group: str | None = None,
    category: str | None = None,
    search: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> tuple[list[SupportTicketProjection], int]:
    filters = [
        SupportTicketProjection.facility_id == requester.facility_id,
        *_visibility_filter(requester),
    ]
    if status_group:
        statuses = STATUS_GROUPS.get(status_group)
        if statuses:
            filters.append(SupportTicketProjection.remote_status.in_(statuses))
    if category:
        filters.append(SupportTicketProjection.category == category)
    if search:
        needle = f"%{search.strip().lower()}%"
        filters.append(
            sa.or_(
                sa.func.lower(SupportTicketProjection.title).like(needle),
                sa.func.lower(
                    sa.func.coalesce(SupportTicketProjection.remote_ticket_number, "")
                ).like(needle),
            )
        )

    total = int(
        (
            await db.execute(
                sa.select(sa.func.count(SupportTicketProjection.id)).where(*filters)
            )
        ).scalar_one()
    )
    rows = (
        (
            await db.execute(
                sa.select(SupportTicketProjection)
                .where(*filters)
                .order_by(SupportTicketProjection.updated_at.desc())
                .limit(min(limit, 100))
                .offset(max(offset, 0))
            )
        )
        .scalars()
        .all()
    )
    return list(rows), total


#: Musteri listesindeki sekmeler -> merkezi statuler.
STATUS_GROUPS: dict[str, tuple[TicketStatus, ...]] = {
    "open": (TicketStatus.open, TicketStatus.reopened),
    "in_progress": (TicketStatus.in_progress,),
    "waiting_customer": (TicketStatus.waiting_customer,),
    "closed": (TicketStatus.resolved, TicketStatus.closed, TicketStatus.cancelled),
}


async def get_ticket(
    db: AsyncSession, requester: TicketRequester, ticket_id: uuid.UUID
) -> SupportTicketProjection:
    """Tek ticket + public konusma. Yetkisiz erisimde 404 (varlik sizdirmaz)."""
    ticket = (
        await db.execute(
            sa.select(SupportTicketProjection)
            .options(
                selectinload(SupportTicketProjection.messages),
                selectinload(SupportTicketProjection.attachments),
            )
            .where(
                SupportTicketProjection.id == ticket_id,
                SupportTicketProjection.facility_id == requester.facility_id,
                *_visibility_filter(requester),
            )
        )
    ).scalar_one_or_none()
    if ticket is None:
        raise NotFoundError("Ticket bulunamadi")
    return ticket


# ---------------------------------------------------------------- yazma


def sanitize_client_context(raw: dict[str, Any] | None) -> dict[str, Any]:
    """Tarayici baglamini ALLOWLIST'ten gecirir.

    Istemci tarafinda da filtre var; buradaki ikinci filtre sart cunku
    istemciye guvenilmez. Query string, cookie, token, form degeri gibi seyler
    listede olmadigi icin gecemez.
    """
    if not isinstance(raw, dict):
        return {}
    cleaned: dict[str, Any] = {}
    for key in contract.CLIENT_CONTEXT_ALLOWED_FIELDS:
        value = raw.get(key)
        if value is None:
            continue
        text = str(value)
        if key == "page_path":
            # Query string ve fragment tasinmaz (00_SHARED_PLATFORM/01).
            text = text.split("?", 1)[0].split("#", 1)[0]
        cleaned[key] = text[:200]
    return cleaned


@dataclass
class TicketCreateInput:
    title: str
    description: str
    category: TicketCategory
    impact: TicketImpact
    reproduction_steps: str | None = None
    expected_result: str | None = None
    actual_result: str | None = None
    error_code: str | None = None
    correlation_id: uuid.UUID | None = None
    occurred_at: datetime | None = None
    client_context: dict[str, Any] | None = None
    attachment_upload_ids: list[uuid.UUID] | None = None


async def create_ticket(
    db: AsyncSession,
    requester: TicketRequester,
    payload: TicketCreateInput,
    *,
    tenant_slug: str | None = None,
    tenant_display_name: str | None = None,
) -> SupportTicketProjection:
    """Yerel ticketi ve giden komutu TEK transaction'da yazar.

    Kullanici acisindan sonuc aninda kesindir: kayit dustuyse komut da
    dusmustur, kayit varsa komut da vardir. Hermes'e gonderim scheduler'in
    isidir; API istegi Hermes'i beklemez.
    """
    if not get_settings().ticketing_enabled:
        raise TicketFeatureDisabledError()
    if not requester.can_create:
        raise ForbiddenError("Ticket olusturma yetkiniz yok")

    route = await resolve_route(requester.tenant_id)
    if not route.ready or route.group_id is None:
        raise TicketRouteNotReadyError(
            "Destek yonlendirmesi henuz yapilandirilmamis; platform yoneticinize basvurun."
        )

    ticket = SupportTicketProjection(
        tenant_id=requester.tenant_id,
        facility_id=requester.facility_id,
        requester_type=requester.type,
        requester_id=requester.id,
        requester_name=requester.name,
        requester_email=requester.email,
        supplier_id=requester.supplier_id,
        supplier_name=requester.supplier_name,
        title=payload.title.strip(),
        description=payload.description.strip(),
        category=payload.category,
        impact=payload.impact,
        reproduction_steps=_clean(payload.reproduction_steps),
        expected_result=_clean(payload.expected_result),
        actual_result=_clean(payload.actual_result),
        error_code=_clean(payload.error_code, limit=120),
        correlation_id=payload.correlation_id,
        occurred_at=payload.occurred_at,
        client_context_json=sanitize_client_context(payload.client_context),
        route_group_id=route.group_id,
        route_group_name=route.group_name,
        route_version=route.route_version,
        remote_status=TicketStatus.open,
        delivery_status=TicketDeliveryStatus.pending,
    )
    db.add(ticket)
    await db.flush()

    # Ilk aciklama bir PUBLIC mesaj olarak da saklanir (sozlesme geregi):
    # boylece konusma zaman cizelgesi bastan tutarlidir.
    initial = SupportTicketMessageProjection(
        ticket_id=ticket.id,
        author_type=TicketMessageAuthorType.requester,
        author_display_name=requester.name,
        body=ticket.description,
        is_pending=True,
        # Zaman ACIKCA verilir: `now()` Postgres'te TRANSACTION baslangicidir,
        # yani ayni transaction'da yazilan iki mesaj ayni damgayi alir ve
        # konusma sirasi belirsizlesirdi.
        created_at=datetime.now(UTC),
    )
    db.add(initial)

    upload_ids = list(dict.fromkeys(payload.attachment_upload_ids or []))
    attachments = await _claim_attachments(db, requester, upload_ids, ticket_id=ticket.id)
    for attachment in attachments:
        attachment.ticket_id = ticket.id

    command = SupportTicketOutbox(
        ticket_id=ticket.id,
        command_type=TicketCommandType.create,
        payload_json=build_create_payload(
            ticket,
            route=route,
            tenant_slug=tenant_slug,
            tenant_display_name=tenant_display_name,
            attachment_upload_ids=upload_ids,
        ),
        correlation_id=payload.correlation_id,
        message_id=initial.id,
        status=TicketOutboxStatus.pending,
        next_attempt_at=datetime.now(UTC),
    )
    db.add(command)

    record_audit(
        db,
        actor_type=requester.actor_type,
        actor_id=requester.id,
        action="ticket.create",
        tenant_id=requester.tenant_id,
        facility_id=requester.facility_id,
        entity_type="support_ticket",
        entity_id=ticket.id,
        metadata={
            "category": ticket.category.value,
            "impact": ticket.impact.value,
            "route_group_id": str(route.group_id),
            "attachment_count": len(upload_ids),
        },
    )
    await db.commit()
    await db.refresh(ticket)
    return ticket


def build_create_payload(
    ticket: SupportTicketProjection,
    *,
    route: RouteSnapshot,
    tenant_slug: str | None,
    tenant_display_name: str | None,
    attachment_upload_ids: list[uuid.UUID],
) -> dict[str, Any]:
    """Hermes `POST /support/tickets` govdesi (sozlesme 04, bolum 6)."""
    return {
        "contract_version": contract.CONTRACT_VERSION,
        "source_ticket_id": str(ticket.id),
        "source_tenant": {
            "id": str(ticket.tenant_id),
            "slug": tenant_slug,
            "display_name": tenant_display_name,
        },
        "route": {
            "group_id": str(route.group_id),
            "route_version": route.route_version,
        },
        "requester": {
            "id": str(ticket.requester_id),
            "display_name": ticket.requester_name,
            "email": ticket.requester_email,
        },
        "title": ticket.title,
        "description": ticket.description,
        "category": ticket.category.value,
        "impact": ticket.impact.value,
        "reproduction_steps": ticket.reproduction_steps,
        "expected_result": ticket.expected_result,
        "actual_result": ticket.actual_result,
        "error_code": ticket.error_code,
        "correlation_id": str(ticket.correlation_id) if ticket.correlation_id else None,
        "occurred_at": _iso(ticket.occurred_at),
        "client_context": ticket.client_context_json or {},
        "attachment_upload_ids": [str(u) for u in attachment_upload_ids],
    }


async def add_public_reply(
    db: AsyncSession,
    requester: TicketRequester,
    ticket_id: uuid.UUID,
    body: str,
    *,
    attachment_upload_ids: list[uuid.UUID] | None = None,
) -> SupportTicketMessageProjection:
    """Musteri yaniti. Metin ASLA kaybolmaz: yerel satir + outbox birlikte yazilir."""
    if not requester.can_comment:
        raise ForbiddenError("Ticketa yanit yazma yetkiniz yok")
    ticket = await get_ticket(db, requester, ticket_id)
    if ticket.remote_status in (TicketStatus.closed, TicketStatus.cancelled):
        raise TicketStateError(
            "Kapatilmis ticketa yanit yazilamaz; yeni bir ticket olusturun."
        )
    if ticket.remote_ticket_id is None:
        raise TicketStateError(
            "Ticket henuz destek merkezine ulasmadi; gonderim tamamlaninca yanit yazabilirsiniz."
        )

    message = SupportTicketMessageProjection(
        ticket_id=ticket.id,
        author_type=TicketMessageAuthorType.requester,
        author_display_name=requester.name,
        body=body.strip(),
        is_pending=True,
        created_at=datetime.now(UTC),
    )
    db.add(message)
    await db.flush()

    upload_ids = list(dict.fromkeys(attachment_upload_ids or []))
    # Yanit yolu create ile AYNI kontrollerden gecer; aksi halde baska bir
    # ticketa bagli bir ek, yanit uzerinden sessizce tasinabilirdi.
    attachments = await _claim_attachments(db, requester, upload_ids, ticket_id=ticket.id)
    for attachment in attachments:
        attachment.ticket_id = ticket.id
        attachment.message_id = message.id

    _enqueue(
        db,
        ticket=ticket,
        command_type=TicketCommandType.public_reply,
        payload={
            "contract_version": contract.CONTRACT_VERSION,
            "source_ticket_id": str(ticket.id),
            "source_message_id": str(message.id),
            "body": message.body,
            "visibility": "public",
            "author": {
                "id": str(requester.id),
                "display_name": requester.name,
                "email": requester.email,
            },
            "attachment_upload_ids": [str(u) for u in upload_ids],
        },
        message_id=message.id,
    )
    record_audit(
        db,
        actor_type=requester.actor_type,
        actor_id=requester.id,
        action="ticket.reply",
        tenant_id=requester.tenant_id,
        facility_id=requester.facility_id,
        entity_type="support_ticket",
        entity_id=ticket.id,
        # Mesaj GOVDESI audit'e kopyalanmaz; kimlik referansi yeterlidir
        # (00_SHARED_PLATFORM/05, bolum 8).
        metadata={"message_id": str(message.id)},
    )
    await db.commit()
    await db.refresh(message)
    return message


async def reopen_ticket(
    db: AsyncSession, requester: TicketRequester, ticket_id: uuid.UUID, reason: str
) -> SupportTicketProjection:
    ticket = await get_ticket(db, requester, ticket_id)
    if not requester.can_comment:
        raise ForbiddenError("Ticketi yeniden acma yetkiniz yok")
    if ticket.remote_status is not TicketStatus.resolved:
        raise TicketStateError("Yalnizca cozulmus bir ticket yeniden acilabilir.")
    if ticket.remote_ticket_id is None:
        raise TicketStateError("Ticket henuz destek merkezine ulasmadi.")

    _enqueue(
        db,
        ticket=ticket,
        command_type=TicketCommandType.reopen,
        payload={
            "contract_version": contract.CONTRACT_VERSION,
            "source_ticket_id": str(ticket.id),
            "reason": reason.strip(),
            "actor": {"id": str(requester.id), "display_name": requester.name},
        },
    )
    record_audit(
        db,
        actor_type=requester.actor_type,
        actor_id=requester.id,
        action="ticket.reopen",
        tenant_id=requester.tenant_id,
        facility_id=requester.facility_id,
        entity_type="support_ticket",
        entity_id=ticket.id,
    )
    await db.commit()
    await db.refresh(ticket)
    return ticket


async def confirm_close_ticket(
    db: AsyncSession, requester: TicketRequester, ticket_id: uuid.UUID
) -> SupportTicketProjection:
    ticket = await get_ticket(db, requester, ticket_id)
    if ticket.remote_status is not TicketStatus.resolved:
        raise TicketStateError("Yalnizca cozulmus bir ticket kapatilabilir.")
    if ticket.remote_ticket_id is None:
        raise TicketStateError("Ticket henuz destek merkezine ulasmadi.")

    _enqueue(
        db,
        ticket=ticket,
        command_type=TicketCommandType.confirm_close,
        payload={
            "contract_version": contract.CONTRACT_VERSION,
            "source_ticket_id": str(ticket.id),
            "actor": {"id": str(requester.id), "display_name": requester.name},
        },
    )
    record_audit(
        db,
        actor_type=requester.actor_type,
        actor_id=requester.id,
        action="ticket.confirm_close",
        tenant_id=requester.tenant_id,
        facility_id=requester.facility_id,
        entity_type="support_ticket",
        entity_id=ticket.id,
    )
    await db.commit()
    await db.refresh(ticket)
    return ticket


async def cancel_ticket(
    db: AsyncSession, requester: TicketRequester, ticket_id: uuid.UUID, reason: str | None
) -> SupportTicketProjection:
    """Talep sahibi, agent cevap vermeden once talebini geri cekebilir."""
    ticket = await get_ticket(db, requester, ticket_id)
    if ticket.remote_status is not TicketStatus.open:
        raise TicketStateError(
            "Destek ekibi calismaya basladiktan sonra talep iptal edilemez."
        )
    if ticket.remote_ticket_id is None:
        raise TicketStateError("Ticket henuz destek merkezine ulasmadi.")
    if ticket.requester_id != requester.id and not requester.can_view_all:
        raise ForbiddenError("Yalnizca kendi talebinizi iptal edebilirsiniz")

    _enqueue(
        db,
        ticket=ticket,
        command_type=TicketCommandType.cancel,
        payload={
            "contract_version": contract.CONTRACT_VERSION,
            "source_ticket_id": str(ticket.id),
            "reason": (reason or "").strip() or None,
            "actor": {"id": str(requester.id), "display_name": requester.name},
        },
    )
    record_audit(
        db,
        actor_type=requester.actor_type,
        actor_id=requester.id,
        action="ticket.cancel",
        tenant_id=requester.tenant_id,
        facility_id=requester.facility_id,
        entity_type="support_ticket",
        entity_id=ticket.id,
    )
    await db.commit()
    await db.refresh(ticket)
    return ticket


def _enqueue(
    db: AsyncSession,
    *,
    ticket: SupportTicketProjection,
    command_type: TicketCommandType,
    payload: dict[str, Any],
    message_id: uuid.UUID | None = None,
) -> SupportTicketOutbox:
    command = SupportTicketOutbox(
        ticket_id=ticket.id,
        message_id=message_id,
        command_type=command_type,
        payload_json=payload,
        correlation_id=ticket.correlation_id,
        status=TicketOutboxStatus.pending,
        next_attempt_at=datetime.now(UTC),
    )
    db.add(command)
    return command


async def _claim_attachments(
    db: AsyncSession,
    requester: TicketRequester,
    upload_ids: list[uuid.UUID],
    *,
    ticket_id: uuid.UUID,
) -> list[SupportTicketAttachmentProjection]:
    """Ek dosyalari dogrular ve sahiplenilebilir halde dondurur.

    Dort kontrol de gereklidir:
      * ADET  — kullanici basina dosya siniri,
      * VARLIK — bilinmeyen upload kimligi kabul edilmez,
      * SAHIPLIK — baska kullanicinin oturumu tenant ici yatay yetki
        yukseltmesi olurdu,
      * BAGLILIK — baska bir ticketa bagli ek TASINAMAZ (aksi halde bir
        yanit, baska bir talebin ekini kendi ustune alabilirdi),
      * TOPLAM BOYUT — `/tickets/config` ile ilan edilen sinir SUNUCUDA da
        zorlanir; yalnizca istemcide zorlanan bir sinir sinir degildir.
    """
    settings = get_settings()
    if len(upload_ids) > settings.ticket_attachment_max_files:
        raise ApiError(
            "TICKET_ATTACHMENT_LIMIT",
            f"En fazla {settings.ticket_attachment_max_files} dosya eklenebilir.",
            400,
        )

    claimed: list[SupportTicketAttachmentProjection] = []
    total_bytes = 0
    for upload_id in upload_ids:
        attachment = (
            await db.execute(
                sa.select(SupportTicketAttachmentProjection).where(
                    SupportTicketAttachmentProjection.upload_id == upload_id
                )
            )
        ).scalar_one_or_none()
        if attachment is None:
            raise ApiError(
                "TICKET_ATTACHMENT_UNKNOWN",
                "Ek dosya oturumu bulunamadi; dosyayi yeniden yukleyin.",
                400,
            )
        if attachment.uploaded_by_id != requester.id:
            raise ForbiddenError("Bu ek dosyaya erisim yetkiniz yok")
        if attachment.ticket_id is not None and attachment.ticket_id != ticket_id:
            raise ApiError(
                "TICKET_ATTACHMENT_IN_USE",
                "Ek dosya baska bir ticketa bagli.",
                409,
            )
        total_bytes += attachment.size_bytes or 0
        claimed.append(attachment)

    if total_bytes > settings.ticket_attachment_max_total_bytes:
        raise ApiError(
            "TICKET_ATTACHMENT_TOTAL_LIMIT",
            "Eklerin toplam boyutu "
            f"{settings.ticket_attachment_max_total_bytes // (1024 * 1024)} MB "
            "sinirini asiyor.",
            400,
        )
    return claimed


def _clean(value: str | None, *, limit: int = 10_000) -> str | None:
    if value is None:
        return None
    text = value.strip()
    return text[:limit] or None


def _iso(value: datetime | None) -> str | None:
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=UTC)
    return value.astimezone(UTC).isoformat().replace("+00:00", "Z")


def next_backoff(attempts: int) -> datetime:
    """Bir sonraki deneme zamani; merdivenin sonunda son adim tekrarlanir."""
    index = min(max(attempts - 1, 0), len(BACKOFF_SECONDS) - 1)
    return datetime.now(UTC) + timedelta(seconds=BACKOFF_SECONDS[index])


# ------------------------------------------------------------------ ekler


#: Hermes'in ek yukleme yetenegi SORULABILIR bir uc degil — yalnizca deneyince
#: ogreniliyor (`support_not_configured`, 503). Gorulunce kisa sure hatirlanir
#: ki ticket formu kullaniciya calismayacak bir alan gostermesin.
#:
#: Elle cevrilecek bir ayar BILEREK yok: boyle bir bayrak Hermes ozelligi
#: acildiginda unutulur ve ekler sessizce kapali kalirdi (Hermes base URL'inde
#: tam olarak bu yasandi). Kayit suresi dolunca yetenek yeniden denenir, yani
#: karsi taraf acinca ekler KENDILIGINDEN geri gelir.
_attachments_unavailable_until: float = 0.0


def attachments_available() -> bool:
    """Hermes yakin zamanda "ek yukleme kapali" demediyse True."""
    return time.monotonic() >= _attachments_unavailable_until


def _remember_attachments_unavailable() -> None:
    global _attachments_unavailable_until
    ttl = get_settings().hermes_support_catalog_ttl_seconds
    _attachments_unavailable_until = time.monotonic() + ttl
    logger.warning(
        "Hermes ek yuklemeyi kabul etmiyor (support_not_configured); "
        "ticket formunda ek alani %s saniye gizlenecek.",
        ttl,
    )


async def create_attachment_session(
    db: AsyncSession,
    requester: TicketRequester,
    *,
    file_name: str,
    size_bytes: int,
    declared_mime_type: str,
    sha256: str | None = None,
) -> dict[str, Any]:
    """Hermes'ten kisa omurlu bir yukleme oturumu alir ve metadatayi kaydeder.

    Tarayiciya donen `upload_url` tek bir nesneye, kisa sureli ve tek islemlik
    izin verir; Hermes SERVICE TOKEN'I tarayiciya hicbir zaman gitmez.
    """
    settings = get_settings()
    if size_bytes > settings.ticket_attachment_max_file_size_bytes:
        raise ApiError(
            "TICKET_ATTACHMENT_TOO_LARGE",
            f"Dosya boyutu en fazla "
            f"{settings.ticket_attachment_max_file_size_bytes // (1024 * 1024)} MB olabilir.",
            400,
        )
    if declared_mime_type not in ALLOWED_ATTACHMENT_MIME_TYPES:
        raise ApiError(
            "TICKET_ATTACHMENT_TYPE",
            "Bu dosya turu desteklenmiyor (PNG, JPEG, WEBP, PDF, TXT, LOG).",
            400,
        )

    client = get_hermes_client()
    try:
        session = await client.create_upload_session(
            source_tenant_id=requester.tenant_id,
            file_name=_safe_file_name(file_name),
            size_bytes=size_bytes,
            declared_mime_type=declared_mime_type,
            sha256=sha256,
        )
    except HermesApiError as exc:
        if exc.code == PEER_SUPPORT_NOT_CONFIGURED:
            _remember_attachments_unavailable()
        raise
    try:
        upload_id = uuid.UUID(str(session["upload_id"]))
    except (KeyError, ValueError, TypeError) as exc:
        raise HermesApiError(
            contract.ERROR_INTEGRATION_UNAVAILABLE,
            "Hermes yukleme oturumu beklenen sekilde degil",
            retryable=True,
        ) from exc

    db.add(
        SupportTicketAttachmentProjection(
            upload_id=upload_id,
            file_name=_safe_file_name(file_name),
            mime_type=declared_mime_type,
            size_bytes=size_bytes,
            uploaded_by_id=requester.id,
        )
    )
    await db.commit()
    return {
        "upload_id": str(upload_id),
        "upload_url": session.get("upload_url"),
        "required_headers": session.get("required_headers") or {},
        "expires_at": session.get("expires_at"),
        "max_size_bytes": session.get("max_size_bytes"),
    }


#: V1 allowlist (00_SHARED_PLATFORM/01, bolum 3). SVG/HTML/script/arsiv YOK.
ALLOWED_ATTACHMENT_MIME_TYPES = frozenset(
    {
        "image/png",
        "image/jpeg",
        "image/webp",
        "application/pdf",
        "text/plain",
    }
)


def _safe_file_name(name: str) -> str:
    """Dosya adini yalnizca GORUNTULEME metadatasi olarak normalize eder.

    Nesne anahtari bu addan turetilmez; yine de path traversal karakterleri
    temizlenir ki ad hicbir yerde yol gibi yorumlanamasin.
    """
    cleaned = name.replace("\\", "/").split("/")[-1]
    cleaned = "".join(ch for ch in cleaned if ch.isprintable() and ch not in '"<>|')
    return (cleaned or "dosya")[:255]


async def complete_attachment(
    db: AsyncSession, requester: TicketRequester, upload_id: uuid.UUID
) -> dict[str, Any]:
    attachment = (
        await db.execute(
            sa.select(SupportTicketAttachmentProjection).where(
                SupportTicketAttachmentProjection.upload_id == upload_id,
                SupportTicketAttachmentProjection.uploaded_by_id == requester.id,
            )
        )
    ).scalar_one_or_none()
    if attachment is None:
        raise NotFoundError("Ek dosya bulunamadi")

    client = get_hermes_client()
    result = await client.complete_upload(upload_id=upload_id)
    status = str(result.get("status") or "").strip()
    from app.core.enums import TicketAttachmentScanStatus

    mapped = {
        "scanning": TicketAttachmentScanStatus.scanning,
        "pending_scan": TicketAttachmentScanStatus.pending_scan,
        "clean": TicketAttachmentScanStatus.clean,
        "rejected": TicketAttachmentScanStatus.rejected,
        "scan_failed": TicketAttachmentScanStatus.scan_failed,
    }.get(status, TicketAttachmentScanStatus.pending_scan)
    attachment.scan_status = mapped
    if result.get("attachment_id"):
        try:
            attachment.remote_attachment_id = uuid.UUID(str(result["attachment_id"]))
        except (ValueError, TypeError):
            pass
    await db.commit()
    return {
        "upload_id": str(upload_id),
        "scan_status": attachment.scan_status.value,
        "file_name": attachment.file_name,
        "size_bytes": attachment.size_bytes,
        "mime_type": attachment.mime_type,
    }


async def attachment_download_url(
    db: AsyncSession, requester: TicketRequester, ticket_id: uuid.UUID, attachment_id: uuid.UUID
) -> str:
    """Yetki kontrolunden SONRA kisa omurlu indirme adresi uretir.

    Once ticket erisimi dogrulanir (get_ticket zaten gorunurluk filtresini
    uygular), sonra Hermes'ten adres istenir. Adres veritabanina YAZILMAZ.
    """
    ticket = await get_ticket(db, requester, ticket_id)
    attachment = next(
        (a for a in ticket.attachments if a.id == attachment_id), None
    )
    if attachment is None or attachment.remote_attachment_id is None:
        raise NotFoundError("Ek dosya bulunamadi")
    from app.core.enums import TicketAttachmentScanStatus

    if attachment.scan_status is not TicketAttachmentScanStatus.clean:
        raise ApiError(
            "TICKET_ATTACHMENT_NOT_READY",
            "Dosya guvenlik kontrolunden gecmedigi icin indirilemiyor.",
            409,
        )
    if ticket.remote_ticket_id is None:
        raise TicketStateError("Ticket henuz destek merkezine ulasmadi.")

    client = get_hermes_client()
    result = await client.attachment_download(
        attachment_id=attachment.remote_attachment_id,
        ticket_id=ticket.remote_ticket_id,
        source_tenant_id=requester.tenant_id,
    )
    url = result.get("download_url")
    if not url:
        raise ApiError(
            "TICKET_ATTACHMENT_NOT_READY", "Indirme adresi alinamadi.", 502
        )
    record_audit(
        db,
        actor_type=requester.actor_type,
        actor_id=requester.id,
        action="ticket.attachment_download",
        tenant_id=requester.tenant_id,
        facility_id=requester.facility_id,
        entity_type="support_ticket_attachment",
        entity_id=attachment.id,
    )
    await db.commit()
    return str(url)
