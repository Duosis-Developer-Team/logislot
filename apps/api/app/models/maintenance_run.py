"""Scheduler is kosumlarinin kaydi (Sprint 12).

Support panelinde "son kosum" gorunurlugu ve coklu-instance kilit
takibi icin tutulur; kayit yoksa "henuz kosmadi" gosterilir.
"""

import uuid
from datetime import datetime
from typing import Any

import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, JsonVariant


class MaintenanceRun(Base):
    __tablename__ = "maintenance_runs"
    __table_args__ = (sa.Index("ix_maintenance_runs_job_started", "job_name", "started_at"),)

    id: Mapped[uuid.UUID] = mapped_column(sa.Uuid, primary_key=True, default=uuid.uuid4)
    job_name: Mapped[str] = mapped_column(sa.String(50), index=True)
    started_at: Mapped[datetime] = mapped_column(sa.DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(sa.DateTime(timezone=True))
    status: Mapped[str] = mapped_column(sa.String(20))  # success / failed / skipped_locked
    processed_count: Mapped[int] = mapped_column(sa.Integer, default=0)
    error_message: Mapped[str | None] = mapped_column(sa.Text)
    metadata_json: Mapped[dict[str, Any] | None] = mapped_column(JsonVariant)
