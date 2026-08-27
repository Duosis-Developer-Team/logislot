"""Demo senaryo verisinin KALITE sozlesmesi.

Sunumda gosterilen veri, urunun kendi kurallarina uymak zorundadir: rampa
uyumu, calisma saatleri ve cakismasizlik. Bu testler o sozlesmeyi ve
modulun yeniden calistirilabilirligini korur.
"""

from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.core.enums import (
    BLOCKING_APPOINTMENT_STATUSES,
    AppointmentStatus,
    DeliveryType,
)
from app.demo_scenarios import (
    SUPPLIERS,
    ScenarioBuilder,
    apply_scenarios,
    demo_id,
)
from app.models import Appointment, Dock, Notification, Supplier


async def _apply(session_maker, facility):
    async with session_maker() as db:
        facility = await db.merge(facility)
        summary = await apply_scenarios(db, facility, tz=ZoneInfo(facility.timezone))
        await db.commit()
        return summary


async def test_scenarios_write_a_full_operating_day(client, seeded, session_maker):
    summary = await _apply(session_maker, seeded["facility"])
    assert summary["appointments"] > 40
    # Konfigurasyona uymadigi icin dusen satir OLMAMALI (hafta sonu haric).
    assert summary["series_occurrences"] >= 1

    facility = seeded["facility"]
    tz = ZoneInfo(facility.timezone)
    today = datetime.now(tz).replace(hour=0, minute=0, second=0, microsecond=0)

    async with session_maker() as db:
        rows = list(
            (
                await db.execute(
                    select(Appointment).where(
                        Appointment.facility_id == facility.id,
                        Appointment.scheduled_start_at >= today.astimezone(UTC),
                        Appointment.scheduled_start_at
                        < (today + timedelta(days=1)).astimezone(UTC),
                    )
                )
            ).scalars()
        )

    statuses = {r.status for r in rows}
    # Sunumun anlatimi: bugun her statuden ornek gorunur.
    assert {
        AppointmentStatus.completed,
        AppointmentStatus.approved,
        AppointmentStatus.pending,
    } <= statuses
    assert any(r.delivery_type == DeliveryType.cargo for r in rows)


async def test_scenarios_are_rerunnable(client, seeded, session_maker):
    """Iki kez kosmak veriyi COGALTMAZ; ikinci kosu oncekini siler."""
    await _apply(session_maker, seeded["facility"])
    async with session_maker() as db:
        first = (
            await db.execute(
                select(func.count()).select_from(Appointment)
            )
        ).scalar_one()

    summary = await _apply(session_maker, seeded["facility"])
    async with session_maker() as db:
        second = (
            await db.execute(
                select(func.count()).select_from(Appointment)
            )
        ).scalar_one()

    assert summary["removed"] > 0
    assert first == second

    # Tedarikciler de tekrar yaratilmaz.
    async with session_maker() as db:
        codes = [
            s.code
            for s in (
                await db.execute(
                    select(Supplier).where(Supplier.facility_id == seeded["facility"].id)
                )
            ).scalars()
        ]
    assert len(codes) == len(set(codes))
    assert {spec["code"] for spec in SUPPLIERS} <= set(codes)


async def test_scenario_rows_respect_dock_compatibility(client, seeded, session_maker):
    """Her randevu, atandigi rampanin kabul listesiyle uyumlu olmali."""
    await _apply(session_maker, seeded["facility"])
    async with session_maker() as db:
        docks = {
            d.id: d
            for d in (
                await db.execute(
                    select(Dock)
                    .options(
                        selectinload(Dock.accepted_product_categories),
                        selectinload(Dock.accepted_vehicle_categories),
                    )
                    .where(Dock.facility_id == seeded["facility"].id)
                )
            ).scalars()
        }
        rows = list(
            (
                await db.execute(
                    select(Appointment).where(
                        Appointment.facility_id == seeded["facility"].id
                    )
                )
            ).scalars()
        )

    scenario_ids = {
        demo_id(seeded["facility"].id, f"appt:{k}")
        for k in _all_scenario_keys()
    }
    checked = 0
    for row in rows:
        if row.id not in scenario_ids or row.dock_id is None:
            continue  # seed'in kendi satirlari bu testin kapsaminda degil
        dock = docks[row.dock_id]
        products = {c.id for c in dock.accepted_product_categories}
        vehicles = {v.id for v in dock.accepted_vehicle_categories}
        assert not products or row.product_category_id in products, row.product_name
        assert not vehicles or row.vehicle_category_id in vehicles, row.product_name
        checked += 1
    assert checked > 40


