"""Tedarikci portal endpointleri.

Tedarikci yalnizca kendi supplier_id kayitlarini gorur; baska veri donmez.
"""

import uuid

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import get_settings
from app.core.db import get_db
from app.core.enums import (
    ActorType,
    CargoWindow,
    CreatedByType,
    DeliveryType,
    QuantityUnit,
)
from app.core.errors import NotFoundError
from app.core.ratelimit import enforce_rate_limit
from app.core.responses import ok
from app.models import Appointment, ProductCategory, VehicleCategory
from app.routers.appointments import (
    _appointment_out,
    _series_summary,
    appointment_out_named,
    evaluate_availability,
    facility_name_maps,
)
from app.schemas.appointment import (
    AvailabilityRequest,
    RevisionOut,
    SupplierAppointmentCreate,
)
from app.schemas.catalog import ProductCategoryOut, SupplierOut, VehicleCategoryOut
from app.services import appointments as svc
from app.tenancy.deps import FacilityContext, get_supplier_context

router = APIRouter(prefix="/supplier", tags=["supplier-portal"])


class SupplierSeriesCancelRequest(BaseModel):
    """Sebep ZORUNLU: yanlislikla toplu iptal riskine karsi bilinçli surtunme."""

    reason: str = Field(min_length=3)

QUANTITY_UNIT_LABELS = {
    QuantityUnit.pallet: "Palet",
    QuantityUnit.piece: "Adet",
    QuantityUnit.box: "Kutu",
    QuantityUnit.carton: "Koli",
}


@router.get("/profile")
@router.get("/me")
async def profile(ctx: FacilityContext = Depends(get_supplier_context)):
    supplier = ctx.supplier
    assert supplier is not None
    data = SupplierOut.model_validate(supplier)
    data.is_active = supplier.status == "active"
    data.allowed_product_category_ids = [c.id for c in supplier.allowed_product_categories]
    return ok(
        {
            **data.model_dump(mode="json"),
            "facility": {
                "id": str(ctx.facility_id),
                "name": ctx.facility.name,
                "timezone": ctx.facility.timezone,
            },
        }
    )


@router.get("/catalog")
async def catalog(
    ctx: FacilityContext = Depends(get_supplier_context),
    db: AsyncSession = Depends(get_db),
):
    """Sihirbazin ihtiyac duydugu her sey tek cagrida:

    izinli AKTIF kategoriler, tesisin aktif arac kategorileri, sure limitleri,
    teslimat tipleri, miktar birimleri ve kargo pencereleri.
    """
    supplier = ctx.supplier
    assert supplier is not None

    allowed_ids = {c.id for c in supplier.allowed_product_categories}
    categories = []
    if allowed_ids:
        categories = list(
            (
                await db.execute(
                    select(ProductCategory)
                    .where(
                        ProductCategory.facility_id == ctx.facility_id,
                        ProductCategory.is_active.is_(True),
                        ProductCategory.id.in_(allowed_ids),
                    )
                    .order_by(ProductCategory.name)
                )
            ).scalars()
        )
    vehicles = list(
        (
            await db.execute(
                select(VehicleCategory)
                .where(
                    VehicleCategory.facility_id == ctx.facility_id,
                    VehicleCategory.is_active.is_(True),
                )
                .order_by(VehicleCategory.name)
            )
        ).scalars()
    )
    return ok(
        {
            "product_categories": [
                ProductCategoryOut.model_validate(c).model_dump(mode="json")
                for c in categories
            ],
            "vehicle_categories": [
                VehicleCategoryOut.model_validate(v).model_dump(mode="json")
                for v in vehicles
            ],
            "limits": {
                "min_block_minutes": supplier.min_block_minutes,
                "max_block_minutes": supplier.max_block_minutes,
                "weekly_quota": supplier.weekly_quota,
                "monthly_quota": supplier.monthly_quota,
                "auto_approval_enabled": supplier.auto_approval_enabled,
            },
            "delivery_types": [t.value for t in DeliveryType],
            "cargo_windows": [w.value for w in CargoWindow],
            "cargo_default_min_block_minutes": ctx.facility.cargo_default_min_block_minutes,
            "quantity_units": [
                {"value": u.value, "label": label}
                for u, label in QUANTITY_UNIT_LABELS.items()
            ],
        }
    )


