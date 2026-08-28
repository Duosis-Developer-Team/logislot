"""Hermes olaylarinin ve snapshot'larinin tenant projeksiyonuna uygulanmasi.

BURASI SISTEMIN EN KIRILGAN YERIDIR: olaylar sirasiz gelebilir, tekrar
edilebilir ve iki veritabani arasindaki adim atomik degildir. Uc kural bu
yuzden pazarlik disidir:

  1. Siralama `sequence` ile yapilir — ticket basina OLAY sayaci. Eski/esit
     olay NO-OP'tur; atlanmis olay korlemesine UYGULANMAZ, `sync_gap`
     isaretlenir ve snapshot ile onarilir. "Yanlis durumu gostermektense biraz
     eski durumu gostermek" yeglenir.

     `aggregate_version` SIRALAMA ALANI DEGILDIR: ticket'in optimistic-lock
     surumudur ve olay basina artmaz (ayni surumu tasiyan iki olay normaldir).
     Onu siralamada kullanmak, ayni surumlu ikinci olayi sessizce dusuruyordu.
  2. Bildirim, olay kimliginden TURETILEN sabit bir birincil anahtarla
     uretilir; ayni olay iki kez islenirse ikinci bildirim OLUSMAZ.
  3. Gelen payload'da ic not/gizli icerik izi varsa olay REDDEDILIR ve
     guvenlik logu uretilir. Hermes'in boyle bir sey gondermemesi gerekir;
     gondermesi durumunda sessizce kabul etmek sizinti olurdu.
"""

from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.enums import (
    TicketAttachmentScanStatus,
    TicketDeliveryStatus,
    TicketMessageAuthorType,
    TicketRequesterType,
    TicketStatus,
)
from app.integrations import hermes_contract as contract
from app.models import (
    Notification,
    SupportTicketAttachmentProjection,
    SupportTicketMessageProjection,
    SupportTicketProjection,
)

logger = logging.getLogger("logislot.ticket.projection")
security_logger = logging.getLogger("logislot.security")

#: Bildirim kimliklerini olay kimliginden turetmek icin sabit ad alani.
#: Sabit olmasi sart: surec yeniden basladiginda ayni olay ayni kimligi
#: uretmezse tekrar isleme ikinci bir bildirim dogururdu.
NOTIFICATION_NAMESPACE = uuid.UUID("6f1a4f0e-2c1b-4d9a-9f5e-0a5c7d2b91c4")

#: Musteri payload'inda BULUNMAMASI gereken alan adlari.
FORBIDDEN_PAYLOAD_KEYS = frozenset(
    {
        "internal_note",
        "internal_notes",
        "internal_root_cause",
        "root_cause_internal",
        "agent_notes",
        "internal_priority_reason",
    }
)


class InternalContentLeakError(Exception):
    """Gelen olay musteriye gitmemesi gereken icerik tasiyor."""


@dataclass
class ApplyResult:
    outcome: str  # applied | noop | gap | unknown_event
    ticket_id: uuid.UUID | None = None
    notified: bool = False


def assert_customer_safe(payload: Any, *, path: str = "data") -> None:
    """Payload'i ic-icerik izine karsi tarar (savunma derinligi)."""
    if isinstance(payload, dict):
        for key, value in payload.items():
            lowered = str(key).lower()
            if lowered in FORBIDDEN_PAYLOAD_KEYS:
                raise InternalContentLeakError(f"{path}.{key}")
            if lowered == "visibility" and str(value).lower() == "internal":
                raise InternalContentLeakError(f"{path}.{key}")
            assert_customer_safe(value, path=f"{path}.{key}")
    elif isinstance(payload, list):
        for index, item in enumerate(payload):
            assert_customer_safe(item, path=f"{path}[{index}]")


