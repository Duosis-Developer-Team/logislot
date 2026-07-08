"""Sprint 5: bildirim uretimi/endpointleri, haftalik ozet, advisory standardi."""

from datetime import date, timedelta

from tests.conftest import auth_headers, login
from tests.test_config_crud import admin, next_weekday
from tests.test_isolation import _create_other_tenant


async def supplier_token(client, email="tedarikci@marmarasoguk.com"):
    return auth_headers(await login(client, "/auth/supplier-login", email))


async def create_via_portal(client, seeded, token, *, hour=9, cargo=False, category="soguk"):
    day = next_weekday()
    body = {
        "product_category_id": str(seeded["product_categories"][category].id),
        "product_name": "Bildirim Testi",
        "quantity": 1,
        "target_date": day.isoformat(),
    }
    if cargo:
        body |= {"delivery_type": "cargo", "cargo_window": "morning"}
    else:
        body |= {
            "start_at": f"{day.isoformat()}T{hour:02d}:00:00+03:00",
            "duration_minutes": 60,
        }
    response = await client.post("/supplier/appointments", headers=token, json=body)
    assert response.status_code == 200, response.text
    return response.json()["data"]


async def admin_notifications(client, seeded, headers, email_hint=""):
    fid = seeded["facility"].id
    response = await client.get(f"/facilities/{fid}/notifications", headers=headers)
    assert response.status_code == 200, email_hint + response.text
    return response.json()["data"]


# ---------- Uretim kurallari ----------


async def test_manual_create_notifies_admins_scoped(client, seeded, session_maker):
    """Manuel onayli create: sistem yoneticisi + ilgili rampa yoneticisi bildirilir;
    baska rampaya atanmis yonetici BILDIRILMEZ."""
    from sqlalchemy import select

    from app.models import FacilityMembership

    # rampa yoneticisini yalnizca R1'e atayalim
    async with session_maker() as db:
        membership = (
            await db.execute(
                select(FacilityMembership).where(
                    FacilityMembership.tenant_user_id == seeded["users"]["dock"].id
                )
            )
        ).scalar_one()
        membership.assigned_dock_ids = [str(seeded["docks"]["d1"].id)]
        await db.commit()

    # soguk zincir -> R2'ye atanir
    created_appt = await create_via_portal(client, seeded, await supplier_token(client))

    def for_appt(rows):
        return [
            n for n in rows
            if n["metadata_json"].get("appointment_id") == created_appt["id"]
        ]

    sysadmin = await admin(client)
    mine = for_appt(await admin_notifications(client, seeded, sysadmin))
    assert mine and mine[0]["type"] == "appointment_created"
    assert mine[0]["severity"] == "warning"
    assert mine[0]["metadata_json"]["route_hint"].startswith("/admin/appointments")

    manager = auth_headers(await login(client, "/auth/login", "rampa@cakesbakes.com"))
    rows = for_appt(await admin_notifications(client, seeded, manager))
    assert rows == []  # R2 olayi yalniz-R1 yoneticisine gitmez


async def test_auto_approve_notifies_supplier_and_admin_info(client, seeded):
    token = await supplier_token(client, "tedarikci@anadoluun.com")
    created_appt = await create_via_portal(client, seeded, token, category="unlu", hour=9)

    # supplier: approved success bildirimi
    response = await client.get("/supplier/notifications", headers=token)
    types = [(n["type"], n["severity"]) for n in response.json()["data"]]
    assert ("appointment_approved", "success") in types

    # admin: info seviyesinde created bildirimi (yeni randevuya ait)
    rows = await admin_notifications(client, seeded, await admin(client))
    created = [
        n for n in rows
        if n["type"] == "appointment_created"
        and n["metadata_json"].get("appointment_id") == created_appt["id"]
    ]
    assert created and created[0]["severity"] == "info"


async def test_lifecycle_notifications_to_supplier(client, seeded):
    token = await supplier_token(client)
    fid = seeded["facility"].id
    headers = await admin(client)
    day = next_weekday()

    a1 = await create_via_portal(client, seeded, token, hour=9)
    base = f"/facilities/{fid}/appointments/{a1['id']}"

    # revise -> old/new metadata
    await client.post(
        f"{base}/revise", headers=headers,
        json={"new_start_at": f"{day.isoformat()}T11:00:00+03:00", "auto_assign_dock": True},
    )
    # approve
    await client.post(f"{base}/approve", headers=headers)
    # complete
    await client.post(f"{base}/complete", headers=headers, json={"note": "ok"})

    response = await client.get("/supplier/notifications", headers=token)
    by_type = {n["type"]: n for n in response.json()["data"]}
    assert by_type["appointment_revised"]["severity"] == "warning"
    assert by_type["appointment_revised"]["metadata_json"]["new_start_at"]
    assert by_type["appointment_approved"]["severity"] == "success"
    assert by_type["appointment_completed"]["severity"] == "info"

    # reject akisi ayri randevuyla
    a2 = await create_via_portal(client, seeded, token, hour=15)
    await client.post(
        f"/facilities/{fid}/appointments/{a2['id']}/reject",
        headers=headers, json={"reason": "Eksik evrak"},
    )
    response = await client.get("/supplier/notifications", headers=token)
    rejected = [n for n in response.json()["data"] if n["type"] == "appointment_rejected"]
    assert rejected and rejected[0]["severity"] == "error"
    assert "Eksik evrak" in rejected[0]["body"]