@router.get("/appointments")
async def my_appointments(
    ctx: FacilityContext = Depends(get_supplier_context),
    db: AsyncSession = Depends(get_db),
):
    assert ctx.supplier is not None
    result = await db.execute(
        select(Appointment)
        .where(Appointment.supplier_id == ctx.supplier.id)
        .order_by(Appointment.scheduled_start_at.desc())
        .limit(200)
    )
    maps = await facility_name_maps(db, ctx.facility_id)
    return ok([appointment_out_named(a, maps) for a in result.scalars()])


@router.get("/appointments/{appointment_id}")
async def my_appointment_detail(
    appointment_id: uuid.UUID,
    ctx: FacilityContext = Depends(get_supplier_context),
    db: AsyncSession = Depends(get_db),
):
    assert ctx.supplier is not None
    result = await db.execute(
        select(Appointment)
        .options(selectinload(Appointment.revisions))
        .where(
            Appointment.id == appointment_id,
            Appointment.supplier_id == ctx.supplier.id,
        )
    )
    appointment = result.scalar_one_or_none()
    if appointment is None:
        raise NotFoundError("Randevu bulunamadi")
    maps = await facility_name_maps(db, ctx.facility_id)
    data = appointment_out_named(appointment, maps)
    # Tedarikci detayda eski/yeni araligi birlikte gorur (revizyon gecmisi).
    data["revisions"] = [
        RevisionOut.model_validate(r).model_dump(mode="json") for r in appointment.revisions
    ]
    data["series"] = await _series_summary(db, appointment)
    return ok(data)


@router.post("/appointments")
async def create_my_appointment(
    body: SupplierAppointmentCreate,
    request: Request,
    ctx: FacilityContext = Depends(get_supplier_context),
    db: AsyncSession = Depends(get_db),
):
    assert ctx.supplier is not None
    enforce_rate_limit(
        request, "appt_create", str(ctx.identity.id),
        times=get_settings().create_rate_limit_attempts,
    )
    if body.recurring is not None and body.recurring.enabled:
        # Tekrarlayan seri: tum occurrence'lar tam kural setinden gecer,
        # biri gecemezse hicbiri olusmaz (all-or-nothing).
        series, appointments = await svc.create_appointment_series(
            db,
            facility=ctx.facility,
            supplier=ctx.supplier,
            actor_type=ActorType.supplier_user,
            actor_id=ctx.identity.id,
            created_by_type=CreatedByType.supplier,
            frequency=body.recurring.frequency,
            occurrence_count=body.recurring.occurrence_count,
            start_at=body.start_at,
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
        )
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
        facility=ctx.facility,
        supplier=ctx.supplier,
        actor_type=ActorType.supplier_user,
        actor_id=ctx.identity.id,
        created_by_type=CreatedByType.supplier,
        product_category_id=body.product_category_id,
        product_name=body.product_name,
        quantity=body.quantity,
        quantity_unit=body.quantity_unit,
        target_date=body.target_date,
        delivery_type=body.delivery_type,
        vehicle_category_id=body.vehicle_category_id,
        license_plate=body.license_plate,
        driver_name=body.driver_name,
        driver_phone=body.driver_phone,
        start_at=body.start_at,
        duration_minutes=body.duration_minutes,
        cargo_window=body.cargo_window,
        recurring_rule=body.recurring_rule,
    )
    return ok(_appointment_out(appointment))


@router.post("/appointments/{appointment_id}/cancel")
async def cancel_my_appointment(
    appointment_id: uuid.UUID,
    ctx: FacilityContext = Depends(get_supplier_context),
    db: AsyncSession = Depends(get_db),
):
    assert ctx.supplier is not None
    appointment = await svc.cancel_appointment(
        db,
        ctx.facility_id,
        appointment_id,
        actor_type=ActorType.supplier_user,
        actor_id=ctx.identity.id,
        supplier_id=ctx.supplier.id,
    )
    return ok(_appointment_out(appointment))


