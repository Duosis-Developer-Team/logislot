"""Randevu olusturma ve yasam dongusu servisleri.

Butun is kurallari AvailabilityService uzerinden degerlendirilir;
UI/router katmaninda kural yazilmaz.
"""

import calendar
import uuid
from datetime import UTC, date, datetime, timedelta

from fastapi import status as http_status
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.enums import (
    BLOCKING_APPOINTMENT_STATUSES,
    ActorType,
    AppointmentStatus,
    CargoWindow,
    CreatedByType,
    DeliveryType,
    QuantityUnit,
    RecurringRule,
    SupplierStatus,
)
from app.core.errors import ApiError, NotFoundError, RuleViolationError
from app.core.timeutils import to_utc
from app.models import (
    Appointment,
    AppointmentRevision,
    AppointmentSeries,
    Dock,
    DockConflictGroup,
    DockOverride,
    Facility,
    ProductCategory,
    Supplier,
    VehicleCategory,
)
from app.rules.availability import AvailabilityService
from app.rules.context import HardRuleCode, HardRuleResult, RuleEvaluationContext
from app.services.audit import record_audit
from app.services.notifications import on_appointment_created, on_lifecycle_action


class InvalidTransitionError(ApiError):
    def __init__(self, current: AppointmentStatus, action: str) -> None:
        super().__init__(
            "INVALID_STATUS_TRANSITION",
            f"'{current.value}' durumundaki randevuda '{action}' yapilamaz",
            http_status.HTTP_409_CONFLICT,
        )


def allowed_delivery_types(supplier: Supplier) -> list[str]:
    """Tedarikcinin kullanabilecegi teslimat tipleri.

    Standart HER tedarikcide aciktir. Kargo yalnizca yonetim o tedarikci
    icin `cargo_enabled` anahtarini actiysa listeye girer (urun karari
    2026-08: kargo otomatik gelmez, acilirsa gorunur).
    """
    types = [DeliveryType.standard.value]
    if supplier.cargo_enabled:
        types.append(DeliveryType.cargo.value)
    return types


def ensure_delivery_type_allowed(supplier: Supplier, delivery_type: DeliveryType) -> None:
    """Kargo kapali tedarikci kargo randevusu olusturamaz (UI + API savunmasi)."""
    if delivery_type == DeliveryType.cargo and not supplier.cargo_enabled:
        raise ApiError(
            "CARGO_NOT_ENABLED",
            "Bu tedarikci icin kargo teslimati acik degil",
            422,
        )


async def acquire_facility_lock(db: AsyncSession, facility_id: uuid.UUID) -> None:
    """Facility bazli PostgreSQL advisory lock (transaction-scoped).

    Ayni tesise eszamanli create/revise isteklerini serialize eder; kilit
    transaction commit/rollback ile otomatik birakilir. Farkli tesisler
    birbirini BLOKLAMAZ. SQLite (test) ortaminda no-op'tur — orada gercek
    eszamanlilik yoktur; canli dogrulama Postgres'e karsi yapilir.
    """
    if db.bind.dialect.name != "postgresql":
        return
    await db.execute(
        text("SELECT pg_advisory_xact_lock(hashtext(:key))"),
        {"key": f"logislot:appt:{facility_id}"},
    )


def _week_bounds(day: date) -> tuple[date, date]:
    start = day - timedelta(days=day.weekday())
    return start, start + timedelta(days=7)


def _month_bounds(day: date) -> tuple[date, date]:
    start = day.replace(day=1)
    last = calendar.monthrange(day.year, day.month)[1]
    return start, start.replace(day=last) + timedelta(days=1)


async def _count_supplier_appointments(
    db: AsyncSession, supplier_id: uuid.UUID, start: date, end: date
) -> int:
    result = await db.execute(
        select(func.count(Appointment.id)).where(
            Appointment.supplier_id == supplier_id,
            Appointment.status.notin_(
                [AppointmentStatus.cancelled, AppointmentStatus.rejected]
            ),
            Appointment.scheduled_start_at >= datetime.combine(start, datetime.min.time(), UTC),
            Appointment.scheduled_start_at < datetime.combine(end, datetime.min.time(), UTC),
        )
    )
    return int(result.scalar_one())


async def build_rule_context(
    db: AsyncSession,
    *,
    facility: Facility,
    supplier: Supplier,
    product_category: ProductCategory,
    vehicle_category_id: uuid.UUID | None,
    delivery_type: DeliveryType,
    target_date: date,
    duration_minutes: int,
    cargo_window: CargoWindow | None = None,
) -> RuleEvaluationContext:
    """Tesis konfigurasyonunu yukleyip framework bagimsiz rule context'i kurar."""
    docks = list(
        (
            await db.execute(
                select(Dock)
                .options(
                    selectinload(Dock.accepted_product_categories),
                    selectinload(Dock.accepted_vehicle_categories),
                )
                .where(Dock.facility_id == facility.id, Dock.is_active.is_(True))
            )
        ).scalars()
    )
    conflict_groups = list(
        (
            await db.execute(
                select(DockConflictGroup)
                .options(selectinload(DockConflictGroup.members))
                .where(
                    DockConflictGroup.facility_id == facility.id,
                    DockConflictGroup.is_active.is_(True),
                )
            )
        ).scalars()
    )
    overrides = list(
        (
            await db.execute(
                select(DockOverride).where(
                    DockOverride.facility_id == facility.id,
                    DockOverride.date == target_date,
                    DockOverride.is_active.is_(True),
                )
            )
        ).scalars()
    )
    day_start = datetime.combine(target_date - timedelta(days=1), datetime.min.time(), UTC)
    day_end = datetime.combine(target_date + timedelta(days=2), datetime.min.time(), UTC)
    existing = list(
        (
            await db.execute(
                select(Appointment).where(
                    Appointment.facility_id == facility.id,
                    Appointment.status.in_(BLOCKING_APPOINTMENT_STATUSES),
                    Appointment.scheduled_start_at >= day_start,
                    Appointment.scheduled_start_at < day_end,
                )
            )
        ).scalars()
    )

    week = _week_bounds(target_date)
    month = _month_bounds(target_date)
    return RuleEvaluationContext(
        facility=facility,
        supplier=supplier,
        product_category=product_category,
        vehicle_category_id=vehicle_category_id,
        delivery_type=delivery_type,
        target_date=target_date,
        duration_minutes=duration_minutes,
        cargo_window=cargo_window,
        docks=docks,
        conflict_groups=conflict_groups,
        overrides=overrides,
        existing_appointments=existing,
        supplier_week_count=await _count_supplier_appointments(db, supplier.id, *week),
        supplier_month_count=await _count_supplier_appointments(db, supplier.id, *month),
    )




