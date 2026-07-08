"""Tenant ici kullanicilar, roller ve facility uyelikleri."""

import uuid
from datetime import datetime

import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.enums import UserStatus
from app.models.base import Base, JsonVariant, TimestampMixin, UUIDPkMixin, str_enum

facility_membership_roles = sa.Table(
    "facility_membership_roles",
    Base.metadata,
    sa.Column(
        "membership_id",
        sa.Uuid,
        sa.ForeignKey("facility_memberships.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    sa.Column(
        "role_id", sa.Uuid, sa.ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True
    ),
)


class TenantUser(Base, UUIDPkMixin, TimestampMixin):
    __tablename__ = "tenant_users"

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        sa.Uuid, sa.ForeignKey("tenants.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(sa.String(255))
    email: Mapped[str] = mapped_column(sa.String(255), unique=True, index=True)
    username: Mapped[str | None] = mapped_column(sa.String(100))
    password_hash: Mapped[str] = mapped_column(sa.String(255))
    # Ilk giriste parola degistirme zorunlulugu (gecici parola akisi)
    must_change_password: Mapped[bool] = mapped_column(
        sa.Boolean, default=False, server_default=sa.false()
    )
    password_changed_at: Mapped[datetime | None] = mapped_column(sa.DateTime(timezone=True))
    # Bildirim tercihleri (Sprint 10): None = tum varsayilanlar acik.
    notification_preferences_json: Mapped[dict | None] = mapped_column(JsonVariant)
    status: Mapped[UserStatus] = mapped_column(str_enum(UserStatus), default=UserStatus.active)
    default_facility_id: Mapped[uuid.UUID | None] = mapped_column(
        sa.Uuid, sa.ForeignKey("facilities.id", ondelete="SET NULL")
    )

    memberships: Mapped[list["FacilityMembership"]] = relationship(back_populates="user")


class Role(Base, UUIDPkMixin, TimestampMixin):
    """Tenant/facility kapsamli rol. facility_id bos ise tenant genelinde sablondur."""

    __tablename__ = "roles"
    __table_args__ = (sa.UniqueConstraint("tenant_id", "facility_id", "name"),)

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        sa.Uuid, sa.ForeignKey("tenants.id", ondelete="CASCADE"), index=True
    )
    facility_id: Mapped[uuid.UUID | None] = mapped_column(
        sa.Uuid, sa.ForeignKey("facilities.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(sa.String(100))
    display_name: Mapped[str | None] = mapped_column(sa.String(150))
    description: Mapped[str | None] = mapped_column(sa.Text)
    permissions_json: Mapped[list[str]] = mapped_column(JsonVariant, default=list)
    is_default: Mapped[bool] = mapped_column(sa.Boolean, default=False)
    is_system: Mapped[bool] = mapped_column(sa.Boolean, default=False)
    is_active: Mapped[bool] = mapped_column(sa.Boolean, default=True, server_default=sa.true())


class FacilityMembership(Base, UUIDPkMixin, TimestampMixin):
    """Kullanicinin bir facility'deki uyeligi; roller ve opsiyonel rampa scope'u."""

    __tablename__ = "facility_memberships"
    __table_args__ = (sa.UniqueConstraint("tenant_user_id", "facility_id"),)

    tenant_user_id: Mapped[uuid.UUID] = mapped_column(
        sa.Uuid, sa.ForeignKey("tenant_users.id", ondelete="CASCADE"), index=True
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        sa.Uuid, sa.ForeignKey("tenants.id", ondelete="CASCADE"), index=True
    )
    facility_id: Mapped[uuid.UUID] = mapped_column(
        sa.Uuid, sa.ForeignKey("facilities.id", ondelete="CASCADE"), index=True
    )
    # Rampa/depo yoneticisi icin rampa scope kisiti; bos/None = kisit yok.
    assigned_dock_ids: Mapped[list[str] | None] = mapped_column(JsonVariant)

    user: Mapped[TenantUser] = relationship(back_populates="memberships")
    roles: Mapped[list[Role]] = relationship(secondary=facility_membership_roles)

    @property
    def permissions(self) -> set[str]:
        return {p for role in self.roles for p in (role.permissions_json or [])}
