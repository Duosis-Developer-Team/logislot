"""Rule engine birim testleri.

DB'siz calisir: model nesneleri bellekte kurulur; AvailabilityService'in
framework bagimsizligini da dogrular.
"""

import uuid
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from app.core.enums import (
    AppointmentStatus,
    CargoWindow,
    ConflictRelationType,
    DeliveryType,
    DockOverrideType,
)
from app.models import (
    Appointment,
    Dock,
    DockConflictGroup,
    DockConflictGroupMember,
    DockOverride,
    Facility,
    ProductCategory,
    Supplier,
    VehicleCategory,
)
from app.rules.availability import AvailabilityService
from app.rules.context import HardRuleCode, RuleEvaluationContext, WarningCode

TZ = ZoneInfo("Europe/Istanbul")
HOURS = {
    key: {"start": "08:00", "end": "18:00"}
    for key in ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
}
TARGET = date(2026, 7, 9)  # Persembe


def make_world():
    facility = Facility(
        id=uuid.uuid4(), tenant_id=uuid.uuid4(), name="Test Tesis",
        timezone="Europe/Istanbul", default_working_profile_json=HOURS,
        cargo_default_min_block_minutes=90,
    )
    vc_tir = VehicleCategory(
        id=uuid.uuid4(), tenant_id=facility.tenant_id, facility_id=facility.id,
        name="TIR", display_name="TIR", is_active=True,
    )
    vc_kamyonet = VehicleCategory(
        id=uuid.uuid4(), tenant_id=facility.tenant_id, facility_id=facility.id,
        name="Kamyonet", display_name="Kamyonet", is_active=True,
    )
    category = ProductCategory(
        id=uuid.uuid4(), tenant_id=facility.tenant_id, facility_id=facility.id,
        name="Genel", display_name="Genel", min_block_minutes=30,
        default_vehicle_category_id=vc_kamyonet.id, is_active=True,
    )
    supplier = Supplier(
        id=uuid.uuid4(), tenant_id=facility.tenant_id, facility_id=facility.id,
        company_name="Test Tedarikci", code="T-1",
        auto_approval_enabled=False,
        min_block_minutes=30, max_block_minutes=120, weekly_quota=5,
    )
    supplier.allowed_product_categories = [category]

    def dock(name: str, vehicles: list) -> Dock:
        d = Dock(
            id=uuid.uuid4(), tenant_id=facility.tenant_id, facility_id=facility.id,
            name=name, is_active=True, working_hours_json=HOURS,
        )
        d.accepted_product_categories = [category]
        d.accepted_vehicle_categories = vehicles
        return d

    dock1 = dock("Rampa 1", [])  # bos = tum araclar
    dock2 = dock("Rampa 2", [])
    dock3 = dock("Rampa 3", [vc_kamyonet])  # yalnizca kamyonet

    group = DockConflictGroup(
        id=uuid.uuid4(), tenant_id=facility.tenant_id, facility_id=facility.id,
        name="R1-R2 Bitisik", relation_type=ConflictRelationType.conditional,
        trigger_condition_json={"vehicle_category_ids": [str(vc_tir.id)]},
        is_active=True,
    )
    group.members = [
        DockConflictGroupMember(id=uuid.uuid4(), group_id=group.id, dock_id=dock1.id),
        DockConflictGroupMember(id=uuid.uuid4(), group_id=group.id, dock_id=dock2.id),
    ]
    return facility, supplier, category, vc_tir, vc_kamyonet, dock1, dock2, dock3, group


def make_ctx(**overrides) -> RuleEvaluationContext:
    facility, supplier, category, vc_tir, vc_kamyonet, d1, d2, d3, group = make_world()
    defaults = dict(
        facility=facility,
        supplier=supplier,
        product_category=category,
        vehicle_category_id=vc_kamyonet.id,
        delivery_type=DeliveryType.standard,
        target_date=TARGET,
        duration_minutes=60,
        docks=[d1, d2, d3],
        conflict_groups=[group],
        overrides=[],
        existing_appointments=[],
    )
    defaults.update(overrides)
    ctx = RuleEvaluationContext(**defaults)
    # test yardimcilari icin referanslari sakla
    ctx._world = (facility, supplier, category, vc_tir, vc_kamyonet, d1, d2, d3, group)
    return ctx


def make_appointment(dock_id, start: datetime, minutes: int, *, delivery=DeliveryType.standard):
    return Appointment(
        id=uuid.uuid4(),
        tenant_id=uuid.uuid4(), facility_id=uuid.uuid4(),
        supplier_id=uuid.uuid4(), dock_id=dock_id,
        product_category_id=uuid.uuid4(),
        product_name="X", quantity=1,
        delivery_type=delivery,
        scheduled_start_at=start,
        scheduled_end_at=start + timedelta(minutes=minutes),
        duration_minutes=minutes,
        status=AppointmentStatus.approved,
    )


