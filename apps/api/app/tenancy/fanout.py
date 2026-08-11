"""Platform duzlemi icin tenant'lar arasi toplama.

Operasyonel tablolar artik tenant semalarina dagildigi icin, platform
panelinin "tum musterileri listele" turu sorgulari tek bir SELECT ile
cevaplanamaz. Bu modul her tenant'in kendi oturumunu acip sonuclari
birlestirir.

Es zamanlilik BILEREK sinirlidir: sema modundaki tum tenant'lar ayni
baglanti havuzunu paylasir; sinirsiz fan-out havuzu tuketip API'nin
tamamini bloklardi.
"""

import asyncio
import uuid
from collections.abc import Awaitable, Callable, Iterable
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

#: Ayni anda sorgulanacak en fazla tenant sayisi.
MAX_CONCURRENT_TENANTS = 5


async def gather_by_tenant[T](
    tenant_ids: Iterable[uuid.UUID],
    loader: Callable[[AsyncSession, uuid.UUID], Awaitable[T]],
) -> dict[uuid.UUID, T]:
    """Her tenant icin kendi semasinda `loader` calistirir.

    Bir tenant'in sorgusu patlarsa DIGERLERI donmeye devam eder ve o tenant
    sonuca girmez — tek bir bozuk/erisilemeyen tenant tum platform panelini
    karartmasin.
    """
    from app.core.db import location_for_tenant, session_scope

    ids = list(tenant_ids)
    semaphore = asyncio.Semaphore(MAX_CONCURRENT_TENANTS)
    results: dict[uuid.UUID, Any] = {}

    async def run(tenant_id: uuid.UUID) -> None:
        async with semaphore:
            try:
                location = await location_for_tenant(tenant_id)
                async with session_scope(location) as db:
                    results[tenant_id] = await loader(db, tenant_id)
            except Exception:  # noqa: BLE001 - tek tenant tum sayfayi dusurmesin
                import logging

                logging.getLogger(__name__).exception(
                    "Tenant %s icin fan-out sorgusu basarisiz", tenant_id
                )

    await asyncio.gather(*(run(tid) for tid in ids))
    return results


async def facilities_by_tenant(tenant_ids: Iterable[uuid.UUID]) -> dict[uuid.UUID, Any]:
    """tenant_id -> Facility (1 tenant = 1 tesis oldugundan tekil)."""
    from sqlalchemy import select

    from app.models import Facility

    async def load(db: AsyncSession, tenant_id: uuid.UUID):
        return (
            await db.execute(select(Facility).where(Facility.tenant_id == tenant_id))
        ).scalars().first()

    found = await gather_by_tenant(tenant_ids, load)
    return {tid: fac for tid, fac in found.items() if fac is not None}


async def facility_of(tenant_id: uuid.UUID):
    """Tek bir tenant'in tesisi."""
    return (await facilities_by_tenant([tenant_id])).get(tenant_id)


async def locate_facility(facility_id: uuid.UUID) -> tuple[uuid.UUID, Any] | None:
    """facility_id -> (tenant_id, Facility).

    Tesis kimligi artik global olarak sorgulanamadigi icin tenant'lar
    taranir. Yalnizca facility_id ile gelen ESKI platform uclari icin
    vardir; sicak yol degildir (1 tenant = 1 tesis oldugundan yeni uclar
    tenant_id ile calisir).
    """
    from sqlalchemy import select

    from app.core.db import control_session
    from app.models import Facility, Tenant

    async with control_session() as db:
        tenant_ids = list((await db.execute(select(Tenant.id))).scalars())

    async def load(db: AsyncSession, _tenant_id: uuid.UUID):
        return (
            await db.execute(select(Facility).where(Facility.id == facility_id))
        ).scalars().first()

    for tenant_id, facility in (await gather_by_tenant(tenant_ids, load)).items():
        if facility is not None:
            return tenant_id, facility
    return None


async def usage_snapshot(tenant_ids: Iterable[uuid.UUID], *, range_start, range_end) -> dict:
    """Kullanim/kota uclarinin ihtiyac duydugu tum tenant-plane verisi.

    Ciktilar, tablolar tek semadayken uretilen sekillerle AYNIDIR; boylece
    cagiran uclardaki toplama mantigi degismeden calisir.
    """
    from sqlalchemy import func, select

    from app.core.enums import SupplierStatus
    from app.models import (
        Appointment,
        AuditLog,
        Dock,
        Facility,
        FacilityMembership,
        Supplier,
    )

    async def load(db: AsyncSession, tenant_id: uuid.UUID) -> dict:
        facility = (
            await db.execute(select(Facility).where(Facility.tenant_id == tenant_id))
        ).scalars().first()
        appointments = list(
            (
                await db.execute(
                    select(
                        Appointment.id,
                        Appointment.facility_id,
                        Appointment.tenant_id,
                        Appointment.status,
                        Appointment.created_at,
                    ).where(
                        Appointment.created_at >= range_start,
                        Appointment.created_at < range_end,
                    )
                )
            ).all()
        )
        docks = dict(
            (
                await db.execute(
                    select(Dock.facility_id, func.count(Dock.id))
                    .where(Dock.is_active.is_(True))
                    .group_by(Dock.facility_id)
                )
            ).all()
        )
        suppliers = dict(
            (
                await db.execute(
                    select(Supplier.facility_id, func.count(Supplier.id))
                    .where(Supplier.status == SupplierStatus.active)
                    .group_by(Supplier.facility_id)
                )
            ).all()
        )
        users = dict(
            (
                await db.execute(
                    select(
                        FacilityMembership.facility_id, func.count(FacilityMembership.id)
                    ).group_by(FacilityMembership.facility_id)
                )
            ).all()
        )
        audit_rows = list(
            (
                await db.execute(
                    select(
                        AuditLog.tenant_id,
                        AuditLog.entity_id,
                        AuditLog.action,
                        AuditLog.occurred_at,
                    ).where(
                        AuditLog.action.in_(
                            ["appointment.create", "appointment.approve", "appointment.reject"]
                        ),
                        AuditLog.occurred_at >= range_start,
                    )
                )
            ).all()
        )
        return {
            "facility": facility,
            "appointments": appointments,
            "docks": docks,
            "suppliers": suppliers,
            "users": users,
            "audit_rows": audit_rows,
        }

    per_tenant = await gather_by_tenant(tenant_ids, load)
    merged: dict = {
        "facilities": [],
        "appointments": [],
        "docks_by_facility": {},
        "suppliers_by_facility": {},
        "users_by_facility": {},
        "audit_rows": [],
    }
    for part in per_tenant.values():
        if part["facility"] is not None:
            merged["facilities"].append(part["facility"])
        merged["appointments"].extend(part["appointments"])
        merged["docks_by_facility"].update(part["docks"])
        merged["suppliers_by_facility"].update(part["suppliers"])
        merged["users_by_facility"].update(part["users"])
        merged["audit_rows"].extend(part["audit_rows"])
    return merged
