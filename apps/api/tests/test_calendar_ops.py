"""Sprint 4: takvim/dashboard endpointleri, lifecycle aksiyonlari, revize + scope."""

from datetime import date, timedelta

from tests.conftest import auth_headers, login
from tests.test_config_crud import admin, next_weekday
from tests.test_isolation import _create_other_tenant


async def dock_manager(client):
    return auth_headers(await login(client, "/auth/login", "rampa@cakesbakes.com"))


# ---------- Dashboard ----------


async def test_dashboard_summary_metrics(client, seeded):
    headers = await admin(client)
    fid = seeded["facility"].id
    response = await client.get(f"/facilities/{fid}/dashboard-summary", headers=headers)
    assert response.status_code == 200
    data = response.json()["data"]
    for key in (
        "today_appointments", "pending_approvals", "approved_today", "completed_today",
        "week_total", "active_suppliers", "active_docks", "cargo_warned",
        "upcoming", "pending_list",
    ):
        assert key in data, key
    assert data["active_docks"] == 3
    assert data["active_suppliers"] == 3
    assert data["cargo_warned"] >= 1  # seed'de yarin kargo randevusu var
    assert data["pending_approvals"] >= 2
    # isim zenginlestirme listelerde mevcut
    assert all("supplier_name" in a for a in data["upcoming"])


async def test_dashboard_requires_appt_view(client, seeded):
    # izleyicide appt.view VAR -> 200; tedarikci -> 403
    fid = seeded["facility"].id
    viewer = auth_headers(await login(client, "/auth/login", "izleyici@cakesbakes.com"))
    assert (
        await client.get(f"/facilities/{fid}/dashboard-summary", headers=viewer)
    ).status_code == 200
    supplier = auth_headers(
        await login(client, "/auth/supplier-login", "tedarikci@anadoluun.com")
    )
    assert (
        await client.get(f"/facilities/{fid}/dashboard-summary", headers=supplier)
    ).status_code == 403


# ---------- Calendar day ----------


async def test_calendar_day_returns_docks_appointments_advisories(client, seeded):
    headers = await admin(client)
    fid = seeded["facility"].id
    tomorrow = (date.today() + timedelta(days=1)).isoformat()
    response = await client.get(
        f"/facilities/{fid}/calendar/day?date={tomorrow}", headers=headers
    )
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["facility"]["timezone"] == "Europe/Istanbul"
    assert len(data["docks"]) == 3
    assert data["working_window"]["slot_minutes"] == 30
    # seed: yarin kargo (R3) + revize edilen randevu (R2)
    statuses = {a["status"] for a in data["appointments"]}
    assert "pending" in statuses
    assert "revision_pending" in statuses
    assert len(data["cargo_advisories"]) == 1
    advisory = data["cargo_advisories"][0]
    assert advisory["window"] == "morning"
    cargo_appt = next(a for a in data["appointments"] if a["delivery_type"] == "cargo")
    assert cargo_appt["has_cargo_warning"] is True
    assert "allowed_actions" in cargo_appt


async def test_calendar_day_closed_override_blocks_and_extra_hours_opens(client, seeded):
    headers = await admin(client)
    fid = seeded["facility"].id

    # Seed: bugun+3 gun R3 kapali (closed override)
    closed_day = (date.today() + timedelta(days=3)).isoformat()
    response = await client.get(
        f"/facilities/{fid}/calendar/day?date={closed_day}", headers=headers
    )
    data = response.json()["data"]
    d3 = str(seeded["docks"]["d3"].id)
    blocked = [b for b in data["blocked_slots"] if b["dock_id"] == d3]
    assert len(blocked) == 1 and blocked[0]["reason"] == "closed_override"
    d3_row = next(d for d in data["docks"] if d["id"] == d3)
    assert d3_row["day_window"] is None  # kapali

    # Seed: onumuzdeki pazar R1 extra_hours 09-13 (normalde pazar kapali)
    today = date.today()
    sunday = (today + timedelta(days=((6 - today.weekday()) % 7) or 7)).isoformat()
    response = await client.get(
        f"/facilities/{fid}/calendar/day?date={sunday}", headers=headers
    )
    data = response.json()["data"]
    d1_row = next(d for d in data["docks"] if d["id"] == str(seeded["docks"]["d1"].id))
    assert d1_row["day_window"] == {"start": "09:00", "end": "13:00"}
    assert data["working_window"]["start"] == "09:00"


