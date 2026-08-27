"""Giden ticket komutlarinin Hermes'e teslimi (outbox dispatcher).

Bu is TENANT BASINA kosar; komutlar tenant semasindaki `support_ticket_outbox`
tablosundadir. Teslimat garantisi "en az bir kez + idempotent tuketici"dir:
ayni komut iki kez gonderilebilir, fakat `Idempotency-Key` ve sabit
`source_ticket_id` sayesinde Hermes'te ikinci bir ticket OLUSMAZ.

Hata siniflandirmasi bilerek uc kategoridir:
  * retryable      -> geri cekilme merdiveniyle tekrar denenir,
  * route kurtarma -> platform yoneticisinin route'u tazelemesi beklenir;
                      tazelendiginde AYNI ticket, YENI bir idempotency key ile
                      gonderilir (source_ticket_id degismez),
  * kalici         -> dead-letter; operator inceler, sessizce yutulmaz.
"""

from __future__ import annotations

import logging
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.enums import (
    TicketCommandType,
    TicketDeliveryStatus,
    TicketOutboxStatus,
    TicketStatus,
)
from app.core.metrics import record_ticket_delivery
from app.integrations import hermes_contract as contract
from app.integrations.hermes_support_client import HermesApiError, get_hermes_client
from app.models import SupportTicketOutbox, SupportTicketProjection
from app.services.ticket_projection_service import mark_pending_messages_sent
from app.services.ticket_service import build_create_payload, next_backoff, resolve_route

logger = logging.getLogger("logislot.ticket.delivery")

#: Bir kosumda islenecek en fazla komut — uzun tutulan bir transaction ve
#: Hermes'e ani yuk binmesi engellenir.
BATCH_SIZE = 25

#: Bu sureden uzun "delivering" kalan satir dusmus bir surecten kalmistir.
STUCK_AFTER = timedelta(minutes=10)


async def deliver_pending(db: AsyncSession, *, limit: int = BATCH_SIZE) -> dict[str, Any]:
    """Zamani gelmis komutlari gonderir. Sonuc ozeti maintenance_runs'a yazilir."""
    settings = get_settings()
    if not settings.ticketing_enabled:
        return {"processed": 0, "metadata": {"skipped": "feature_disabled"}}

    await _release_stuck(db)

    rows = await _claim_batch(db, limit=limit)
    if not rows:
        return {"processed": 0, "metadata": {"sent": 0, "failed": 0, "dead": 0}}

    client = get_hermes_client()
    if not client.configured:
        # Yapilandirma eksikse denemeye bile gerek yok: satirlari kuyruga geri
        # birakip cikmak, log firtinasindan ve gereksiz baglanti
        # denemelerinden iyidir. Deneme sayaci da geri alinir — yapilandirma
        # eksikligi bir TESLIMAT DENEMESI degildir ve satiri dead-letter'a
        # dogru itmemelidir.
        now = datetime.now(UTC)
        for row in rows:
            row.status = TicketOutboxStatus.pending
            row.attempts = max(row.attempts - 1, 0)
            row.locked_at = None
            row.last_error_code = contract.ERROR_INTEGRATION_UNAVAILABLE
            row.next_attempt_at = now + timedelta(minutes=5)
        await db.commit()
        return {
            "processed": 0,
            "metadata": {"skipped": "hermes_not_configured", "pending": len(rows)},
        }

    summary = {"sent": 0, "failed": 0, "dead": 0, "route_blocked": 0}
    for row in rows:
        outcome = await _deliver_one(db, row, client)
        summary[outcome] = summary.get(outcome, 0) + 1
    return {"processed": summary["sent"], "metadata": summary}


async def _claim_batch(
    db: AsyncSession, *, limit: int
) -> list[SupportTicketOutbox]:
    """Zamani gelmis satirlari TEK transaction'da sahiplenir.

    Postgres'te `FOR UPDATE SKIP LOCKED` kullanilir: es zamanli iki dispatcher
    ayni satiri ASLA almaz. Bu, scheduler'in advisory kilidine ek DEGIL,
    ondan BAGIMSIZ bir garantidir — kilit transaction kapsamlidir ve is
    icindeki ilk commit'te duser (rolling update sirasinda iki pod kisa sure
    ust uste biner). Sahiplenme, satirin kendi durumuyla yapilir.

    SQLite'ta (test paketi) satir kilidi yoktur; orada tek surec kostugu icin
    durum degisikligi zaten yeterlidir.
    """
    now = datetime.now(UTC)
    query = (
        sa.select(SupportTicketOutbox)
        .where(
            SupportTicketOutbox.status.in_(
                [TicketOutboxStatus.pending, TicketOutboxStatus.failed]
            ),
            sa.or_(
                SupportTicketOutbox.next_attempt_at.is_(None),
                SupportTicketOutbox.next_attempt_at <= now,
            ),
        )
        .order_by(SupportTicketOutbox.created_at)
        .limit(limit)
    )
    if db.bind is not None and db.bind.dialect.name == "postgresql":
        query = query.with_for_update(skip_locked=True)

    rows = list((await db.execute(query)).scalars().all())
    for row in rows:
        row.status = TicketOutboxStatus.delivering
        row.locked_at = now
        row.attempts += 1
    await db.commit()
    return rows


