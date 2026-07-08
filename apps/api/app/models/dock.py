"""Rampalar, override'lar (CalendarOverride) ve rampa cakisma gruplari.

Cakisma iliskileri hardcode DEGILDIR; DockConflictGroup konfigurasyonuyla yasar.
Grup uyeligi, cift yonlu senkron hatalarindan kacinmak icin grup varliginda tutulur.
"""

import uuid
from datetime import date, time
from typing import Any

import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.enums import ConflictRelationType, DockOverrideType
from app.models.base import (
    Base,
    FacilityScopedMixin,
    JsonVariant,
    TimestampMixin,
    UUIDPkMixin,
    str_enum,
)
from app.models.catalog import ProductCategory, VehicleCategory

dock_product_categories = sa.Table(
    "dock_product_categories",
    Base.metadata,
    sa.Column("dock_id", sa.Uuid, sa.ForeignKey("docks.id", ondelete="CASCADE"), primary_key=True),
    sa.Column(
        "product_category_id",
        sa.Uuid,
        sa.ForeignKey("product_categories.id", ondelete="CASCADE"),
        primary_key=True,
    ),
)

dock_vehicle_categories = sa.Table(
    "dock_vehicle_categories",
    Base.metadata,
    sa.Column("dock_id", sa.Uuid, sa.ForeignKey("docks.id", ondelete="CASCADE"), primary_key=True),
    sa.Column(
        "vehicle_category_id",
        sa.Uuid,
        sa.ForeignKey("vehicle_categories.id", ondelete="CASCADE"),
        primary_key=True,
    ),
)


class Dock(Base, UUIDPkMixin, TimestampMixin, FacilityScopedMixin):
    __tablename__ = "docks"
    __table_args__ = (sa.UniqueConstraint("facility_id", "name"),)

    name: Mapped[str] = mapped_column(sa.String(100))
    note: Mapped[str | None] = mapped_column(sa.Text)
    is_active: Mapped[bool] = mapped_column(sa.Boolean, default=True)
    # Sekil: {"mon": {"start": "08:00", "end": "17:00"}, ..., "sun": null}
    working_hours_json: Mapped[dict[str, Any] | None] = mapped_column(JsonVariant)
    responsible_user_ids: Mapped[list[str] | None] = mapped_column(JsonVariant)

    accepted_product_categories: Mapped[list["ProductCategory"]] = relationship(
        secondary=dock_product_categories
    )
    # BOS liste = tum arac kategorileri kabul (geriye uyumluluk kurali).
    accepted_vehicle_categories: Mapped[list["VehicleCategory"]] = relationship(
        secondary=dock_vehicle_categories
    )


class DockOverride(Base, UUIDPkMixin, TimestampMixin, FacilityScopedMixin):
    """Takvim istisnasi (CalendarOverride): kapali gun veya ek mesai.

    extra_hours penceresi, o gunun normal calisma penceresinin YERINE gecer;
    normalde kapali gunlerde de slot acabilir.
    """

    __tablename__ = "dock_overrides"

    dock_id: Mapped[uuid.UUID] = mapped_column(
        sa.Uuid, sa.ForeignKey("docks.id", ondelete="CASCADE"), index=True
    )
    date: Mapped[date] = mapped_column(sa.Date, index=True)
    type: Mapped[DockOverrideType] = mapped_column(str_enum(DockOverrideType))
    start_time: Mapped[time | None] = mapped_column(sa.Time)
    end_time: Mapped[time | None] = mapped_column(sa.Time)
    reason: Mapped[str | None] = mapped_column(sa.Text)
    is_active: Mapped[bool] = mapped_column(
        sa.Boolean, default=True, server_default=sa.true()
    )

    dock: Mapped[Dock] = relationship()


class DockConflictGroup(Base, UUIDPkMixin, TimestampMixin, FacilityScopedMixin):
    __tablename__ = "dock_conflict_groups"
    __table_args__ = (sa.UniqueConstraint("facility_id", "name"),)

    name: Mapped[str] = mapped_column(sa.String(150))
    relation_type: Mapped[ConflictRelationType] = mapped_column(str_enum(ConflictRelationType))
    # Ornek: {"vehicle_category_ids": ["..."]} -> yalnizca bu araclarla tetiklenir.
    trigger_condition_json: Mapped[dict[str, Any] | None] = mapped_column(JsonVariant)
    is_active: Mapped[bool] = mapped_column(sa.Boolean, default=True)

    members: Mapped[list["DockConflictGroupMember"]] = relationship(
        back_populates="group", cascade="all, delete-orphan"
    )


class DockConflictGroupMember(Base, UUIDPkMixin):
    __tablename__ = "dock_conflict_group_members"
    __table_args__ = (sa.UniqueConstraint("group_id", "dock_id"),)

    group_id: Mapped[uuid.UUID] = mapped_column(
        sa.Uuid, sa.ForeignKey("dock_conflict_groups.id", ondelete="CASCADE"), index=True
    )
    dock_id: Mapped[uuid.UUID] = mapped_column(
        sa.Uuid, sa.ForeignKey("docks.id", ondelete="CASCADE"), index=True
    )

    group: Mapped[DockConflictGroup] = relationship(back_populates="members")
