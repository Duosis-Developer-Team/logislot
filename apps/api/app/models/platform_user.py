"""Platform (vendor/super-admin) kullanicilari.

Tenant/facility'ye bagli DEGILDIR; kendi izin uzayini (platform.*) kullanir.
"""

from datetime import datetime

import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.enums import UserStatus
from app.models.base import (
    CONTROL_SCHEMA,
    Base,
    JsonVariant,
    TimestampMixin,
    UUIDPkMixin,
    str_enum,
)

platform_user_roles = sa.Table(
    "platform_user_roles",
    Base.metadata,
    sa.Column(
        "platform_user_id",
        sa.Uuid,
        sa.ForeignKey(f"{CONTROL_SCHEMA}.platform_users.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    sa.Column(
        "platform_role_id",
        sa.Uuid,
        sa.ForeignKey(f"{CONTROL_SCHEMA}.platform_roles.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    schema=CONTROL_SCHEMA,
)


class PlatformRole(Base, UUIDPkMixin, TimestampMixin):
    __tablename__ = "platform_roles"
    __table_args__ = {"schema": CONTROL_SCHEMA}

    name: Mapped[str] = mapped_column(sa.String(100), unique=True)
    permissions_json: Mapped[list[str]] = mapped_column(JsonVariant, default=list)


class PlatformUser(Base, UUIDPkMixin, TimestampMixin):
    __tablename__ = "platform_users"
    __table_args__ = {"schema": CONTROL_SCHEMA}

    name: Mapped[str] = mapped_column(sa.String(255))
    email: Mapped[str] = mapped_column(sa.String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(sa.String(255))
    # Ilk giriste parola degistirme zorunlulugu (gecici parola akisi)
    must_change_password: Mapped[bool] = mapped_column(
        sa.Boolean, default=False, server_default=sa.false()
    )
    password_changed_at: Mapped[datetime | None] = mapped_column(sa.DateTime(timezone=True))
    status: Mapped[UserStatus] = mapped_column(str_enum(UserStatus), default=UserStatus.active)

    roles: Mapped[list[PlatformRole]] = relationship(secondary=platform_user_roles)

    @property
    def permissions(self) -> set[str]:
        return {p for role in self.roles for p in (role.permissions_json or [])}
