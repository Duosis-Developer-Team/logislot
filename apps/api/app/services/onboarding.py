"""Yeni tesis icin varsayilan konfigurasyon bootstrap'i (vendor onboarding).

MVP karari: bootstrap MINIMAL bir baslangic seti kurar — 3 arac kategorisi,
"Genel" urun kategorisi, varsayilan calisma saatli "Rampa 1" ve 3 standart
sistem rolu. Amac pilotta tesisin ilk randevuyu alabilir duruma gelmesidir;
detay konfigurasyonu tenant yoneticisi panelden yapar.
"""

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import TenantPermission
from app.models import Dock, Facility, ProductCategory, Role, VehicleCategory

DEFAULT_WORKING_HOURS = {
    "mon": {"start": "08:00", "end": "18:00"},
    "tue": {"start": "08:00", "end": "18:00"},
    "wed": {"start": "08:00", "end": "18:00"},
    "thu": {"start": "08:00", "end": "18:00"},
    "fri": {"start": "08:00", "end": "18:00"},
    "sat": {"start": "08:00", "end": "13:00"},
    "sun": None,
}


async def ensure_sysadmin_role(db: AsyncSession, facility: Facility) -> Role:
    """Tesisin "Sistem Yoneticisi" system rolunu dondurur; yoksa olusturur.

    Ilk yonetici onboarding'i bootstrap kapaliyken de calisabilsin diye
    rol garantisi burada verilir (son-yonetici korumasi user.manage arar).
    """
    from sqlalchemy import select

    role = (
        await db.execute(
            select(Role).where(
                Role.facility_id == facility.id,
                Role.name == "Sistem Yoneticisi",
                Role.is_active.is_(True),
            )
        )
    ).scalar_one_or_none()
    if role is not None:
        return role
    role = Role(
        tenant_id=facility.tenant_id,
        facility_id=facility.id,
        name="Sistem Yoneticisi",
        permissions_json=TenantPermission.ALL,
        is_default=True,
        is_system=True,
    )
    db.add(role)
    await db.flush()
    return role


async def bootstrap_facility_defaults(db: AsyncSession, facility: Facility) -> dict:
    """Bos tesise baslangic konfigurasyonu kurar. Commit ETMEZ (caller commit'ler)."""
    tenant_id: uuid.UUID = facility.tenant_id

    vc_tir = VehicleCategory(
        tenant_id=tenant_id, facility_id=facility.id, name="TIR", display_name="TIR"
    )
    vc_kamyon = VehicleCategory(
        tenant_id=tenant_id, facility_id=facility.id, name="Kamyon", display_name="Kamyon"
    )
    vc_kamyonet = VehicleCategory(
        tenant_id=tenant_id, facility_id=facility.id, name="Kamyonet", display_name="Kamyonet"
    )
    db.add_all([vc_tir, vc_kamyon, vc_kamyonet])
    await db.flush()

    pc_genel = ProductCategory(
        tenant_id=tenant_id,
        facility_id=facility.id,
        name="Genel",
        display_name="Genel",
        min_block_minutes=30,
        default_vehicle_category_id=vc_kamyonet.id,
    )
    db.add(pc_genel)
    await db.flush()

    dock = Dock(
        tenant_id=tenant_id,
        facility_id=facility.id,
        name="Rampa 1",
        note="Onboarding varsayilan rampasi",
        working_hours_json=DEFAULT_WORKING_HOURS,
        accepted_product_categories=[pc_genel],
        accepted_vehicle_categories=[],  # bos = tum araclar kabul
    )
    db.add(dock)

    roles = [
        Role(
            tenant_id=tenant_id,
            facility_id=facility.id,
            name="Sistem Yoneticisi",
            permissions_json=TenantPermission.ALL,
            is_default=True,
            is_system=True,
        ),
        Role(
            tenant_id=tenant_id,
            facility_id=facility.id,
            name="Rampa / Depo Yoneticisi",
            permissions_json=[
                TenantPermission.APPT_VIEW,
                TenantPermission.APPT_CREATE,  # Sprint 10: tedarikci adina randevu acma
                TenantPermission.APPT_APPROVE,
                TenantPermission.APPT_REJECT,
                TenantPermission.APPT_REVISE,
                TenantPermission.APPT_COMPLETE,
                TenantPermission.APPT_CANCEL,
                TenantPermission.CALENDAR_VIEW,
                TenantPermission.REPORT_VIEW,
            ],
            is_default=True,
            is_system=True,
        ),
        Role(
            tenant_id=tenant_id,
            facility_id=facility.id,
            name="Izleyici / Planlama",
            permissions_json=[
                TenantPermission.APPT_VIEW,
                TenantPermission.CALENDAR_VIEW,
                TenantPermission.REPORT_VIEW,
            ],
            is_default=True,
            is_system=True,
        ),
    ]
    db.add_all(roles)
    if facility.default_working_profile_json is None:
        facility.default_working_profile_json = DEFAULT_WORKING_HOURS
    await db.flush()

    return {
        "vehicle_categories": 3,
        "product_categories": 1,
        "docks": 1,
        "roles": 3,
    }