async def test_cancel_direction_notifications(client, seeded):
    token = await supplier_token(client)
    fid = seeded["facility"].id
    headers = await admin(client)

    # supplier iptal eder -> admin bilgilendirilir
    a1 = await create_via_portal(client, seeded, token, hour=9)
    await client.post(f"/supplier/appointments/{a1['id']}/cancel", headers=token)
    rows = await admin_notifications(client, seeded, headers)
    assert any(
        n["type"] == "appointment_cancelled"
        and "tedarikçi" in n["title"].lower()
        for n in rows
    )

    # admin iptal eder -> supplier bilgilendirilir
    a2 = await create_via_portal(client, seeded, token, hour=15)
    await client.post(
        f"/facilities/{fid}/appointments/{a2['id']}/cancel",
        headers=headers, json={"reason": "Operasyon iptali"},
    )
    response = await client.get("/supplier/notifications", headers=token)
    cancelled = [n for n in response.json()["data"] if n["type"] == "appointment_cancelled"]
    assert cancelled and "Operasyon iptali" in cancelled[0]["body"]


async def test_cargo_create_produces_single_advisory_notification(client, seeded):
    token = await supplier_token(client, "tedarikci@hizlikargo.com")
    await create_via_portal(client, seeded, token, cargo=True, category="genel")
    rows = await admin_notifications(client, seeded, await admin(client))
    advisories = [
        n for n in rows
        if n["type"] == "cargo_advisory" and "Bildirim Testi" not in (n["body"] or "")
    ]
    new_advisories = [n for n in rows if n["type"] == "cargo_advisory"]
    # seed'de 1 advisory var; create ile 1 tane daha -> ayni randevu icin duplicate yok
    assert len(new_advisories) == 2
    assert all(n["severity"] == "warning" for n in new_advisories)
    assert advisories is not None  # okunabilirlik


# ---------- Endpoint davranislari ----------


async def test_unread_count_mark_read_read_all_delete(client, seeded):
    fid = seeded["facility"].id
    headers = await admin(client)
    base = f"/facilities/{fid}/notifications"

    # seed: sistem yoneticisine 2 okunmamis bildirim
    response = await client.get(f"{base}/unread-count", headers=headers)
    assert response.json()["data"]["unread"] == 2

    rows = await admin_notifications(client, seeded, headers)
    first = rows[0]
    response = await client.post(f"{base}/{first['id']}/read", headers=headers)
    assert response.json()["data"]["is_read"] is True
    response = await client.get(f"{base}/unread-count", headers=headers)
    assert response.json()["data"]["unread"] == 1

    response = await client.post(f"{base}/read-all", headers=headers)
    assert response.status_code == 200
    response = await client.get(f"{base}/unread-count", headers=headers)
    assert response.json()["data"]["unread"] == 0

    response = await client.delete(f"{base}/{first['id']}", headers=headers)
    assert response.json()["data"]["deleted"] is True
    rows = await admin_notifications(client, seeded, headers)
    assert all(n["id"] != first["id"] for n in rows)


async def test_notification_isolation(client, seeded, session_maker):
    fid = seeded["facility"].id

    # baska tenant admini 403
    await _create_other_tenant(session_maker)
    other = auth_headers(await login(client, "/auth/login", "admin@rakip.com"))
    assert (
        await client.get(f"/facilities/{fid}/notifications", headers=other)
    ).status_code == 403

    # platform user 403
    platform = auth_headers(await login(client, "/auth/platform-login", "admin@logislot.com"))
    assert (
        await client.get(f"/facilities/{fid}/notifications", headers=platform)
    ).status_code == 403

    # supplier baska supplier'in bildirimini goremez (kendi listesi bos/kendi)
    kargo = await supplier_token(client, "tedarikci@hizlikargo.com")
    response = await client.get("/supplier/notifications", headers=kargo)
    assert all(
        n["metadata_json"]["supplier_id"] == str(seeded["suppliers"]["kargo"].id)
        for n in response.json()["data"]
    )

    # sistem yoneticisinin bildirimi rampa yoneticisinin listesinde degildir (alici-basina)
    manager = auth_headers(await login(client, "/auth/login", "rampa@cakesbakes.com"))
    response = await client.get(f"/facilities/{fid}/notifications", headers=manager)
    admin_rows = await admin_notifications(client, seeded, await admin(client))
    manager_ids = {n["id"] for n in response.json()["data"]}
    assert manager_ids.isdisjoint({n["id"] for n in admin_rows})


