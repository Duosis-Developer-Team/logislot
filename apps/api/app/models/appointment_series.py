import uuid
from datetime import datetime
from typing import Any

import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, FacilityScopedMixin, JsonVariant, UUIDPkMixin


class AppointmentSeries(Base, UUIDPkMixin, FacilityScopedMixin):
    """Tekrarlayan randevu serisi (Option B — v2.0 tercihi).

    Occurrence'lar normal Appointment satirlaridir (series_id + occurrence_index
    ile baglanir) ve tekil yasam dongulerini korurlar: tek tek iptal/revize
    edilebilirler. Seri olusturma ALL-OR-NOTHING'dir: herhangi bir occurrence
    kurallardan gecemezse hicbiri olusmaz.
    """

    __tablename__ = "appointment_series"

    supplier_id: Mapped[uuid.UUID] = mapped_column(
        sa.Uuid, sa.ForeignKey("suppliers.id", ondelete="CASCADE"), index=True
    )
    recurrence_frequency: Mapped[str] = mapped_column(sa.String(10))  # weekly/biweekly/monthly
    occurrence_count: Mapped[int] = mapped_column(sa.Integer)
    status: Mapped[str] = mapped_column(sa.String(10), default="active")
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(sa.Uuid)
    metadata_json: Mapped[dict[str, Any] | None] = mapped_column(JsonVariant)
    created_at: Mapped[datetime] = mapped_column(
        sa.DateTime(timezone=True), server_default=sa.func.now()
    )