async def test_scenario_rows_do_not_overlap_on_a_dock(client, seeded, session_maker):
    """Ayni rampada zamani fiilen isgal eden iki randevu ust uste binmez."""
    await _apply(session_maker, seeded["facility"])
    async with session_maker() as db:
        rows = list(
            (
                await db.execute(
                    select(Appointment)
                    .where(Appointment.facility_id == seeded["facility"].id)
                    .order_by(Appointment.scheduled_start_at)
                )
            ).scalars()
        )

    occupying = BLOCKING_APPOINTMENT_STATUSES + (AppointmentStatus.completed,)
    by_dock: dict = {}
    for row in rows:
        if row.dock_id is None or row.status not in occupying:
            continue
        by_dock.setdefault(row.dock_id, []).append(row)

    for dock_id, dock_rows in by_dock.items():
        dock_rows.sort(key=lambda r: r.scheduled_start_at)
        for previous, current in zip(dock_rows, dock_rows[1:], strict=False):
            assert previous.scheduled_end_at <= current.scheduled_start_at, (
                f"{dock_id}: {previous.product_name} / {current.product_name}"
            )


async def test_scenarios_never_exceed_supplier_weekly_quota(
    client, seeded, session_maker
):
    """Demo verisi tedarikcinin kendi kotasini asmaz.

    Assaydi sunum sirasinda "yeni randevu" akisi SUPPLIER_QUOTA_EXCEEDED ile
    kapali gelirdi — vitrin verisi urunu kilitlememelidir.
    """
    await _apply(session_maker, seeded["facility"])
    async with session_maker() as db:
        suppliers = {
            s.id: s
            for s in (
                await db.execute(
                    select(Supplier).where(Supplier.facility_id == seeded["facility"].id)
                )
            ).scalars()
        }
        rows = list(
            (
                await db.execute(
                    select(Appointment).where(
                        Appointment.facility_id == seeded["facility"].id,
                        Appointment.status.not_in(
                            [AppointmentStatus.cancelled, AppointmentStatus.rejected]
                        ),
                    )
                )
            ).scalars()
        )

    usage: dict = {}
    for row in rows:
        day = row.scheduled_start_at.date()
        week = day - timedelta(days=day.weekday())
        usage[(row.supplier_id, week)] = usage.get((row.supplier_id, week), 0) + 1

    for (supplier_id, week), count in usage.items():
        quota = suppliers[supplier_id].weekly_quota
        if quota is not None:
            assert count <= quota, (
                f"{suppliers[supplier_id].company_name} {week}: {count} > {quota}"
            )


async def test_scenarios_produce_notifications(client, seeded, session_maker):
    await _apply(session_maker, seeded["facility"])
    async with session_maker() as db:
        rows = list(
            (
                await db.execute(
                    select(Notification).where(
                        Notification.facility_id == seeded["facility"].id
                    )
                )
            ).scalars()
        )
    types = {n.type for n in rows}
    assert {"appointment_created", "cargo_advisory", "appointment_approved"} <= types


def test_builder_placement_rejects_overlap():
    """Yerlestirme yardimcisi cakismayi gercekten yakaliyor mu?"""
    from app.demo_scenarios import Placement

    placement = Placement()
    base = datetime(2026, 8, 19, 9, 0, tzinfo=UTC)
    placement.add(base, base + timedelta(minutes=60))
    assert placement.conflicts(base + timedelta(minutes=30), base + timedelta(minutes=90))
    assert not placement.conflicts(base + timedelta(minutes=60), base + timedelta(hours=2))
    assert ScenarioBuilder is not None  # import sozlesmesi


def _all_scenario_keys() -> list[str]:
    from app.demo_scenarios import _scenario_keys

    return _scenario_keys()
