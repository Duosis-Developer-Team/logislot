"""Facility operasyon raporlari (Sprint 6).

Kararlar (raporda): varsayilan aralik son 30 gun; date_to DAHILdir;
maksimum aralik 180 gun (asimi 422); aralik randevunun scheduled_start_at
tarihine gore facility timezone'unda hesaplanir. Rampa yoneticisi yalnizca
atanmis rampalarinin verisini gorur (response.scope.restricted=true).
"""

import statistics
import uuid
from datetime import UTC, date, datetime, timedelta
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.csvutils import csv_response
from app.core.db import get_db
from app.core.enums import (
    BLOCKING_APPOINTMENT_STATUSES,
    AppointmentStatus,
    DeliveryType,
    DockOverrideType,
    SupplierStatus,
)
from app.core.errors import ApiError
from app.core.permissions import TenantPermission
from app.core.responses import ok
from app.core.timeutils import to_utc
from app.models import Appointment, AuditLog, Dock, DockOverride
from app.routers.appointments import facility_name_maps
from app.rules.availability import WEEKDAY_KEYS
from app.services.overrides import pick_override
from app.tenancy.deps import FacilityContext, require_facility_permissions

router = APIRouter(prefix="/facilities/{facility_id}", tags=["reports"])

MAX_RANGE_DAYS = 180
#: Zamani isgal eden statuler (utilization) — iptal/red HARIC, revize DAHIL.
OCCUPYING_STATUSES = (*BLOCKING_APPOINTMENT_STATUSES, AppointmentStatus.completed)


def _hhmm(value: str) -> int:
    hour, minute = value.split(":")
    return int(hour) * 60 + int(minute)