async def create_appointment(
    db: AsyncSession,
    *,
    facility: Facility,
    supplier: Supplier,
    actor_type: ActorType,
    actor_id: uuid.UUID | None,
    created_by_type: CreatedByType,
    product_category_id: uuid.UUID,
    product_name: str,
    quantity: int,
    quantity_unit: QuantityUnit,
    target_date: date,
    delivery_type: DeliveryType = DeliveryType.standard,
    vehicle_category_id: uuid.UUID | None = None,
    license_plate: str | None = None,
    driver_name: str | None = None,
    driver_phone: str | None = None,
    start_at: datetime | None = None,
    duration_minutes: int | None = None,
    cargo_window: CargoWindow | None = None,
    recurring_rule: RecurringRule | None = None,
    series_id: uuid.UUID | None = None,
    occurrence_index: int | None = None,
    dock_id: uuid.UUID | None = None,
    allowed_dock_ids: list[uuid.UUID] | None = None,
    approved_override: bool = False,
    by_admin: bool = False,
    _audit_action: str = "appointment.create",
    _commit: bool = True,
    _notify: bool = True,
    _skip_lock: bool = False,
) -> Appointment:
    # Savunma: pasif tedarikci hicbir yoldan randevu olusturamaz
    # (admin on-behalf dahil; portal tarafinda auth katmani zaten engeller).
    if supplier.status != SupplierStatus.active:
        raise ApiError("SUPPLIER_INACTIVE", "Pasif tedarikci randevu olusturamaz", 403)

    # Kargo tedarikci bazinda acilir; kapaliyken admin adina olusturma dahil
    # hicbir yoldan kargo randevusu olusmaz.
    ensure_delivery_type_allowed(supplier, delivery_type)

    # Eszamanlilik: kilit altinda son-an availability degerlendirmesi yapilir;
    # ayni tesise paralel create/revise istekleri serialize edilir.
    # (_skip_lock: seri olusturma tum occurrence'lar icin kilidi BIR kez alir.)
    if not _skip_lock:
        await acquire_facility_lock(db, facility.id)

    result = await db.execute(
        select(ProductCategory).where(
            ProductCategory.id == product_category_id,
            ProductCategory.facility_id == facility.id,
            ProductCategory.is_active.is_(True),
        )
    )
    category = result.scalar_one_or_none()
    if category is None:
        raise NotFoundError("Urun kategorisi bulunamadi")

    # Arac kategorisi cozumu: tedarikci override > kategori varsayilani.
    resolved_vehicle_id = vehicle_category_id or category.default_vehicle_category_id
    if resolved_vehicle_id is not None:
        vc = (
            await db.execute(
                select(VehicleCategory).where(
                    VehicleCategory.id == resolved_vehicle_id,
                    VehicleCategory.facility_id == facility.id,
                    VehicleCategory.is_active.is_(True),
                )
            )
        ).scalar_one_or_none()
        if vc is None:
            raise NotFoundError("Arac kategorisi bulunamadi")

    cargo_min_block: int | None = None
    if delivery_type == DeliveryType.cargo:
        cargo_min_block = facility.cargo_default_min_block_minutes
        duration = duration_minutes or cargo_min_block
        duration = max(duration, cargo_min_block, category.min_block_minutes)
    else:
        duration = duration_minutes or category.min_block_minutes

    ctx = await build_rule_context(
        db,
        facility=facility,
        supplier=supplier,
        product_category=category,
        vehicle_category_id=resolved_vehicle_id,
        delivery_type=delivery_type,
        target_date=target_date,
        duration_minutes=duration,
        cargo_window=cargo_window,
    )
    if allowed_dock_ids is not None:
        # Rampa yoneticisi scope'u: yalnizca atanmis rampalar aday olur.
        ctx.docks = [d for d in ctx.docks if d.id in allowed_dock_ids]
    engine = AvailabilityService(ctx)

    check = engine.validate_request()
    if not check.ok:
        raise RuleViolationError(check.code or "RULE_VIOLATION", check.message or "")

    if not engine.compatible_docks():
        raise RuleViolationError(
            HardRuleCode.NO_COMPATIBLE_DOCK,
            "Urun/arac kategorisiyle uyumlu aktif rampa yok",
        )

    if delivery_type == DeliveryType.cargo:
        # Kargo: kesin slot yerine kaba pencere. Sert blokaj uretmez.
        start_dt, window_end = engine.cargo_bounds()
        end_dt = start_dt + timedelta(minutes=duration)
        if end_dt > window_end:
            end_dt = window_end
        start_dt, end_dt = to_utc(start_dt), to_utc(end_dt)
        dock = engine.choose_dock_for_cargo()
        if dock is None:
            raise RuleViolationError(
                HardRuleCode.DOCK_OUTSIDE_WORKING_HOURS,
                "Secilen gun icin acik uyumlu rampa yok",
            )
    else:
        if start_at is None:
            raise ApiError("VALIDATION_ERROR", "Standart randevu icin baslangic saati zorunlu")
        start_dt = to_utc(start_at)
        end_dt = start_dt + timedelta(minutes=duration)
        if dock_id is not None:
            # Manuel rampa (admin): uyumluluk + kural seti YINE tam uygulanir.
            dock = next((d for d in engine.compatible_docks() if d.id == dock_id), None)
            if dock is None:
                raise RuleViolationError(
                    HardRuleCode.NO_COMPATIBLE_DOCK,
                    "Secilen rampa bu urun/arac kategorisiyle uyumlu degil veya "
                    "yetkili rampalarinizin disinda",
                )
            status_check = engine.interval_status(dock, start_dt, end_dt)
            if not status_check.ok:
                code = status_check.code or HardRuleCode.DOCK_TIME_CONFLICT
                raise RuleViolationError(code, HardRuleResult.failed(code).message or "")
        else:
            dock = engine.choose_dock(start_dt, end_dt)
        if dock is None:
            codes = [
                r.code
                for d in engine.compatible_docks()
                if (r := engine.interval_status(d, start_dt, end_dt)).code
            ]
            code = codes[0] if codes else HardRuleCode.DOCK_TIME_CONFLICT
            raise RuleViolationError(code, HardRuleResult.failed(code).message or "")

    appointment = Appointment(
        tenant_id=facility.tenant_id,
        facility_id=facility.id,
        supplier_id=supplier.id,
        dock_id=dock.id,
        product_category_id=category.id,
        vehicle_category_id=resolved_vehicle_id,
        product_name=product_name,
        quantity=quantity,
        quantity_unit=quantity_unit,
        license_plate=license_plate,
        driver_name=driver_name,
        driver_phone=driver_phone,
        delivery_type=delivery_type,
        cargo_window=cargo_window,
        cargo_min_block_minutes=cargo_min_block,
        requested_start_at=start_dt,
        requested_end_at=end_dt,
        scheduled_start_at=start_dt,
        scheduled_end_at=end_dt,
        duration_minutes=duration,
        status=(
            AppointmentStatus.approved
            # Karar (Sprint 10): admin tesisin adina aciyorsa randevu ONAYLI dogar.
            if (approved_override or supplier.auto_approval_enabled)
            else AppointmentStatus.pending
        ),
        recurring_rule=recurring_rule,
        series_id=series_id,
        occurrence_index=occurrence_index,
        created_by_type=created_by_type,
        created_by_id=actor_id,
    )
    db.add(appointment)
    await db.flush()

    if _notify:
        await on_appointment_created(
            db, appointment, supplier.company_name, by_admin=by_admin
        )
    record_audit(
        db,
        actor_type=actor_type,
        actor_id=actor_id,
        action=_audit_action,
        tenant_id=appointment.tenant_id,
        facility_id=appointment.facility_id,
        entity_type="appointment",
        entity_id=appointment.id,
        after={"status": appointment.status.value, "dock_id": str(dock.id)},
    )
    if _commit:
        await db.commit()
        await db.refresh(appointment)
    return appointment


async def _get_for_update(
    db: AsyncSession, facility_id: uuid.UUID, appointment_id: uuid.UUID
) -> Appointment:
    result = await db.execute(
        select(Appointment).where(
            Appointment.id == appointment_id, Appointment.facility_id == facility_id
        )
    )
    appointment = result.scalar_one_or_none()
    if appointment is None:
        raise NotFoundError("Randevu bulunamadi")
    return appointment


