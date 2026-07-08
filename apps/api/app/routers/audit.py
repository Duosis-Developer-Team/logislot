"""Denetim izleri (audit) endpoint'i — Sprint 11.

Guvenlik kararlari (rapor):
- Yeni `audit.view` izni gerekir (sistem yoneticisinde var; izleyici/rampa
  yoneticisinde YOK — denetim izleri guvenlik hassastir).
- Supplier ve platform kullanicilari facility audit'ine ERISEMEZ.
- before/after snapshot'larinda parola/token/secret benzeri alanlar maskelenir
  (`***`); e-posta/telefon gibi operasyonel iletisim alanlari tenant admin'e
  gosterilir (kendi tesisi; PII platforma sizmaz — karar).
- Cok buyuk snapshot'lar kirpilir.
"""

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.enums import ActorType
from app.core.permissions import TenantPermission
from app.core.responses import ok
from app.models import AuditLog, PlatformUser, SupplierUser, TenantUser
from app.services.audit_view import ACTION_LABELS, safe_snapshot
from app.tenancy.deps import FacilityContext, require_facility_permissions

router = APIRouter(prefix="/facilities/{facility_id}", tags=["audit"])

@router.get("/audit-logs")
async def list_audit_logs(
    ctx: FacilityContext = Depends(require_facility_permissions(TenantPermission.AUDIT_VIEW)),
    db: AsyncSession = Depends(get_db),
    actor_type: ActorType | None = None,
    actor_id: uuid.UUID | None = None,
    action: str | None = None,
    entity_type: str | None = None,
    entity_id: uuid.UUID | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    search: str | None = None,
    limit: int = Query(default=50, le=200),
    offset: int = Query(default=0, ge=0),
):
    query = select(AuditLog).where(AuditLog.facility_id == ctx.facility_id)
    if actor_type is not None:
        query = query.where(AuditLog.actor_type == actor_type)
    if actor_id is not None:
        query = query.where(AuditLog.actor_id == actor_id)
    if action is not None:
        query = query.where(AuditLog.action == action)
    if entity_type is not None:
        query = query.where(AuditLog.entity_type == entity_type)
    if entity_id is not None:
        query = query.where(AuditLog.entity_id == entity_id)
    if date_from is not None:
        query = query.where(AuditLog.occurred_at >= date_from)
    if date_to is not None:
        query = query.where(AuditLog.occurred_at < date_to)
    if search:
        query = query.where(
            or_(
                AuditLog.action.ilike(f"%{search}%"),
                AuditLog.entity_type.ilike(f"%{search}%"),
            )
        )

    total = (
        await db.execute(select(func.count()).select_from(query.subquery()))
    ).scalar_one()
    rows = list(
        (
            await db.execute(
                query.order_by(AuditLog.occurred_at.desc()).offset(offset).limit(limit)
            )
        ).scalars()
    )

    # Aktor adlarini toplu coz (N+1 yok)
    actor_names: dict[uuid.UUID, str] = {}
    by_type: dict[ActorType, set] = {}
    for row in rows:
        if row.actor_id is not None:
            by_type.setdefault(row.actor_type, set()).add(row.actor_id)
    model_map = {
        ActorType.tenant_user: TenantUser,
        ActorType.supplier_user: SupplierUser,
        ActorType.platform_user: PlatformUser,
    }
    for a_type, ids in by_type.items():
        model = model_map.get(a_type)
        if model is None:
            continue
        for user_id, name in (
            await db.execute(select(model.id, model.name).where(model.id.in_(ids)))
        ).all():
            actor_names[user_id] = name

    items = [
        {
            "id": str(row.id),
            "created_at": row.occurred_at.isoformat(),
            "actor_type": row.actor_type.value,
            "actor_id": str(row.actor_id) if row.actor_id else None,
            "actor_name": (
                actor_names.get(row.actor_id)
                if row.actor_id
                else ("Sistem" if row.actor_type == ActorType.system else None)
            ),
            "action": row.action,
            "summary": ACTION_LABELS.get(row.action, row.action),
            "entity_type": row.entity_type,
            "entity_id": str(row.entity_id) if row.entity_id else None,
            "before": safe_snapshot(row.before_json),
            "after": safe_snapshot(row.after_json),
            "metadata": safe_snapshot(row.metadata_json),
        }
        for row in rows
    ]
    return ok({"items": items, "total": int(total), "limit": limit, "offset": offset})