async def apply_event(
    db: AsyncSession,
    *,
    event_id: uuid.UUID,
    event_type: str,
    source_ticket_id: uuid.UUID | None,
    remote_ticket_id: uuid.UUID | None,
    remote_ticket_number: str | None,
    aggregate_version: int | None,
    sequence: int | None,
    occurred_at: datetime | None,
    data: dict[str, Any],
) -> ApplyResult:
    """Tek bir olayi tenant semasina uygular. COMMIT ETMEZ; cagiran commit'ler."""
    if event_type not in contract.KNOWN_EVENT_TYPES:
        # Bilinmeyen olay tipini reddetmek yerine ACK'liyoruz: sozlesme
        # additive'dir ve eski bir consumer yeni bir olay yuzunden Hermes'in
        # kuyrugunu tikamamalidir.
        logger.info("Bilinmeyen ticket olayi yok sayildi: %s", event_type)
        return ApplyResult("unknown_event")

    assert_customer_safe(data)

    ticket = await _locate_ticket(db, source_ticket_id, remote_ticket_id)
    if ticket is None:
        # Ticket bu tenant semasinda yok. Kaynak uygulama LogiSlot olmayan bir
        # ticket veya yanlis tenant eslemesi olabilir; cagiran bunu
        # `source_tenant_unknown` olarak raporlar.
        return ApplyResult("noop")

    # SIRALAMA `sequence` ILE YAPILIR, `aggregate_version` ILE DEGIL.
    #
    # Zarf iki ayri sayi tasir ve karistirmak veri kaybettirir:
    #   sequence          -> ticket basina OLAY sayaci, her olayda artar
    #   aggregate_version -> ticket'in optimistic-lock surumu, olay basina ARTMAZ
    #
    # Onceden `aggregate_version` kapisi kullaniliyordu. Ayni surumu tasiyan iki
    # olay normaldir (canli: created ve attachment_ready ikisi de 1) ve ikincisi
    # "eski/esit olay" sayilip SESSIZCE dusuyordu — inbox `processed` gorunuyor,
    # musteri destegin yanitini hic gormuyordu.
    #
    # `aggregate_version` yine SAKLANIR: yazma cagrilarindaki `expected_version`
    # icin ticket'in gercek surumudur.
    current = ticket.event_sequence or 0
    if sequence is not None:
        if sequence <= current:
            return ApplyResult("noop", ticket_id=ticket.id)
        if sequence > current + 1:
            ticket.sync_gap = True
            logger.warning(
                "Ticket %s icin olay atlandi (beklenen sequence %s, gelen %s)",
                ticket.id,
                current + 1,
                sequence,
            )
            return ApplyResult("gap", ticket_id=ticket.id)

    _apply_identity(ticket, remote_ticket_id, remote_ticket_number)
    notified = await _apply_payload(db, ticket, event_id, event_type, data, occurred_at)

    if sequence is not None:
        ticket.event_sequence = sequence
    # Lock surumu GERIYE gitmez.
    if aggregate_version is not None and aggregate_version > (
        ticket.aggregate_version or 0
    ):
        ticket.aggregate_version = aggregate_version
    gap_detected = False
    ticket.remote_updated_at = occurred_at or datetime.now(UTC)
    ticket.last_sync_at = datetime.now(UTC)
    ticket.sync_gap = gap_detected
    if ticket.remote_ticket_id is not None:
        ticket.delivery_status = TicketDeliveryStatus.synced
        ticket.last_sync_error_code = None
    return ApplyResult("applied", ticket_id=ticket.id, notified=notified)


async def _locate_ticket(
    db: AsyncSession,
    source_ticket_id: uuid.UUID | None,
    remote_ticket_id: uuid.UUID | None,
) -> SupportTicketProjection | None:
    # Mesaj/ek koleksiyonlari BURADA yuklenir: asenkron oturumda tembel
    # yukleme calismaz ve uygulama mantigi bu koleksiyonlar uzerinde
    # tekrar kontrolu yapar.
    options = (
        selectinload(SupportTicketProjection.messages),
        selectinload(SupportTicketProjection.attachments),
    )
    if source_ticket_id is not None:
        ticket = (
            await db.execute(
                sa.select(SupportTicketProjection)
                .options(*options)
                .where(SupportTicketProjection.id == source_ticket_id)
            )
        ).scalar_one_or_none()
        if ticket is not None:
            return ticket
    if remote_ticket_id is not None:
        return (
            await db.execute(
                sa.select(SupportTicketProjection)
                .options(*options)
                .where(SupportTicketProjection.remote_ticket_id == remote_ticket_id)
            )
        ).scalar_one_or_none()
    return None


