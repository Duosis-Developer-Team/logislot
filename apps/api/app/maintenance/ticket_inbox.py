"""Webhook inbox isleyicisi ve kurtarma isi (control-plane).

Gelen olay iki adimda islenir ve bu SIRA bilinclidir:

    1. tenant semasinda projeksiyon + bildirim commit edilir,
    2. control-plane'de inbox kaydi `processed` yapilir.

Iki veritabani arasinda atomik transaction OLMADIGI icin arada cokme olabilir.
Ters sirada (once processed, sonra projeksiyon) cokme SESSIZ VERI KAYBI
olurdu: olay islenmis sayilir ama musteri hicbir zaman gormezdi. Bu sirada ise
en kotu ihtimalle olay TEKRAR islenir ve version kontrolu sayesinde no-op olur.
"""

from __future__ import annotations

import logging
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

import sqlalchemy as sa
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import TicketWebhookStatus
from app.core.metrics import record_webhook_event
from app.models import TicketWebhookInbox
from app.services.ticket_projection_service import (
    InternalContentLeakError,
    apply_event,
)

logger = logging.getLogger("logislot.ticket.inbox")
security_logger = logging.getLogger("logislot.security")

#: `processing` durumunda bu sureden uzun kalan kayit dusmus bir surecten
#: kalmistir; kurtarma isi onu tekrar kuyruga alir.
STUCK_AFTER = timedelta(minutes=5)

MAX_ATTEMPTS = 10
BACKOFF_SECONDS = (10, 30, 120, 600, 1800, 7200)


async def process_inbox_row(control_db: AsyncSession, row: TicketWebhookInbox) -> str:
    """Tek bir inbox kaydini isler ve sonucu (`applied|noop|...`) dondurur."""
    from app.core.db import location_for_tenant, session_scope

    if row.source_tenant_id is None:
        return await _fail(control_db, row, "source_tenant_unknown", permanent=True)

    row.status = TicketWebhookStatus.processing
    row.locked_at = datetime.now(UTC)
    row.attempts += 1
    await control_db.commit()

    payload = row.payload_json or {}
    data = payload.get("data") if isinstance(payload.get("data"), dict) else {}

    try:
        location = await location_for_tenant(row.source_tenant_id)
        async with session_scope(location) as tenant_db:
            result = await apply_event(
                tenant_db,
                event_id=row.event_id,
                event_type=row.event_type,
                source_ticket_id=row.source_ticket_id,
                remote_ticket_id=row.remote_ticket_id,
                remote_ticket_number=row.remote_ticket_number,
                aggregate_version=row.aggregate_version,
                occurred_at=row.occurred_at,
                data=data,
            )
            # ADIM 1: tenant tarafi kalici hale gelir.
            await tenant_db.commit()
    except InternalContentLeakError as exc:
        # Hermes'in gondermemesi gereken bir icerik geldi. Kaydi kalici olarak
        # reddediyoruz; sessizce uygulamak sizinti olurdu.
        security_logger.error(
            "Ticket olayi ic icerik tasidigi icin reddedildi: event=%s alan=%s",
            row.event_id,
            exc,
        )
        record_webhook_event("rejected_internal_content")
        return await _fail(control_db, row, "internal_content_rejected", permanent=True)
    except Exception as exc:  # noqa: BLE001 - tek olay tum kuyrugu dusurmesin
        logger.exception("Webhook olayi islenemedi: %s", row.event_id)
        record_webhook_event("error")
        return await _fail(control_db, row, type(exc).__name__.lower()[:64])

    # ADIM 2: control-plane kaydi kapanir.
    row.status = TicketWebhookStatus.processed
    row.processed_at = datetime.now(UTC)
    row.locked_at = None
    row.last_error_code = None
    if result.ticket_id is not None and row.source_ticket_id is None:
        row.source_ticket_id = result.ticket_id
    await control_db.commit()
    record_webhook_event(result.outcome)
    return result.outcome


async def _fail(
    control_db: AsyncSession,
    row: TicketWebhookInbox,
    code: str,
    *,
    permanent: bool = False,
) -> str:
    row.last_error_code = code[:64]
    row.locked_at = None
    if permanent or row.attempts >= MAX_ATTEMPTS:
        row.status = TicketWebhookStatus.dead
    else:
        row.status = TicketWebhookStatus.failed
        index = min(max(row.attempts - 1, 0), len(BACKOFF_SECONDS) - 1)
        row.next_attempt_at = datetime.now(UTC) + timedelta(seconds=BACKOFF_SECONDS[index])
    await control_db.commit()
    return "failed"


