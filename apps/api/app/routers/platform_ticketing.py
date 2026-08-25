"""Platform Yonetimi — Hermes ticket yonlendirmesi ve entegrasyon sagligi.

Bu router ticket ICERIGI dondurmez. Platform kullanicisi hangi tenant'in hangi
Hermes ekibine gittigini ve entegrasyonun saglikli olup olmadigini gorur;
basliklar, talep sahipleri ve mesajlar bu yuzeye HIC gelmez
(00_SHARED_PLATFORM/06, bolum 8).

`platform.py` zaten cok buyudugu icin ayri router tercih edildi; ana app'e
ayrica include edilir.
"""

import uuid
from datetime import UTC, datetime

import sqlalchemy as sa
from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import Identity, require_platform_permissions
from app.core.config import get_settings
from app.core.db import get_control_db
from app.core.enums import TicketOutboxStatus, TicketWebhookStatus
from app.core.permissions import PlatformPermission
from app.core.ratelimit import enforce_rate_limit
from app.core.responses import ok
from app.models import Tenant, TicketWebhookInbox
from app.schemas.ticketing import RouteConfigRequest, RouteTestRequest
from app.services import ticket_routing_service as routing
from app.tenancy.fanout import gather_by_tenant

router = APIRouter(prefix="/platform/ticket-routing", tags=["platform-ticketing"])


def _group_out(row) -> dict:
    return {
        "id": str(row.group_id),
        "name": row.name,
        "description": row.description,
        "member_count": row.member_count,
        "is_active": row.is_active,
        "fetched_at": row.fetched_at.isoformat() if row.fetched_at else None,
    }


def _config_out(config) -> dict:
    if config is None:
        return {
            "configured": False,
            "status": "unconfigured",
            "hermes_group_id": None,
            "hermes_group_name": None,
            "route_version": 0,
            "is_active": False,
            "last_verified_at": None,
            "last_error_code": None,
            "last_error_at": None,
        }
    return {
        "configured": True,
        "status": routing.route_status(config),
        "hermes_group_id": str(config.hermes_group_id),
        "hermes_group_name": config.hermes_group_name_snapshot,
        "route_version": config.route_version,
        "is_active": config.is_active,
        "last_verified_at": (
            config.last_verified_at.isoformat() if config.last_verified_at else None
        ),
        "last_error_code": config.last_error_code,
        "last_error_at": config.last_error_at.isoformat() if config.last_error_at else None,
    }


@router.get("/groups")
async def list_groups(
    _: Identity = Depends(
        require_platform_permissions(PlatformPermission.TICKET_ROUTING_VIEW)
    ),
    db: AsyncSession = Depends(get_control_db),
):
    """Hermes Duosis aktif gruplari — BACKEND uzerinden.

    Tarayici Hermes'e hicbir zaman dogrudan gitmez ve servis kimligini gormez.
    """
    rows, error_code = await routing.ensure_catalog_fresh(db)
    return ok(
        {
            "items": [_group_out(r) for r in rows],
            "stale": routing.catalog_is_stale(rows),
            "error_code": error_code,
        }
    )


@router.post("/groups/refresh")
async def refresh_groups(
    request: Request,
    identity: Identity = Depends(
        require_platform_permissions(PlatformPermission.TICKET_ROUTING_MANAGE)
    ),
    db: AsyncSession = Depends(get_control_db),
):
    # Hermes'e kasitsiz yuk binmesin: yenileme kullanici basina sinirlidir.
    enforce_rate_limit(request, "ticket_catalog_refresh", str(identity.id), times=10)
    summary = await routing.refresh_catalog(db, actor_id=identity.id)
    rows = await routing.cached_groups(db)
    return ok({"items": [_group_out(r) for r in rows], **summary})