@router.get("/reports/summary")
async def reports_summary(
    ctx: FacilityContext = Depends(require_facility_permissions(TenantPermission.REPORT_VIEW)),
    db: AsyncSession = Depends(get_db),
    date_from: date | None = None,
    date_to: date | None = None,
):
    facility = ctx.facility
    tz = ZoneInfo(facility.timezone)
    today = datetime.now(UTC).astimezone(tz).date()
    date_to = date_to or today
    date_from = date_from or (date_to - timedelta(days=29))
    if date_from > date_to:
        raise ApiError("VALIDATION_ERROR", "date_from, date_to'dan sonra olamaz", 422)
    if (date_to - date_from).days > MAX_RANGE_DAYS:
        raise ApiError(
            "RANGE_TOO_LARGE", f"Aralik en fazla {MAX_RANGE_DAYS} gun olabilir", 422
        )

    range_start = datetime.combine(date_from, datetime.min.time(), tz).astimezone(UTC)
    range_end = datetime.combine(
        date_to + timedelta(days=1), datetime.min.time(), tz
    ).astimezone(UTC)

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
    appointment_ids = {a.id for a in appointments}

    # SLA + auto/manual: audit izlerinden (canli olaylar; dogrudan seed edilen
    # gecmis kayitlarin audit'i olmadigindan bunlar manuel sayilir — bilinen sinir).
    audit_rows = list(
        (
            await db.execute(
                select(AuditLog).where(
                    AuditLog.facility_id == ctx.facility_id,
                    AuditLog.action.in_(
                        ["appointment.create", "appointment.approve", "appointment.reject"]
                    ),
                )
            )
        ).scalars()
    )
    created_at_map: dict[uuid.UUID, datetime] = {}
    initial_status: dict[uuid.UUID, str] = {}
    decision_at: dict[uuid.UUID, datetime] = {}
    for row in audit_rows:
        if row.entity_id not in appointment_ids:
            continue
        occurred = to_utc(row.occurred_at)
        if row.action == "appointment.create":
            created_at_map[row.entity_id] = occurred
            initial_status[row.entity_id] = (row.after_json or {}).get("status", "pending")
        elif row.entity_id not in decision_at:
            decision_at[row.entity_id] = occurred

    decision_minutes = [
        (decision_at[k] - created_at_map[k]).total_seconds() / 60
        for k in decision_at
        if k in created_at_map and initial_status.get(k) != "approved"
    ]
    now = datetime.now(UTC)
    pending_ages = [
        (now - to_utc(a.created_at)).total_seconds() / 3600
        for a in appointments
        if a.status == AppointmentStatus.pending
    ]

    def count(predicate) -> int:
        return sum(1 for a in appointments if predicate(a))

    total = len(appointments)
    auto_approved = sum(1 for s in initial_status.values() if s == "approved")
    by_status = [
        {
            "key": status.value,
            "label": status.value,
            "count": count(lambda a, s=status: a.status == s),
            "percentage": round(count(lambda a, s=status: a.status == s) / total, 3)
            if total
            else 0,
        }
        for status in AppointmentStatus
    ]

    maps = await facility_name_maps(db, ctx.facility_id)

    def breakdown(key_fn, label_map) -> list[dict]:
        buckets: dict = {}
        for a in appointments:
            key = key_fn(a)
            if key is None:
                continue
            b = buckets.setdefault(
                key, {"count": 0, "completed": 0, "cargo": 0, "cancelled": 0, "rejected": 0}
            )
            b["count"] += 1
            if a.status == AppointmentStatus.completed:
                b["completed"] += 1
            if a.status == AppointmentStatus.cancelled:
                b["cancelled"] += 1
            if a.status == AppointmentStatus.rejected:
                b["rejected"] += 1
            if a.delivery_type == DeliveryType.cargo:
                b["cargo"] += 1
        return sorted(
            (
                {
                    "key": str(key),
                    "label": label_map.get(key),
                    "percentage": round(b["count"] / total, 3) if total else 0,
                    **b,
                }
                for key, b in buckets.items()
            ),
            key=lambda r: -r["count"],
        )

    by_category = breakdown(lambda a: a.product_category_id, maps["categories"])
    by_supplier_raw = breakdown(lambda a: a.supplier_id, maps["suppliers"])
    by_supplier = [
        {
            "supplier_id": r["key"],
            "supplier_name": r["label"],
            "appointment_count": r["count"],
            "completed": r["completed"],
            "cancelled": r["cancelled"],
            "rejected": r["rejected"],
            "cargo": r["cargo"],
        }
        for r in by_supplier_raw
    ]

    # Rampa yogunlugu: bloklanan dakika / aralik boyunca calisma dakikasi
    overrides = list(
        (
            await db.execute(
                select(DockOverride).where(
                    DockOverride.facility_id == ctx.facility_id,
                    DockOverride.date >= date_from,
                    DockOverride.date <= date_to,
                    DockOverride.is_active.is_(True),
                )
            )
        ).scalars()
    )

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
        return _hhmm(conf["end"]) - _hhmm(conf["start"])

    day_count = (date_to - date_from).days + 1
    by_dock = []
    for dock in docks:
        dock_appts = [a for a in appointments if a.dock_id == dock.id]
        blocked = sum(
            a.duration_minutes for a in dock_appts if a.status in OCCUPYING_STATUSES
        )
        capacity = sum(
            window_minutes(dock, date_from + timedelta(days=i)) for i in range(day_count)
        )
        by_dock.append(
            {
                "dock_id": str(dock.id),
                "dock_name": dock.name,
                "appointment_count": len(dock_appts),
                "blocked_minutes": blocked,
                "utilization_percent": min(100, round(blocked / capacity * 100))
                if capacity
                else 0,
            }
        )

    daily_trend = []
    for i in range(day_count):
        day = date_from + timedelta(days=i)
        day_appts = [
            a for a in appointments
            if to_utc(a.scheduled_start_at).astimezone(tz).date() == day
        ]
        daily_trend.append(
            {
                "date": day.isoformat(),
                "total": len(day_appts),
                "completed": sum(
                    1 for a in day_appts if a.status == AppointmentStatus.completed
                ),
                "pending": sum(
                    1 for a in day_appts if a.status == AppointmentStatus.pending
                ),
                # CSV'nin "iptal" sutunu bu alani kullanir; alan olmadigi surece
                # sutun sessizce hep 0 yazardi.
                "cancelled": sum(
                    1 for a in day_appts if a.status == AppointmentStatus.cancelled
                ),
                "cargo": sum(
                    1 for a in day_appts if a.delivery_type == DeliveryType.cargo
                ),
            }
        )

    completed = count(lambda a: a.status == AppointmentStatus.completed)
    rejected = count(lambda a: a.status == AppointmentStatus.rejected)
    cancelled = count(lambda a: a.status == AppointmentStatus.cancelled)
    cargo = count(lambda a: a.delivery_type == DeliveryType.cargo)

    return ok(
        {
            "range": {
                "date_from": date_from.isoformat(),
                "date_to": date_to.isoformat(),
                "timezone": facility.timezone,
            },
            "scope": {"restricted": ctx.assigned_dock_ids is not None},
            "totals": {
                "appointments": total,
                "pending": count(lambda a: a.status == AppointmentStatus.pending),
                "approved": count(lambda a: a.status == AppointmentStatus.approved),
                "revision_pending": count(
                    lambda a: a.status == AppointmentStatus.revision_pending
                ),
                "completed": completed,
                "rejected": rejected,
                "cancelled": cancelled,
                "cargo": cargo,
                "auto_approved": auto_approved,
                "manual_approval": max(0, total - auto_approved),
            },
            "rates": {
                "completion_rate": round(completed / total, 3) if total else 0,
                "rejection_rate": round(rejected / total, 3) if total else 0,
                "cancellation_rate": round(cancelled / total, 3) if total else 0,
                "cargo_rate": round(cargo / total, 3) if total else 0,
            },
            "approval_sla": {
                "average_minutes_to_decision": round(
                    sum(decision_minutes) / len(decision_minutes)
                )
                if decision_minutes
                else None,
                "median_minutes_to_decision": round(statistics.median(decision_minutes))
                if decision_minutes
                else None,
                "pending_over_2h": sum(1 for h in pending_ages if h > 2),
                "pending_over_24h": sum(1 for h in pending_ages if h > 24),
            },
            "by_status": by_status,
            "by_category": by_category,
            "by_dock": by_dock,
            "by_supplier": by_supplier,
            "daily_trend": daily_trend,
        }
    )


