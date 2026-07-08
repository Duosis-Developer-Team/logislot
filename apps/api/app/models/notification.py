import uuid
from datetime import datetime
from typing import Any

import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, FacilityScopedMixin, JsonVariant, UUIDPkMixin


class Notification(Base, UUIDPkMixin, FacilityScopedMixin):
    """Alici-basina bildirim satiri.

    Tenant kullanicisi icin recipient_user_id, tedarikci icin
    recipient_supplier_id dolu olur (ikisi ayni anda dolmaz). Okundu durumu
    alici basina tutulur (read_at). severity yalnizca gorsel siddettir;
    is akisini etkilemez.
    """

    __tablename__ = "notifications"
    __table_args__ = (
        sa.Index("ix_notifications_recipient_read", "recipient_user_id", "read_at"),
        sa.Index("ix_notifications_supplier_read", "recipient_supplier_id", "read_at"),
    )

    recipient_user_id: Mapped[uuid.UUID | None] = mapped_column(
        sa.Uuid, sa.ForeignKey("tenant_users.id", ondelete="CASCADE"), index=True
    )
    recipient_supplier_id: Mapped[uuid.UUID | None] = mapped_column(
        sa.Uuid, sa.ForeignKey("suppliers.id", ondelete="CASCADE"), index=True
    )
    type: Mapped[str] = mapped_column(sa.String(50))
    severity: Mapped[str] = mapped_column(
        sa.String(10), default="info", server_default="info"
    )  # info / success / warning / error
    title: Mapped[str] = mapped_column(sa.String(255))
    body: Mapped[str | None] = mapped_column(sa.Text)
    entity_type: Mapped[str | None] = mapped_column(sa.String(50))
    entity_id: Mapped[uuid.UUID | None] = mapped_column(sa.Uuid)
    # Frontend yonlendirme + baglam: appointment_id, dock_id, route_hint, reason...
    metadata_json: Mapped[dict[str, Any] | None] = mapped_column(JsonVariant)
    read_at: Mapped[datetime | None] = mapped_column(sa.DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        sa.DateTime(timezone=True), server_default=sa.func.now()
    )