@router.get("")
async def list_routes(
    _: Identity = Depends(
        require_platform_permissions(PlatformPermission.TICKET_ROUTING_VIEW)
    ),
    db: AsyncSession = Depends(get_control_db),
    search: str | None = None,
    status: str | None = None,
    limit: int = Query(default=100, le=200),
    offset: int = Query(default=0, ge=0),
):
    """Tenant listesi + route durumu + iceriksiz teslimat sayaclari.

    Satir basina Hermes cagrisi YAPILMAZ (N+1 yasak); durum control-plane'de
    saklanan son dogrulama bilgisinden okunur.
    """
    tenants = list(
        (await db.execute(sa.select(Tenant).order_by(Tenant.commercial_name))).scalars()
    )
    configs = await routing.all_route_configs(db)

    rows = []
    for tenant in tenants:
        config = configs.get(tenant.id)
        row = {
            "tenant_id": str(tenant.id),
            "tenant_name": tenant.display_name or tenant.commercial_name,
            "tenant_slug": tenant.slug,
            "tenant_status": tenant.status.value,
            **_config_out(config),
        }
        rows.append(row)

    if search:
        needle = search.strip().lower()
        rows = [r for r in rows if needle in (r["tenant_name"] or "").lower()]
    if status:
        rows = [r for r in rows if r["status"] == status]

    total = len(rows)
    page = rows[offset : offset + limit]
    counts = await _delivery_counts([uuid.UUID(r["tenant_id"]) for r in page])
    for row in page:
        row["delivery"] = counts.get(
            uuid.UUID(row["tenant_id"]),
            {"pending": 0, "failed": 0, "dead": 0},
        )
    return ok(page, meta={"total": total, "offset": offset})


async def _delivery_counts(tenant_ids: list[uuid.UUID]) -> dict[uuid.UUID, dict]:
    """Tenant basina outbox sayaclari — ICERIK yok, yalnizca adet."""
    from app.models import SupportTicketOutbox

    async def load(tdb: AsyncSession, _tid) -> dict:
        result = await tdb.execute(
            sa.select(SupportTicketOutbox.status, sa.func.count(SupportTicketOutbox.id))
            .where(
                SupportTicketOutbox.status.in_(
                    [
                        TicketOutboxStatus.pending,
                        TicketOutboxStatus.failed,
                        TicketOutboxStatus.dead,
                    ]
                )
            )
            .group_by(SupportTicketOutbox.status)
        )
        counts = {"pending": 0, "failed": 0, "dead": 0}
        for status, count in result.all():
            key = status.value if hasattr(status, "value") else str(status)
            counts[key] = int(count)
        return counts

    return await gather_by_tenant(tenant_ids, load)


@router.get("/{tenant_id}")
async def get_route(
    tenant_id: uuid.UUID,
    _: Identity = Depends(
        require_platform_permissions(PlatformPermission.TICKET_ROUTING_VIEW)
    ),
    db: AsyncSession = Depends(get_control_db),
):
    tenant = (
        await db.execute(sa.select(Tenant).where(Tenant.id == tenant_id))
    ).scalar_one_or_none()
    if tenant is None:
        from app.core.errors import NotFoundError

        raise NotFoundError("Musteri hesabi bulunamadi")
    config = await routing.get_route_config(db, tenant_id)
    rows, error_code = await routing.ensure_catalog_fresh(db)
    counts = await _delivery_counts([tenant_id])
    return ok(
        {
            "tenant_id": str(tenant.id),
            "tenant_name": tenant.display_name or tenant.commercial_name,
            "tenant_slug": tenant.slug,
            "tenant_status": tenant.status.value,
            **_config_out(config),
            "groups": [_group_out(r) for r in rows],
            "catalog_stale": routing.catalog_is_stale(rows),
            "catalog_error_code": error_code,
            "delivery": counts.get(tenant_id, {"pending": 0, "failed": 0, "dead": 0}),
        }
    )


@router.put("/{tenant_id}")
async def save_route(
    tenant_id: uuid.UUID,
    body: RouteConfigRequest,
    identity: Identity = Depends(
        require_platform_permissions(PlatformPermission.TICKET_ROUTING_MANAGE)
    ),
    db: AsyncSession = Depends(get_control_db),
):
    config = await routing.save_route(
        db,
        tenant_id=tenant_id,
        group_id=body.hermes_group_id,
        is_active=body.is_active,
        expected_route_version=body.expected_route_version,
        actor_id=identity.id,
    )
    return ok(_config_out(config))


@router.post("/{tenant_id}/test")
async def test_route(
    tenant_id: uuid.UUID,
    body: RouteTestRequest,
    identity: Identity = Depends(
        require_platform_permissions(PlatformPermission.TICKET_ROUTING_MANAGE)
    ),
    db: AsyncSession = Depends(get_control_db),
):
    """Baglanti/dogrulama testi — TICKET OLUSTURMAZ."""
    return ok(
        await routing.test_route(
            db,
            tenant_id=tenant_id,
            actor_id=identity.id,
            group_id=body.hermes_group_id,
        )
    )