@router.get("/plan/warnings")
async def facility_plan_warnings(
    ctx: FacilityContext = Depends(require_facility_permissions(TenantPermission.REPORT_VIEW)),
    db: AsyncSession = Depends(get_db),
    date_from: date | None = None,
    date_to: date | None = None,
):
    """Tenant admin'in KENDI plan kullanim uyarilari (Sprint 11).

    Kurallar: effective plan = facility override || tenant plani; yalnizca
    uyari (fatura degil), randevu olusturmayi ASLA engellemez; PII yok.
    Izin karari: report.view (rampa yoneticisinde de var -> banner gorunur).
    """
    from sqlalchemy import func as sa_func

    from app.models import FacilityMembership, Plan, Supplier, Tenant
    from app.services.plan_warnings import evaluate_rate_card

    facility = ctx.facility
    today = datetime.now(UTC).date()
    date_to = date_to or today
    date_from = date_from or (date_to - timedelta(days=29))
    range_start = datetime.combine(date_from, datetime.min.time(), UTC)
    range_end = datetime.combine(date_to + timedelta(days=1), datetime.min.time(), UTC)

    tenant = (
        await db.execute(select(Tenant).where(Tenant.id == facility.tenant_id))
    ).scalar_one()
    plan_id = facility.plan_override_id or tenant.assigned_plan_id
    plan = None
    if plan_id is not None:
        plan = (
            await db.execute(select(Plan).where(Plan.id == plan_id))
        ).scalar_one_or_none()
    if plan is None:
        return ok({"effective_plan": None, "warnings": []})

    async def count(query) -> int:
        return int((await db.execute(query)).scalar_one())

    created = await count(
        select(sa_func.count(Appointment.id)).where(
            Appointment.facility_id == facility.id,
            Appointment.created_at >= range_start,
            Appointment.created_at < range_end,
        )
    )
    completed = await count(
        select(sa_func.count(Appointment.id)).where(
            Appointment.facility_id == facility.id,
            Appointment.status == AppointmentStatus.completed,
            Appointment.created_at >= range_start,
            Appointment.created_at < range_end,
        )
    )
    dims = {
        "appointments_created": created,
        "appointments_completed": completed,
        "active_docks": await count(
            select(sa_func.count(Dock.id)).where(
                Dock.facility_id == facility.id, Dock.is_active.is_(True)
            )
        ),
        "active_suppliers": await count(
            select(sa_func.count(Supplier.id)).where(
                Supplier.facility_id == facility.id,
                Supplier.status == SupplierStatus.active,
            )
        ),
        "active_users": await count(
            select(sa_func.count(FacilityMembership.id)).where(
                FacilityMembership.facility_id == facility.id
            )
        ),
        "active_facilities": 1,
    }
    warnings = [
        {
            **w,
            "message": (
                f"{plan.name} planında {w['label']} kotanın %{w['percent']} "
                "seviyesinde. Bu uyarı bilgilendirme amaçlıdır; randevu "
                "oluşturmayı engellemez."
            ),
        }
        for w in evaluate_rate_card(plan, dims)
    ]
    return ok(
        {
            "effective_plan": {
                "id": str(plan.id),
                "name": plan.name,
                "is_override": facility.plan_override_id is not None,
            },
            "range": {"date_from": date_from.isoformat(), "date_to": date_to.isoformat()},
            "warnings": warnings,
        }
    )


# ---------- CSV exportlar (Sprint 11) ----------