async def _release_stuck(db: AsyncSession) -> None:
    """Dusmus bir surecin kilitledigi satirlari tekrar kuyruga alir."""
    cutoff = datetime.now(UTC) - STUCK_AFTER
    await db.execute(
        sa.update(SupportTicketOutbox)
        .where(
            SupportTicketOutbox.status == TicketOutboxStatus.delivering,
            SupportTicketOutbox.locked_at.is_not(None),
            SupportTicketOutbox.locked_at < cutoff,
        )
        .values(status=TicketOutboxStatus.pending, locked_at=None, locked_by=None)
    )
    await db.commit()


async def _deliver_one(db: AsyncSession, row: SupportTicketOutbox, client) -> str:
    ticket = (
        await db.execute(
            sa.select(SupportTicketProjection).where(
                SupportTicketProjection.id == row.ticket_id
            )
        )
    ).scalar_one_or_none()
    if ticket is None:
        row.status = TicketOutboxStatus.dead
        row.dead_at = datetime.now(UTC)
        row.last_error_code = "ticket_missing"
        await db.commit()
        return "dead"

    # Satir `_claim_batch` icinde zaten sahiplenildi (status/locked_at/attempts).
    if row.command_type is TicketCommandType.create:
        ticket.delivery_status = TicketDeliveryStatus.delivering
        await db.commit()

    try:
        if row.command_type is TicketCommandType.create:
            await _refresh_route_payload(db, row, ticket)
        response = await _send(client, row, ticket)
    except HermesApiError as exc:
        record_ticket_delivery("outgoing", "failure")
        return await _handle_error(db, row, ticket, exc)

    record_ticket_delivery("outgoing", "success")
    await _apply_success(db, row, ticket, response)
    return "sent"


async def _send(client, row: SupportTicketOutbox, ticket: SupportTicketProjection) -> dict:
    payload = dict(row.payload_json or {})
    correlation = row.correlation_id
    if row.command_type is TicketCommandType.create:
        return await client.create_ticket(
            payload, idempotency_key=row.command_id, correlation_id=correlation
        )

    if ticket.remote_ticket_id is None:
        # Komut sirasi bozulmus: yanit/reopen create'ten once gonderilemez.
        raise HermesApiError(
            contract.ERROR_INTEGRATION_UNAVAILABLE,
            "Ticket henuz merkezde olusmadi",
            retryable=True,
        )

    kwargs = {
        "ticket_id": ticket.remote_ticket_id,
        "payload": payload,
        "idempotency_key": row.command_id,
        "correlation_id": correlation,
    }
    if row.command_type is TicketCommandType.public_reply:
        return await client.add_public_message(**kwargs)
    if row.command_type is TicketCommandType.reopen:
        return await client.reopen_ticket(**kwargs)
    if row.command_type is TicketCommandType.confirm_close:
        return await client.confirm_close_ticket(**kwargs)
    if row.command_type is TicketCommandType.cancel:
        return await client.cancel_ticket(**kwargs)
    raise HermesApiError("unsupported_command", str(row.command_type), retryable=False)


async def _refresh_route_payload(
    db: AsyncSession, row: SupportTicketOutbox, ticket: SupportTicketProjection
) -> None:
    """Create komutunu gondermeden once route'u tazeler.

    Route degistiyse payload guncellenir VE idempotency key yenilenir; boylece
    Hermes yeni bir komut goruр eski (bayat) route'u tekrar reddetmez. Ticketin
    icerigi ve `source_ticket_id` DEGISMEZ — duplicate riski Hermes'in kaynak
    tekilligiyle kapatilir.
    """
    route = await resolve_route(ticket.tenant_id)
    if not route.ready or route.group_id is None:
        raise HermesApiError(
            contract.ERROR_ROUTE_MISSING,
            "Tenant icin aktif yonlendirme yok",
            retryable=False,
        )
    payload = dict(row.payload_json or {})
    current = payload.get("route") or {}
    if (
        str(current.get("group_id")) == str(route.group_id)
        and current.get("route_version") == route.route_version
    ):
        return

    tenant_slug, tenant_display = await _tenant_identity(ticket.tenant_id)
    upload_ids = [
        uuid.UUID(str(u)) for u in (payload.get("attachment_upload_ids") or [])
    ]
    row.payload_json = build_create_payload(
        ticket,
        route=route,
        tenant_slug=tenant_slug,
        tenant_display_name=tenant_display,
        attachment_upload_ids=upload_ids,
    )
    row.command_id = uuid.uuid4()
    ticket.route_group_id = route.group_id
    ticket.route_group_name = route.group_name
    ticket.route_version = route.route_version
    logger.info(
        "Ticket %s icin yonlendirme tazelendi; yeni idempotency anahtari uretildi",
        ticket.id,
    )
    await db.commit()


async def _tenant_identity(tenant_id: uuid.UUID) -> tuple[str | None, str | None]:
    from app.core.db import control_session
    from app.models import Tenant

    async with control_session() as control_db:
        tenant = (
            await control_db.execute(sa.select(Tenant).where(Tenant.id == tenant_id))
        ).scalar_one_or_none()
        if tenant is None:
            return None, None
        return tenant.slug, (tenant.display_name or tenant.commercial_name)