@router.get("/health/summary")
async def integration_health(
    _: Identity = Depends(
        require_platform_permissions(PlatformPermission.TICKET_INTEGRATION_HEALTH_VIEW)
    ),
    db: AsyncSession = Depends(get_control_db),
):
    """Entegrasyon saglik kartlari. Ticket basligi/talep sahibi ICERMEZ."""
    settings = get_settings()
    tenants = list((await db.execute(sa.select(Tenant.id))).scalars())
    configs = await routing.all_route_configs(db)

    configured = sum(1 for t in tenants if t in configs and configs[t].is_active)
    error_count = sum(1 for c in configs.values() if c.last_error_code)
    catalog = await routing.cached_groups(db)
    last_catalog_fetch = max((r.fetched_at for r in catalog), default=None)

    counts = await _delivery_counts(tenants)
    pending = sum(c.get("pending", 0) for c in counts.values())
    failed = sum(c.get("failed", 0) for c in counts.values())
    dead = sum(c.get("dead", 0) for c in counts.values())

    inbox_rows = (
        await db.execute(
            sa.select(TicketWebhookInbox.status, sa.func.count(TicketWebhookInbox.id))
            .group_by(TicketWebhookInbox.status)
        )
    ).all()
    inbox = {
        (s.value if hasattr(s, "value") else str(s)): int(c) for s, c in inbox_rows
    }

    last_run = await _last_ticket_runs()
    return ok(
        {
            "enabled": settings.ticketing_enabled,
            "hermes_configured": bool(
                settings.hermes_support_base_url and settings.hermes_support_token
            ),
            "webhook_secret_configured": bool(settings.hermes_support_webhook_secret),
            "tenant_count": len(tenants),
            "configured_tenant_count": configured,
            "unconfigured_tenant_count": len(tenants) - configured,
            "route_error_count": error_count,
            "catalog_group_count": len(catalog),
            "catalog_last_fetched_at": (
                last_catalog_fetch.isoformat() if last_catalog_fetch else None
            ),
            "catalog_stale": routing.catalog_is_stale(catalog),
            "outgoing": {"pending": pending, "failed": failed, "dead": dead},
            "webhook_inbox": {
                "received": inbox.get(TicketWebhookStatus.received.value, 0),
                "processing": inbox.get(TicketWebhookStatus.processing.value, 0),
                "processed": inbox.get(TicketWebhookStatus.processed.value, 0),
                "failed": inbox.get(TicketWebhookStatus.failed.value, 0),
                "dead": inbox.get(TicketWebhookStatus.dead.value, 0),
            },
            "jobs": last_run,
            "checked_at": datetime.now(UTC).isoformat(),
        }
    )


async def _last_ticket_runs() -> dict[str, dict | None]:
    """Ticket islerinin son kosumlari (control-plane kayitlari).

    Isler tenant basina kostugu icin tam tablo tenant semalarindadir; burada
    control-plane'deki son kosum "scheduler yasiyor mu" sinyali olarak yeterlidir.
    """
    from app.core.db import control_session
    from app.maintenance.scheduler import (
        JOB_TICKET_INBOX_RECOVERY,
        JOB_TICKET_OUTBOX,
        JOB_TICKET_RECONCILIATION,
    )
    from app.models import MaintenanceRun

    jobs = (JOB_TICKET_OUTBOX, JOB_TICKET_RECONCILIATION, JOB_TICKET_INBOX_RECOVERY)
    result: dict[str, dict | None] = {}
    async with control_session() as db:
        for job in jobs:
            row = (
                await db.execute(
                    sa.select(MaintenanceRun)
                    .where(MaintenanceRun.job_name == job)
                    .order_by(MaintenanceRun.started_at.desc())
                    .limit(1)
                )
            ).scalar_one_or_none()
            result[job] = (
                {
                    "last_status": row.status,
                    "last_finished_at": (
                        row.finished_at.isoformat() if row.finished_at else None
                    ),
                    "processed_count": row.processed_count,
                    "error_message": row.error_message,
                }
                if row
                else None
            )
    return result