@router.get("/reports/summary.csv")
async def reports_summary_csv(
    ctx: FacilityContext = Depends(require_facility_permissions(TenantPermission.REPORT_VIEW)),
    db: AsyncSession = Depends(get_db),
    date_from: date | None = None,
    date_to: date | None = None,
):
    """Ozet raporun bolumlu (sectioned) CSV'si — ayni hesap, ayni scope."""
    envelope = await reports_summary(ctx=ctx, db=db, date_from=date_from, date_to=date_to)
    data = envelope["data"]

    rows: list[list] = [
        ["LogiSlot Rapor Ozeti"],
        ["Aralik", data["range"]["date_from"], data["range"]["date_to"]],
        ["Rampa kisiti", "evet" if data["scope"]["restricted"] else "hayir"],
        [],
        ["TOPLAMLAR"],
        *[[key, value] for key, value in data["totals"].items()],
        [],
        ["GUNLUK TREND"],
        # "toplam" = o gune planlanmis randevu sayisi (olusturulma tarihi degil).
        ["tarih", "toplam", "tamamlanan", "bekleyen", "iptal", "kargo"],
        *[
            [d["date"], d["total"], d["completed"], d["pending"], d["cancelled"], d["cargo"]]
            for d in data["daily_trend"]
        ],
        [],
        ["KATEGORIYE GORE"],
        ["kategori", "adet", "yuzde"],
        *[[b["label"], b["count"], b["percentage"]] for b in data["by_category"]],
        [],
        ["RAMPAYA GORE"],
        ["rampa", "randevu", "dolu_dakika", "doluluk_yuzde"],
        *[
            [b["dock_name"], b["appointment_count"], b["blocked_minutes"],
             b["utilization_percent"]]
            for b in data["by_dock"]
        ],
        [],
        ["TEDARIKCIYE GORE"],
        ["tedarikci", "randevu", "tamamlanan", "iptal", "red", "kargo"],
        *[
            [b["supplier_name"], b["appointment_count"], b["completed"],
             b["cancelled"], b["rejected"], b["cargo"]]
            for b in data["by_supplier"]
        ],
    ]
    return csv_response(
        f"logislot_ozet_{data['range']['date_from']}_{data['range']['date_to']}.csv", rows
    )


@router.get("/reports/appointments.csv")
async def reports_appointments_csv(
    ctx: FacilityContext = Depends(require_facility_permissions(TenantPermission.REPORT_VIEW)),
    db: AsyncSession = Depends(get_db),
    date_from: date | None = None,
    date_to: date | None = None,
):
    """Randevu detay CSV'si.

    PII karari (rapor): plaka/surucu/iletisim ALANLARI EXPORT EDILMEZ (MVP —
    dosya tesisten disari cikabilir); ihtiyac olursa ayri izinle acilir.
    Rampa yoneticisi scope'u aynen uygulanir.
    """
    facility = ctx.facility
    tz = ZoneInfo(facility.timezone)
    today = datetime.now(UTC).astimezone(tz).date()
    date_to = date_to or today
    date_from = date_from or (date_to - timedelta(days=29))
    if (date_to - date_from).days > MAX_RANGE_DAYS:
        raise ApiError(
            "RANGE_TOO_LARGE", f"Aralik en fazla {MAX_RANGE_DAYS} gun olabilir", 422
        )
    range_start = datetime.combine(date_from, datetime.min.time(), tz).astimezone(UTC)
    range_end = datetime.combine(
        date_to + timedelta(days=1), datetime.min.time(), tz
    ).astimezone(UTC)

    appointments = list(
        (
            await db.execute(
                select(Appointment)
                .where(
                    Appointment.facility_id == ctx.facility_id,
                    Appointment.scheduled_start_at >= range_start,
                    Appointment.scheduled_start_at < range_end,
                )
                .order_by(Appointment.scheduled_start_at)
            )
        ).scalars()
    )
    if ctx.assigned_dock_ids is not None:
        appointments = [a for a in appointments if a.dock_id in set(ctx.assigned_dock_ids)]

    maps = await facility_name_maps(db, ctx.facility_id)
    approve_rows = (
        await db.execute(
            select(AuditLog.entity_id, AuditLog.occurred_at).where(
                AuditLog.facility_id == ctx.facility_id,
                AuditLog.action == "appointment.approve",
            )
        )
    ).all()
    approved_at = {}
    for entity_id, occurred in approve_rows:
        approved_at.setdefault(entity_id, occurred)

    def local(dt) -> str:
        return to_utc(dt).astimezone(tz).strftime("%Y-%m-%d %H:%M")

    rows: list[list] = [
        [
            "tarih", "saat", "tedarikci", "urun", "kategori", "rampa", "durum",
            "teslimat_tipi", "sure_dk", "olusturulma", "onaylanma",
        ]
    ]
    for a in appointments:
        start_local = to_utc(a.scheduled_start_at).astimezone(tz)
        rows.append(
            [
                start_local.strftime("%Y-%m-%d"),
                start_local.strftime("%H:%M"),
                maps["suppliers"].get(a.supplier_id, ""),
                a.product_name,
                maps["categories"].get(a.product_category_id, ""),
                maps["docks"].get(a.dock_id, ""),
                a.status.value,
                a.delivery_type.value,
                a.duration_minutes,
                local(a.created_at),
                local(approved_at[a.id]) if a.id in approved_at else "",
            ]
        )
    return csv_response(
        f"logislot_randevular_{date_from.isoformat()}_{date_to.isoformat()}.csv", rows
    )
