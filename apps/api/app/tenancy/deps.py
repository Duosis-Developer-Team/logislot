"""Facility context: her operasyonel istek dogrulanmis facility kapsaminda calisir.

Path'teki facility_id, authenticated kullanicinin membership'i ile dogrulanir.
ID'ler API'den korlemesine kabul edilmez.
"""

import uuid
from dataclasses import dataclass

from fastapi import Depends, Header, Path
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


# ---------------------------------------------------------------- ticketlar


async def get_ticket_requester(
    identity: Identity = Depends(get_identity),
    db: AsyncSession = Depends(get_db),
    x_facility_id: uuid.UUID | None = Header(default=None, alias="X-Facility-Id"),
):
    """Ticket uclarinin kimlik/kapsam baglami.

    Ticket rotalari path'te `facility_id` TASIMAZ (sozlesme `/tickets` diyor ve
    1 tenant = 1 tesis). Kapsam yine de dogrulanir: baslikta bir tesis
    geldiyse uyelik aranir, gelmediyse kullanicinin varsayilan/tek uyeligi
    kullanilir. ID'ler korlemesine kabul EDILMEZ.

    Izinler tesis uyeligindeki rollerden gelir; tedarikci hesabi icin
    sabit portal izin setinden.
    """
    from app.core.config import get_settings
    from app.core.enums import TicketRequesterType
    from app.core.metrics import record_ticket_authz_denied
    from app.core.permissions import SupplierPortalPermission, TenantPermission
    from app.services.ticket_service import TicketFeatureDisabledError, TicketRequester

    if not get_settings().ticketing_enabled:
        raise TicketFeatureDisabledError()

    if identity.user_type == "supplier":
        supplier_user: SupplierUser = identity.user  # type: ignore[assignment]
        supplier = supplier_user.supplier
        permissions = set(SupplierPortalPermission.DEFAULT)
        return TicketRequester(
            type=TicketRequesterType.supplier_user,
            id=supplier_user.id,
            name=supplier_user.name,
            email=supplier_user.email,
            tenant_id=supplier.tenant_id,
            facility_id=supplier.facility_id,
            can_view_all=False,
            can_create=SupplierPortalPermission.TICKET_CREATE in permissions,
            can_comment=SupplierPortalPermission.TICKET_COMMENT_OWN in permissions,
            supplier_id=supplier.id,
            supplier_name=supplier.company_name,
        )

    if identity.user_type != "tenant":
        record_ticket_authz_denied("tickets", "wrong_principal")
        raise ForbiddenError("Ticket ekranlari platform kullanicilarina kapalidir")

    user: TenantUser = identity.user  # type: ignore[assignment]
    memberships = list(
        (
            await db.execute(
                select(FacilityMembership)
                .options(selectinload(FacilityMembership.roles))
                .where(FacilityMembership.tenant_user_id == user.id)
            )
        ).scalars()
    )
    if not memberships:
        record_ticket_authz_denied("tickets", "no_membership")
        raise ForbiddenError("Bir tesise uyeliginiz yok")

    membership = None
    if x_facility_id is not None:
        membership = next(
            (m for m in memberships if m.facility_id == x_facility_id), None
        )
        if membership is None:
            record_ticket_authz_denied("tickets", "facility_not_member")
            raise ForbiddenError("Bu tesise erisim yetkiniz yok")
    if membership is None and user.default_facility_id is not None:
        membership = next(
            (m for m in memberships if m.facility_id == user.default_facility_id), None
        )
    if membership is None:
        membership = memberships[0]

    permissions = membership.permissions
    if TenantPermission.TICKET_VIEW not in permissions:
        record_ticket_authz_denied("tickets", "missing_permission")
        raise ForbiddenError("Ticket goruntuleme yetkiniz yok")

    return TicketRequester(
        type=TicketRequesterType.tenant_user,
        id=user.id,
        name=user.name,
        email=user.email,
        tenant_id=membership.tenant_id,
        facility_id=membership.facility_id,
        can_view_all=TenantPermission.TICKET_VIEW_ALL in permissions,
        can_create=TenantPermission.TICKET_CREATE in permissions,
        can_comment=TenantPermission.TICKET_COMMENT in permissions,
    )