def _apply_identity(
    ticket: SupportTicketProjection,
    remote_ticket_id: uuid.UUID | None,
    remote_ticket_number: str | None,
) -> None:
    if remote_ticket_id is not None and ticket.remote_ticket_id is None:
        ticket.remote_ticket_id = remote_ticket_id
    if remote_ticket_number and not ticket.remote_ticket_number:
        ticket.remote_ticket_number = remote_ticket_number[:40]


async def _apply_payload(
    db: AsyncSession,
    ticket: SupportTicketProjection,
    event_id: uuid.UUID,
    event_type: str,
    data: dict[str, Any],
    occurred_at: datetime | None,
) -> bool:
    """Olay tipine gore alanlari gunceller; bildirim uretildiyse True doner."""
    notify: tuple[str, str, str] | None = None  # (type, severity, title)

    if event_type == contract.EVENT_TICKET_CREATED:
        ticket.remote_status = _status(data.get("status"), ticket.remote_status)
        ticket.remote_created_at = _dt(data.get("created_at")) or ticket.remote_created_at
        _apply_group(ticket, data.get("assigned_group"))
        # Ilk aciklamanin "gonderiliyor" rozeti duser: talep artik merkezde.
        await mark_pending_messages_sent(db, ticket.id)
        notify = ("ticket.received", "success", "Destek talebiniz alindi")

    elif event_type == contract.EVENT_TICKET_STATUS_CHANGED:
        previous = ticket.remote_status
        ticket.remote_status = _status(data.get("status"), ticket.remote_status)
        if ticket.remote_status is TicketStatus.waiting_customer:
            notify = (
                "ticket.info_requested",
                "warning",
                "Destek ekibi sizden bilgi bekliyor",
            )
        elif previous is not ticket.remote_status:
            notify = ("ticket.status_changed", "info", "Ticket durumu guncellendi")

    elif event_type == contract.EVENT_TICKET_PUBLIC_MESSAGE_ADDED:
        added = _apply_message(db, ticket, data, occurred_at)
        if added:
            notify = ("ticket.reply", "info", "Destek ekibinden yeni yanit")

    elif event_type == contract.EVENT_TICKET_ASSIGNMENT_CHANGED:
        # Musteri payload'i yalnizca GOSTERIME uygun grup adini tasir; agent
        # kimligi/e-postasi bu kanaldan hic gelmez.
        _apply_group(ticket, data.get("assigned_group"))

    elif event_type == contract.EVENT_TICKET_RESOLVED:
        resolution = data.get("resolution") or {}
        ticket.remote_status = TicketStatus.resolved
        ticket.resolution_summary = _text(resolution.get("summary"))
        ticket.resolution_code = _text(resolution.get("code"), limit=40)
        ticket.resolution_fix_version = _text(resolution.get("fix_version"), limit=120)
        ticket.resolved_at = _dt(resolution.get("resolved_at")) or occurred_at
        ticket.resolved_by_group_name = (
            _text(resolution.get("resolved_by_group_name"), limit=255)
            or ticket.route_group_name
        )
        notify = ("ticket.resolved", "success", "Destek talebiniz cozuldu")

    elif event_type == contract.EVENT_TICKET_REOPENED:
        ticket.remote_status = TicketStatus.reopened
        ticket.closed_at = None
        notify = ("ticket.reopened", "info", "Ticket yeniden acildi")

    elif event_type == contract.EVENT_TICKET_CLOSED:
        ticket.remote_status = TicketStatus.closed
        ticket.closed_at = _dt(data.get("closed_at")) or occurred_at
        notify = ("ticket.closed", "info", "Ticket kapatildi")

    elif event_type == contract.EVENT_TICKET_ATTACHMENT_READY:
        _apply_attachment(db, ticket, data.get("attachment") or {})

    if (
        event_type == contract.EVENT_TICKET_PUBLIC_MESSAGE_ADDED
        and ticket.first_response_at is None
    ):
        author = str((data.get("message") or {}).get("author_type") or "")
        if author == TicketMessageAuthorType.agent.value:
            ticket.first_response_at = occurred_at or datetime.now(UTC)

    if notify is None:
        return False
    return await _notify(db, ticket, event_id, *notify)


