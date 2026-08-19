"""Yonetim paneli randevu endpointleri + musaitlik degerlendirme."""

import uuid
from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.db import get_db
from app.core.enums import ActorType, AppointmentStatus, CreatedByType, DeliveryType
from app.core.errors import ApiError, ForbiddenError, NotFoundError
from app.core.permissions import TenantPermission
from app.core.responses import ok
from app.models import (
    Appointment,
    AppointmentSeries,
    Dock,
    ProductCategory,
    Supplier,
    VehicleCategory,
)
from app.rules.availability import AvailabilityService
from app.schemas.appointment import (
    AdminAppointmentCreate,
    AppointmentOut,
    AvailabilityRequest,
    CancelRequest,
    CompleteRequest,
    DockChangeRequest,
    RejectRequest,
    ReviseRequest,
    RevisionOut,
    SeriesApproveRequest,
    SeriesCancelRequest,
    SeriesReviseRequest,
    SlotOut,
)
from app.services import appointments as svc
from app.services.appointments import build_rule_context
from app.tenancy.deps import FacilityContext, require_facility_permissions

router = APIRouter(prefix="/facilities/{facility_id}", tags=["appointments"])


def _appointment_out(appointment: Appointment) -> dict:
    return AppointmentOut.model_validate(appointment).model_dump(mode="json")


async def facility_name_maps(db: AsyncSession, facility_id: uuid.UUID) -> dict[str, dict]:
    """Listeleri UI icin isimle zenginlestirmek uzere id->ad haritalari."""

    async def rows(query):
        return dict((await db.execute(query)).all())

    return {
        "suppliers": await rows(
            select(Supplier.id, Supplier.company_name).where(
                Supplier.facility_id == facility_id
            )
        ),
        "docks": await rows(
            select(Dock.id, Dock.name).where(Dock.facility_id == facility_id)
        ),
        "categories": await rows(
            select(ProductCategory.id, ProductCategory.display_name).where(
                ProductCategory.facility_id == facility_id
            )
        ),
        "vehicles": await rows(
            select(VehicleCategory.id, VehicleCategory.display_name).where(
                VehicleCategory.facility_id == facility_id
            )
        ),
    }


def appointment_out_named(appointment: Appointment, maps: dict[str, dict]) -> dict:
    data = _appointment_out(appointment)
    data["supplier_name"] = maps["suppliers"].get(appointment.supplier_id)
    data["dock_name"] = maps["docks"].get(appointment.dock_id)
    data["product_category_name"] = maps["categories"].get(appointment.product_category_id)
    data["vehicle_category_name"] = maps["vehicles"].get(appointment.vehicle_category_id)
    return data


@router.get("/appointments")
async def list_appointments(
    ctx: FacilityContext = Depends(require_facility_permissions(TenantPermission.APPT_VIEW)),
    db: AsyncSession = Depends(get_db),
    status: AppointmentStatus | None = None,
    delivery_type: DeliveryType | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    supplier_id: uuid.UUID | None = None,
    dock_id: uuid.UUID | None = None,
    limit: int = Query(default=100, le=500),
):
    query = select(Appointment).where(Appointment.facility_id == ctx.facility_id)
    if status is not None:
        query = query.where(Appointment.status == status)
    if delivery_type is not None:
        query = query.where(Appointment.delivery_type == delivery_type)
    if supplier_id is not None:
        query = query.where(Appointment.supplier_id == supplier_id)
    if dock_id is not None:
        query = query.where(Appointment.dock_id == dock_id)
    if date_from is not None:
        query = query.where(Appointment.scheduled_start_at >= date_from)
    if date_to is not None:
        query = query.where(Appointment.scheduled_start_at < date_to)
    query = query.order_by(Appointment.scheduled_start_at).limit(limit)
    result = await db.execute(query)
    maps = await facility_name_maps(db, ctx.facility_id)
    return ok([appointment_out_named(a, maps) for a in result.scalars()])


def _allowed_actions(appointment: Appointment, ctx: FacilityContext) -> dict[str, bool]:
    """Status + izin + rampa scope'unu birlestiren aksiyon haritasi."""
    s = appointment.status
    scope_ok = ctx.can_act_on_dock(appointment.dock_id)
    return {
        "approve": (
            s in (AppointmentStatus.pending, AppointmentStatus.revision_pending)
            and ctx.has(TenantPermission.APPT_APPROVE)
            and scope_ok
        ),
        "reject": (
            s == AppointmentStatus.pending
            and ctx.has(TenantPermission.APPT_REJECT)
            and scope_ok
        ),
        "revise": (
            s
            in (
                AppointmentStatus.pending,
                AppointmentStatus.approved,
                AppointmentStatus.revision_pending,
            )
            and ctx.has(TenantPermission.APPT_REVISE)
            and scope_ok
        ),
        "complete": (
            s == AppointmentStatus.approved
            and ctx.has(TenantPermission.APPT_COMPLETE)
            and scope_ok
        ),
        "cancel": (
            s
            in (
                AppointmentStatus.pending,
                AppointmentStatus.approved,
                AppointmentStatus.revision_pending,
            )
            and ctx.has(TenantPermission.APPT_CANCEL)
            and scope_ok
        ),
    }


