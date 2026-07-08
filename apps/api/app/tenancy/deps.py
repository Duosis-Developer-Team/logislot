"""Facility context: her operasyonel istek dogrulanmis facility kapsaminda calisir.

Path'teki facility_id, authenticated kullanicinin membership'i ile dogrulanir.
ID'ler API'den korlemesine kabul edilmez.
"""

import uuid
from dataclasses import dataclass

from fastapi import Depends, Path
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth.deps import Identity, get_identity
from app.core.db import get_db
from app.core.enums import FacilityStatus
from app.core.errors import ForbiddenError, NotFoundError
from app.models import Facility, FacilityMembership, Supplier, SupplierUser, TenantUser


@dataclass
class FacilityContext:
    tenant_id: uuid.UUID
    facility_id: uuid.UUID
    facility: Facility
    identity: Identity
    permissions: set[str]
    # Rampa yoneticisi scope kisiti; None = kisit yok.
    assigned_dock_ids: list[uuid.UUID] | None = None
    # Supplier context'inde dolu olur.
    supplier: Supplier | None = None

    def has(self, permission: str) -> bool:
        return permission in self.permissions

    def can_act_on_dock(self, dock_id: uuid.UUID | None) -> bool:
        if self.assigned_dock_ids is None or dock_id is None:
            return True
        return dock_id in self.assigned_dock_ids


async def get_facility_context(
    facility_id: uuid.UUID = Path(...),
    identity: Identity = Depends(get_identity),
    db: AsyncSession = Depends(get_db),
) -> FacilityContext:
    result = await db.execute(select(Facility).where(Facility.id == facility_id))
    facility = result.scalar_one_or_none()
    if facility is None or facility.status != FacilityStatus.active:
        raise NotFoundError("Tesis bulunamadi")

    if identity.user_type == "tenant":
        user: TenantUser = identity.user  # type: ignore[assignment]
        result = await db.execute(
            select(FacilityMembership)
            .options(selectinload(FacilityMembership.roles))
            .where(
                FacilityMembership.tenant_user_id == user.id,
                FacilityMembership.facility_id == facility_id,
            )
        )
        membership = result.scalar_one_or_none()
        if membership is None or membership.tenant_id != facility.tenant_id:
            raise ForbiddenError("Bu tesise erisim yetkiniz yok")
        assigned = (
            [uuid.UUID(d) for d in membership.assigned_dock_ids]
            if membership.assigned_dock_ids
            else None
        )
        return FacilityContext(
            tenant_id=facility.tenant_id,
            facility_id=facility_id,
            facility=facility,
            identity=identity,
            permissions=membership.permissions,
            assigned_dock_ids=assigned,
        )

    if identity.user_type == "supplier":
        supplier_user: SupplierUser = identity.user  # type: ignore[assignment]
        supplier = supplier_user.supplier
        if supplier.facility_id != facility_id:
            raise ForbiddenError("Bu tesise erisim yetkiniz yok")
        return FacilityContext(
            tenant_id=supplier.tenant_id,
            facility_id=facility_id,
            facility=facility,
            identity=identity,
            permissions=set(),
            supplier=supplier,
        )

    # Platform kullanicisi operasyonel facility endpointlerine default erisemez.
    raise ForbiddenError("Platform kullanicilari operasyonel veriye varsayilan erisemez")


def require_facility_permissions(*permissions: str):
    async def checker(
        ctx: FacilityContext = Depends(get_facility_context),
    ) -> FacilityContext:
        if ctx.identity.user_type != "tenant":
            raise ForbiddenError("Tenant kullanicisi gerekli")
        missing = set(permissions) - ctx.permissions
        if missing:
            raise ForbiddenError(f"Eksik izinler: {', '.join(sorted(missing))}")
        return ctx

    return checker


async def get_supplier_context(
    identity: Identity = Depends(get_identity),
    db: AsyncSession = Depends(get_db),
) -> FacilityContext:
    """Supplier portal endpointleri icin: tedarikcinin kendi facility baglami."""
    if identity.user_type != "supplier":
        raise ForbiddenError("Tedarikci kullanicisi gerekli")
    supplier_user: SupplierUser = identity.user  # type: ignore[assignment]
    supplier = supplier_user.supplier
    result = await db.execute(select(Facility).where(Facility.id == supplier.facility_id))
    facility = result.scalar_one_or_none()
    if facility is None:
        raise NotFoundError("Tesis bulunamadi")
    return FacilityContext(
        tenant_id=supplier.tenant_id,
        facility_id=supplier.facility_id,
        facility=facility,
        identity=identity,
        permissions=set(),
        supplier=supplier,
    )