def _apply_message(
    db: AsyncSession,
    ticket: SupportTicketProjection,
    data: dict[str, Any],
    occurred_at: datetime | None,
) -> bool:
    """Public mesaji ekler. Bildirim uretilmesi gerekiyorsa True doner.

    Musterinin KENDI mesaji Hermes'ten yankilandiginda yeni satir acilmaz:
    yerel "gonderiliyor" satiri BENIMSENIR (uzak kimlik yazilir, rozet duser).
    Aksi halde kullanici kendi cumlesini ekranda iki kez gorurdu.
    """
    message = data.get("message") or {}
    if str(message.get("visibility") or "public").lower() != "public":
        raise InternalContentLeakError("data.message.visibility")
    remote_id = _uuid(message.get("id"))
    body = _text(message.get("body")) or ""
    if not body:
        return False

    if remote_id is not None:
        for existing in ticket.messages:
            if existing.remote_message_id == remote_id:
                return False

    author_type = _author_type(message.get("author_type"))
    if author_type is TicketMessageAuthorType.requester:
        # Musteri mesajlarinin TAMAMI bizden cikar; dolayisiyla uzaktan gelen
        # her requester mesajinin yerelde bir karsiligi vardir. Once govde
        # esitligi denenir, bulunamazsa (Hermes metni normalize etmis olabilir)
        # baglanmamis EN ESKI yerel mesaj benimsenir. Ikisi de olmazsa yeni
        # satir acilir — mesaji kaybetmektense fazladan gostermek yeglenir.
        unlinked = [
            m
            for m in ticket.messages
            if m.remote_message_id is None
            and m.author_type is TicketMessageAuthorType.requester
        ]
        adopted = next((m for m in unlinked if m.body == body), None)
        if adopted is None:
            # Govde tutmuyorsa YALNIZCA hala "gonderiliyor" olan bir satir
            # benimsenebilir: o satir bizim henuz onaylanmamis komutumuzdur ve
            # kanonik metinle guncellenmesi dogrudur.
            #
            # Onaylanmis satirlar (ozellikle ILK ACIKLAMA) asla benimsenmez:
            # ilk aciklama uzak kimlik almadigi icin daima "baglanmamis"
            # gorunur; onu aday saymak, eslesmeyen her requester mesajinin
            # talebin ozgun metnini EZMESI demekti.
            pending = [m for m in unlinked if m.is_pending]
            if pending:
                adopted = min(pending, key=lambda m: (m.created_at, str(m.id)))
        if adopted is not None:
            adopted.remote_message_id = remote_id
            adopted.is_pending = False
            # Kanonik metin gosterilir: destek ekibi ne goruyorsa musteri de
            # onu gormeli.
            adopted.body = body
            return False

    row = SupportTicketMessageProjection(
        ticket_id=ticket.id,
        remote_message_id=remote_id,
        author_type=author_type,
        author_display_name=_text(message.get("author_display_name"), limit=255),
        body=body,
        body_format=str(message.get("body_format") or "text")[:20],
        aggregate_version=ticket.aggregate_version,
        is_pending=False,
        created_at=_dt(message.get("created_at")) or occurred_at or datetime.now(UTC),
    )
    db.add(row)
    ticket.messages.append(row)
    # Musteri kendi yanitinin yankisini bildirim olarak almamali.
    return author_type is not TicketMessageAuthorType.requester