@router.get("/appointments/{appointment_id}")
async def get_appointment(
    appointment_id: uuid.UUID,
    ctx: FacilityContext = Depends(require_facility_permissions(TenantPermission.APPT_VIEW)),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Appointment)
        .options(selectinload(Appointment.revisions))
        .where(
            Appointment.id == appointment_id, Appointment.facility_id == ctx.facility_id
        )
    )
    appointment = result.scalar_one_or_none()
    if appointment is None:
        raise NotFoundError("Randevu bulunamadi")
    maps = await facility_name_maps(db, ctx.facility_id)
    data = appointment_out_named(appointment, maps)
    data["revisions"] = [
        RevisionOut.model_validate(r).model_dump(mode="json") for r in appointment.revisions
    ]
    supplier = (
        await db.execute(select(Supplier).where(Supplier.id == appointment.supplier_id))
    ).scalar_one_or_none()
    data["supplier_contact"] = (
        {
            "name": supplier.contact_name,
            "email": supplier.contact_email,
            "phone": supplier.contact_phone,
        }
        if supplier
        else None
    )
    data["allowed_actions"] = _allowed_actions(appointment, ctx)
    data["series"] = await _series_summary(db, appointment)
    return ok(data)


async def _series_summary(db: AsyncSession, appointment: Appointment) -> dict | None:
    """Drawer icin seri ozeti (randevu bir seriye bagliysa)."""
    if appointment.series_id is None:
        return None
    series = (
        await db.execute(
            select(AppointmentSeries).where(AppointmentSeries.id == appointment.series_id)
        )
    ).scalar_one_or_none()
    if series is None:
        return None
    return {
        "id": str(series.id),
        "frequency": series.recurrence_frequency,
        "occurrence_count": series.occurrence_count,
        "occurrence_index": appointment.occurrence_index,
    }


def _series_out(series: AppointmentSeries, maps: dict[str, dict]) -> dict:
    return {
        "id": str(series.id),
        "supplier_id": str(series.supplier_id),
        "supplier_name": maps["suppliers"].get(series.supplier_id),
        "frequency": series.recurrence_frequency,
        "occurrence_count": series.occurrence_count,
        "status": series.status,
        "created_at": series.created_at.isoformat() if series.created_at else None,
    }


@router.get("/appointment-series")
async def list_appointment_series(
    ctx: FacilityContext = Depends(require_facility_permissions(TenantPermission.APPT_VIEW)),
    db: AsyncSession = Depends(get_db),
    limit: int = Query(default=100, le=500),
):
    series_rows = list(
        (
            await db.execute(
                select(AppointmentSeries)
                .where(AppointmentSeries.facility_id == ctx.facility_id)
                .order_by(AppointmentSeries.created_at.desc())
                .limit(limit)
            )
        ).scalars()
    )
    counts: dict[uuid.UUID, dict[str, int]] = {}
    if series_rows:
        rows = (
            await db.execute(
                select(Appointment.series_id, Appointment.status, func.count())
                .where(Appointment.series_id.in_([s.id for s in series_rows]))
                .group_by(Appointment.series_id, Appointment.status)
            )
        ).all()
        for series_id, appt_status, count in rows:
            counts.setdefault(series_id, {})[appt_status.value] = count
    maps = await facility_name_maps(db, ctx.facility_id)
    return ok(
        [
            {**_series_out(s, maps), "status_counts": counts.get(s.id, {})}
            for s in series_rows
        ]
    )


@router.get("/appointment-series/{series_id}")
async def get_appointment_series(
    series_id: uuid.UUID,
    ctx: FacilityContext = Depends(require_facility_permissions(TenantPermission.APPT_VIEW)),
    db: AsyncSession = Depends(get_db),
):
    series = (
        await db.execute(
            select(AppointmentSeries).where(
                AppointmentSeries.id == series_id,
                AppointmentSeries.facility_id == ctx.facility_id,
            )
        )
    ).scalar_one_or_none()
    if series is None:
        raise NotFoundError("Seri bulunamadi")
    occurrences = list(
        (
            await db.execute(
                select(Appointment)
                .where(Appointment.series_id == series.id)
                .order_by(Appointment.occurrence_index)
            )
        ).scalars()
    )
    maps = await facility_name_maps(db, ctx.facility_id)
    data = _series_out(series, maps)
    data["appointments"] = [appointment_out_named(a, maps) for a in occurrences]
    return ok(data)


@router.post("/appointment-series/{series_id}/cancel")
async def cancel_appointment_series(
    series_id: uuid.UUID,
    body: SeriesCancelRequest,
    ctx: FacilityContext = Depends(require_facility_permissions(TenantPermission.APPT_CANCEL)),
    db: AsyncSession = Depends(get_db),
):
    """Serinin gelecekteki randevularini toplu iptal eder (future_only).

    Rampa yoneticisi yalnizca TUM etkilenen occurrence'lar kendi
    scope'undaysa iptal edebilir (all-or-nothing yetki karari).
    """
    series, affected = await svc.cancel_appointment_series(
        db,
        facility=ctx.facility,
        series_id=series_id,
        actor_type=ActorType.tenant_user,
        actor_id=ctx.identity.id,
        reason=body.reason,
        allowed_dock_ids=ctx.assigned_dock_ids,
    )
    return ok(
        {
            "series_id": str(series.id),
            "status": series.status,
            "scope": body.scope,
            "affected_count": len(affected),
            "cancelled_appointment_ids": [str(a.id) for a in affected],
        }
    )