def at(hour: int, minute: int = 0) -> datetime:
    return datetime(TARGET.year, TARGET.month, TARGET.day, hour, minute, tzinfo=TZ)


# ---------- talep dogrulama ----------


def test_supplier_category_not_allowed():
    ctx = make_ctx()
    other = ProductCategory(
        id=uuid.uuid4(), tenant_id=uuid.uuid4(), facility_id=uuid.uuid4(),
        name="Yasak", display_name="Yasak", min_block_minutes=30, is_active=True,
    )
    ctx.product_category = other
    result = AvailabilityService(ctx).validate_request()
    assert not result.ok
    assert result.code == HardRuleCode.SUPPLIER_CATEGORY_NOT_ALLOWED


def test_duration_below_category_minimum():
    ctx = make_ctx(duration_minutes=15)
    result = AvailabilityService(ctx).validate_request()
    assert result.code == HardRuleCode.DURATION_BELOW_CATEGORY_MINIMUM


def test_duration_above_supplier_max():
    ctx = make_ctx(duration_minutes=180)
    result = AvailabilityService(ctx).validate_request()
    assert result.code == HardRuleCode.DURATION_OUTSIDE_SUPPLIER_LIMITS


def test_weekly_quota_exceeded():
    ctx = make_ctx(supplier_week_count=5)  # quota = 5
    result = AvailabilityService(ctx).validate_request()
    assert result.code == HardRuleCode.SUPPLIER_QUOTA_EXCEEDED


def test_valid_request_passes():
    ctx = make_ctx()
    assert AvailabilityService(ctx).validate_request().ok


# ---------- arac-rampa uyumu ----------


def test_vehicle_incompatible_dock_filtered():
    ctx = make_ctx()
    _, _, _, vc_tir, _, d1, d2, d3, _ = ctx._world
    ctx.vehicle_category_id = vc_tir.id
    names = [d.name for d in AvailabilityService(ctx).compatible_docks()]
    # Rampa 3 yalnizca kamyonet kabul eder -> TIR icin elenir
    assert names == ["Rampa 1", "Rampa 2"]


def test_empty_vehicle_list_accepts_all():
    ctx = make_ctx()
    names = [d.name for d in AvailabilityService(ctx).compatible_docks()]
    assert names == ["Rampa 1", "Rampa 2", "Rampa 3"]


def test_product_incompatible_dock_filtered():
    ctx = make_ctx()
    other = ProductCategory(
        id=uuid.uuid4(), tenant_id=uuid.uuid4(), facility_id=uuid.uuid4(),
        name="Baska", display_name="Baska", min_block_minutes=30, is_active=True,
    )
    ctx.supplier.allowed_product_categories = [other]
    ctx.product_category = other
    # Hicbir rampa 'Baska' kategorisini kabul etmiyor
    assert AvailabilityService(ctx).compatible_docks() == []


# ---------- cakisma gruplari ----------


def test_conditional_conflict_group_blocks_sibling_when_triggered():
    ctx = make_ctx()
    _, _, _, vc_tir, _, d1, d2, _, _ = ctx._world
    ctx.vehicle_category_id = vc_tir.id  # tetik: TIR
    ctx.existing_appointments = [make_appointment(d1.id, at(10), 60)]
    engine = AvailabilityService(ctx)
    result = engine.interval_status(d2, at(10), at(11))
    assert result.code == HardRuleCode.DOCK_CONFLICT_GROUP_BLOCKED


def test_conditional_conflict_group_not_triggered_for_other_vehicle():
    ctx = make_ctx()  # arac: kamyonet -> tetik eslesmiyor
    _, _, _, _, _, d1, d2, _, _ = ctx._world
    ctx.existing_appointments = [make_appointment(d1.id, at(10), 60)]
    engine = AvailabilityService(ctx)
    assert engine.interval_status(d2, at(10), at(11)).ok


# ---------- zaman cakismasi / calisma saatleri / override ----------


def test_time_conflict_detected():
    ctx = make_ctx()
    _, _, _, _, _, d1, _, _, _ = ctx._world
    ctx.existing_appointments = [make_appointment(d1.id, at(10), 60)]
    engine = AvailabilityService(ctx)
    assert engine.interval_status(d1, at(10, 30), at(11, 30)).code == (
        HardRuleCode.DOCK_TIME_CONFLICT
    )


def test_outside_working_hours_rejected():
    ctx = make_ctx()
    _, _, _, _, _, d1, _, _, _ = ctx._world
    engine = AvailabilityService(ctx)
    assert engine.interval_status(d1, at(19), at(20)).code == (
        HardRuleCode.DOCK_OUTSIDE_WORKING_HOURS
    )


