"""Ticket senkronizasyon onarimi — webhook'a TEK BASINA guvenilmez.

Webhook kaybolabilir, sirasiz gelebilir veya LogiSlot kisa sure erisilemez
olabilir. Bu is periyodik olarak Hermes'ten snapshot cekip projeksiyonu
duzeltir. "Sadece webhook'a guvenip reconciliation olmamasi" acikca yasak
mimarilerdendir (00_SHARED_PLATFORM/03, bolum 9).

Secim kriteri bilerek dardir; her kosumda TUM ticketlar taranmaz:
  * `sync_gap` isaretli olanlar (atlanmis olay),
  * merkezi kimligi olmayan ama teslim edilmis gorunenler,
  * uzun suredir guncellenmemis ACIK ticketlar.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta
from typing import Any

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import get_settings
from app.core.enums import TICKET_ACTIVE_STATUSES, TicketDeliveryStatus
from app.core.metrics import record_ticket_delivery
from app.integrations.hermes_support_client import HermesApiError, get_hermes_client
from app.models import SupportTicketProjection
from app.services.ticket_projection_service import apply_snapshot

logger = logging.getLogger("logislot.ticket.reconciliation")

BATCH_SIZE = 20

#: Bu sureden uzun sure guncellenmemis acik ticketlar tazelik kontrolune girer.
STALE_AFTER = timedelta(hours=6)


async def reconcile(db: AsyncSession, *, limit: int = BATCH_SIZE) -> dict[str, Any]:
    settings = get_settings()
    if not settings.ticketing_enabled:
        return {"processed": 0, "metadata": {"skipped": "feature_disabled"}}

    client = get_hermes_client()
    if not client.configured:
        return {"processed": 0, "metadata": {"skipped": "hermes_not_configured"}}

    now = datetime.now(UTC)
    candidates = (
        (
            await db.execute(
                sa.select(SupportTicketProjection)
                .options(
                    selectinload(SupportTicketProjection.messages),
                    selectinload(SupportTicketProjection.attachments),
                )
                .where(
                    sa.or_(
                        # Bosluklu ticket remote kimligi HENUZ BILINMESE de
                        # onarilabilir: snapshot `by-source` ile cekilir ve
                        # yerel kimlik her zaman vardir. `remote_ticket_id`
                        # sarti burada olsaydi, create yanitini VE
                        # `ticket.created.v1` olayini birlikte kaybetmis bir
                        # ticket sonsuza kadar onarilmadan kalirdi.
                        SupportTicketProjection.sync_gap.is_(True),
                        sa.and_(
                            SupportTicketProjection.remote_ticket_id.is_not(None),
                            SupportTicketProjection.remote_status.in_(
                                list(TICKET_ACTIVE_STATUSES)
                            ),
                            sa.or_(
                                SupportTicketProjection.last_sync_at.is_(None),
                                SupportTicketProjection.last_sync_at < now - STALE_AFTER,
                            ),
                        ),
                    ),
                )
                # Bosluklu olanlar once: yanlis durum gosterme riski en yuksek
                # olanlar en hizli onarilmali.
                .order_by(
                    SupportTicketProjection.sync_gap.desc(),
                    SupportTicketProjection.last_sync_at.asc().nulls_first(),
                )
                .limit(limit)
            )
        )
        .scalars()
        .all()
    )

    repaired = 0
    failures = 0
    for ticket in candidates:
        try:
            snapshot = await client.get_ticket_by_source(
                source_ticket_id=ticket.id, source_tenant_id=ticket.tenant_id
            )
        except HermesApiError as exc:
            failures += 1
            record_ticket_delivery("snapshot", "failure")
            ticket.last_sync_error_code = exc.code[:64]
            # DENEME ZAMANI basarisizlikta da ilerletilir. Aksi halde kalici
            # olarak basarisiz olan birkac ticket her turda ayni siralamayla
            # basa gecer ve digerleri HIC sirasini alamazdi (aclik).
            ticket.last_sync_at = datetime.now(UTC)
            logger.info(
                "Ticket %s snapshot alinamadi (%s)", ticket.id, exc.code
            )
            continue
        record_ticket_delivery("snapshot", "success")
        if await apply_snapshot(db, ticket, snapshot):
            repaired += 1
    await db.commit()
    return {
        "processed": repaired,
        "metadata": {
            "candidates": len(candidates),
            "repaired": repaired,
            "failures": failures,
        },
    }


async def requeue_orphan_creates(db: AsyncSession) -> int:
    """Outbox kaydi olmayan ama gonderilmemis ticketlar icin komut uretir.

    Boyle bir satir normalde olusmaz; olustuysa (elle mudahale, yarim kalmis
    goc) ticket sessizce sonsuza kadar "gonderiliyor" kalirdi. Onarim, veri
    silmeden yeni bir komut yazmaktir.
    """
    from app.core.enums import TicketCommandType, TicketOutboxStatus
    from app.models import SupportTicketOutbox
    from app.services.ticket_service import build_create_payload, resolve_route

    orphans = (
        (
            await db.execute(
                sa.select(SupportTicketProjection)
                .options(selectinload(SupportTicketProjection.attachments))
                .where(
                    SupportTicketProjection.remote_ticket_id.is_(None),
                    SupportTicketProjection.delivery_status.in_(
                        [
                            TicketDeliveryStatus.pending,
                            TicketDeliveryStatus.retrying,
                            TicketDeliveryStatus.failed,
                        ]
                    ),
                    # Dead-letter'a dusmus create HARIC TUTULMAZ: satir
                    # varsa (durumu ne olursa olsun) yeniden uretilmez.
                    # Aksi halde kalici olarak basarisiz bir komut her
                    # mutabakat turunda yeniden kuyruga girer ve dead-letter
                    # hicbir zaman sonlanmazdi.
                    ~sa.exists().where(
                        sa.and_(
                            SupportTicketOutbox.ticket_id == SupportTicketProjection.id,
                            SupportTicketOutbox.command_type == TicketCommandType.create,
                        )
                    ),
                )
            )
        )
        .scalars()
        .all()
    )
    if not orphans:
        return 0

    created = 0
    for ticket in orphans:
        route = await resolve_route(ticket.tenant_id)
        if not route.ready or route.group_id is None:
            continue
        tenant_slug, tenant_display = await _tenant_identity(ticket.tenant_id)
        db.add(
            SupportTicketOutbox(
                ticket_id=ticket.id,
                command_type=TicketCommandType.create,
                payload_json=build_create_payload(
                    ticket,
                    route=route,
                    tenant_slug=tenant_slug,
                    tenant_display_name=tenant_display,
                    attachment_upload_ids=[a.upload_id for a in ticket.attachments],
                ),
                status=TicketOutboxStatus.pending,
                next_attempt_at=datetime.now(UTC),
            )
        )
        created += 1
    await db.commit()
    return created


async def _tenant_identity(tenant_id) -> tuple[str | None, str | None]:
    from app.core.db import control_session
    from app.models import Tenant

    async with control_session() as control_db:
        tenant = (
            await control_db.execute(sa.select(Tenant).where(Tenant.id == tenant_id))
        ).scalar_one_or_none()
        if tenant is None:
            return None, None
        return tenant.slug, (tenant.display_name or tenant.commercial_name)