@router.post("/appointment-series/{series_id}/approve")
async def approve_appointment_series(
    series_id: uuid.UUID,
    body: SeriesApproveRequest,
    ctx: FacilityContext = Depends(require_facility_permissions(TenantPermission.APPT_APPROVE)),
    db: AsyncSession = Depends(get_db),
):
    """Serinin gelecekteki revize bekleyen randevularini toplu onaylar.

    Onay aninda cakisma yeniden kontrol edilir; biri uygun degilse hicbiri
    onaylanmaz (all-or-nothing).
    """
    series, affected = await svc.approve_appointment_series(
        db,
        facility=ctx.facility,
        series_id=series_id,
        actor_type=ActorType.tenant_user,
        actor_id=ctx.identity.id,
        note=body.note,
        allowed_dock_ids=ctx.assigned_dock_ids,
    )
    return ok(
        {
            "series_id": str(series.id),
            "scope": body.scope,
            "affected_count": len(affected),
            "appointments": [_appointment_out(a) for a in affected],
        }
    )


@router.post("/appointment-series/{series_id}/revise")
async def revise_appointment_series(
    series_id: uuid.UUID,
    body: SeriesReviseRequest,
    ctx: FacilityContext = Depends(require_facility_permissions(TenantPermission.APPT_REVISE)),
    db: AsyncSession = Depends(get_db),
):
    """Serinin gelecekteki randevularini ayni saate/sureye kaydirir.

    All-or-nothing: bir occurrence bile kurallara uymazsa hicbiri degismez.
    Sonuc: etkilenenler revision_pending olur (tekil revise ile tutarli).
    """
    series, affected = await svc.revise_appointment_series(
        db,
        facility=ctx.facility,
        series_id=series_id,
        actor_type=ActorType.tenant_user,
        actor_id=ctx.identity.id,
        new_time=body.new_time,
        duration_minutes=body.duration_minutes,
        dock_id=body.dock_id,
        auto_assign_dock=body.auto_assign_dock,
        note=body.note,
        allowed_dock_ids=ctx.assigned_dock_ids,
    )
    return ok(
        {
            "series_id": str(series.id),
            "scope": body.scope,
            "new_time": body.new_time,
            "affected_count": len(affected),
            "appointments": [_appointment_out(a) for a in affected],
        }
    )


@router.post("/appointments")
async def create_appointment(
    body: AdminAppointmentCreate,
    ctx: FacilityContext = Depends(require_facility_permissions(TenantPermission.APPT_CREATE)),
    db: AsyncSession = Depends(get_db),
):
    """Admin, tedarikci ADINA randevu (veya seri) olusturur.

    Kararlar (Sprint 10 raporu):
    - Admin actigi icin randevu ONAYLI dogar (approved_override).
    - Tedarikci kurallari (izinli kategori, kota, min/maks sure) AYNEN uygulanir.
    - Manuel rampa secilirse uyumluluk + kural seti yine tam kontrol edilir.
    - Rampa yoneticisi yalnizca atanmis rampalarina olusturabilir.
    - `note` randevuya yazilmaz; audit metadata'sina islenir (MVP).
    - Recurring artik DESTEKLENIR: supplier ile ayni Option B seri servisi.
    """
    result = await db.execute(
        select(Supplier)
        .options(selectinload(Supplier.allowed_product_categories))
        .where(Supplier.id == body.supplier_id, Supplier.facility_id == ctx.facility_id)
    )
    supplier = result.scalar_one_or_none()
    if supplier is None:
        raise NotFoundError("Tedarikci bulunamadi")

    base_kwargs = dict(
        facility=ctx.facility,
        supplier=supplier,
        actor_type=ActorType.tenant_user,
        actor_id=ctx.identity.id,
        created_by_type=CreatedByType.tenant_user,
        product_category_id=body.product_category_id,
        product_name=body.product_name,
        quantity=body.quantity,
        quantity_unit=body.quantity_unit,
        delivery_type=body.delivery_type,
        vehicle_category_id=body.vehicle_category_id,
        license_plate=body.license_plate,
        driver_name=body.driver_name,
        driver_phone=body.driver_phone,
        duration_minutes=body.duration_minutes,
        allowed_dock_ids=ctx.assigned_dock_ids,
        approved_override=True,
        by_admin=True,
    )

    if body.recurring is not None and body.recurring.enabled:
        series, appointments = await svc.create_appointment_series(
            db,
            frequency=body.recurring.frequency,
            occurrence_count=body.recurring.occurrence_count,
            start_at=body.start_at,
            _audit_action="appointment_series.create_admin",
            **base_kwargs,
        )
        if body.note:
            _audit_admin_create_note(db, ctx, "appointment_series", series.id, body.note)
            await db.commit()
        return ok(
            {
                "series_id": str(series.id),
                "frequency": series.recurrence_frequency,
                "occurrence_count": series.occurrence_count,
                "appointments": [_appointment_out(a) for a in appointments],
            }
        )

    appointment = await svc.create_appointment(
        db,
        target_date=body.target_date,
        start_at=body.start_at,
        cargo_window=body.cargo_window,
        recurring_rule=body.recurring_rule,
        dock_id=None if body.auto_assign_dock else body.dock_id,
        _audit_action="appointment.create_admin",
        **base_kwargs,
    )
    if body.note:
        _audit_admin_create_note(db, ctx, "appointment", appointment.id, body.note)
        await db.commit()
    return ok(_appointment_out(appointment))