async def test_calendar_facility_isolation(client, seeded, session_maker):
    await _create_other_tenant(session_maker)
    other = auth_headers(await login(client, "/auth/login", "admin@rakip.com"))
    fid = seeded["facility"].id
    response = await client.get(
        f"/facilities/{fid}/calendar/day?date={date.today().isoformat()}", headers=other
    )
    assert response.status_code == 403


# ---------- Detail + allowed_actions ----------


async def test_detail_allowed_actions_by_status_and_permission(client, seeded, session_maker):
    from sqlalchemy import select

    from app.core.enums import AppointmentStatus
    from app.models import Appointment

    fid = seeded["facility"].id
    async with session_maker() as db:
        pending = (
            await db.execute(
                select(Appointment).where(Appointment.status == AppointmentStatus.pending)
            )
        ).scalars().first()
        completed = (
            await db.execute(
                select(Appointment).where(Appointment.status == AppointmentStatus.completed)
            )
        ).scalars().first()

    headers = await admin(client)
    response = await client.get(
        f"/facilities/{fid}/appointments/{pending.id}", headers=headers
    )
    actions = response.json()["data"]["allowed_actions"]
    assert actions == {
        "approve": True, "reject": True, "revise": True, "complete": False, "cancel": True,
    }
    assert response.json()["data"]["supplier_contact"] is not None

    response = await client.get(
        f"/facilities/{fid}/appointments/{completed.id}", headers=headers
    )
    actions = response.json()["data"]["allowed_actions"]
    assert not any(actions.values())

    # izleyici: appt.view var ama hicbir aksiyon izni yok
    viewer = auth_headers(await login(client, "/auth/login", "izleyici@cakesbakes.com"))
    response = await client.get(
        f"/facilities/{fid}/appointments/{pending.id}", headers=viewer
    )
    assert not any(response.json()["data"]["allowed_actions"].values())


# ---------- Lifecycle: complete/cancel govdeleri ----------


async def test_complete_with_note_and_cancel_with_reason(client, seeded, session_maker):
    from sqlalchemy import select

    from app.core.enums import AppointmentStatus
    from app.models import Appointment

    fid = seeded["facility"].id
    headers = await admin(client)
    async with session_maker() as db:
        approved = (
            await db.execute(
                select(Appointment).where(Appointment.status == AppointmentStatus.approved)
            )
        ).scalars().first()
        pending = (
            await db.execute(
                select(Appointment).where(Appointment.status == AppointmentStatus.pending)
            )
        ).scalars().first()

    response = await client.post(
        f"/facilities/{fid}/appointments/{approved.id}/complete",
        headers=headers,
        json={"note": "Mal kabul sorunsuz tamamlandi"},
    )
    assert response.status_code == 200
    assert response.json()["data"]["completion_note"] == "Mal kabul sorunsuz tamamlandi"

    response = await client.post(
        f"/facilities/{fid}/appointments/{pending.id}/cancel",
        headers=headers,
        json={"reason": "Operasyon iptali"},
    )
    assert response.status_code == 200
    assert response.json()["data"]["cancellation_reason"] == "Operasyon iptali"


# ---------- Revize: uygunluk + auto assign + gecmis ----------