@router.post("/availability/evaluate")
async def my_availability(
    body: AvailabilityRequest,
    ctx: FacilityContext = Depends(get_supplier_context),
    db: AsyncSession = Depends(get_db),
):
    assert ctx.supplier is not None
    return ok(await evaluate_availability(body, ctx, db, ctx.supplier))


# ---------- tekrarlayan seriler (Sprint 12) ----------


@router.get("/appointment-series")
async def my_appointment_series(
    ctx: FacilityContext = Depends(get_supplier_context),
    db: AsyncSession = Depends(get_db),
):
    """Tedarikcinin kendi serileri: sayaclar + siradaki randevu + iptal hakki."""
    from datetime import UTC, datetime

    from app.core.timeutils import to_utc
    from app.models import AppointmentSeries

    assert ctx.supplier is not None
    series_rows = list(
        (
            await db.execute(
                select(AppointmentSeries)
                .where(AppointmentSeries.supplier_id == ctx.supplier.id)
                .order_by(AppointmentSeries.created_at.desc())
                .limit(100)
            )
        ).scalars()
    )
    if not series_rows:
        return ok([])

    appointments = list(
        (
            await db.execute(
                select(Appointment).where(
                    Appointment.series_id.in_([s.id for s in series_rows])
                )
            )
        ).scalars()
    )
    now = datetime.now(UTC)
    by_series: dict = {}
    for a in appointments:
        by_series.setdefault(a.series_id, []).append(a)

    def row(series) -> dict:
        rows = by_series.get(series.id, [])
        counts: dict[str, int] = {}
        for a in rows:
            counts[a.status.value] = counts.get(a.status.value, 0) + 1
        future_cancellable = [
            a for a in rows
            if a.status.value in ("pending", "approved", "revision_pending")
            and to_utc(a.scheduled_start_at) > now
        ]
        upcoming = min(
            (to_utc(a.scheduled_start_at) for a in future_cancellable), default=None
        )
        return {
            "id": str(series.id),
            "frequency": series.recurrence_frequency,
            "occurrence_count": series.occurrence_count,
            "status": series.status,
            "status_counts": counts,
            "next_appointment_at": upcoming.isoformat() if upcoming else None,
            "product_name": rows[0].product_name if rows else None,
            "can_cancel_series": len(future_cancellable) > 0,
            "future_cancellable_count": len(future_cancellable),
        }

    return ok([row(s) for s in series_rows])


@router.get("/appointment-series/{series_id}")
async def my_appointment_series_detail(
    series_id: uuid.UUID,
    ctx: FacilityContext = Depends(get_supplier_context),
    db: AsyncSession = Depends(get_db),
):
    from app.models import AppointmentSeries

    assert ctx.supplier is not None
    series = (
        await db.execute(
            select(AppointmentSeries).where(
                AppointmentSeries.id == series_id,
                AppointmentSeries.supplier_id == ctx.supplier.id,
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
    return ok(
        {
            "id": str(series.id),
            "frequency": series.recurrence_frequency,
            "occurrence_count": series.occurrence_count,
            "status": series.status,
            "appointments": [appointment_out_named(a, maps) for a in occurrences],
        }
    )


@router.post("/appointment-series/{series_id}/cancel")
async def cancel_my_appointment_series(
    series_id: uuid.UUID,
    body: "SupplierSeriesCancelRequest",
    ctx: FacilityContext = Depends(get_supplier_context),
    db: AsyncSession = Depends(get_db),
):
    """Tedarikci KENDI serisinin gelecekteki randevularini toplu iptal eder.

    Karar (Sprint 12, rapor): supplier series cancel EKLENDI — yalnizca
    gelecekteki pending/approved/revision_pending randevular; sebep ZORUNLU;
    tamamlanmis/gecmis randevulara dokunulmaz; adminlere TEK ozet bildirim.
    """
    assert ctx.supplier is not None
    series, affected = await svc.cancel_appointment_series(
        db,
        facility=ctx.facility,
        series_id=series_id,
        actor_type=ActorType.supplier_user,
        actor_id=ctx.identity.id,
        reason=body.reason,
        supplier_id=ctx.supplier.id,
        by_supplier=True,
    )
    return ok(
        {
            "series_id": str(series.id),
            "status": series.status,
            "affected_count": len(affected),
        }
    )
