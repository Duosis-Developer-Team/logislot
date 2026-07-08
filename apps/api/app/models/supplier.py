"""Tedarikciler ve tedarikci portal kullanicilari."""

import uuid
from datetime import datetime

import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.enums import SupplierStatus, UserStatus
from app.models.base import (
    Base,
    FacilityScopedMixin,
    JsonVariant,
    TimestampMixin,
    UUIDPkMixin,
    str_enum,
)
from app.models.catalog import ProductCategory

supplier_product_categories = sa.Table(
    "supplier_product_categories",
    Base.metadata,
    sa.Column(
        "supplier_id", sa.Uuid, sa.ForeignKey("suppliers.id", ondelete="CASCADE"), primary_key=True
    ),
    sa.Column(
        "product_category_id",
        sa.Uuid,
        sa.ForeignKey("product_categories.id", ondelete="CASCADE"),
        primary_key=True,
    ),
)


class Supplier(Base, UUIDPkMixin, TimestampMixin, FacilityScopedMixin):
    __tablename__ = "suppliers"
    __table_args__ = (sa.UniqueConstraint("facility_id", "code"),)

    company_name: Mapped[str] = mapped_column(sa.String(255))
    code: Mapped[str] = mapped_column(sa.String(50))
    category_label: Mapped[str | None] = mapped_column(sa.String(100))
    contact_name: Mapped[str | None] = mapped_column(sa.String(255))
    contact_email: Mapped[str | None] = mapped_column(sa.String(255))
    contact_phone: Mapped[str | None] = mapped_column(sa.String(50))
    status: Mapped[SupplierStatus] = mapped_column(
        str_enum(SupplierStatus), default=SupplierStatus.active
    )
    auto_approval_enabled: Mapped[bool] = mapped_column(sa.Boolean, default=False)
    min_block_minutes: Mapped[int | None] = mapped_column(sa.Integer)
    max_block_minutes: Mapped[int | None] = mapped_column(sa.Integer)
    weekly_quota: Mapped[int | None] = mapped_column(sa.Integer)
    monthly_quota: Mapped[int | None] = mapped_column(sa.Integer)
    notes: Mapped[str | None] = mapped_column(sa.Text)

    allowed_product_categories: Mapped[list[ProductCategory]] = relationship(
        secondary=supplier_product_categories
    )
    users: Mapped[list["SupplierUser"]] = relationship(back_populates="supplier")


class SupplierUser(Base, UUIDPkMixin, TimestampMixin):
    """Tedarikci portalina giris yapan hesap; her zaman bir Supplier'a baglidir."""

    __tablename__ = "supplier_users"

    supplier_id: Mapped[uuid.UUID] = mapped_column(
        sa.Uuid, sa.ForeignKey("suppliers.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(sa.String(255))
    email: Mapped[str] = mapped_column(sa.String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(sa.String(255))
    # Ilk giriste parola degistirme zorunlulugu (gecici parola akisi)
    must_change_password: Mapped[bool] = mapped_column(
        sa.Boolean, default=False, server_default=sa.false()
    )
    password_changed_at: Mapped[datetime | None] = mapped_column(sa.DateTime(timezone=True))
    # Bildirim tercihleri (Sprint 10): None = tum varsayilanlar acik.
    notification_preferences_json: Mapped[dict | None] = mapped_column(JsonVariant)
    status: Mapped[UserStatus] = mapped_column(str_enum(UserStatus), default=UserStatus.active)

    supplier: Mapped[Supplier] = relationship(back_populates="users")