async def create_appointment_via_api(client, seeded, token, hour: int, **overrides):
    day = next_weekday()
    body = {
        "product_category_id": str(seeded["product_categories"]["unlu"].id),
        "product_name": "Un",
        "quantity": 1,
        "vehicle_category_id": str(seeded["vehicle_categories"]["kamyonet"].id),
        "target_date": day.isoformat(),
        "start_at": f"{day.isoformat()}T{hour:02d}:00:00+03:00",
        "duration_minutes": 60,
        **overrides,
    }
    response = await client.post("/supplier/appointments", headers=token, json=body)
    assert response.status_code == 200, response.text
    return response.json()["data"], day


async def test_revise_validates_availability_and_writes_history(client, seeded):
    supplier_token = auth_headers(
        await login(client, "/auth/supplier-login", "tedarikci@anadoluun.com")
    )
    headers = await admin(client)
    fid = seeded["facility"].id

    first, day = await create_appointment_via_api(client, seeded, supplier_token, 9)
    second, _ = await create_appointment_via_api(client, seeded, supplier_token, 11)
    assert first["dock_id"] == second["dock_id"]  # ikisi de en az dolu R1'e atanir

    base = f"/facilities/{fid}/appointments/{second['id']}"

    # 1) Dolu aralige (ayni docka 09:00) revize -> 422 cakisma
    response = await client.post(
        f"{base}/revise",
        headers=headers,
        json={
            "new_start_at": f"{day.isoformat()}T09:00:00+03:00",
            "new_dock_id": first["dock_id"],
        },
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] in (
        "DOCK_TIME_CONFLICT", "DOCK_CONFLICT_GROUP_BLOCKED",
    )

    # 2) Uyumsuz rampaya revize -> 422 (R3 unlu mamul kabul etmez)
    response = await client.post(
        f"{base}/revise",
        headers=headers,
        json={
            "new_start_at": f"{day.isoformat()}T11:00:00+03:00",
            "new_dock_id": str(seeded["docks"]["d3"].id),
        },
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "NO_COMPATIBLE_DOCK"

    # 3) auto_assign ile ayni saatte farkli rampaya (R2) tasi -> basarili
    response = await client.post(
        f"{base}/revise",
        headers=headers,
        json={
            "new_start_at": f"{day.isoformat()}T09:00:00+03:00",
            "auto_assign_dock": True,
            "note": "Yogunluk nedeniyle uygun rampaya alindi",
        },
    )
    assert response.status_code == 200, response.text
    data = response.json()["data"]
    assert data["status"] == "revision_pending"
    assert data["dock_id"] == str(seeded["docks"]["d2"].id)
    assert data["original_start_at"] is not None

    # revizyon gecmisi yazildi + supplier portalda gorunur
    response = await client.get(
        f"/supplier/appointments/{second['id']}", headers=supplier_token
    )
    revisions = response.json()["data"]["revisions"]
    assert len(revisions) == 1
    assert revisions[0]["note"] == "Yogunluk nedeniyle uygun rampaya alindi"

    # admin revize sonrasi onaylayabilir (revision_pending -> approved)
    response = await client.post(f"{base}/approve", headers=headers)
    assert response.json()["data"]["status"] == "approved"


async def test_revise_slot_no_longer_available(client, seeded):
    """auto_assign: tum uygun rampalar doluysa SLOT_NO_LONGER_AVAILABLE."""
    supplier_token = auth_headers(
        await login(client, "/auth/supplier-login", "tedarikci@anadoluun.com")
    )
    headers = await admin(client)
    fid = seeded["facility"].id

    # 10:00'da R1 ve R2'yi doldur (unlu mamul yalniz R1+R2)
    a1, day = await create_appointment_via_api(client, seeded, supplier_token, 10)
    a2, _ = await create_appointment_via_api(client, seeded, supplier_token, 10)
    assert {a1["dock_id"], a2["dock_id"]} == {
        str(seeded["docks"]["d1"].id), str(seeded["docks"]["d2"].id),
    }
    # 14:00'te ucuncu randevu
    a3, _ = await create_appointment_via_api(client, seeded, supplier_token, 14)

    response = await client.post(
        f"/facilities/{fid}/appointments/{a3['id']}/revise",
        headers=headers,
        json={
            "new_start_at": f"{day.isoformat()}T10:00:00+03:00",
            "auto_assign_dock": True,
        },
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "SLOT_NO_LONGER_AVAILABLE"


# ---------- Rampa yoneticisi scope ----------


async def test_dock_manager_scope_on_calendar_and_actions(client, seeded, session_maker):
    """Yalnizca R1'e atanmis rampa yoneticisi R2 randevusunda aksiyon alamaz."""
    from sqlalchemy import select

    from app.models import FacilityMembership

    fid = seeded["facility"].id
    d1 = seeded["docks"]["d1"].id

    # rampa yoneticisinin scope'unu yalnizca R1'e indir
    async with session_maker() as db:
        membership = (
            await db.execute(
                select(FacilityMembership).where(
                    FacilityMembership.tenant_user_id == seeded["users"]["dock"].id
                )
            )
        ).scalar_one()
        membership.assigned_dock_ids = [str(d1)]
        await db.commit()

    manager = await dock_manager(client)

    # Takvimde yalniz R1 gorunur
    tomorrow = (date.today() + timedelta(days=1)).isoformat()
    response = await client.get(
        f"/facilities/{fid}/calendar/day?date={tomorrow}", headers=manager
    )
    docks = response.json()["data"]["docks"]
    assert [d["name"] for d in docks] == ["Rampa 1"]

    # R2'deki pending randevuda (seed: Donuk Pasta Bazi) approve -> 403
    from app.core.enums import AppointmentStatus
    from app.models import Appointment

    async with session_maker() as db:
        r2_pending = (
            await db.execute(
                select(Appointment).where(
                    Appointment.dock_id == seeded["docks"]["d2"].id,
                    Appointment.status == AppointmentStatus.pending,
                )
            )
        ).scalars().first()

    response = await client.post(
        f"/facilities/{fid}/appointments/{r2_pending.id}/approve", headers=manager
    )
    assert response.status_code == 403

    # R1'deki REVISE EDILEBILIR randevuyu yetkisiz rampaya (R2) revize edemez
    async with session_maker() as db:
        r1_appt = (
            await db.execute(
                select(Appointment).where(
                    Appointment.dock_id == d1,
                    Appointment.status.in_(
                        [AppointmentStatus.pending, AppointmentStatus.approved]
                    ),
                )
            )
        ).scalars().first()

    day = next_weekday()
    response = await client.post(
        f"/facilities/{fid}/appointments/{r1_appt.id}/revise",
        headers=manager,
        json={
            "new_start_at": f"{day.isoformat()}T13:00:00+03:00",
            "new_dock_id": str(seeded["docks"]["d2"].id),
        },
    )
    assert response.status_code == 403


# ---------- Eszamanlilik (sirali son-an kontrol; gercek paralellik canli smoke'ta) ----------


async def test_sequential_double_booking_prevented(client, seeded):
    """Ayni slot + ayni rampa kombinasyonu ikinci kez rezerve edilemez."""
    token = auth_headers(
        await login(client, "/auth/supplier-login", "tedarikci@marmarasoguk.com")
    )
    day = next_weekday()

    async def create():
        return await client.post(
            "/supplier/appointments",
            headers=token,
            json={
                "product_category_id": str(seeded["product_categories"]["soguk"].id),
                "product_name": "Krema",
                "quantity": 1,
                "target_date": day.isoformat(),
                "start_at": f"{day.isoformat()}T09:00:00+03:00",
                "duration_minutes": 60,
            },
        )

    first = await create()
    assert first.status_code == 200
    second = await create()  # soguk zincir yalniz R2 -> ikinci istek carpisir
    assert second.status_code == 422
    assert second.json()["error"]["code"] == "DOCK_TIME_CONFLICT"