async def _finalize_action(
    db: AsyncSession,
    appointment: Appointment,
    *,
    action: str,
    actor_type: ActorType,
    actor_id: uuid.UUID | None,
    before_status: AppointmentStatus,
) -> Appointment:
    record_audit(
        db,
        actor_type=actor_type,
        actor_id=actor_id,
        action=f"appointment.{action}",
        tenant_id=appointment.tenant_id,
        facility_id=appointment.facility_id,
        entity_type="appointment",
        entity_id=appointment.id,
        before={"status": before_status.value},
        after={"status": appointment.status.value},
    )
    await db.commit()
    await db.refresh(appointment)
    return appointment


async def approve_appointment(
    db: AsyncSession,
    facility_id: uuid.UUID,
    appointment_id: uuid.UUID,
    *,
    actor_type: ActorType,
    actor_id: uuid.UUID | None,
) -> Appointment:
    appointment = await _get_for_update(db, facility_id, appointment_id)
    before = appointment.status
    if before not in (AppointmentStatus.pending, AppointmentStatus.revision_pending):
        raise InvalidTransitionError(before, "approve")
    appointment.status = AppointmentStatus.approved
    await on_lifecycle_action(db, appointment, action="approve")
    return await _finalize_action(
        db,
        appointment,
        action="approve",
        actor_type=actor_type,
        actor_id=actor_id,
        before_status=before,
    )


async def reject_appointment(
    db: AsyncSession,
    facility_id: uuid.UUID,
    appointment_id: uuid.UUID,
    *,
    reason: str,
    actor_type: ActorType,
    actor_id: uuid.UUID | None,
) -> Appointment:
    appointment = await _get_for_update(db, facility_id, appointment_id)
    before = appointment.status
    if before != AppointmentStatus.pending:
        raise InvalidTransitionError(before, "reject")
    appointment.status = AppointmentStatus.rejected
    appointment.rejection_reason = reason
    await on_lifecycle_action(db, appointment, action="reject", reason=reason)
    return await _finalize_action(
        db,
        appointment,
        action="reject",
        actor_type=actor_type,
        actor_id=actor_id,
        before_status=before,
    )


async def revise_appointment(
    db: AsyncSession,
    facility_id: uuid.UUID,
    appointment_id: uuid.UUID,
    *,
    new_start_at: datetime,
    new_duration_minutes: int | None,
    new_dock_id: uuid.UUID | None,
    auto_assign_dock: bool = False,
    note: str | None,
    actor_type: ActorType,
    actor_id: uuid.UUID | None,
    allowed_dock_ids: list[uuid.UUID] | None = None,
) -> Appointment:
    """Revize akisi kargo varisinda da AYNEN kullanilir; yeni modal/statu yoktur.

    Hedef aralik kilit altinda YENIDEN dogrulanir (kendisi haric): rampa
    uyumu, calisma saatleri/override, cakisma ve cakisma gruplari.
    Lifecycle karari: revize her zaman `revision_pending` uretir (v2.0 —
    tedarikcinin gorusu beklenir); admin gerekiyorsa ardindan onaylar.
    `allowed_dock_ids`: rampa yoneticisi scope'u — hedef rampa bu listede olmali.
    """
    from zoneinfo import ZoneInfo

    from app.rules.availability import AvailabilityService
    from app.rules.context import HardRuleCode, HardRuleResult

    appointment = await _get_for_update(db, facility_id, appointment_id)
    before = appointment.status
    if before not in (
        AppointmentStatus.pending,
        AppointmentStatus.approved,
        AppointmentStatus.revision_pending,
    ):
        raise InvalidTransitionError(before, "revise")

    await acquire_facility_lock(db, facility_id)

    duration = new_duration_minutes or appointment.duration_minutes
    new_start_at = to_utc(new_start_at)
    new_end = new_start_at + timedelta(minutes=duration)

    # Hedef gun icin taze rule context (kendisi haric)
    facility = (
        await db.execute(select(Facility).where(Facility.id == facility_id))
    ).scalar_one()
    supplier = (
        await db.execute(
            select(Supplier)
            .options(selectinload(Supplier.allowed_product_categories))
            .where(Supplier.id == appointment.supplier_id)
        )
    ).scalar_one()
    category = (
        await db.execute(
            select(ProductCategory).where(
                ProductCategory.id == appointment.product_category_id
            )
        )
    ).scalar_one()
    target_date = new_start_at.astimezone(ZoneInfo(facility.timezone)).date()
    ctx = await build_rule_context(
        db,
        facility=facility,
        supplier=supplier,
        product_category=category,
        vehicle_category_id=appointment.vehicle_category_id,
        delivery_type=appointment.delivery_type,
        target_date=target_date,
        duration_minutes=duration,
        cargo_window=appointment.cargo_window,
    )
    ctx.existing_appointments = [
        a for a in ctx.existing_appointments if a.id != appointment.id
    ]
    engine = AvailabilityService(ctx)

    # Sure limitleri YALNIZCA sure gercekten degistiginde dogrulanir. Eski
    # limitlerle acilmis bir randevunun saatini tasimak, limitler sonradan
    # daraltildi diye engellenmemelidir (canli veri guvenligi).
    if duration != appointment.duration_minutes:
        duration_check = engine.validate_duration()
        if not duration_check.ok:
            raise RuleViolationError(
                duration_check.code or "RULE_VIOLATION", duration_check.message or ""
            )

    compatible = {d.id: d for d in engine.compatible_docks()}

    if auto_assign_dock:
        candidates = [
            d
            for d in compatible.values()
            if engine.interval_status(d, new_start_at, new_end).ok
            and (allowed_dock_ids is None or d.id in allowed_dock_ids)
        ]
        if not candidates:
            raise RuleViolationError(
                "SLOT_NO_LONGER_AVAILABLE",
                "Secilen aralik icin uygun rampa kalmadi",
            )
        target_dock = engine.choose_dock(new_start_at, new_end)
        if target_dock is None or (
            allowed_dock_ids is not None and target_dock.id not in allowed_dock_ids
        ):
            target_dock = candidates[0]
        resolved_dock_id = target_dock.id
    else:
        resolved_dock_id = new_dock_id or appointment.dock_id
        if resolved_dock_id is None:
            raise ApiError("VALIDATION_ERROR", "Hedef rampa belirtilmeli", 422)
        if allowed_dock_ids is not None and resolved_dock_id not in allowed_dock_ids:
            raise ApiError("FORBIDDEN", "Bu rampada islem yetkiniz yok", 403)
        dock = compatible.get(resolved_dock_id)
        if dock is None:
            raise RuleViolationError(
                HardRuleCode.NO_COMPATIBLE_DOCK,
                "Secilen rampa bu randevunun urun/arac kategorisiyle uyumlu degil",
            )
        status_check = engine.interval_status(dock, new_start_at, new_end)
        if not status_check.ok:
            code = status_check.code or HardRuleCode.DOCK_TIME_CONFLICT
            raise RuleViolationError(code, HardRuleResult.failed(code).message or "")

    old_start_iso = to_utc(appointment.scheduled_start_at).isoformat()
    db.add(
        AppointmentRevision(
            appointment_id=appointment.id,
            old_start_at=appointment.scheduled_start_at,
            old_end_at=appointment.scheduled_end_at,
            old_dock_id=appointment.dock_id,
            new_start_at=new_start_at,
            new_end_at=new_end,
            new_dock_id=resolved_dock_id,
            note=note,
            revised_by_user_id=actor_id,
        )
    )
    if appointment.original_start_at is None:
        appointment.original_start_at = appointment.scheduled_start_at
        appointment.original_end_at = appointment.scheduled_end_at
    appointment.scheduled_start_at = new_start_at
    appointment.scheduled_end_at = new_end
    appointment.duration_minutes = duration
    appointment.dock_id = resolved_dock_id
    appointment.revision_note = note
    appointment.status = AppointmentStatus.revision_pending
    await on_lifecycle_action(
        db, appointment, action="revise",
        old_start=old_start_iso, new_start=new_start_at.isoformat(),
    )
    return await _finalize_action(
        db,
        appointment,
        action="revise",
        actor_type=actor_type,
        actor_id=actor_id,
        before_status=before,
    )