def _audit_admin_create_note(
    db: AsyncSession, ctx: FacilityContext, entity_type: str, entity_id: uuid.UUID, note: str
) -> None:
    """Operasyon notu randevu kaydina yazilmaz; audit'te izlenir (MVP karari)."""
    from app.services.audit import record_audit

    record_audit(
        db,
        actor_type=ActorType.tenant_user,
        actor_id=ctx.identity.id,
        action="appointment.create_note",
        tenant_id=ctx.tenant_id,
        facility_id=ctx.facility_id,
        entity_type=entity_type,
        entity_id=entity_id,
        after={"note": note},
    )


def _check_dock_scope(ctx: FacilityContext, appointment: Appointment) -> None:
    """Rampa yoneticisi yalnizca atanmis rampalarinda islem yapabilir."""
    if not ctx.can_act_on_dock(appointment.dock_id):
        raise ForbiddenError("Bu rampada islem yetkiniz yok")


async def _load(db: AsyncSession, ctx: FacilityContext, appointment_id: uuid.UUID) -> Appointment:
    result = await db.execute(
        select(Appointment).where(
            Appointment.id == appointment_id, Appointment.facility_id == ctx.facility_id
        )
    )
    appointment = result.scalar_one_or_none()
    if appointment is None:
        raise NotFoundError("Randevu bulunamadi")
    return appointment


@router.post("/appointments/{appointment_id}/approve")
async def approve(
    appointment_id: uuid.UUID,
    ctx: FacilityContext = Depends(require_facility_permissions(TenantPermission.APPT_APPROVE)),
    db: AsyncSession = Depends(get_db),
):
    _check_dock_scope(ctx, await _load(db, ctx, appointment_id))
    appointment = await svc.approve_appointment(
        db, ctx.facility_id, appointment_id,
        actor_type=ActorType.tenant_user, actor_id=ctx.identity.id,
    )
    return ok(_appointment_out(appointment))


@router.post("/appointments/{appointment_id}/reject")
async def reject(
    appointment_id: uuid.UUID,
    body: RejectRequest,
    ctx: FacilityContext = Depends(require_facility_permissions(TenantPermission.APPT_REJECT)),
    db: AsyncSession = Depends(get_db),
):
    _check_dock_scope(ctx, await _load(db, ctx, appointment_id))
    appointment = await svc.reject_appointment(
        db, ctx.facility_id, appointment_id, reason=body.reason,
        actor_type=ActorType.tenant_user, actor_id=ctx.identity.id,
    )
    return ok(_appointment_out(appointment))


@router.post("/appointments/{appointment_id}/revise")
async def revise(
    appointment_id: uuid.UUID,
    body: ReviseRequest,
    ctx: FacilityContext = Depends(require_facility_permissions(TenantPermission.APPT_REVISE)),
    db: AsyncSession = Depends(get_db),
):
    _check_dock_scope(ctx, await _load(db, ctx, appointment_id))
    appointment = await svc.revise_appointment(
        db, ctx.facility_id, appointment_id,
        new_start_at=body.new_start_at,
        new_duration_minutes=body.new_duration_minutes,
        new_dock_id=body.new_dock_id,
        auto_assign_dock=body.auto_assign_dock,
        note=body.note,
        actor_type=ActorType.tenant_user, actor_id=ctx.identity.id,
        # Hedef rampa da kullanicinin scope'unda olmali (rampa yoneticisi).
        allowed_dock_ids=ctx.assigned_dock_ids,
    )
    return ok(_appointment_out(appointment))


@router.get("/appointments/{appointment_id}/dock-options")
async def dock_options(
    appointment_id: uuid.UUID,
    ctx: FacilityContext = Depends(require_facility_permissions(TenantPermission.APPT_VIEW)),
    db: AsyncSession = Depends(get_db),
):
    """Bu randevunun tasinabilecegi rampalar (uyumlu olanlar + doluluk durumu).

    UI listeyi buradan cizer; uyumluluk/doluluk mantigi istemciye KOPYALANMAZ.
    """
    _check_dock_scope(ctx, await _load(db, ctx, appointment_id))
    return ok(
        {
            "options": await svc.list_dock_options(
                db, ctx.facility_id, appointment_id,
                allowed_dock_ids=ctx.assigned_dock_ids,
            )
        }
    )


