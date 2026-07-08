"""Kimlik cozumleme ve guard dependency'leri.

Identity uc tipten biridir: platform / tenant / supplier. Tipler ayri
tablolarda yasar ve izin uzaylari birlesmez.
"""

import uuid
from dataclasses import dataclass, field

import jwt as pyjwt
from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.db import get_db
from app.core.enums import SupplierStatus, UserStatus
from app.core.errors import ApiError, ForbiddenError, UnauthorizedError
from app.core.security import decode_token
from app.models import PlatformUser, Supplier, SupplierUser, TenantUser

_bearer = HTTPBearer(auto_error=False)

#: must_change_password=True kullanicinin erisebildigi yollar — parola
#: degistirme, cikis ve kimlik okuma disinda TUM API 403 ile kapalidir.
_PASSWORD_CHANGE_ALLOWED_PATHS = {"/auth/change-password", "/auth/logout", "/auth/me"}


def _enforce_password_change(request: Request | None, user) -> None:
    if not getattr(user, "must_change_password", False):
        return
    if request is not None and request.url.path in _PASSWORD_CHANGE_ALLOWED_PATHS:
        return
    raise ApiError(
        "PASSWORD_CHANGE_REQUIRED",
        "Devam etmeden önce parolanızı değiştirmeniz gerekiyor",
        403,
    )


@dataclass
class Identity:
    user_type: str  # platform / tenant / supplier
    user: PlatformUser | TenantUser | SupplierUser
    permissions: set[str] = field(default_factory=set)

    @property
    def id(self) -> uuid.UUID:
        return self.user.id


async def get_identity(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: AsyncSession = Depends(get_db),
) -> Identity:
    if credentials is None:
        raise UnauthorizedError()
    try:
        payload = decode_token(credentials.credentials)
    except pyjwt.PyJWTError as exc:
        raise UnauthorizedError("Gecersiz veya suresi dolmus token") from exc

    if payload.get("token_type") != "access":
        raise UnauthorizedError("Access token gerekli")

    user_type = payload.get("user_type")
    user_id = uuid.UUID(payload["sub"])

    if user_type == "platform":
        result = await db.execute(
            select(PlatformUser)
            .options(selectinload(PlatformUser.roles))
            .where(PlatformUser.id == user_id)
        )
        user = result.scalar_one_or_none()
        if user is None or user.status != UserStatus.active:
            raise UnauthorizedError()
        _enforce_password_change(request, user)
        return Identity(user_type="platform", user=user, permissions=user.permissions)

    if user_type == "tenant":
        result = await db.execute(select(TenantUser).where(TenantUser.id == user_id))
        user = result.scalar_one_or_none()
        if user is None or user.status != UserStatus.active:
            raise UnauthorizedError()
        _enforce_password_change(request, user)
        return Identity(user_type="tenant", user=user)

    if user_type == "supplier":
        result = await db.execute(
            select(SupplierUser)
            .options(selectinload(SupplierUser.supplier).selectinload(Supplier.allowed_product_categories))
            .where(SupplierUser.id == user_id)
        )
        user = result.scalar_one_or_none()
        if user is None or user.status != UserStatus.active:
            raise UnauthorizedError()
        # Firma pasifse bagli portal hesabi da tum endpointlerden engellenir.
        if user.supplier.status != SupplierStatus.active:
            raise ForbiddenError("Tedarikci hesabi pasif durumda")
        _enforce_password_change(request, user)
        return Identity(user_type="supplier", user=user)

    raise UnauthorizedError()


async def require_platform_identity(identity: Identity = Depends(get_identity)) -> Identity:
    if identity.user_type != "platform":
        raise ForbiddenError("Platform kullanicisi gerekli")
    return identity


async def require_tenant_identity(identity: Identity = Depends(get_identity)) -> Identity:
    if identity.user_type != "tenant":
        raise ForbiddenError("Tenant kullanicisi gerekli")
    return identity


async def require_supplier_identity(identity: Identity = Depends(get_identity)) -> Identity:
    if identity.user_type != "supplier":
        raise ForbiddenError("Tedarikci kullanicisi gerekli")
    return identity


def require_platform_permissions(*permissions: str):
    async def checker(
        identity: Identity = Depends(require_platform_identity),
    ) -> Identity:
        missing = set(permissions) - identity.permissions
        if missing:
            raise ForbiddenError(f"Eksik platform izinleri: {', '.join(sorted(missing))}")
        return identity

    return checker