def test_closed_override_rejected():
    ctx = make_ctx()
    _, _, _, _, _, d1, _, _, _ = ctx._world
    ctx.overrides = [
        DockOverride(
            id=uuid.uuid4(), tenant_id=ctx.facility.tenant_id,
            facility_id=ctx.facility.id, dock_id=d1.id,
            date=TARGET, type=DockOverrideType.closed, is_active=True,
        )
    ]
    engine = AvailabilityService(ctx)
    assert engine.interval_status(d1, at(10), at(11)).code == (
        HardRuleCode.DOCK_CLOSED_BY_OVERRIDE
    )


def test_inactive_override_is_ignored():
    ctx = make_ctx()
    _, _, _, _, _, d1, _, _, _ = ctx._world
    ctx.overrides = [
        DockOverride(
            id=uuid.uuid4(), tenant_id=ctx.facility.tenant_id,
            facility_id=ctx.facility.id, dock_id=d1.id,
            date=TARGET, type=DockOverrideType.closed, is_active=False,
        )
    ]
    engine = AvailabilityService(ctx)
    assert engine.interval_status(d1, at(10), at(11)).ok


def test_extra_hours_override_opens_slots_outside_normal_hours():
    """extra_hours penceresi normal saatlerin YERINE gecer ve dis saat acabilir."""
    ctx = make_ctx()
    _, _, _, _, _, d1, _, _, _ = ctx._world
    ctx.overrides = [
        DockOverride(
            id=uuid.uuid4(), tenant_id=ctx.facility.tenant_id,
            facility_id=ctx.facility.id, dock_id=d1.id,
            date=TARGET, type=DockOverrideType.extra_hours,
            start_time=datetime.strptime("18:00", "%H:%M").time(),
            end_time=datetime.strptime("21:00", "%H:%M").time(),
            is_active=True,
        )
    ]
    engine = AvailabilityService(ctx)
    # Normalde 18:00 sonrasi kapali; extra_hours ile acilir
    assert engine.interval_status(d1, at(19), at(20)).ok
    # Yeni pencere disinda kalan eski normal saat artik kapali
    assert engine.interval_status(d1, at(10), at(11)).code == (
        HardRuleCode.DOCK_OUTSIDE_WORKING_HOURS
    )


# ---------- kargo tavsiye katmani ----------


def test_cargo_does_not_block_but_warns():
    """Kargo randevusu slotu ENGELLEMEZ; yalnizca advisory uyari uretir."""
    ctx = make_ctx()
    _, _, _, _, _, d1, _, _, _ = ctx._world
    ctx.existing_appointments = [
        make_appointment(d1.id, at(8), 240, delivery=DeliveryType.cargo)
    ]
    engine = AvailabilityService(ctx)
    # Sert kural: ayni aralikta bile slot uygun
    assert engine.interval_status(d1, at(9), at(10)).ok
    # Tavsiye: uyarilar donuyor
    warnings = engine.advisory_warnings(d1.id, at(9), at(10))
    codes = {w.code for w in warnings}
    assert WarningCode.CARGO_DAY_WARNING in codes
    assert WarningCode.CARGO_WINDOW_OVERLAP in codes


def test_cargo_bounds_morning():
    ctx = make_ctx(delivery_type=DeliveryType.cargo, cargo_window=CargoWindow.morning)
    start, end = AvailabilityService(ctx).cargo_bounds()
    assert (start.hour, end.hour) == (8, 12)


# ---------- slot izgarasi ve rampa secimi ----------


def test_evaluate_day_slot_statuses():
    ctx = make_ctx()
    _, _, _, _, _, d1, d2, d3, _ = ctx._world
    # 10:00-11:00 arasi d1 ve d2 dolu; d3 bos -> partial
    ctx.existing_appointments = [
        make_appointment(d1.id, at(10), 60),
        make_appointment(d2.id, at(10), 60),
    ]
    slots = AvailabilityService(ctx).evaluate_day()
    by_start = {s.start.strftime("%H:%M"): s for s in slots}
    assert by_start["08:00"].status == "available"
    assert by_start["10:00"].status == "partial"
    assert len(by_start["10:00"].candidate_dock_ids) == 1


def test_choose_dock_least_busy_deterministic():
    ctx = make_ctx()
    _, _, _, _, _, d1, d2, d3, _ = ctx._world
    # d1'de 2 saatlik yuk var; d2/d3 bos -> alfabetik ilk bos: Rampa 2
    ctx.existing_appointments = [make_appointment(d1.id, at(8), 120)]
    chosen = AvailabilityService(ctx).choose_dock(at(14), at(15))
    assert chosen.name == "Rampa 2"
