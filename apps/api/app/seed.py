"""Demo seed verisi: BTA tenant'i + Cakes & Bakes tesisi.

BTA burada YALNIZCA seed verisidir; domain logic'te hicbir BTA varsayimi yoktur.
Calistirma: python -m app.seed  (idempotent: tenant varsa dokunmaz)
"""

import asyncio
from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import select

from app.core.db import SessionLocal
from app.core.enums import (
    AppointmentStatus,
    CargoWindow,
    ConflictRelationType,
    CreatedByType,
    DeliveryType,
    DockOverrideType,
    PlanScope,
    PlanStatus,
    QuantityUnit,
    TenantStatus,
)
from app.core.permissions import PlatformPermission, TenantPermission
from app.core.security import hash_password
from app.core.timeutils import to_utc
from app.models import (
    Appointment,
    AppointmentRevision,
    Dock,
    DockConflictGroup,
    DockConflictGroupMember,
    DockOverride,
    Facility,
    FacilityMembership,
    Notification,
    Plan,
    PlatformRole,
    PlatformUser,
    ProductCategory,
    Role,
    Supplier,
    SupplierUser,
    Tenant,
    TenantUser,
    VehicleCategory,
)

WORKING_HOURS = {
    "mon": {"start": "08:00", "end": "18:00"},
    "tue": {"start": "08:00", "end": "18:00"},
    "wed": {"start": "08:00", "end": "18:00"},
    "thu": {"start": "08:00", "end": "18:00"},
    "fri": {"start": "08:00", "end": "18:00"},
    "sat": {"start": "08:00", "end": "13:00"},
    "sun": None,
}

DEMO_PASSWORD = "Demo123!"


