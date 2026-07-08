"""Audit log yardimcisi. Kritik her aksiyon bir satir uretir; commit cagirana aittir."""

import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import ActorType
from app.models import AuditLog


def record_audit(
    db: AsyncSession,
    *,
    actor_type: ActorType,
    actor_id: uuid.UUID | None,
    action: str,
    tenant_id: uuid.UUID | None = None,
    facility_id: uuid.UUID | None = None,
    entity_type: str | None = None,
    entity_id: uuid.UUID | None = None,
    before: dict[str, Any] | None = None,
    after: dict[str, Any] | None = None,
    metadata: dict[str, Any] | None = None,
) -> AuditLog:
    entry = AuditLog(
        actor_type=actor_type,
        actor_id=actor_id,
        action=action,
        tenant_id=tenant_id,
        facility_id=facility_id,
        entity_type=entity_type,
        entity_id=entity_id,
        before_json=before,
        after_json=after,
        metadata_json=metadata,
    )
    db.add(entry)
    return entry