@router.post("/appointments/{appointment_id}/dock-change")
async def change_dock(
    appointment_id: uuid.UUID,
    body: DockChangeRequest | None = None,
    ctx: FacilityContext = Depends(require_facility_permissions(TenantPermission.APPT_REVISE)),
    db: AsyncSession = Depends(get_db),
):
    """Randevunun rampasini degistirir; saat/sure ve DURUM degismez.

    Revize ucundan ayri tutulmasinin sebebi: saat degismedigi icin tedarikciden
    yeniden onay istemek gereksiz. Tedarikci yalnizca bilgilendirilir.
    Yetki olarak APPT_REVISE istenir (randevuyu degistiren bir islemdir).
    """
    _check_dock_scope(ctx, await _load(db, ctx, appointment_id))
    appointment = await svc.change_appointment_dock(
        db, ctx.facility_id, appointment_id,
        dock_id=body.dock_id if body else None,
        note=body.note if body else None,
        actor_type=ActorType.tenant_user, actor_id=ctx.identity.id,
        allowed_dock_ids=ctx.assigned_dock_ids,
    )
    return ok(_appointment_out(appointment))


@router.post("/appointments/{appointment_id}/complete")
async def complete(
    appointment_id: uuid.UUID,
    body: CompleteRequest | None = None,
    ctx: FacilityContext = Depends(require_facility_permissions(TenantPermission.APPT_COMPLETE)),
    db: AsyncSession = Depends(get_db),
):
    _check_dock_scope(ctx, await _load(db, ctx, appointment_id))
    appointment = await svc.complete_appointment(
        db, ctx.facility_id, appointment_id,
        actor_type=ActorType.tenant_user, actor_id=ctx.identity.id,
        note=body.note if body else None,
    )
    return ok(_appointment_out(appointment))


@router.post("/appointments/{appointment_id}/cancel")
async def cancel(
    appointment_id: uuid.UUID,
    body: CancelRequest | None = None,
    ctx: FacilityContext = Depends(require_facility_permissions(TenantPermission.APPT_CANCEL)),
    db: AsyncSession = Depends(get_db),
):
    _check_dock_scope(ctx, await _load(db, ctx, appointment_id))
    appointment = await svc.cancel_appointment(
        db, ctx.facility_id, appointment_id,
        actor_type=ActorType.tenant_user, actor_id=ctx.identity.id,
        reason=body.reason if body else None,
    )
    return ok(_appointment_out(appointment))


async def evaluate_availability(
    body: AvailabilityRequest,
    ctx: FacilityContext,
    db: AsyncSession,
    supplier: Supplier,
) -> list[dict]:
    # Kargo kapali tedarikci icin kargo musaitligi de sorgulanamaz.
    svc.ensure_delivery_type_allowed(supplier, body.delivery_type)
    result = await db.execute(
        select(ProductCategory).where(
            ProductCategory.id == body.product_category_id,
            ProductCategory.facility_id == ctx.facility_id,
        )
    )
    category = result.scalar_one_or_none()
    if category is None:
        raise NotFoundError("Urun kategorisi bulunamadi")

    vehicle_id = body.vehicle_category_id or category.default_vehicle_category_id
    duration = body.duration_minutes or category.min_block_minutes

    rule_ctx = await build_rule_context(
        db,
        facility=ctx.facility,
        supplier=supplier,
        product_category=category,
        vehicle_category_id=vehicle_id,
        delivery_type=body.delivery_type,
        target_date=body.target_date,
        duration_minutes=duration,
        cargo_window=body.cargo_window,
    )
    engine = AvailabilityService(rule_ctx)
    slots = engine.evaluate_day()
    return [
        SlotOut(
            start=s.start,
            end=s.end,
            status=s.status,
            candidate_dock_ids=s.candidate_dock_ids,
            blocking_reasons=s.blocking_reasons,
            advisory_warnings=[
                {
                    "code": w.code,
                    "message": w.message,
                    "severity": w.severity,
                    "blocking": w.blocking,  # her zaman False — tavsiye katmani
                    "dock_id": str(w.dock_id),
                    "appointment_id": str(w.appointment_id) if w.appointment_id else None,
                    "window": w.window,
                }
                for w in s.advisory_warnings
            ],
        ).model_dump(mode="json")
        for s in slots
    ]


@router.post("/availability/evaluate")
async def availability_evaluate(
    body: AvailabilityRequest,
    ctx: FacilityContext = Depends(require_facility_permissions(TenantPermission.APPT_VIEW)),
    db: AsyncSession = Depends(get_db),
):
    if body.supplier_id is None:
        raise ApiError("VALIDATION_ERROR", "supplier_id zorunlu")
    result = await db.execute(
        select(Supplier)
        .options(selectinload(Supplier.allowed_product_categories))
        .where(Supplier.id == body.supplier_id, Supplier.facility_id == ctx.facility_id)
    )
    supplier = result.scalar_one_or_none()
    if supplier is None:
        raise NotFoundError("Tedarikci bulunamadi")
    return ok(await evaluate_availability(body, ctx, db, supplier))


