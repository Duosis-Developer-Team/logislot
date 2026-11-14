"""Tedarikci portal endpointleri.

Tedarikci yalnizca kendi supplier_id kayitlarini gorur; baska veri donmez.
"""

import uuid
from datetime import date

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
    QuantityUnit,
)
from app.core.errors import NotFoundError
from app.core.ratelimit import enforce_rate_limit
from app.core.responses import ok
from app.models import Appointment, ProductCategory, VehicleCategory
from app.routers.appointments import (
    _appointment_out,
    _linked_summary,
    _series_summary,
    appointment_out_named,
    evaluate_availability,
    facility_name_maps,
)
from app.schemas.appointment import (
    AvailabilityRequest,
    DurationEstimateRequest,
    RevisionOut,
    SupplierAppointmentCreate,
    SupplierCancelRequest,
)
from app.schemas.catalog import ProductCategoryOut, SupplierOut, VehicleCategoryOut
from app.services import appointments as svc
from app.services.appointment_form import MAX_ORDER_NUMBERS, resolve_appointment_form
from app.services.appointments import allowed_delivery_types
from app.services.cancellation_policy import (
    list_reasons,
    notice_cutoff,
    resolve_cancellation_policy,
)
from app.services.duration_rules import estimate_duration, resolve_duration_policy
from app.services.supplier_limits import minute_usage
from app.tenancy.deps import FacilityContext, get_supplier_context

router = APIRouter(prefix="/supplier", tags=["supplier-portal"])


class SupplierSeriesCancelRequest(BaseModel):
    """Sebep ZORUNLU: yanlislikla toplu iptal riskine karsi bilinçli surtunme.

    Sebep ya listeden (`reason_id`) ya serbest metinle (`reason`, >= 3
    karakter) verilir; tesis kurali sebep istiyorsa liste zorunludur. Kontrol
    serviste yapilir (services/cancellation_policy.py).
    """

    reason_id: uuid.UUID | None = None
    reason: str | None = Field(default=None, max_length=500)

QUANTITY_UNIT_LABELS = {
    QuantityUnit.pallet: "Palet",
    QuantityUnit.piece: "Adet",
    QuantityUnit.box: "Kutu",
    QuantityUnit.carton: "Koli",
    QuantityUnit.sack: "Çuval",
    QuantityUnit.big_bag: "Big Bag",
    QuantityUnit.ton: "Ton",
}


@router.get("/profile")
@router.get("/me")
async def profile(
    ctx: FacilityContext = Depends(get_supplier_context),
    db: AsyncSession = Depends(get_db),
):
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
            # Iptal penceresi ve zorunlu alanlar; arayuz buna gore iptal
            # dugmesini kapatir ve formu kurar. Kural sunucuda da zorlanir.
            "cancellation_policy": resolve_cancellation_policy(ctx.facility),
            # Firmanin AKTIF sebep listesi (siraya gore). Tedarikci yalnizca
            # bunlardan secebilir; aciklama zorunlulugu sebep bazindadir.
            "cancellation_reasons": [
                {"id": str(r.id), "label": r.label, "note_required": r.note_required}
                for r in await list_reasons(db, ctx.facility_id, active_only=True)
            ],
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
                "cargo_enabled": supplier.cargo_enabled,
            },
            # Standart her tedarikcide aciktir; kargo yalnizca yonetim bu
            # tedarikci icin acmissa listelenir (sihirbaz bu listeyi kullanir).
            "delivery_types": allowed_delivery_types(supplier),
            "cargo_windows": [w.value for w in CargoWindow],
            "cargo_default_min_block_minutes": ctx.facility.cargo_default_min_block_minutes,
            "quantity_units": [
                {"value": u.value, "label": label}
                for u, label in QUANTITY_UNIT_LABELS.items()
            ],
            # Tesisin form ayari: hangi alan gizli/istege bagli/zorunlu.
            "appointment_form": resolve_appointment_form(ctx.facility),
            # Islem suresini kim belirler (supplier / suggested / computed).
            "duration_policy": resolve_duration_policy(ctx.facility),
            "max_order_numbers": MAX_ORDER_NUMBERS,
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
    # Telafi baglantilari (ayni tedarikcinin kendi randevulari arasinda).
    data["makeup_of"] = await _linked_summary(db, appointment.makeup_of_id)
    data["makeup_appointment"] = await _linked_summary(db, appointment.makeup_appointment_id)
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
            order_numbers=body.order_numbers,
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
        order_numbers=body.order_numbers,
        start_at=body.start_at,
        duration_minutes=body.duration_minutes,
        cargo_window=body.cargo_window,
        recurring_rule=body.recurring_rule,
    )
    return ok(_appointment_out(appointment))


