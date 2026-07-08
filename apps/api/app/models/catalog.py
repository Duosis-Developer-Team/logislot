"""Urun ve arac kategorileri. Ikisi de facility kapsamli birinci sinif entity'dir."""

import uuid

import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, FacilityScopedMixin, TimestampMixin, UUIDPkMixin


class VehicleCategory(Base, UUIDPkMixin, TimestampMixin, FacilityScopedMixin):
    __tablename__ = "vehicle_categories"
    __table_args__ = (sa.UniqueConstraint("facility_id", "name"),)

    name: Mapped[str] = mapped_column(sa.String(100))
    display_name: Mapped[str] = mapped_column(sa.String(150))
    description: Mapped[str | None] = mapped_column(sa.Text)
    # Bilgilendirici fiziksel not (orn. "uzun sasi, geri manevra alani gerekir").
    # v2.0'da zorlayici kural alani DEGILDIR.
    physical_note: Mapped[str | None] = mapped_column(sa.Text)
    is_active: Mapped[bool] = mapped_column(sa.Boolean, default=True)


class ProductCategory(Base, UUIDPkMixin, TimestampMixin, FacilityScopedMixin):
    __tablename__ = "product_categories"
    __table_args__ = (sa.UniqueConstraint("facility_id", "name"),)

    name: Mapped[str] = mapped_column(sa.String(100))
    display_name: Mapped[str] = mapped_column(sa.String(150))
    description: Mapped[str | None] = mapped_column(sa.Text)
    # Dinamik Sure Blokaji: kalite kontrol gibi ek sureler bu minimuma yansitilir.
    min_block_minutes: Mapped[int] = mapped_column(sa.Integer, default=30)
    default_vehicle_category_id: Mapped[uuid.UUID | None] = mapped_column(
        sa.Uuid, sa.ForeignKey("vehicle_categories.id", ondelete="SET NULL")
    )
    is_active: Mapped[bool] = mapped_column(sa.Boolean, default=True)

    default_vehicle_category: Mapped[VehicleCategory | None] = relationship()