async def seed_data(db) -> dict:
    """Demo evrenini verilen session'a kurar; testler de bunu kullanir."""
    # --- Planlar: politika kabi, faturalama motoru degil ---
    dimensions = [
        "appointments_created",
        "appointments_completed",
        "active_docks",
        "active_suppliers",
        "active_users",
    ]
    plan_starter = Plan(
        name="Starter",
        scope=PlanScope.tenant,
        billing_unit_label="fixed",
        measurable_dimensions_json=dimensions,
        rate_card_json=[
            {
                "dimension": "appointments_created",
                "unit_price": 0,
                "included_quota": 100,
                "overage_rule": "per_unit",
            }
        ],
        # Dinamik kotalar (platform panelinden degistirilebilir).
        limits_json={
            "max_tenants": 300,
            "monthly_appointments": 100,
            "max_docks": 3,
            "max_suppliers": 10,
            "max_users": 5,
        },
        status=PlanStatus.active,
    )
    plan = Plan(  # Professional — BTA'ya atanir
        name="Professional",
        scope=PlanScope.tenant,
        billing_unit_label="per_appointment",
        measurable_dimensions_json=dimensions,
        limits_json={
            "max_tenants": 500,
            "monthly_appointments": 500,
            "max_docks": 10,
            "max_suppliers": 50,
            "max_users": 25,
        },
        rate_card_json=[
            {
                "dimension": "appointments_created",
                "unit_price": 0,
                "included_quota": 500,
                "overage_rule": "per_unit",
            },
            {
                "dimension": "active_docks",
                "unit_price": 0,
                "included_quota": 5,
                "overage_rule": "per_unit",
            },
        ],
        status=PlanStatus.active,
    )
    db.add_all([plan_starter, plan])
    await db.flush()

    # --- Tenant + Facility ---
    tenant = Tenant(
        commercial_name="BTA Uretim A.S.",
        display_name="BTA / Cakes & Bakes",
        slug="bta",
        status=TenantStatus.active,
        primary_contact_name="BTA Operasyon",
        primary_contact_email="operasyon@bta.example.com",
        assigned_plan_id=plan.id,
    )
    db.add(tenant)
    await db.flush()

    facility = Facility(
        tenant_id=tenant.id,
        name="Cakes & Bakes Uretim Tesisi",
        address="Istanbul",
        timezone="Europe/Istanbul",
        default_working_profile_json=WORKING_HOURS,
        cargo_default_min_block_minutes=90,
    )
    db.add(facility)
    await db.flush()

    # --- Platform admin ---
    platform_role = PlatformRole(
        name="Platform Yoneticisi", permissions_json=PlatformPermission.ALL
    )
    db.add(platform_role)
    await db.flush()
    platform_admin = PlatformUser(
        name="LogiSlot Admin",
        email="admin@logislot.com",
        password_hash=hash_password(DEMO_PASSWORD),
        roles=[platform_role],
    )
    db.add(platform_admin)

    # --- Tenant rolleri ---
    role_sysadmin = Role(
        tenant_id=tenant.id,
        facility_id=facility.id,
        name="Sistem Yoneticisi",
        permissions_json=TenantPermission.ALL,
        is_default=True,
        is_system=True,
    )
    role_dock_manager = Role(
        tenant_id=tenant.id,
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
            TenantPermission.REPORT_VIEW,  # kendi rampalarinin raporunu gorebilir
        ],
        is_default=True,
        is_system=True,
    )
    role_viewer = Role(
        tenant_id=tenant.id,
        facility_id=facility.id,
        name="Izleyici / Planlama",
        permissions_json=[
            TenantPermission.APPT_VIEW,
            TenantPermission.CALENDAR_VIEW,
            TenantPermission.REPORT_VIEW,
        ],
        is_default=True,
        is_system=True,
    )
    db.add_all([role_sysadmin, role_dock_manager, role_viewer])
    await db.flush()

    # --- Arac kategorileri ---
    vc_tir = VehicleCategory(
        tenant_id=tenant.id, facility_id=facility.id,
        name="TIR", display_name="TIR",
        physical_note="Uzun sasi; genis manevra alani gerekir",
    )
    vc_kamyon = VehicleCategory(
        tenant_id=tenant.id, facility_id=facility.id,
        name="Kamyon", display_name="Kamyon",
    )
    vc_kamyonet = VehicleCategory(
        tenant_id=tenant.id, facility_id=facility.id,
        name="Kamyonet", display_name="Kamyonet",
    )
    vc_kargo = VehicleCategory(
        tenant_id=tenant.id, facility_id=facility.id,
        name="Kargo/Parsel Araci", display_name="Kargo / Parsel Araci",
    )
    vc_frigo = VehicleCategory(
        tenant_id=tenant.id, facility_id=facility.id,
        name="Frigorifik Arac", display_name="Frigorifik Arac",
        physical_note="Sogutuculu tasima",
    )
    db.add_all([vc_tir, vc_kamyon, vc_kamyonet, vc_kargo, vc_frigo])
    await db.flush()

    # --- Urun kategorileri (dinamik sure blokaji + varsayilan arac) ---
    pc_soguk = ProductCategory(
        tenant_id=tenant.id, facility_id=facility.id,
        name="Soguk Zincir", display_name="Soguk Zincir (Et, Donuk, Sut)",
        min_block_minutes=60,  # kalite kontrol dahil
        default_vehicle_category_id=vc_frigo.id,
    )
    pc_unlu = ProductCategory(
        tenant_id=tenant.id, facility_id=facility.id,
        name="Unlu Mamul Hammaddesi", display_name="Unlu Mamul Hammaddesi",
        min_block_minutes=45,
        default_vehicle_category_id=vc_tir.id,
    )
    pc_ambalaj = ProductCategory(
        tenant_id=tenant.id, facility_id=facility.id,
        name="Ambalaj", display_name="Ambalaj Malzemesi",
        min_block_minutes=30,
        default_vehicle_category_id=vc_kamyon.id,
    )
    pc_genel = ProductCategory(
        tenant_id=tenant.id, facility_id=facility.id,
        name="Genel", display_name="Genel",
        min_block_minutes=30,
        default_vehicle_category_id=vc_kamyonet.id,
    )
    db.add_all([pc_soguk, pc_unlu, pc_ambalaj, pc_genel])
    await db.flush()

    # --- Rampalar ---
    # Saha tespiti #1: R1-R2 bitisik; R3 yalnizca kucuk araclar.
    dock1 = Dock(
        tenant_id=tenant.id, facility_id=facility.id,
        name="Rampa 1", note="TIR uyumlu",
        working_hours_json=WORKING_HOURS,
        accepted_product_categories=[pc_unlu, pc_ambalaj, pc_genel],
        accepted_vehicle_categories=[],  # bos = tum araclar
    )
    dock2 = Dock(
        tenant_id=tenant.id, facility_id=facility.id,
        name="Rampa 2", note="TIR uyumlu, soguk zincir kabul eder",
        working_hours_json=WORKING_HOURS,
        accepted_product_categories=[pc_soguk, pc_unlu, pc_genel],
        accepted_vehicle_categories=[],
    )
    dock3 = Dock(
        tenant_id=tenant.id, facility_id=facility.id,
        name="Rampa 3", note="Yalnizca kucuk araclar (kamyonet/kargo)",
        working_hours_json=WORKING_HOURS,
        accepted_product_categories=[pc_genel, pc_ambalaj],
        accepted_vehicle_categories=[vc_kamyonet, vc_kargo],
    )
    db.add_all([dock1, dock2, dock3])
    await db.flush()

    # --- Cakisma grubu: R1-R2, yalnizca TIR'da tetiklenir ---
    group = DockConflictGroup(
        tenant_id=tenant.id, facility_id=facility.id,
        name="Rampa 1-2 Bitisik Blok",
        relation_type=ConflictRelationType.conditional,
        trigger_condition_json={"vehicle_category_ids": [str(vc_tir.id)]},
    )
    db.add(group)
    await db.flush()
    db.add_all(
        [
            DockConflictGroupMember(group_id=group.id, dock_id=dock1.id),
            DockConflictGroupMember(group_id=group.id, dock_id=dock2.id),
        ]
    )

    # --- Tedarikciler ---
    sup_un = Supplier(
        tenant_id=tenant.id, facility_id=facility.id,
        company_name="Anadolu Un A.S.", code="SUP-001",
        category_label="Hammadde",
        contact_name="Ali Kaya", contact_email="tedarik@anadoluun.example.com",
        auto_approval_enabled=False,
        min_block_minutes=30, max_block_minutes=120, weekly_quota=10,
        allowed_product_categories=[pc_unlu, pc_genel],
        notes="Uzun sureli anlasmali hammadde tedarikcisi; talepler yonetim onayina duser.",
    )
    sup_soguk = Supplier(
        tenant_id=tenant.id, facility_id=facility.id,
        company_name="Marmara Soguk Zincir Ltd.", code="SUP-002",
        category_label="Soguk Zincir",
        contact_name="Ayse Demir", contact_email="ops@marmarasoguk.example.com",
        auto_approval_enabled=True,
        min_block_minutes=60, max_block_minutes=180, weekly_quota=5,
        allowed_product_categories=[pc_soguk],
        notes="Anlasmali sogutmali tasima; otomatik onay ozelligi bu hesapta ornekli.",
    )
    sup_kargo = Supplier(
        tenant_id=tenant.id, facility_id=facility.id,
        company_name="Hizli Kargo Lojistik", code="SUP-003",
        category_label="Kargo",
        contact_name="Mehmet Can", contact_email="destek@hizlikargo.example.com",
        auto_approval_enabled=False,
        weekly_quota=2,  # kota sinirina yakin demo ornegi (1 kargo randevusu seed'li)
        allowed_product_categories=[pc_genel, pc_ambalaj],
        notes="Sehir disi kargo teslimatlari; varis saati belirsiz olabilir.",
    )
    db.add_all([sup_un, sup_soguk, sup_kargo])
    await db.flush()

    db.add_all(
        [
            SupplierUser(
                supplier_id=sup_un.id, name="Anadolu Un Portal",
                email="tedarikci@anadoluun.com",
                password_hash=hash_password(DEMO_PASSWORD),
            ),
            SupplierUser(
                supplier_id=sup_soguk.id, name="Marmara Soguk Portal",
                email="tedarikci@marmarasoguk.com",
                password_hash=hash_password(DEMO_PASSWORD),
            ),
            SupplierUser(
                supplier_id=sup_kargo.id, name="Hizli Kargo Portal",
                email="tedarikci@hizlikargo.com",
                password_hash=hash_password(DEMO_PASSWORD),
            ),
        ]
    )

    # --- Tenant kullanicilari ---
    user_admin = TenantUser(
        tenant_id=tenant.id, name="Sistem Yoneticisi",
        email="admin@cakesbakes.com",
        password_hash=hash_password(DEMO_PASSWORD),
        default_facility_id=facility.id,
    )
    user_dock = TenantUser(
        tenant_id=tenant.id, name="Rampa Yoneticisi",
        email="rampa@cakesbakes.com",
        password_hash=hash_password(DEMO_PASSWORD),
        default_facility_id=facility.id,
    )
    user_viewer = TenantUser(
        tenant_id=tenant.id, name="Planlama Izleyici",
        email="izleyici@cakesbakes.com",
        password_hash=hash_password(DEMO_PASSWORD),
        default_facility_id=facility.id,
    )
    db.add_all([user_admin, user_dock, user_viewer])
    await db.flush()

    db.add_all(
        [
            FacilityMembership(
                tenant_user_id=user_admin.id, tenant_id=tenant.id,
                facility_id=facility.id, roles=[role_sysadmin],
            ),
            FacilityMembership(
                tenant_user_id=user_dock.id, tenant_id=tenant.id,
                facility_id=facility.id, roles=[role_dock_manager],
                assigned_dock_ids=[str(dock1.id), str(dock2.id), str(dock3.id)],
            ),
            FacilityMembership(
                tenant_user_id=user_viewer.id, tenant_id=tenant.id,
                facility_id=facility.id, roles=[role_viewer],
            ),
        ]
    )

    # --- Ornek randevular ---
    tz = ZoneInfo(facility.timezone)
    today = datetime.now(tz).replace(hour=0, minute=0, second=0, microsecond=0)

    def appt(
        supplier: Supplier,
        category: ProductCategory,
        vehicle: VehicleCategory,
        dock: Dock,
        start: datetime,
        minutes: int,
        status: AppointmentStatus,
        product: str,
        *,
        delivery: DeliveryType = DeliveryType.standard,
        window: CargoWindow | None = None,
        plate: str | None = None,
    ) -> Appointment:
        return Appointment(
            tenant_id=tenant.id, facility_id=facility.id,
            supplier_id=supplier.id, dock_id=dock.id,
            product_category_id=category.id, vehicle_category_id=vehicle.id,
            product_name=product, quantity=10, quantity_unit=QuantityUnit.pallet,
            license_plate=plate, driver_name="Demo Surucu", driver_phone="+90 555 000 0000",
            delivery_type=delivery, cargo_window=window,
            cargo_min_block_minutes=90 if delivery == DeliveryType.cargo else None,
            scheduled_start_at=to_utc(start),
            scheduled_end_at=to_utc(start + timedelta(minutes=minutes)),
            duration_minutes=minutes, status=status,
            created_by_type=CreatedByType.supplier,
        )

    appt_flour = appt(
        sup_un, pc_unlu, vc_tir, dock1,
        today + timedelta(days=0, hours=10), 60,
        AppointmentStatus.approved, "Bugday Unu Tip 650", plate="34 ABC 123",
    )
    appt_frozen = appt(
        sup_soguk, pc_soguk, vc_frigo, dock2,
        today + timedelta(days=0, hours=13), 90,
        AppointmentStatus.pending, "Donuk Pasta Bazi", plate="34 DEF 456",
    )
    appt_cargo = appt(
        sup_kargo, pc_genel, vc_kargo, dock3,
        today + timedelta(days=1, hours=8), 90,
        AppointmentStatus.pending, "Etiket Rulolari",
        delivery=DeliveryType.cargo, window=CargoWindow.morning,
    )
    db.add_all(
        [
            appt_flour,
            appt_frozen,
            appt_cargo,
            appt(
                sup_un, pc_genel, vc_kamyonet, dock3,
                today - timedelta(days=1) + timedelta(hours=11), 45,
                AppointmentStatus.completed, "Kek Kaliplari", plate="06 XYZ 789",
            ),
            # Haftalik gorunum icin haftaya yayilmis ek randevular
            appt(
                sup_un, pc_ambalaj, vc_kamyon, dock1,
                today + timedelta(days=2, hours=9), 45,
                AppointmentStatus.approved, "Karton Kutu", plate="34 KTN 200",
            ),
            appt(
                sup_un, pc_unlu, vc_tir, dock2,
                today + timedelta(days=4, hours=14), 60,
                AppointmentStatus.approved, "Cavdar Unu", plate="34 UNL 300",
            ),
        ]
    )

    # --- Raporlar icin gecmis 2 haftaya yayilmis tarihsel randevular ---
    history = [
        # (gun once, saat, dk, supplier, kategori, arac, rampa, statu, urun)
        (3, 9, 60, sup_un, pc_unlu, vc_tir, dock1, AppointmentStatus.completed, "Un Teslimati A"),
        (4, 11, 45, sup_un,
         pc_genel, vc_kamyonet, dock3, AppointmentStatus.completed, "Kek Malzemesi"),
        (5, 14, 60, sup_un, pc_unlu, vc_tir, dock2, AppointmentStatus.completed, "Un Teslimati B"),
        (6, 10, 30, sup_un,
         pc_genel, vc_kamyonet, dock1, AppointmentStatus.cancelled, "Iptal Ornek"),
        (7, 13, 45, sup_un, pc_ambalaj, vc_kamyon, dock1, AppointmentStatus.rejected, "Red Ornek"),
        (4, 9, 90, sup_soguk,
         pc_soguk, vc_frigo, dock2, AppointmentStatus.completed, "Donuk Mamul A"),
        (8, 10, 60, sup_soguk,
         pc_soguk, vc_frigo, dock2, AppointmentStatus.completed, "Donuk Mamul B"),
        (10, 15, 90, sup_soguk,
         pc_soguk, vc_frigo, dock2, AppointmentStatus.cancelled, "Soguk Iptal"),
        (12, 11, 45, sup_kargo,
         pc_ambalaj, vc_kargo, dock3, AppointmentStatus.rejected, "Kargo Red"),
    ]
    for days_ago, hour, minutes, supplier, category, vehicle, dock, status, product in history:
        row = appt(
            supplier, category, vehicle, dock,
            today - timedelta(days=days_ago) + timedelta(hours=hour), minutes,
            status, product,
        )
        if status == AppointmentStatus.rejected:
            row.rejection_reason = "Uygun olmayan saat"
        if status == AppointmentStatus.cancelled:
            row.cancellation_reason = "Operasyon iptali"
        db.add(row)
    # Gecmis tamamlanmis KARGO teslimati (raporlardaki kargo orani icin)
    db.add(
        appt(
            sup_kargo, pc_genel, vc_kargo, dock3,
            today - timedelta(days=6) + timedelta(hours=8), 90,
            AppointmentStatus.completed, "Kargo Kolisi",
            delivery=DeliveryType.cargo, window=CargoWindow.morning,
        )
    )
    await db.flush()

    # --- Ornek bildirimler (alici basina satir) ---
    def notification(
        appointment: Appointment,
        *,
        type_: str,
        severity: str,
        title: str,
        body: str,
        user_id=None,
        supplier_id=None,
    ) -> Notification:
        return Notification(
            tenant_id=tenant.id, facility_id=facility.id,
            recipient_user_id=user_id, recipient_supplier_id=supplier_id,
            type=type_, severity=severity, title=title, body=body,
            entity_type="appointment", entity_id=appointment.id,
            metadata_json={
                "appointment_id": str(appointment.id),
                "status": appointment.status.value,
                "dock_id": str(appointment.dock_id),
                "supplier_id": str(appointment.supplier_id),
                "route_hint": f"/admin/appointments?appointmentId={appointment.id}",
            },
        )

    for admin_user in (user_admin, user_dock):
        db.add(
            notification(
                appt_frozen,
                type_="appointment_created", severity="warning",
                title="Yeni randevu talebi",
                body="Marmara Soguk Zincir Ltd. bugun 13:00 icin randevu talep etti.",
                user_id=admin_user.id,
            )
        )
        db.add(
            notification(
                appt_cargo,
                type_="cargo_advisory", severity="warning",
                title="Kargo uyarisi",
                body=(
                    "Hizli Kargo Lojistik kargosu yarin sabah bekleniyor; "
                    "Rampa 3'te bosluk birakin."
                ),
                user_id=admin_user.id,
            )
        )
    db.add(
        notification(
            appt_flour,
            type_="appointment_approved", severity="success",
            title="Randevunuz onaylandi",
            body="Bugun 10:00 randevunuz otomatik onaylandi.",
            supplier_id=sup_un.id,
        )
    )

    # --- Revizyon gecmisi ornegi: 15:00'ten 16:00'ya revize edilmis randevu ---
    revised = appt(
        sup_soguk, pc_soguk, vc_frigo, dock2,
        today + timedelta(days=1, hours=16), 60,
        AppointmentStatus.revision_pending, "Sut Kremasi", plate="34 RVZ 100",
    )
    revised.original_start_at = to_utc(today + timedelta(days=1, hours=15))
    revised.original_end_at = to_utc(today + timedelta(days=1, hours=16))
    revised.revision_note = "Oglen yogunlugu nedeniyle bir saat sonraya alindi."
    db.add(revised)
    await db.flush()
    db.add(
        AppointmentRevision(
            appointment_id=revised.id,
            old_start_at=revised.original_start_at,
            old_end_at=revised.original_end_at,
            old_dock_id=dock2.id,
            new_start_at=revised.scheduled_start_at,
            new_end_at=revised.scheduled_end_at,
            new_dock_id=dock2.id,
            note=revised.revision_note,
            revised_by_user_id=user_dock.id,
        )
    )

    # --- Takvim istisnalari (override ornekleri) ---
    next_sunday = today + timedelta(days=((6 - today.weekday()) % 7) or 7)
    db.add_all(
        [
            # Kapali gun: 3 gun sonra Rampa 3 bakimda -> availability sert engel
            DockOverride(
                tenant_id=tenant.id, facility_id=facility.id, dock_id=dock3.id,
                date=(today + timedelta(days=3)).date(),
                type=DockOverrideType.closed, reason="Planli bakim",
            ),
            # Ek mesai: normalde kapali pazar gunu Rampa 1 acilir
            DockOverride(
                tenant_id=tenant.id, facility_id=facility.id, dock_id=dock1.id,
                date=next_sunday.date(),
                type=DockOverrideType.extra_hours,
                start_time=time(9, 0), end_time=time(13, 0),
                reason="Bayram oncesi ek mesai",
            ),
        ]
    )

    await db.commit()
    return {
        "plan": plan,
        "tenant": tenant,
        "facility": facility,
        "platform_admin": platform_admin,
        "roles": {
            "sysadmin": role_sysadmin,
            "dock_manager": role_dock_manager,
            "viewer": role_viewer,
        },
        "vehicle_categories": {
            "tir": vc_tir,
            "kamyon": vc_kamyon,
            "kamyonet": vc_kamyonet,
            "kargo": vc_kargo,
            "frigo": vc_frigo,
        },
        "product_categories": {
            "soguk": pc_soguk,
            "unlu": pc_unlu,
            "ambalaj": pc_ambalaj,
            "genel": pc_genel,
        },
        "docks": {"d1": dock1, "d2": dock2, "d3": dock3},
        "conflict_group": group,
        "suppliers": {"un": sup_un, "soguk": sup_soguk, "kargo": sup_kargo},
        "users": {"admin": user_admin, "dock": user_dock, "viewer": user_viewer},
    }


async def seed() -> None:
    async with SessionLocal() as db:
        existing = await db.execute(select(Tenant).where(Tenant.slug == "bta"))
        if existing.scalar_one_or_none() is not None:
            print("Seed atlandi: 'bta' tenant'i zaten mevcut.")
            return
        await seed_data(db)
        print("Seed tamamlandi.")
        print(f"  Platform : admin@logislot.com / {DEMO_PASSWORD}")
        print(f"  Tenant   : admin@cakesbakes.com / {DEMO_PASSWORD}")
        print(f"             rampa@cakesbakes.com / {DEMO_PASSWORD}")
        print(f"             izleyici@cakesbakes.com / {DEMO_PASSWORD}")
        print(f"  Supplier : tedarikci@anadoluun.com / {DEMO_PASSWORD} (manuel onay)")
        print(f"             tedarikci@marmarasoguk.com / {DEMO_PASSWORD} (otomatik onayli)")
        print(f"             tedarikci@hizlikargo.com / {DEMO_PASSWORD}")


if __name__ == "__main__":
    asyncio.run(seed())