@router.get("/dashboard-summary")
async def dashboard_summary(
    ctx: FacilityContext = Depends(require_facility_permissions(TenantPermission.APPT_VIEW)),
    db: AsyncSession = Depends(get_db),
):
    """Operasyon dashboard'u — rampa/depo yoneticisi dahil appt.view yeterli."""
    from datetime import UTC, datetime, timedelta
    from zoneinfo import ZoneInfo

    from sqlalchemy import func

    from app.core.enums import BLOCKING_APPOINTMENT_STATUSES, DeliveryType

    tz = ZoneInfo(ctx.facility.timezone)
    now = datetime.now(UTC)
    today = now.astimezone(tz).date()
    day_start = datetime.combine(today, datetime.min.time(), tz).astimezone(UTC)
    day_end = day_start + timedelta(days=1)
    week_start_date = today - timedelta(days=today.weekday())
    week_start = datetime.combine(week_start_date, datetime.min.time(), tz).astimezone(UTC)

    async def count(*conditions) -> int:
        result = await db.execute(
            select(func.count(Appointment.id)).where(
                Appointment.facility_id == ctx.facility_id, *conditions
            )
        )
        return int(result.scalar_one())

    not_dead = Appointment.status.notin_(
        [AppointmentStatus.cancelled, AppointmentStatus.rejected]
    )
    in_today = (
        Appointment.scheduled_start_at >= day_start,
        Appointment.scheduled_start_at < day_end,
    )

    maps = await facility_name_maps(db, ctx.facility_id)

    async def top5(*conditions, order=Appointment.scheduled_start_at):
        result = await db.execute(
            select(Appointment)
            .where(Appointment.facility_id == ctx.facility_id, *conditions)
            .order_by(order)
            .limit(5)
        )
        return [appointment_out_named(a, maps) for a in result.scalars()]

    active_docks = int(
        (
            await db.execute(
                select(func.count(Dock.id)).where(
                    Dock.facility_id == ctx.facility_id, Dock.is_active.is_(True)
                )
            )
        ).scalar_one()
    )
    active_suppliers = int(
        (
            await db.execute(
                select(func.count(Supplier.id)).where(
                    Supplier.facility_id == ctx.facility_id, Supplier.status == "active"
                )
            )
        ).scalar_one()
    )

    return ok(
        {
            "today_appointments": await count(*in_today, not_dead),
            "pending_approvals": await count(Appointment.status == AppointmentStatus.pending),
            "approved_today": await count(
                *in_today, Appointment.status == AppointmentStatus.approved
            ),
            "completed_today": await count(
                *in_today, Appointment.status == AppointmentStatus.completed
            ),
            "week_total": await count(
                Appointment.scheduled_start_at >= week_start, not_dead
            ),
            "active_suppliers": active_suppliers,
            "active_docks": active_docks,
            "cargo_warned": await count(
                Appointment.delivery_type == DeliveryType.cargo,
                Appointment.status.in_(BLOCKING_APPOINTMENT_STATUSES),
                Appointment.scheduled_start_at >= day_start,
            ),
            "upcoming": await top5(
                Appointment.scheduled_start_at >= now,
                Appointment.status.in_(BLOCKING_APPOINTMENT_STATUSES),
            ),
            "pending_list": await top5(Appointment.status == AppointmentStatus.pending),
        }
    )


