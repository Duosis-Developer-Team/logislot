import uuid
from datetime import datetime
from typing import Any

import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, FacilityScopedMixin, JsonVariant, UUIDPkMixin


class EmailLog(Base, UUIDPkMixin, FacilityScopedMixin):
    """Giden e-posta kaydi.

    Gercek SMTP YOKTUR: varsayilan provider log_only'dir ve yalnizca bu
    tabloya yazar. Provider degistirilebilir (EmailProvider arayuzu).
    """

    __tablename__ = "email_logs"
    __table_args__ = (sa.Index("ix_email_logs_appointment", "appointment_id"),)

    recipient_email: Mapped[str] = mapped_column(sa.String(255))
    recipient_name: Mapped[str | None] = mapped_column(sa.String(255))
    subject: Mapped[str] = mapped_column(sa.String(255))
    body: Mapped[str | None] = mapped_column(sa.Text)
    template_key: Mapped[str] = mapped_column(sa.String(50))
    status: Mapped[str] = mapped_column(
        sa.String(10), default="queued"
    )  # queued / sent / failed / skipped
    provider: Mapped[str] = mapped_column(sa.String(20), default="log_only")
    appointment_id: Mapped[uuid.UUID | None] = mapped_column(sa.Uuid)
    notification_id: Mapped[uuid.UUID | None] = mapped_column(sa.Uuid)
    metadata_json: Mapped[dict[str, Any] | None] = mapped_column(JsonVariant)
    error_message: Mapped[str | None] = mapped_column(sa.Text)
    # Retry/kuyruk alanlari (Sprint 10): failed kayitlar backoff'la yeniden denenir.
    retry_count: Mapped[int] = mapped_column(sa.Integer, default=0, server_default="0")
    max_attempts: Mapped[int] = mapped_column(sa.Integer, default=3, server_default="3")
    next_retry_at: Mapped[datetime | None] = mapped_column(sa.DateTime(timezone=True))
    last_attempt_at: Mapped[datetime | None] = mapped_column(sa.DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        sa.DateTime(timezone=True), server_default=sa.func.now()
    )
    sent_at: Mapped[datetime | None] = mapped_column(sa.DateTime(timezone=True))
