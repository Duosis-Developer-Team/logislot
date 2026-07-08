"""Randevu ve revizyon gecmisi.

Kargo yeni bir statu DEGILDIR: delivery_type + cargo_* alanlari ile modellenir
ve ayni statu yasam dongusunu kullanir.
"""

import uuid
from datetime import datetime

import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.enums import (
    AppointmentStatus,
    CargoWindow,
    CreatedByType,
    DeliveryType,
    QuantityUnit,
    RecurringRule,
)
from app.models.base import Base, FacilityScopedMixin, TimestampMixin, UUIDPkMixin, str_enum


class Appointment(Base, UUIDPkMixin, TimestampMixin, FacilityScopedMixin):
    __tablename__ = "appointments"
    __table_args__ = (
        sa.Index("ix_appointments_facility_start", "facility_id", "scheduled_start_at"),
        sa.Index("ix_appointments_dock_start", "dock_id", "scheduled_start_at"),
        sa.Index(
            "ix_appointments_facility_status_start",
            "facility_id",
            "status",
            "scheduled_start_at",
        ),
    )

    supplier_id: Mapped[uuid.UUID] = mapped_column(
        sa.Uuid, sa.ForeignKey("suppliers.id", ondelete="CASCADE"), index=True
    )
    # Rule engine atar; tedarikci manuel rampa secmez.
    dock_id: Mapped[uuid.UUID | None] = mapped_column(
        sa.Uuid, sa.ForeignKey("docks.id", ondelete="SET NULL"), index=True
    )
    product_category_id: Mapped[uuid.UUID] = mapped_column(
        sa.Uuid, sa.ForeignKey("product_categories.id", ondelete="RESTRICT")
    )
    vehicle_category_id: Mapped[uuid.UUID | None] = mapped_column(
        sa.Uuid, sa.ForeignKey("vehicle_categories.id", ondelete="SET NULL")
    )
    product_name: Mapped[str] = mapped_column(sa.String(255))
    quantity: Mapped[int] = mapped_column(sa.Integer, default=1)
    quantity_unit: Mapped[QuantityUnit] = mapped_column(
        str_enum(QuantityUnit), default=QuantityUnit.pallet
    )
    license_plate: Mapped[str | None] = mapped_column(sa.String(30))
    driver_name: Mapped[str | None] = mapped_column(sa.String(255))
    driver_phone: Mapped[str | None] = mapped_column(sa.String(50))

    delivery_type: Mapped[DeliveryType] = mapped_column(
        str_enum(DeliveryType), default=DeliveryType.standard
    )
    cargo_window: Mapped[CargoWindow | None] = mapped_column(str_enum(CargoWindow))
    cargo_min_block_minutes: Mapped[int | None] = mapped_column(sa.Integer)

    requested_start_at: Mapped[datetime | None] = mapped_column(sa.DateTime(timezone=True))
    requested_end_at: Mapped[datetime | None] = mapped_column(sa.DateTime(timezone=True))
    scheduled_start_at: Mapped[datetime] = mapped_column(sa.DateTime(timezone=True))
    scheduled_end_at: Mapped[datetime] = mapped_column(sa.DateTime(timezone=True))
    duration_minutes: Mapped[int] = mapped_column(sa.Integer)

    status: Mapped[AppointmentStatus] = mapped_column(
        str_enum(AppointmentStatus), default=AppointmentStatus.pending, index=True
    )
    rejection_reason: Mapped[str | None] = mapped_column(sa.Text)
    cancellation_reason: Mapped[str | None] = mapped_column(sa.Text)
    completion_note: Mapped[str | None] = mapped_column(sa.Text)
    revision_note: Mapped[str | None] = mapped_column(sa.Text)
    original_start_at: Mapped[datetime | None] = mapped_column(sa.DateTime(timezone=True))
    original_end_at: Mapped[datetime | None] = mapped_column(sa.DateTime(timezone=True))
    recurring_rule: Mapped[RecurringRule | None] = mapped_column(str_enum(RecurringRule))
    # Tekrarlayan seri baglantisi (AppointmentSeries)
    series_id: Mapped[uuid.UUID | None] = mapped_column(
        sa.Uuid, sa.ForeignKey("appointment_series.id", ondelete="SET NULL"), index=True
    )
    occurrence_index: Mapped[int | None] = mapped_column(sa.Integer)

    created_by_type: Mapped[CreatedByType] = mapped_column(
        str_enum(CreatedByType), default=CreatedByType.supplier
    )
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(sa.Uuid)

    revisions: Mapped[list["AppointmentRevision"]] = relationship(
        back_populates="appointment", cascade="all, delete-orphan"
    )


class AppointmentRevision(Base, UUIDPkMixin):
    __tablename__ = "appointment_revisions"

    appointment_id: Mapped[uuid.UUID] = mapped_column(
        sa.Uuid, sa.ForeignKey("appointments.id", ondelete="CASCADE"), index=True
    )
    old_start_at: Mapped[datetime] = mapped_column(sa.DateTime(timezone=True))
    old_end_at: Mapped[datetime] = mapped_column(sa.DateTime(timezone=True))
    old_dock_id: Mapped[uuid.UUID | None] = mapped_column(sa.Uuid)
    new_start_at: Mapped[datetime] = mapped_column(sa.DateTime(timezone=True))
    new_end_at: Mapped[datetime] = mapped_column(sa.DateTime(timezone=True))
    new_dock_id: Mapped[uuid.UUID | None] = mapped_column(sa.Uuid)
    note: Mapped[str | None] = mapped_column(sa.Text)
    revised_by_user_id: Mapped[uuid.UUID | None] = mapped_column(sa.Uuid)
    created_at: Mapped[datetime] = mapped_column(
        sa.DateTime(timezone=True), server_default=sa.func.now()
    )

    appointment: Mapped[Appointment] = relationship(back_populates="revisions")