@router.get("/calendar/day")
async def calendar_day(
    date: date,
    ctx: FacilityContext = Depends(require_facility_permissions(TenantPermission.APPT_VIEW)),
    db: AsyncSession = Depends(get_db),
):
    """Gunluk rampa x saat takvimi icin tek cagrilik veri.

    Rampa yoneticisi yalnizca atanmis rampalarini gorur (UX karari);
    izolasyon + isim zenginlestirme tek sorgu setiyle yapilir (N+1 yok).
    """
    from datetime import UTC, datetime, timedelta
    from zoneinfo import ZoneInfo

    from app.core.enums import BLOCKING_APPOINTMENT_STATUSES, DeliveryType, DockOverrideType
    from app.models import DockOverride
    from app.rules.availability import WEEKDAY_KEYS
    from app.services.overrides import pick_override

    facility = ctx.facility
    tz = ZoneInfo(facility.timezone)
    day_start = datetime.combine(date, datetime.min.time(), tz).astimezone(UTC)
    day_end = day_start + timedelta(days=1)

    docks = list(
        (
            await db.execute(
                select(Dock)
                .where(Dock.facility_id == ctx.facility_id, Dock.is_active.is_(True))
                .order_by(Dock.name)
            )
        ).scalars()
    )
    if ctx.assigned_dock_ids is not None:
        docks = [d for d in docks if d.id in ctx.assigned_dock_ids]

    overrides = list(
        (
            await db.execute(
                select(DockOverride).where(
                    DockOverride.facility_id == ctx.facility_id,
                    DockOverride.date == date,
                    DockOverride.is_active.is_(True),
                )
            )
        ).scalars()
    )
    weekday = WEEKDAY_KEYS[date.weekday()]

    def day_window(dock: Dock) -> dict | None:
        override = pick_override(overrides, dock.id, date)
        if override is not None:
            if override.type == DockOverrideType.closed:
                return None
            if override.start_time and override.end_time:
                return {
                    "start": override.start_time.strftime("%H:%M"),
                    "end": override.end_time.strftime("%H:%M"),
                }
        hours = dock.working_hours_json or facility.default_working_profile_json or {}
        day_conf = hours.get(weekday)
        if not day_conf:
            return None
        return {"start": day_conf["start"], "end": day_conf["end"]}

    def normal_window(dock: Dock) -> dict | None:
        """Override'siz normal pencere (closed override'in blokladigi aralik icin)."""
        hours = dock.working_hours_json or facility.default_working_profile_json or {}
        day_conf = hours.get(weekday)
        if not day_conf:
            return None
        return {"start": day_conf["start"], "end": day_conf["end"]}

    dock_windows = {d.id: day_window(d) for d in docks}
    open_windows = [w for w in dock_windows.values() if w]
    working_window = {
        "start": min((w["start"] for w in open_windows), default="08:00"),
        "end": max((w["end"] for w in open_windows), default="18:00"),
        "slot_minutes": 30,
    }

    dock_ids = [d.id for d in docks]
    dock_filter = (
        Appointment.dock_id.in_(dock_ids) if dock_ids else Appointment.dock_id.is_(None)
    )
    appointments = list(
        (
            await db.execute(
                select(Appointment)
                .where(
                    Appointment.facility_id == ctx.facility_id,
                    Appointment.scheduled_start_at >= day_start,
                    Appointment.scheduled_start_at < day_end,
                    dock_filter,
                )
                .order_by(Appointment.scheduled_start_at)
            )
        ).scalars()
    )
    maps = await facility_name_maps(db, ctx.facility_id)

    cargo_dock_ids = {
        a.dock_id
        for a in appointments
        if a.delivery_type == DeliveryType.cargo
        and a.status in BLOCKING_APPOINTMENT_STATUSES
    }

    appointment_rows = []
    for a in appointments:
        row = appointment_out_named(a, maps)
        row["has_cargo_warning"] = a.dock_id in cargo_dock_ids
        row["allowed_actions"] = _allowed_actions(a, ctx)
        appointment_rows.append(row)

    window_labels = {"morning": "sabah", "afternoon": "öğleden sonra", "all_day": "gün içinde"}
    cargo_advisories = [
        {
            "code": "CARGO_DAY_WARNING",
            "severity": "warning",
            "blocking": False,  # tavsiye katmani — asla engellemez
            "dock_id": str(a.dock_id),
            "dock_name": maps["docks"].get(a.dock_id),
            "window": a.cargo_window.value if a.cargo_window else "all_day",
            "appointment_id": str(a.id),
            "message": (
                f"{maps['docks'].get(a.dock_id)}: "
                f"{maps['suppliers'].get(a.supplier_id)} kargosu "
                f"{window_labels.get(a.cargo_window.value if a.cargo_window else 'all_day')} "
                "bekleniyor — boşluk bırakın."
            ),
        }
        for a in appointments
        if a.delivery_type == DeliveryType.cargo
        and a.status in BLOCKING_APPOINTMENT_STATUSES
    ]

    blocked_slots = []
    for override in overrides:
        if override.type != DockOverrideType.closed or override.dock_id not in dock_windows:
            continue
        dock = next(d for d in docks if d.id == override.dock_id)
        window = normal_window(dock) or {
            "start": working_window["start"],
            "end": working_window["end"],
        }
        blocked_slots.append(
            {
                "dock_id": str(override.dock_id),
                "start": window["start"],
                "end": window["end"],
                "reason": "closed_override",
                "note": override.reason,
            }
        )

    return ok(
        {
            "date": date.isoformat(),
            "facility": {
                "id": str(facility.id),
                "name": facility.name,
                "timezone": facility.timezone,
            },
            "working_window": working_window,
            "docks": [
                {
                    "id": str(d.id),
                    "name": d.name,
                    "note": d.note,
                    "active": d.is_active,
                    "day_window": dock_windows[d.id],
                    "has_cargo_warning": d.id in cargo_dock_ids,
                }
                for d in docks
            ],
            "appointments": appointment_rows,
            "cargo_advisories": cargo_advisories,
            "blocked_slots": blocked_slots,
        }
    )


def _hhmm_minutes(value: str) -> int:
    hour, minute = value.split(":")
    return int(hour) * 60 + int(minute)