def _apply_attachment(
    db: AsyncSession, ticket: SupportTicketProjection, data: dict[str, Any]
) -> None:
    if str(data.get("visibility") or "public").lower() != "public":
        raise InternalContentLeakError("data.attachment.visibility")
    upload_id = _uuid(data.get("upload_id"))
    remote_id = _uuid(data.get("id"))
    existing = None
    for row in ticket.attachments:
        if upload_id is not None and row.upload_id == upload_id:
            existing = row
            break
        if remote_id is not None and row.remote_attachment_id == remote_id:
            existing = row
            break
    if existing is None:
        if upload_id is None:
            upload_id = remote_id or uuid.uuid4()
        existing = SupportTicketAttachmentProjection(
            ticket_id=ticket.id,
            upload_id=upload_id,
            file_name=_text(data.get("file_name"), limit=255) or "dosya",
        )
        db.add(existing)
        ticket.attachments.append(existing)
    existing.remote_attachment_id = remote_id or existing.remote_attachment_id
    existing.mime_type = _text(data.get("mime_type"), limit=120) or existing.mime_type
    size = data.get("size_bytes")
    if isinstance(size, int):
        existing.size_bytes = size
    existing.scan_status = _scan_status(data.get("scan_status"), existing.scan_status)


def _apply_group(ticket: SupportTicketProjection, group: Any) -> None:
    if not isinstance(group, dict):
        return
    name = _text(group.get("name"), limit=255)
    if name:
        ticket.route_group_name = name


async def _notify(
    db: AsyncSession,
    ticket: SupportTicketProjection,
    event_id: uuid.UUID,
    notification_type: str,
    severity: str,
    title: str,
) -> bool:
    """Alicisina bir kez bildirim yazar.

    Kimlik `uuid5(namespace, event_id:recipient)` ile TURETILIR: ayni olay
    tekrar islenirse ayni satir hedeflenir ve ikinci bildirim olusmaz.
    """
    recipient_user_id: uuid.UUID | None = None
    recipient_supplier_id: uuid.UUID | None = None
    if ticket.requester_type is TicketRequesterType.tenant_user:
        recipient_user_id = ticket.requester_id
        route_hint = f"/admin/tickets?ticketId={ticket.id}"
    else:
        recipient_supplier_id = ticket.supplier_id
        route_hint = f"/supplier/tickets?ticketId={ticket.id}"

    if recipient_user_id is None and recipient_supplier_id is None:
        return False

    recipient_key = str(recipient_user_id or recipient_supplier_id)
    notification_id = uuid.uuid5(NOTIFICATION_NAMESPACE, f"{event_id}:{recipient_key}")
    already = (
        await db.execute(
            sa.select(Notification.id).where(Notification.id == notification_id)
        )
    ).scalar_one_or_none()
    if already is not None:
        return False

    db.add(
        Notification(
            id=notification_id,
            tenant_id=ticket.tenant_id,
            facility_id=ticket.facility_id,
            recipient_user_id=recipient_user_id,
            recipient_supplier_id=recipient_supplier_id,
            type=notification_type,
            severity=severity,
            title=title,
            body=_notification_body(ticket),
            entity_type="support_ticket",
            entity_id=ticket.id,
            metadata_json={
                "ticket_id": str(ticket.id),
                "ticket_number": ticket.remote_ticket_number,
                "status": ticket.remote_status.value,
                "route_hint": route_hint,
            },
        )
    )
    return True


def _notification_body(ticket: SupportTicketProjection) -> str:
    number = ticket.remote_ticket_number or "Gonderiliyor"
    return f"{number} · {ticket.title}"[:500]


# ------------------------------------------------------------- snapshot