async def _dock_change_engine(
    db: AsyncSession,
    facility_id: uuid.UUID,
    appointment: Appointment,
):
    """Randevunun MEVCUT araligi icin taze kural motoru (kendisi haric).

    Rampa degisiminde saat/sure degismedigi icin hedef aralik randevunun
    kendi araligidir; kendisi disarida birakilmazsa rampa "dolu" gorunur.
    """
    from zoneinfo import ZoneInfo

    facility = (
        await db.execute(select(Facility).where(Facility.id == facility_id))
    ).scalar_one()
    supplier = (
        await db.execute(
            select(Supplier)
            .options(selectinload(Supplier.allowed_product_categories))
            .where(Supplier.id == appointment.supplier_id)
        )
    ).scalar_one()
    category = (
        await db.execute(
            select(ProductCategory).where(
                ProductCategory.id == appointment.product_category_id
            )
        )
    ).scalar_one()
    start = to_utc(appointment.scheduled_start_at)
    end = to_utc(appointment.scheduled_end_at)
    target_date = start.astimezone(ZoneInfo(facility.timezone)).date()
    ctx = await build_rule_context(
        db,
        facility=facility,
        supplier=supplier,
        product_category=category,
        vehicle_category_id=appointment.vehicle_category_id,
        delivery_type=appointment.delivery_type,
        target_date=target_date,
        duration_minutes=appointment.duration_minutes,
        cargo_window=appointment.cargo_window,
    )
    ctx.existing_appointments = [
        a for a in ctx.existing_appointments if a.id != appointment.id
    ]
    return AvailabilityService(ctx), start, end


async def list_dock_options(
    db: AsyncSession,
    facility_id: uuid.UUID,
    appointment_id: uuid.UUID,
    *,
    allowed_dock_ids: list[uuid.UUID] | None = None,
) -> list[dict]:
    """Bu randevunun tasinabilecegi rampalar — her biri icin sebepli durum.

    UI'in "uygun rampalar" listesini SUNUCU kararindan cizmesi icin var:
    istemci uyumluluk/doluluk mantigini kopyalamaz, yalnizca gosterir.
    Uyumsuz rampalar listeye HIC girmez; uyumlu ama dolu olanlar
    `available=false` + sebep ile doner ki kullanici neden secemedigini gorsun.
    """
    appointment = (
        await db.execute(
            select(Appointment).where(
                Appointment.facility_id == facility_id, Appointment.id == appointment_id
            )
        )
    ).scalar_one_or_none()
    if appointment is None:
        raise NotFoundError("Randevu bulunamadi")

    engine, start, end = await _dock_change_engine(db, facility_id, appointment)
    options: list[dict] = []
    for dock in engine.compatible_docks():
        if allowed_dock_ids is not None and dock.id not in allowed_dock_ids:
            continue
        status = engine.interval_status(dock, start, end)
        options.append(
            {
                "dock_id": str(dock.id),
                "name": dock.name,
                "is_current": dock.id == appointment.dock_id,
                "available": bool(status.ok),
                # HardRuleResult.code zaten duz string (HardRuleCode str-enum'un
                # degeri); .value cagrilmaz.
                "reason_code": status.code,
                "reason": status.message,
                # Gun ici doluluk: "en az dolu" siralamasinin kullaniciya
                # gorunen karsiligi.
                "booked_minutes_today": engine.booked_minutes_on_target_day(dock.id),
            }
        )
    return sorted(options, key=lambda o: (not o["available"], o["booked_minutes_today"], o["name"]))


async def change_appointment_dock(
    db: AsyncSession,
    facility_id: uuid.UUID,
    appointment_id: uuid.UUID,
    *,
    dock_id: uuid.UUID | None,
    actor_type: ActorType,
    actor_id: uuid.UUID | None,
    note: str | None = None,
    allowed_dock_ids: list[uuid.UUID] | None = None,
) -> Appointment:
    """Saat/sure AYNI kalarak yalnizca rampayi degistirir.

    Urun karari: rampa degisimi revize DEGILDIR — randevu durumu korunur ve
    tedarikciden yeniden onay istenmez; tedarikci yalnizca bilgilendirilir.
    Gerekce: tedarikcinin taahhut ettigi saat degismiyor, yalnizca tesis ici
    yerlesim degisiyor.

    `dock_id=None` => otomatik: uyumlu ve o aralikta BOS rampalar arasindan
    gun ici en az dolu olani secilir (olusturma akisiyla ayni kural).
    Hedef aralik kilit altinda yeniden dogrulanir.
    """
    appointment = await _get_for_update(db, facility_id, appointment_id)
    before = appointment.status
    # Kapanmis/iptal randevunun rampasi degistirilemez (gecmis kayit bozulmaz).
    if before not in (
        AppointmentStatus.pending,
        AppointmentStatus.approved,
        AppointmentStatus.revision_pending,
    ):
        raise InvalidTransitionError(before, "change_dock")

    await acquire_facility_lock(db, facility_id)
    engine, start, end = await _dock_change_engine(db, facility_id, appointment)
    compatible = {d.id: d for d in engine.compatible_docks()}

    if dock_id is None:
        candidates = [
            d
            for d in compatible.values()
            if engine.interval_status(d, start, end).ok
            and (allowed_dock_ids is None or d.id in allowed_dock_ids)
        ]
        if not candidates:
            raise RuleViolationError(
                HardRuleCode.DOCK_TIME_CONFLICT,
                "Bu saatte uygun ve bos baska rampa yok",
            )
        target = min(
            candidates, key=lambda d: (engine.booked_minutes_on_target_day(d.id), d.name)
        )
    else:
        target = compatible.get(dock_id)
        if target is None or (allowed_dock_ids is not None and dock_id not in allowed_dock_ids):
            raise RuleViolationError(
                HardRuleCode.NO_COMPATIBLE_DOCK,
                "Secilen rampa bu randevunun urun/arac kategorisiyle uyumlu degil "
                "veya yetkili rampalarinizin disinda",
            )
        status_check = engine.interval_status(target, start, end)
        if not status_check.ok:
            code = status_check.code or HardRuleCode.DOCK_TIME_CONFLICT
            raise RuleViolationError(code, HardRuleResult.failed(code).message or "")

    old_dock_id = appointment.dock_id
    if old_dock_id == target.id:
        # Degisiklik yok: bildirim/denetim gurultusu uretme.
        return appointment

    old_dock_name = None
    if old_dock_id is not None:
        old_dock = (
            await db.execute(select(Dock).where(Dock.id == old_dock_id))
        ).scalar_one_or_none()
        old_dock_name = old_dock.name if old_dock else None

    appointment.dock_id = target.id
    await on_lifecycle_action(
        db,
        appointment,
        action="dock_change",
        old_dock_name=old_dock_name,
        new_dock_name=target.name,
        reason=note,
    )
    record_audit(
        db,
        actor_type=actor_type,
        actor_id=actor_id,
        action="appointment.dock_change",
        tenant_id=appointment.tenant_id,
        facility_id=appointment.facility_id,
        entity_type="appointment",
        entity_id=appointment.id,
        before={"dock_id": str(old_dock_id) if old_dock_id else None, "dock_name": old_dock_name},
        after={"dock_id": str(target.id), "dock_name": target.name, "note": note},
    )
    await db.commit()
    await db.refresh(appointment)
    return appointment