async def _apply_success(
    db: AsyncSession,
    row: SupportTicketOutbox,
    ticket: SupportTicketProjection,
    response: dict[str, Any],
) -> None:
    now = datetime.now(UTC)
    row.status = TicketOutboxStatus.sent
    row.sent_at = now
    row.locked_at = None
    row.last_error_code = None
    row.last_error_message = None

    if row.command_type is TicketCommandType.create:
        ticket.remote_ticket_id = _uuid(response.get("ticket_id")) or ticket.remote_ticket_id
        number = response.get("ticket_number")
        if number:
            ticket.remote_ticket_number = str(number)[:40]
        ticket.remote_status = _status(response.get("status"), ticket.remote_status)
        ticket.remote_created_at = _dt(response.get("created_at")) or now
        version = response.get("version")
        if isinstance(version, int):
            ticket.aggregate_version = max(ticket.aggregate_version or 0, version)
        group = response.get("assigned_group") or {}
        if isinstance(group, dict) and group.get("name"):
            ticket.route_group_name = str(group["name"])[:255]
        ticket.delivery_status = TicketDeliveryStatus.synced
        await mark_pending_messages_sent(db, ticket.id)

    elif row.command_type is TicketCommandType.public_reply:
        await _finish_reply(db, row, _uuid(response.get("message_id")))

    ticket.last_sync_at = now
    ticket.last_sync_error_code = None
    await db.commit()


async def _finish_reply(
    db: AsyncSession, row: SupportTicketOutbox, remote_message_id: uuid.UUID | None
) -> None:
    from app.models import SupportTicketMessageProjection

    if row.message_id is None:
        return
    values: dict[str, Any] = {"is_pending": False}
    if remote_message_id is not None:
        values["remote_message_id"] = remote_message_id
    await db.execute(
        sa.update(SupportTicketMessageProjection)
        .where(SupportTicketMessageProjection.id == row.message_id)
        .values(**values)
    )


async def _handle_error(
    db: AsyncSession,
    row: SupportTicketOutbox,
    ticket: SupportTicketProjection,
    exc: HermesApiError,
) -> str:
    settings = get_settings()
    now = datetime.now(UTC)
    row.locked_at = None
    row.last_error_code = exc.code[:64]
    row.last_error_message = exc.message[:500]
    ticket.last_sync_error_code = exc.code[:64]
    ticket.last_sync_at = now

    if exc.code in contract.ROUTE_RECOVERY_ERROR_CODES:
        # Kurtarma yolu: retry firtinasi degil, insan aksiyonu bekleniyor.
        # Komut kuyrukta KALIR; route tazelendikten sonra bir sonraki
        # kosumda yeni idempotency anahtariyla gonderilir.
        row.status = TicketOutboxStatus.failed
        row.next_attempt_at = now + timedelta(minutes=15)
        ticket.delivery_status = TicketDeliveryStatus.failed
        await _record_route_error(ticket.tenant_id, exc.code)
        await db.commit()
        return "route_blocked"

    if exc.code == contract.ERROR_IDEMPOTENCY_CONFLICT:
        # Ayni anahtarla FARKLI govde gonderilmis. Tekrar denemek ayni sonucu
        # verir; elle inceleme gerekir ve yeni ticket URETILMEZ.
        row.status = TicketOutboxStatus.dead
        row.dead_at = now
        ticket.delivery_status = TicketDeliveryStatus.failed
        await db.commit()
        return "dead"

    if not exc.retryable or row.attempts >= settings.ticket_outbox_max_attempts:
        row.status = TicketOutboxStatus.dead
        row.dead_at = now
        ticket.delivery_status = TicketDeliveryStatus.failed
        await db.commit()
        return "dead"

    row.status = TicketOutboxStatus.failed
    row.next_attempt_at = next_backoff(row.attempts)
    ticket.delivery_status = (
        TicketDeliveryStatus.retrying
        if row.command_type is TicketCommandType.create
        else ticket.delivery_status
    )
    await db.commit()
    return "failed"


async def _record_route_error(tenant_id: uuid.UUID, error_code: str) -> None:
    from app.core.db import control_session
    from app.services.ticket_routing_service import mark_route_error

    try:
        async with control_session() as control_db:
            await mark_route_error(control_db, tenant_id=tenant_id, error_code=error_code)
    except Exception:  # noqa: BLE001 - saglik isaretlemesi teslimati dusurmemeli
        logger.exception("Route hatasi control-plane'e islenemedi (tenant=%s)", tenant_id)


def _uuid(value: Any) -> uuid.UUID | None:
    if value in (None, ""):
        return None
    try:
        return uuid.UUID(str(value))
    except (ValueError, TypeError):
        return None


def _status(value: Any, fallback: TicketStatus) -> TicketStatus:
    try:
        return TicketStatus(str(value))
    except ValueError:
        return fallback


def _dt(value: Any) -> datetime | None:
    if not isinstance(value, str) or not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=UTC)