@router.post("/appointments/{appointment_id}/cancel")
async def cancel_my_appointment(
    appointment_id: uuid.UUID,
    body: SupplierCancelRequest | None = None,
    ctx: FacilityContext = Depends(get_supplier_context),
    db: AsyncSession = Depends(get_db),
):
    """Tedarikci kendi randevusunu iptal eder (+ zorunluysa telafi randevusu).

    Govde opsiyoneldir (eski istemciler bos POST atar); tesisin iptal kurali
    sebep veya telafi istiyorsa eksik govde 422 ile reddedilir. Telafi
    olusturulamazsa (slot dolu vb.) iptal de YAPILMAZ.
    """
    assert ctx.supplier is not None
    body = body or SupplierCancelRequest()
    appointment, makeup = await svc.supplier_cancel_appointment(
        db,
        facility=ctx.facility,
        supplier=ctx.supplier,
        appointment_id=appointment_id,
        actor_id=ctx.identity.id,
        reason_id=body.reason_id,
        note=body.reason,
        makeup=(
            svc.MakeupSlot(
                target_date=body.makeup.target_date,
                start_at=body.makeup.start_at,
                cargo_window=body.makeup.cargo_window,
            )
            if body.makeup
            else None
        ),
    )
    data = _appointment_out(appointment)
    data["makeup_appointment"] = _appointment_out(makeup) if makeup else None
    return ok(data)


@router.post("/availability/evaluate")
async def my_availability(
    body: AvailabilityRequest,
    ctx: FacilityContext = Depends(get_supplier_context),
    db: AsyncSession = Depends(get_db),
):
    assert ctx.supplier is not None
    return ok(await evaluate_availability(body, ctx, db, ctx.supplier, locked=True))


@router.get("/minute-usage")
async def my_minute_usage(
    target_date: date,
    ctx: FacilityContext = Depends(get_supplier_context),
    db: AsyncSession = Depends(get_db),
):
    """Sihirbaz: hedef gunun gun/hafta/ay donemlerinde kullanilan ve kalan sure.

    Limitler tesis varsayilani ya da tedarikciye ozel olabilir; sunucu
    randevu olustururken ayni hesabi kilit altinda yeniden yapar.
    """
    assert ctx.supplier is not None
    usage = await minute_usage(db, ctx.facility, ctx.supplier, target_date)
    return ok({"target_date": target_date.isoformat(), "usage": [u.as_dict() for u in usage]})


@router.post("/duration/estimate")
async def estimate_my_duration(
    body: DurationEstimateRequest,
    ctx: FacilityContext = Depends(get_supplier_context),
    db: AsyncSession = Depends(get_db),
):
    """Sihirbazin islem suresi: tesisin sure kurallarindan hesaplanir.

    Mod "tedarikci secer" ise hesap yine doner (bilgi amacli) ama sihirbaz
    secimi tedarikciye birakir. Yalnizca tedarikcinin izinli kategorileri.
    """
    assert ctx.supplier is not None
    allowed = {c.id for c in ctx.supplier.allowed_product_categories}
    if body.product_category_id not in allowed:
        raise NotFoundError("Urun kategorisi bulunamadi")
    category = await db.get(ProductCategory, body.product_category_id)
    if category is None or category.facility_id != ctx.facility_id:
        raise NotFoundError("Urun kategorisi bulunamadi")
    estimate = await estimate_duration(
        db,
        ctx.facility,
        product_category=category,
        vehicle_category_id=body.vehicle_category_id,
        quantity=body.quantity,
        quantity_unit=body.quantity_unit.value,
    )
    return ok({**estimate.as_dict(), **resolve_duration_policy(ctx.facility)})


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
    # Tesisin bildirim suresinden yakin occurrence'lar portaldan iptal
    # edilemez; sayaclar ve "seriyi iptal et" hakki buna gore hesaplanir.
    policy = resolve_cancellation_policy(ctx.facility)
    cutoff = notice_cutoff(policy, now)
    by_series: dict = {}
    for a in appointments:
        by_series.setdefault(a.series_id, []).append(a)

    def row(series) -> dict:
        rows = by_series.get(series.id, [])
        counts: dict[str, int] = {}
        for a in rows:
            counts[a.status.value] = counts.get(a.status.value, 0) + 1
        future_active = [
            a for a in rows
            if a.status.value in ("pending", "approved", "revision_pending")
            and to_utc(a.scheduled_start_at) > now
        ]
        future_cancellable = [
            a for a in future_active if to_utc(a.scheduled_start_at) >= cutoff
        ]
        upcoming = min(
            (to_utc(a.scheduled_start_at) for a in future_active), default=None
        )
        return {
            "id": str(series.id),
            "frequency": series.recurrence_frequency,
            "occurrence_count": series.occurrence_count,
            "status": series.status,
            "status_counts": counts,
            "next_appointment_at": upcoming.isoformat() if upcoming else None,
            "product_name": rows[0].product_name if rows else None,
            # Telafi zorunluysa seri toplu iptal edilemez (her iptal kendi
            # telafisiyle tek tek yapilir).
            "can_cancel_series": len(future_cancellable) > 0 and not policy["require_makeup"],
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
    series, affected, kept_within_notice = await svc.cancel_appointment_series(
        db,
        facility=ctx.facility,
        series_id=series_id,
        actor_type=ActorType.supplier_user,
        actor_id=ctx.identity.id,
        reason=body.reason,
        reason_id=body.reason_id,
        supplier_id=ctx.supplier.id,
        by_supplier=True,
    )
    return ok(
        {
            "series_id": str(series.id),
            "status": series.status,
            "affected_count": len(affected),
            "kept_within_notice_count": kept_within_notice,
        }
    )