async def complete_appointment(
    db: AsyncSession,
    facility_id: uuid.UUID,
    appointment_id: uuid.UUID,
    *,
    actor_type: ActorType,
    actor_id: uuid.UUID | None,
    note: str | None = None,
) -> Appointment:
    appointment = await _get_for_update(db, facility_id, appointment_id)
    before = appointment.status
    if before != AppointmentStatus.approved:
        raise InvalidTransitionError(before, "complete")
    appointment.status = AppointmentStatus.completed
    appointment.completion_note = note
    await on_lifecycle_action(db, appointment, action="complete")
    return await _finalize_action(
        db,
        appointment,
        action="complete",
        actor_type=actor_type,
        actor_id=actor_id,
        before_status=before,
    )


async def cancel_appointment(
    db: AsyncSession,
    facility_id: uuid.UUID,
    appointment_id: uuid.UUID,
    *,
    actor_type: ActorType,
    actor_id: uuid.UUID | None,
    supplier_id: uuid.UUID | None = None,
    reason: str | None = None,
) -> Appointment:
    appointment = await _get_for_update(db, facility_id, appointment_id)
    before = appointment.status

    if supplier_id is not None:
        # Tedarikci yalnizca kendi gelecek tarihli bekleyen/onayli randevusunu iptal eder.
        if appointment.supplier_id != supplier_id:
            raise NotFoundError("Randevu bulunamadi")
        if before not in (AppointmentStatus.pending, AppointmentStatus.approved):
            raise InvalidTransitionError(before, "cancel")
        if to_utc(appointment.scheduled_start_at) <= datetime.now(UTC):
            raise ApiError(
                "APPOINTMENT_IN_PAST",
                "Gecmis veya baslamis randevu iptal edilemez",
                409,
            )
    else:
        if before in (
            AppointmentStatus.completed,
            AppointmentStatus.cancelled,
            AppointmentStatus.rejected,
        ):
            raise InvalidTransitionError(before, "cancel")

    appointment.status = AppointmentStatus.cancelled
    appointment.cancellation_reason = reason
    await on_lifecycle_action(
        db, appointment, action="cancel", by_supplier=supplier_id is not None, reason=reason
    )
    return await _finalize_action(
        db,
        appointment,
        action="cancel",
        actor_type=actor_type,
        actor_id=actor_id,
        before_status=before,
    )


def _add_months_clamped(dt: datetime, months: int) -> datetime:
    """Ay ekler; hedef ayda gun yoksa AYIN SON GUNUNE kirpar (rapor karari)."""
    month_index = dt.month - 1 + months
    year = dt.year + month_index // 12
    month = month_index % 12 + 1
    last_day = calendar.monthrange(year, month)[1]
    return dt.replace(year=year, month=month, day=min(dt.day, last_day))


_FREQUENCY_RULES = {
    "weekly": RecurringRule.weekly,
    "biweekly": RecurringRule.biweekly,
    "monthly": RecurringRule.monthly,
}


def _occurrence_start(start_at: datetime, frequency: str, index: int) -> datetime:
    if frequency == "weekly":
        return start_at + timedelta(days=7 * index)
    if frequency == "biweekly":
        return start_at + timedelta(days=14 * index)
    return _add_months_clamped(start_at, index)


async def create_appointment_series(
    db: AsyncSession,
    *,
    facility: Facility,
    supplier: Supplier,
    actor_type: ActorType,
    actor_id: uuid.UUID | None,
    created_by_type: CreatedByType,
    frequency: str,
    occurrence_count: int,
    start_at: datetime,
    _audit_action: str = "appointment_series.create",
    **base_kwargs,
) -> tuple[AppointmentSeries, list[Appointment]]:
    """Tekrarlayan seri olusturur — ALL-OR-NOTHING.

    Tek facility kilidi altinda her occurrence sirayla tam kural setinden
    (uygunluk, kota, cakisma gruplari) gecer; biri gecemezse
    RECURRING_OCCURRENCE_FAILED ile TAMAMI reddedilir (rollback).
    Bildirim spam'i yoktur: adminlere ve tedarikciye BIRER ozet bildirim.
    """
    from zoneinfo import ZoneInfo

    from app.services.notifications import notify_admins, notify_supplier

    if base_kwargs.get("delivery_type", DeliveryType.standard) == DeliveryType.cargo:
        raise ApiError(
            "RECURRING_CARGO_NOT_SUPPORTED",
            "Kargo teslimati tekrarlayan seriyle birlestirilemez",
            422,
        )
    if start_at is None:
        raise ApiError(
            "VALIDATION_ERROR", "Tekrarlayan seri icin baslangic saati zorunlu", 422
        )

    await acquire_facility_lock(db, facility.id)
    tz = ZoneInfo(facility.timezone)

    series = AppointmentSeries(
        tenant_id=facility.tenant_id,
        facility_id=facility.id,
        supplier_id=supplier.id,
        recurrence_frequency=frequency,
        occurrence_count=occurrence_count,
        created_by_id=actor_id,
    )
    db.add(series)
    await db.flush()

    appointments: list[Appointment] = []
    for index in range(occurrence_count):
        occurrence_start = _occurrence_start(to_utc(start_at), frequency, index)
        try:
            appointment = await create_appointment(
                db,
                facility=facility,
                supplier=supplier,
                actor_type=actor_type,
                actor_id=actor_id,
                created_by_type=created_by_type,
                start_at=occurrence_start,
                target_date=occurrence_start.astimezone(tz).date(),
                recurring_rule=_FREQUENCY_RULES[frequency],
                series_id=series.id,
                occurrence_index=index + 1,
                _commit=False,
                _notify=False,
                _skip_lock=True,
                **base_kwargs,
            )
        except ApiError as exc:
            # ALL-OR-NOTHING: hangi occurrence'in neden dustugunu bildir;
            # exception yayilinca transaction tamamen geri alinir.
            raise ApiError(
                "RECURRING_OCCURRENCE_FAILED",
                (
                    f"{index + 1}. tekrar ({occurrence_start.astimezone(tz):%d.%m.%Y %H:%M}) "
                    f"olusturulamadi: {exc.message}"
                ),
                422,
                details={
                    "occurrence_index": index + 1,
                    "occurrence_date": occurrence_start.astimezone(tz).date().isoformat(),
                    "code": exc.code,
                },
            ) from exc
        appointments.append(appointment)

    # Tek ozet bildirim (spam yok)
    first = appointments[0]
    auto_approved = first.status == AppointmentStatus.approved
    frequency_labels = {"weekly": "haftalık", "biweekly": "2 haftada bir", "monthly": "aylık"}
    await notify_admins(
        db, first,
        type_="appointment_created",
        severity="info" if auto_approved else "warning",
        title="Tekrarlayan randevu serisi",
        body=(
            f"{supplier.company_name}, {occurrence_count} randevuluk "
            f"{frequency_labels[frequency]} seri oluşturdu"
            + (" (otomatik onaylandı)." if auto_approved else " — onay bekliyor.")
        ),
        extra={"series_id": str(series.id)},
    )
    await notify_supplier(
        db, first,
        type_="appointment_approved" if auto_approved else "appointment_created",
        severity="success" if auto_approved else "info",
        title=(
            f"{occurrence_count} randevunuz onaylandı"
            if auto_approved
            else f"{occurrence_count} randevu talebiniz alındı"
        ),
        body=f"{frequency_labels[frequency].capitalize()} tekrarlayan seri oluşturuldu.",
        extra={"series_id": str(series.id)},
    )
    record_audit(
        db,
        actor_type=actor_type,
        actor_id=actor_id,
        action=_audit_action,
        tenant_id=facility.tenant_id,
        facility_id=facility.id,
        entity_type="appointment_series",
        entity_id=series.id,
        after={
            "frequency": frequency,
            "occurrence_count": occurrence_count,
            "supplier_id": str(supplier.id),
        },
    )
    await db.commit()
    for appointment in appointments:
        await db.refresh(appointment)
    await db.refresh(series)
    return series, appointments