async def recover_inbox(control_db: AsyncSession, *, limit: int = 50) -> dict[str, Any]:
    """Takilmis/yeniden denenecek olaylari isler (scheduler isi)."""
    now = datetime.now(UTC)
    stuck_cutoff = now - STUCK_AFTER

    await control_db.execute(
        sa.update(TicketWebhookInbox)
        .where(
            TicketWebhookInbox.status == TicketWebhookStatus.processing,
            TicketWebhookInbox.locked_at.is_not(None),
            TicketWebhookInbox.locked_at < stuck_cutoff,
        )
        .values(status=TicketWebhookStatus.received, locked_at=None)
    )
    await control_db.commit()

    rows = (
        (
            await control_db.execute(
                sa.select(TicketWebhookInbox)
                .where(
                    TicketWebhookInbox.status.in_(
                        [TicketWebhookStatus.received, TicketWebhookStatus.failed]
                    ),
                    sa.or_(
                        TicketWebhookInbox.next_attempt_at.is_(None),
                        TicketWebhookInbox.next_attempt_at <= now,
                    ),
                )
                .order_by(TicketWebhookInbox.received_at)
                .limit(limit)
            )
        )
        .scalars()
        .all()
    )
    outcomes: dict[str, int] = {}
    for row in rows:
        outcome = await process_inbox_row(control_db, row)
        outcomes[outcome] = outcomes.get(outcome, 0) + 1
    return {"processed": len(rows), "metadata": outcomes}


async def record_event(
    control_db: AsyncSession,
    *,
    envelope: dict[str, Any],
) -> tuple[TicketWebhookInbox, bool]:
    """Olayi inbox'a yazar. Ikinci deger: kayit YENI mi (False = replay).

    `event_id` UNIQUE oldugu icin replay ikinci bir satir uretmez; cagiran
    yine 2xx doner (Hermes bosuna retry etmesin) ama isleme yapilmaz.
    """
    event_id = uuid.UUID(str(envelope["event_id"]))
    existing = (
        await control_db.execute(
            sa.select(TicketWebhookInbox).where(TicketWebhookInbox.event_id == event_id)
        )
    ).scalar_one_or_none()
    if existing is not None:
        return existing, False

    row = TicketWebhookInbox(
        event_id=event_id,
        application_code=str(envelope.get("application_code") or "")[:50],
        source_tenant_id=_uuid(envelope.get("source_tenant_id")),
        source_ticket_id=_uuid(envelope.get("source_ticket_id")),
        remote_ticket_id=_uuid(envelope.get("ticket_id")),
        remote_ticket_number=(
            str(envelope["ticket_number"])[:40] if envelope.get("ticket_number") else None
        ),
        event_type=str(envelope.get("event_type") or "")[:80],
        aggregate_version=_int(envelope.get("aggregate_version")),
        sequence=_int(envelope.get("sequence")),
        occurred_at=_dt(envelope.get("occurred_at")),
        correlation_id=_uuid(envelope.get("correlation_id")),
        payload_json=envelope,
        status=TicketWebhookStatus.received,
    )
    control_db.add(row)
    try:
        await control_db.commit()
    except IntegrityError:
        # Ayni olay ES ZAMANLI iki istekle geldi (Hermes retry'i ile ilk
        # teslimat yarisabilir). SELECT-sonra-INSERT yarisi UNIQUE kisitiyla
        # kapanir; burada kaybeden taraf mevcut satiri okuyup replay gibi
        # davranir. Aksi halde istek 500 doner ve Hermes bosuna tekrar dener.
        await control_db.rollback()
        existing = (
            await control_db.execute(
                sa.select(TicketWebhookInbox).where(TicketWebhookInbox.event_id == event_id)
            )
        ).scalar_one()
        return existing, False
    await control_db.refresh(row)
    return row, True


def _uuid(value: Any) -> uuid.UUID | None:
    if value in (None, ""):
        return None
    try:
        return uuid.UUID(str(value))
    except (ValueError, TypeError):
        return None


def _int(value: Any) -> int | None:
    return value if isinstance(value, int) else None


def _dt(value: Any) -> datetime | None:
    if not isinstance(value, str) or not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=UTC)