@router.get("/calendar/week")
async def calendar_week(
    week_start: date,
    ctx: FacilityContext = Depends(require_facility_permissions(TenantPermission.APPT_VIEW)),
    db: AsyncSession = Depends(get_db),
):
    """Haftalik operasyon ozeti (raporlama motoru DEGIL).

    Karar: week_start pazartesi degilse 422 yerine pazartesiye NORMALIZE edilir.
    Rampa yoneticisi yalnizca atanmis rampalarinin verisini gorur; utilization
    yaklasiktir: bloklanan dakika / acik rampalarin calisma dakikasi
    (iptal/red haric, kargo tentative blok dahil).
    """
    from datetime import UTC, datetime, timedelta
    from zoneinfo import ZoneInfo

    from app.core.enums import (
        BLOCKING_APPOINTMENT_STATUSES,
        DeliveryType,
        DockOverrideType,
    )
    from app.core.timeutils import to_utc
    from app.models import DockOverride
    from app.rules.availability import WEEKDAY_KEYS
    from app.services.overrides import pick_override

    facility = ctx.facility
    tz = ZoneInfo(facility.timezone)
    week_start = week_start - timedelta(days=week_start.weekday())
    days = [week_start + timedelta(days=i) for i in range(7)]
    range_start = datetime.combine(week_start, datetime.min.time(), tz).astimezone(UTC)
    range_end = range_start + timedelta(days=7)

    docks = list(
        (
            await db.execute(
                select(Dock)
                .where(Dock.facility_id == ctx.facility_id, Dock.is_active.is_(True))
                .order_by(Dock.name)
            )
        ).scalars()
    )
    if ctx.assigned_dock_ids is not None:
        docks = [d for d in docks if d.id in ctx.assigned_dock_ids]
    dock_ids = {d.id for d in docks}
    dock_names = {d.id: d.name for d in docks}

    overrides = list(
        (
            await db.execute(
                select(DockOverride).where(
                    DockOverride.facility_id == ctx.facility_id,
                    DockOverride.date >= week_start,
                    DockOverride.date <= days[-1],
                    DockOverride.is_active.is_(True),
                )
            )
        ).scalars()
    )
    overrides = [o for o in overrides if o.dock_id in dock_ids]

    appointments = list(
        (
            await db.execute(
                select(Appointment).where(
                    Appointment.facility_id == ctx.facility_id,
                    Appointment.scheduled_start_at >= range_start,
                    Appointment.scheduled_start_at < range_end,
                )
            )
        ).scalars()
    )
    appointments = [a for a in appointments if a.dock_id in dock_ids]

    def window_minutes(dock: Dock, day: date) -> int:
        override = pick_override(overrides, dock.id, day)
        if override is not None:
            if override.type == DockOverrideType.closed:
                return 0
            if override.start_time and override.end_time:
                return (
                    override.end_time.hour * 60 + override.end_time.minute
                    - override.start_time.hour * 60 - override.start_time.minute
                )
        hours = dock.working_hours_json or facility.default_working_profile_json or {}
        conf = hours.get(WEEKDAY_KEYS[day.weekday()])
        if not conf:
            return 0
        return _hhmm_minutes(conf["end"]) - _hhmm_minutes(conf["start"])

    day_rows = []
    for day in days:
        day_appts = [
            a for a in appointments
            if to_utc(a.scheduled_start_at).astimezone(tz).date() == day
        ]

        def count(status: AppointmentStatus, appts=day_appts) -> int:
            return sum(1 for a in appts if a.status == status)

        active_statuses = (*BLOCKING_APPOINTMENT_STATUSES, AppointmentStatus.completed)
        blocked_minutes = sum(
            a.duration_minutes for a in day_appts if a.status in active_statuses
        )
        capacity = sum(window_minutes(d, day) for d in docks)

        dock_counts: dict = {}
        for a in day_appts:
            if a.status not in active_statuses:
                continue
            entry = dock_counts.setdefault(
                a.dock_id, {"appointments": 0, "cargo": 0}
            )
            entry["appointments"] += 1
            if a.delivery_type == DeliveryType.cargo:
                entry["cargo"] += 1
        top_docks = [
            {
                "dock_id": str(dock_id),
                "dock_name": dock_names.get(dock_id),
                **counts,
            }
            for dock_id, counts in sorted(
                dock_counts.items(), key=lambda kv: -kv[1]["appointments"]
            )[:3]
        ]

        day_overrides = [o for o in overrides if o.date == day]
        day_rows.append(
            {
                "date": day.isoformat(),
                # total = operasyonel randevular (iptal/red haric) — rapor karari
                "total": sum(count(s) for s in active_statuses),
                "pending": count(AppointmentStatus.pending),
                "approved": count(AppointmentStatus.approved),
                "revision_pending": count(AppointmentStatus.revision_pending),
                "completed": count(AppointmentStatus.completed),
                "cancelled": count(AppointmentStatus.cancelled),
                "cargo": sum(
                    1 for a in day_appts
                    if a.delivery_type == DeliveryType.cargo
                    and a.status in BLOCKING_APPOINTMENT_STATUSES
                ),
                "dock_count": len(docks),
                "active_dock_count": sum(1 for d in docks if window_minutes(d, day) > 0),
                "utilization_percent": (
                    min(100, round(blocked_minutes / capacity * 100)) if capacity else 0
                ),
                "has_closed_override": any(
                    o.type == DockOverrideType.closed for o in day_overrides
                ),
                "has_extra_hours": any(
                    o.type == DockOverrideType.extra_hours for o in day_overrides
                ),
                "top_docks": top_docks,
            }
        )

    return ok(
        {
            "week_start": week_start.isoformat(),
            "week_end": days[-1].isoformat(),
            "timezone": facility.timezone,
            "days": day_rows,
        }
    )