async def cancel_appointment_series(
    db: AsyncSession,
    *,
    facility: Facility,
    series_id: uuid.UUID,
    actor_type: ActorType,
    actor_id: uuid.UUID | None,
    reason: str | None = None,
    allowed_dock_ids: list[uuid.UUID] | None = None,
    supplier_id: uuid.UUID | None = None,
    by_supplier: bool = False,
) -> tuple[AppointmentSeries, list[Appointment]]:
    """Serinin GELECEKTEKI iptal edilebilir randevularini toplu iptal eder.

    Sprint 12: `supplier_id` verilirse yalnizca KENDI serisi (aksi 404);
    `by_supplier=True` ise bildirim yonu tersine doner — adminlere tek ozet
    gider, tedarikciye bildirim/e-posta uretilmez (islemi kendisi yapti).

    Kurallar (rapor):
    - Scope MVP'de future_only'dir: yalnizca pending/approved/revision_pending
      VE baslangici gelecekte olan occurrence'lar iptal edilir.
    - completed/rejected/cancelled ve gecmis randevulara DOKUNULMAZ.
    - Rampa yoneticisi scope'u all-or-nothing: etkilenecek occurrence'lardan
      biri bile scope disindaysa 403 (kismi seri iptali yapilmaz).
    - Bildirim/e-posta SPAM'i yok: tedarikciye TEK ozet bildirim + TEK e-posta,
      adminlere TEK ozet bildirim.
    """
    from app.services.notifications import notify_admins, notify_supplier

    series = (
        await db.execute(
            select(AppointmentSeries).where(
                AppointmentSeries.id == series_id,
                AppointmentSeries.facility_id == facility.id,
            )
        )
    ).scalar_one_or_none()
    if series is None:
        raise NotFoundError("Seri bulunamadi")
    if supplier_id is not None and series.supplier_id != supplier_id:
        raise NotFoundError("Seri bulunamadi")

    cancellable = (
        AppointmentStatus.pending,
        AppointmentStatus.approved,
        AppointmentStatus.revision_pending,
    )
    rows = list(
        (
            await db.execute(
                select(Appointment)
                .where(
                    Appointment.series_id == series.id,
                    Appointment.status.in_(cancellable),
                )
                .order_by(Appointment.occurrence_index)
            )
        ).scalars()
    )
    now = datetime.now(UTC)
    affected = [a for a in rows if to_utc(a.scheduled_start_at) > now]
    if not affected:
        raise ApiError(
            "NO_FUTURE_OCCURRENCES",
            "Bu seride iptal edilebilecek gelecek tarihli randevu yok",
            409,
        )
    if allowed_dock_ids is not None:
        outside = [a for a in affected if a.dock_id not in allowed_dock_ids]
        if outside:
            raise ApiError(
                "FORBIDDEN",
                "Seri, yetkili rampalarinizin disinda randevular iceriyor; "
                "seri iptali icin sistem yoneticisi gerekli",
                403,
            )

    for appointment in affected:
        appointment.status = AppointmentStatus.cancelled
        appointment.cancellation_reason = reason
    series.status = "cancelled"

    first = affected[0]
    frequency_labels = {"weekly": "haftalık", "biweekly": "2 haftada bir", "monthly": "aylık"}
    frequency = frequency_labels.get(series.recurrence_frequency, series.recurrence_frequency)
    if by_supplier:
        # Tedarikci kendisi iptal etti: adminlere TEK ozet; tedarikciye uretim yok.
        await notify_admins(
            db, first,
            type_="appointment_cancelled",
            severity="warning",
            title="Seri tedarikçi tarafından iptal edildi",
            body=(
                f"Tedarikçi, serinin gelecekteki {len(affected)} randevusunu iptal etti. "
                f"Sebep: {reason}"
            ),
            extra={"series_id": str(series.id), "affected_count": len(affected)},
        )
    else:
        await notify_supplier(
            db, first,
            type_="appointment_cancelled",
            severity="warning",
            title="Tekrarlayan seriniz iptal edildi",
            body=(
                f"{frequency.capitalize()} serinizin gelecekteki {len(affected)} randevusu "
                "iptal edildi." + (f" Sebep: {reason}" if reason else "")
            ),
            extra={"series_id": str(series.id), "affected_count": len(affected)},
        )
        await notify_admins(
            db, first,
            type_="appointment_cancelled",
            severity="warning",
            title="Tekrarlayan seri iptal edildi",
            body=f"Serinin gelecekteki {len(affected)} randevusu iptal edildi.",
            extra={"series_id": str(series.id), "affected_count": len(affected)},
        )
    # Tedarikciye TEK ozet e-posta (occurrence basina e-posta YOK; kendi
    # iptalinde e-posta da uretilmez)
    from app.services.email import EmailMessage, send_email
    from app.services.email_templates import EmailContext, render_email
    from app.services.notification_preferences import prefs_email_allowed
    from app.services.notifications import _supplier_email, _supplier_policy

    email, supplier_name = await _supplier_email(db, series.supplier_id)
    policy = await _supplier_policy(db, facility.id)
    if email and not by_supplier and prefs_email_allowed(policy, "appointment_series_cancelled"):
        subject, body = render_email(
            "appointment_series_cancelled",
            EmailContext(
                supplier_name=supplier_name or "Tedarikçi",
                product_name=first.product_name,
                when=to_utc(first.scheduled_start_at).strftime("%d.%m.%Y %H:%M"),
                reason=reason,
                occurrence_count=len(affected),
            ),
        )
        await send_email(
            db,
            EmailMessage(
                tenant_id=facility.tenant_id,
                facility_id=facility.id,
                recipient_email=email,
                recipient_name=supplier_name,
                subject=subject,
                body=body,
                template_key="appointment_series_cancelled",
                appointment_id=first.id,
                metadata={"series_id": str(series.id), "affected_count": len(affected)},
            ),
        )
    record_audit(
        db,
        actor_type=actor_type,
        actor_id=actor_id,
        action="appointment_series.cancel",
        tenant_id=facility.tenant_id,
        facility_id=facility.id,
        entity_type="appointment_series",
        entity_id=series.id,
        after={
            "scope": "future_only",
            "affected_count": len(affected),
            "reason": reason,
        },
    )
    await db.commit()
    await db.refresh(series)
    return series, affected