# ---------- Haftalik takvim ----------


async def test_calendar_week_summary(client, seeded):
    fid = seeded["facility"].id
    headers = await admin(client)
    today = date.today()
    monday = today - timedelta(days=today.weekday())

    # pazartesi olmayan girdi normalize edilir
    response = await client.get(
        f"/facilities/{fid}/calendar/week?week_start={(monday + timedelta(days=2)).isoformat()}",
        headers=headers,
    )
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["week_start"] == monday.isoformat()
    assert len(data["days"]) == 7
    assert data["timezone"] == "Europe/Istanbul"

    by_date = {d["date"]: d for d in data["days"]}
    today_row = by_date[today.isoformat()]
    # seed: bugun 1 approved (un) + 1 pending (donuk)
    assert today_row["approved"] >= 1 and today_row["pending"] >= 1
    assert today_row["utilization_percent"] > 0
    assert today_row["dock_count"] == 3
    assert today_row["top_docks"]

    tomorrow_row = by_date.get((today + timedelta(days=1)).isoformat())
    if tomorrow_row:  # hafta ici ayni haftadaysa
        assert tomorrow_row["cargo"] >= 1

    closed_day = (today + timedelta(days=3)).isoformat()
    if closed_day in by_date:
        assert by_date[closed_day]["has_closed_override"] is True


async def test_calendar_week_scope_and_isolation(client, seeded, session_maker):
    from sqlalchemy import select

    from app.models import FacilityMembership

    fid = seeded["facility"].id
    today = date.today()

    # rampa yoneticisi yalniz R1: dock_count=1 gormeli
    async with session_maker() as db:
        membership = (
            await db.execute(
                select(FacilityMembership).where(
                    FacilityMembership.tenant_user_id == seeded["users"]["dock"].id
                )
            )
        ).scalar_one()
        membership.assigned_dock_ids = [str(seeded["docks"]["d1"].id)]
        await db.commit()

    manager = auth_headers(await login(client, "/auth/login", "rampa@cakesbakes.com"))
    response = await client.get(
        f"/facilities/{fid}/calendar/week?week_start={today.isoformat()}", headers=manager
    )
    assert all(d["dock_count"] == 1 for d in response.json()["data"]["days"])

    await _create_other_tenant(session_maker)
    other = auth_headers(await login(client, "/auth/login", "admin@rakip.com"))
    assert (
        await client.get(
            f"/facilities/{fid}/calendar/week?week_start={today.isoformat()}", headers=other
        )
    ).status_code == 403


# ---------- Advisory standardi ----------


async def test_advisory_schema_and_non_blocking_create(client, seeded):
    """Advisory blocking=false doner; kargo-uyarili slota standart create BASARILI."""
    token = await supplier_token(client, "tedarikci@hizlikargo.com")
    day = next_weekday()

    # ayni gune kargo olustur (R3 - genel kategorisi)
    await create_via_portal(client, seeded, token, cargo=True, category="genel")

    # availability: R3 slotlarinda advisory schema alanlari
    response = await client.post(
        "/supplier/availability/evaluate",
        headers=token,
        json={
            "product_category_id": str(seeded["product_categories"]["genel"].id),
            "vehicle_category_id": str(seeded["vehicle_categories"]["kamyonet"].id),
            "target_date": day.isoformat(),
            "duration_minutes": 30,
        },
    )
    slots = response.json()["data"]
    warned = [s for s in slots if s["advisory_warnings"]]
    assert warned, "kargo advisory bekleniyordu"
    warning = warned[0]["advisory_warnings"][0]
    assert warning["blocking"] is False
    assert warning["severity"] == "warning"
    assert warning["appointment_id"]
    assert warning["code"] in ("CARGO_DAY_WARNING", "CARGO_WINDOW_OVERLAP")

    # advisory'li slota standart randevu (kotasi genis tedarikciyle):
    # acknowledged_warning_codes ile kabul — kargo hard block DEGIL
    slot = next(s for s in warned if s["status"] != "full")
    un_token = await supplier_token(client, "tedarikci@anadoluun.com")
    response = await client.post(
        "/supplier/appointments",
        headers=un_token,
        json={
            "product_category_id": str(seeded["product_categories"]["genel"].id),
            "product_name": "Advisory Ustune Standart",
            "quantity": 1,
            "vehicle_category_id": str(seeded["vehicle_categories"]["kamyonet"].id),
            "target_date": day.isoformat(),
            "start_at": slot["start"],
            "duration_minutes": 30,
            "acknowledged_warning_codes": [warning["code"]],
        },
    )
    assert response.status_code == 200, response.text
    assert response.json()["data"]["status"] in ("pending", "approved")