async def apply_snapshot(
    db: AsyncSession, ticket: SupportTicketProjection, snapshot: dict[str, Any]
) -> bool:
    """Hermes snapshot'ini projeksiyona uygular (bosluk onarimi).

    Snapshot OTORITEDIR: public alanlar uzerine yazilir. Yerel teslimat
    metadatasi (outbox durumu, `delivery_status` disindaki yerel alanlar)
    KORUNUR — onlar Hermes'in bilmedigi LogiSlot verisidir.
    """
    assert_customer_safe(snapshot, path="snapshot")
    remote_version = snapshot.get("version") or snapshot.get("aggregate_version")
    if isinstance(remote_version, int) and remote_version < (ticket.aggregate_version or 0):
        return False

    _apply_identity(
        ticket, _uuid(snapshot.get("ticket_id")), _text(snapshot.get("ticket_number"), limit=40)
    )
    ticket.remote_status = _status(snapshot.get("status"), ticket.remote_status)
    ticket.remote_created_at = _dt(snapshot.get("created_at")) or ticket.remote_created_at
    ticket.remote_updated_at = _dt(snapshot.get("updated_at")) or datetime.now(UTC)
    _apply_group(ticket, snapshot.get("assigned_group"))

    resolution = snapshot.get("resolution") or {}
    if resolution:
        ticket.resolution_summary = _text(resolution.get("summary"))
        ticket.resolution_code = _text(resolution.get("code"), limit=40)
        ticket.resolution_fix_version = _text(resolution.get("fix_version"), limit=120)
        ticket.resolved_at = _dt(resolution.get("resolved_at")) or ticket.resolved_at
        ticket.resolved_by_group_name = (
            _text(resolution.get("resolved_by_group_name"), limit=255)
            or ticket.resolved_by_group_name
        )

    for message in snapshot.get("messages") or []:
        _apply_message(db, ticket, {"message": message}, None)
    for attachment in snapshot.get("attachments") or []:
        _apply_attachment(db, ticket, attachment)

    if isinstance(remote_version, int):
        ticket.aggregate_version = remote_version
    ticket.sync_gap = False
    ticket.last_sync_at = datetime.now(UTC)
    ticket.last_sync_error_code = None
    if ticket.remote_ticket_id is not None:
        ticket.delivery_status = TicketDeliveryStatus.synced
    return True


async def mark_pending_messages_sent(
    db: AsyncSession, ticket_id: uuid.UUID, *, message_id: uuid.UUID | None = None
) -> None:
    """Yerel 'gonderiliyor' rozetlerini dusurur (ack veya olay sonrasi)."""
    query = sa.update(SupportTicketMessageProjection).where(
        SupportTicketMessageProjection.ticket_id == ticket_id,
        SupportTicketMessageProjection.is_pending.is_(True),
    )
    if message_id is not None:
        query = query.where(SupportTicketMessageProjection.id == message_id)
    await db.execute(query.values(is_pending=False))


# ------------------------------------------------------------ donusturucu


def _status(value: Any, fallback: TicketStatus) -> TicketStatus:
    """Bilinmeyen status degeri mevcut durumu KORUR.

    Sozlesme enum'a additive yeni deger ekleyebilir; bilinmeyen bir deger
    yuzunden musteriye yanlis bir durum gostermektense son bilineni gostermek
    dogru davranistir (00_SHARED_PLATFORM/04, bolum 13).
    """
    try:
        return TicketStatus(str(value))
    except ValueError:
        if value:
            logger.info("Bilinmeyen ticket status degeri: %s", value)
        return fallback


def _author_type(value: Any) -> TicketMessageAuthorType:
    try:
        return TicketMessageAuthorType(str(value))
    except ValueError:
        return TicketMessageAuthorType.agent


def _scan_status(value: Any, fallback: TicketAttachmentScanStatus) -> TicketAttachmentScanStatus:
    try:
        return TicketAttachmentScanStatus(str(value))
    except ValueError:
        return fallback


def _uuid(value: Any) -> uuid.UUID | None:
    if value in (None, ""):
        return None
    try:
        return uuid.UUID(str(value))
    except (ValueError, TypeError):
        return None


def _dt(value: Any) -> datetime | None:
    if not isinstance(value, str) or not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=UTC)


def _text(value: Any, *, limit: int = 10_000) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text[:limit] or None