async def revise_appointment_series(
    db: AsyncSession,
    *,
    facility: Facility,
    series_id: uuid.UUID,
    actor_type: ActorType,
    actor_id: uuid.UUID | None,
    new_time: str,  # "HH:MM" (tesis saat diliminde)
    duration_minutes: int | None = None,
    dock_id: uuid.UUID | None = None,
    auto_assign_dock: bool = True,
    note: str | None = None,
    allowed_dock_ids: list[uuid.UUID] | None = None,
) -> tuple[AppointmentSeries, list[Appointment]]:
    """Serinin GELECEKTEKI randevularini ayni saate/sureye kaydirir.

    Kurallar (rapor):
    - Scope future_only: pending/approved/revision_pending + gelecek.
    - Her occurrence TAM kural setinden gecer; biri uymazsa HICBIRI degismez
      (all-or-nothing, SERIES_REVISE_OCCURRENCE_FAILED + index/tarih/kod).
    - Tekil revise ile tutarli: tum occurrence'lar revision_pending olur,
      revizyon gecmisi occurrence basina yazilir.
    - Bildirim spam'i yok: tedarikciye TEK ozet bildirim + TEK e-posta;
      ekip e-postasi gonderilmez (rapor karari).
    - Rampa yoneticisi scope'u all-or-nothing (kaynak + hedef rampalar).
    """
    from zoneinfo import ZoneInfo

    from app.services.notifications import notify_supplier

    try:
        hour, minute = (int(part) for part in new_time.split(":"))
        if not (0 <= hour <= 23 and 0 <= minute <= 59):
            raise ValueError
    except ValueError:
        raise ApiError("VALIDATION_ERROR", "Saat 'HH:MM' biciminde olmali", 422) from None

    series = (
        await db.execute(
            select(AppointmentSeries).where(
                AppointmentSeries.id == series_id,
                AppointmentSeries.facility_id == facility.id,
            )
        )
    ).scalar_one_or_none()
    if series is None:
        raise NotFoundError("Seri bulunamadi")

    revisable = (
        AppointmentStatus.pending,
        AppointmentStatus.approved,
        AppointmentStatus.revision_pending,
    )
    rows = list(
        (
            await db.execute(
                select(Appointment)
                .where(
                    Appointment.series_id == series.id,
                    Appointment.status.in_(revisable),
                )
                .order_by(Appointment.occurrence_index)
            )
        ).scalars()
    )
    now = datetime.now(UTC)
    affected = [a for a in rows if to_utc(a.scheduled_start_at) > now]
    if not affected:
        raise ApiError(
            "NO_FUTURE_OCCURRENCES",
            "Bu seride revize edilebilecek gelecek tarihli randevu yok",
            409,
        )
    if allowed_dock_ids is not None:
        outside = [a for a in affected if a.dock_id not in allowed_dock_ids]
        if outside or (dock_id is not None and dock_id not in allowed_dock_ids):
            raise ApiError(
                "FORBIDDEN",
                "Seri, yetkili rampalarinizin disinda randevular iceriyor; "
                "seri revizesi icin sistem yoneticisi gerekli",
                403,
            )

    await acquire_facility_lock(db, facility.id)
    tz = ZoneInfo(facility.timezone)
    supplier = (
        await db.execute(
            select(Supplier)
            .options(selectinload(Supplier.allowed_product_categories))
            .where(Supplier.id == series.supplier_id)
        )
    ).scalar_one()
    category = (
        await db.execute(
            select(ProductCategory).where(
                ProductCategory.id == affected[0].product_category_id
            )
        )
    ).scalar_one()

    from app.rules.availability import AvailabilityService
    from app.rules.context import HardRuleCode

    for appointment in affected:
        duration = duration_minutes or appointment.duration_minutes
        local_day = to_utc(appointment.scheduled_start_at).astimezone(tz).date()
        new_start = to_utc(
            datetime(local_day.year, local_day.month, local_day.day, hour, minute, tzinfo=tz)
        )
        new_end = new_start + timedelta(minutes=duration)

        ctx = await build_rule_context(
            db,
            facility=facility,
            supplier=supplier,
            product_category=category,
            vehicle_category_id=appointment.vehicle_category_id,
            delivery_type=appointment.delivery_type,
            target_date=local_day,
            duration_minutes=duration,
            cargo_window=appointment.cargo_window,
        )
        # Kendisi haric degerlendir (kendi eski slotu blokaj sayilmasin)
        ctx.existing_appointments = [
            a for a in ctx.existing_appointments if a.id != appointment.id
        ]
        if allowed_dock_ids is not None:
            ctx.docks = [d for d in ctx.docks if d.id in allowed_dock_ids]
        engine = AvailabilityService(ctx)
        compatible = {d.id: d for d in engine.compatible_docks()}

        def _fail(code, appt=appointment, day=local_day):
            raise RuleViolationError(
                "SERIES_REVISE_OCCURRENCE_FAILED",
                (
                    f"{appt.occurrence_index}. randevu ({day.strftime('%d.%m.%Y')} "
                    f"{new_time}) revize edilemedi"
                ),
                details={
                    "occurrence_index": appt.occurrence_index,
                    "occurrence_date": day.isoformat(),
                    "code": str(code),
                },
            )

        # Tekil revize ile ayni kural: sure degistiyse limitler yeniden gecerli.
        if duration != appointment.duration_minutes:
            duration_check = engine.validate_duration()
            if not duration_check.ok:
                _fail(duration_check.code or "RULE_VIOLATION")

        if dock_id is not None and not auto_assign_dock:
            target = compatible.get(dock_id)
            if target is None:
                _fail(HardRuleCode.NO_COMPATIBLE_DOCK)
            check = engine.interval_status(target, new_start, new_end)
            if not check.ok:
                _fail(check.code or HardRuleCode.DOCK_TIME_CONFLICT)
        else:
            target = engine.choose_dock(new_start, new_end)
            if target is None:
                codes = [
                    r.code
                    for d in compatible.values()
                    if (r := engine.interval_status(d, new_start, new_end)).code
                ]
                _fail(codes[0] if codes else HardRuleCode.DOCK_TIME_CONFLICT)

        db.add(
            AppointmentRevision(
                appointment_id=appointment.id,
                old_start_at=appointment.scheduled_start_at,
                old_end_at=appointment.scheduled_end_at,
                old_dock_id=appointment.dock_id,
                new_start_at=new_start,
                new_end_at=new_end,
                new_dock_id=target.id,
                note=note,
                revised_by_user_id=actor_id,
            )
        )
        if appointment.original_start_at is None:
            appointment.original_start_at = appointment.scheduled_start_at
            appointment.original_end_at = appointment.scheduled_end_at
        appointment.scheduled_start_at = new_start
        appointment.scheduled_end_at = new_end
        appointment.duration_minutes = duration
        appointment.dock_id = target.id
        appointment.revision_note = note
        appointment.status = AppointmentStatus.revision_pending
        await db.flush()

    # TEK ozet bildirim + TEK e-posta (occurrence basina uretim YOK)
    first = affected[0]
    await notify_supplier(
        db, first,
        type_="appointment_revised",
        severity="warning",
        title="Tekrarlayan seriniz revize edildi",
        body=(
            f"Serideki {len(affected)} randevu için yeni saat önerildi: {new_time}."
            + (f" Not: {note}" if note else "")
        ),
        extra={"series_id": str(series.id), "affected_count": len(affected)},
    )
    from app.services.email import EmailMessage, send_email
    from app.services.email_templates import EmailContext, render_email
    from app.services.notification_preferences import prefs_email_allowed
    from app.services.notifications import _supplier_email, _supplier_policy

    email, supplier_name = await _supplier_email(db, series.supplier_id)
    policy = await _supplier_policy(db, facility.id)
    if email and prefs_email_allowed(policy, "appointment_series_revised"):
        subject, body = render_email(
            "appointment_series_revised",
            EmailContext(
                supplier_name=supplier_name or "Tedarikçi",
                product_name=first.product_name,
                when=to_utc(first.scheduled_start_at).strftime("%d.%m.%Y %H:%M"),
                new_when=new_time,
                note=note,
                occurrence_count=len(affected),
            ),
        )
        await send_email(
            db,
            EmailMessage(
                tenant_id=facility.tenant_id,
                facility_id=facility.id,
                recipient_email=email,
                recipient_name=supplier_name,
                subject=subject,
                body=body,
                template_key="appointment_series_revised",
                appointment_id=first.id,
                metadata={"series_id": str(series.id), "affected_count": len(affected)},
            ),
        )
    record_audit(
        db,
        actor_type=actor_type,
        actor_id=actor_id,
        action="appointment_series.revise",
        tenant_id=facility.tenant_id,
        facility_id=facility.id,
        entity_type="appointment_series",
        entity_id=series.id,
        after={
            "scope": "future_only",
            "new_time": new_time,
            "duration_minutes": duration_minutes,
            "affected_count": len(affected),
            "note": note,
        },
    )
    await db.commit()
    for appointment in affected:
        await db.refresh(appointment)
    return series, affected


