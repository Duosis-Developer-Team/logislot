from datetime import datetime
from typing import Any
from uuid import UUID

import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column

from app.core.enums import ActorType
from app.models.base import Base, JsonVariant, UUIDPkMixin, str_enum


class AuditLog(Base, UUIDPkMixin):
    """Kritik aksiyon izi. tenant_id/facility_id platform olaylari icin bos olabilir."""

    __tablename__ = "audit_logs"

    occurred_at: Mapped[datetime] = mapped_column(
        sa.DateTime(timezone=True), server_default=sa.func.now(), index=True
    )
    actor_type: Mapped[ActorType] = mapped_column(str_enum(ActorType))
    actor_id: Mapped[UUID | None] = mapped_column(sa.Uuid)
    tenant_id: Mapped[UUID | None] = mapped_column(sa.Uuid, index=True)
    facility_id: Mapped[UUID | None] = mapped_column(sa.Uuid, index=True)
    action: Mapped[str] = mapped_column(sa.String(100), index=True)
    entity_type: Mapped[str | None] = mapped_column(sa.String(50))
    entity_id: Mapped[UUID | None] = mapped_column(sa.Uuid)
    before_json: Mapped[dict[str, Any] | None] = mapped_column(JsonVariant)
    after_json: Mapped[dict[str, Any] | None] = mapped_column(JsonVariant)
    metadata_json: Mapped[dict[str, Any] | None] = mapped_column(JsonVariant)
    ip_address: Mapped[str | None] = mapped_column(sa.String(64))
    user_agent: Mapped[str | None] = mapped_column(sa.String(255))
    impersonation_session_id: Mapped[UUID | None] = mapped_column(sa.Uuid)