async def approve_appointment_series(
    db: AsyncSession,
    *,
    facility: Facility,
    series_id: uuid.UUID,
    actor_type: ActorType,
    actor_id: uuid.UUID | None,
    note: str | None = None,
    allowed_dock_ids: list[uuid.UUID] | None = None,
) -> tuple[AppointmentSeries, list[Appointment]]:
    """Serinin GELECEKTEKI revision_pending randevularini toplu onaylar.

    Kurallar (rapor):
    - Scope MVP'de revision_pending_future_only: yalnizca gelecek tarihli
      revision_pending occurrence'lar; completed/rejected/cancelled/pending
      DOKUNULMAZ (pending'ler normal tekil onay akisinda kalir — karar).
    - Onay aninda cakisma YENIDEN kontrol edilir (revize ile onay arasinda
      slot degismis olabilir); biri cakisiyorsa HICBIRI onaylanmaz
      (all-or-nothing, SERIES_APPROVE_OCCURRENCE_FAILED + index/tarih/kod).
    - Tedarikciye TEK ozet bildirim + TEK e-posta (tercihlere tabidir).
    - Rampa yoneticisi scope'u all-or-nothing.
    """
    from app.services.notifications import notify_supplier

    series = (
        await db.execute(
            select(AppointmentSeries).where(
                AppointmentSeries.id == series_id,
                AppointmentSeries.facility_id == facility.id,
            )
        )
    ).scalar_one_or_none()
    if series is None:
        raise NotFoundError("Seri bulunamadi")

    rows = list(
        (
            await db.execute(
                select(Appointment)
                .where(
                    Appointment.series_id == series.id,
                    Appointment.status == AppointmentStatus.revision_pending,
                )
                .order_by(Appointment.occurrence_index)
            )
        ).scalars()
    )
    now = datetime.now(UTC)
    affected = [a for a in rows if to_utc(a.scheduled_start_at) > now]
    if not affected:
        raise ApiError(
            "NO_REVISION_PENDING_OCCURRENCES",
            "Bu seride onaylanabilecek gelecek tarihli revize bekleyen randevu yok",
            409,
        )
    if allowed_dock_ids is not None:
        if any(a.dock_id not in allowed_dock_ids for a in affected):
            raise ApiError(
                "FORBIDDEN",
                "Seri, yetkili rampalarinizin disinda randevular iceriyor; "
                "seri onayi icin sistem yoneticisi gerekli",
                403,
            )

    await acquire_facility_lock(db, facility.id)
    from zoneinfo import ZoneInfo

    from app.rules.availability import AvailabilityService
    from app.rules.context import HardRuleCode

    tz = ZoneInfo(facility.timezone)
    supplier = (
        await db.execute(
            select(Supplier)
            .options(selectinload(Supplier.allowed_product_categories))
            .where(Supplier.id == series.supplier_id)
        )
    ).scalar_one()
    category = (
        await db.execute(
            select(ProductCategory).where(
                ProductCategory.id == affected[0].product_category_id
            )
        )
    ).scalar_one()

    # Onay aninda son-an cakisma kontrolu (kendisi haric)
    for appointment in affected:
        start = to_utc(appointment.scheduled_start_at)
        end = to_utc(appointment.scheduled_end_at)
        local_day = start.astimezone(tz).date()
        ctx = await build_rule_context(
            db,
            facility=facility,
            supplier=supplier,
            product_category=category,
            vehicle_category_id=appointment.vehicle_category_id,
            delivery_type=appointment.delivery_type,
            target_date=local_day,
            duration_minutes=appointment.duration_minutes,
            cargo_window=appointment.cargo_window,
        )
        ctx.existing_appointments = [
            a for a in ctx.existing_appointments if a.id != appointment.id
        ]
        engine = AvailabilityService(ctx)
        dock = next(
            (d for d in engine.compatible_docks() if d.id == appointment.dock_id), None
        )
        check = engine.interval_status(dock, start, end) if dock else None
        if dock is None or not check.ok:
            code = (check.code if check else None) or HardRuleCode.DOCK_TIME_CONFLICT
            raise RuleViolationError(
                "SERIES_APPROVE_OCCURRENCE_FAILED",
                (
                    f"{appointment.occurrence_index}. randevu "
                    f"({start.astimezone(tz):%d.%m.%Y %H:%M}) onaylanamadi: "
                    "slot artik uygun degil"
                ),
                details={
                    "occurrence_index": appointment.occurrence_index,
                    "occurrence_date": local_day.isoformat(),
                    "code": str(code),
                },
            )

    for appointment in affected:
        before = appointment.status
        appointment.status = AppointmentStatus.approved
        record_audit(
            db,
            actor_type=actor_type,
            actor_id=actor_id,
            action="appointment.approve",
            tenant_id=facility.tenant_id,
            facility_id=facility.id,
            entity_type="appointment",
            entity_id=appointment.id,
            before={"status": before.value},
            after={"status": "approved", "series_bulk": True},
        )

    first = affected[0]
    await notify_supplier(
        db, first,
        type_="appointment_approved",
        severity="success",
        title="Serinizdeki randevular onaylandı",
        body=(
            f"Serideki {len(affected)} randevu onaylandı."
            + (f" Not: {note}" if note else "")
        ),
        extra={"series_id": str(series.id), "affected_count": len(affected)},
    )
    from app.services.email import EmailMessage, send_email
    from app.services.email_templates import EmailContext, render_email
    from app.services.notification_preferences import prefs_email_allowed
    from app.services.notifications import _supplier_account, _supplier_policy

    supplier_row, account = await _supplier_account(db, series.supplier_id)
    email = account.email if account else (supplier_row.contact_email if supplier_row else None)
    policy = await _supplier_policy(db, facility.id)
    if email and prefs_email_allowed(policy, "appointment_approved"):
        subject, body_text = render_email(
            "appointment_approved",
            EmailContext(
                supplier_name=supplier_row.company_name if supplier_row else "Tedarikçi",
                product_name=f"{first.product_name} (serideki {len(affected)} randevu)",
                when=to_utc(first.scheduled_start_at).strftime("%d.%m.%Y %H:%M"),
                status="approved",
            ),
        )
        await send_email(
            db,
            EmailMessage(
                tenant_id=facility.tenant_id,
                facility_id=facility.id,
                recipient_email=email,
                recipient_name=supplier_row.company_name if supplier_row else None,
                subject=subject,
                body=body_text,
                template_key="appointment_approved",
                appointment_id=first.id,
                metadata={"series_id": str(series.id), "affected_count": len(affected)},
            ),
        )
    record_audit(
        db,
        actor_type=actor_type,
        actor_id=actor_id,
        action="appointment_series.approve",
        tenant_id=facility.tenant_id,
        facility_id=facility.id,
        entity_type="appointment_series",
        entity_id=series.id,
        after={"affected_count": len(affected), "note": note},
    )
    await db.commit()
    for appointment in affected:
        await db.refresh(appointment)
    return series, affected
