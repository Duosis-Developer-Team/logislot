"""Sprint 6: raporlar, platform usage/plans ve e-posta abstraction testleri."""

import json
from datetime import date, timedelta

from tests.conftest import auth_headers, login
from tests.test_config_crud import admin, next_weekday
from tests.test_isolation import _create_other_tenant


async def platform_headers(client):
    return auth_headers(await login(client, "/auth/platform-login", "admin@logislot.com"))


# ---------- Reports ----------


async def test_reports_summary_shape_and_counts(client, seeded):
    headers = await admin(client)
    fid = seeded["facility"].id

    # varsayilan aralik: son 30 gun — tarihsel seed'i kapsar
    response = await client.get(f"/facilities/{fid}/reports/summary", headers=headers)
    assert response.status_code == 200
    data = response.json()["data"]
    for key in ("range", "scope", "totals", "rates", "approval_sla",
                "by_status", "by_category", "by_dock", "by_supplier", "daily_trend"):
        assert key in data, key
    assert data["scope"]["restricted"] is False

    totals = data["totals"]
    # tarihsel seed: 6 completed + 2 rejected + 2 cancelled (+1 gecmis 'Kek Kaliplari')
    assert totals["completed"] >= 7
    assert totals["rejected"] >= 2
    assert totals["cancelled"] >= 2
    assert totals["cargo"] >= 1
    assert totals["appointments"] >= 13

    assert 0 < data["rates"]["completion_rate"] <= 1
    assert data["rates"]["cargo_rate"] > 0

    # breakdown'lar isim tasir
    category_labels = {c["label"] for c in data["by_category"]}
    assert "Soguk Zincir (Et, Donuk, Sut)" in category_labels
    supplier_names = {s["supplier_name"] for s in data["by_supplier"]}
    assert "Anadolu Un A.S." in supplier_names
    dock_names = {d["dock_name"] for d in data["by_dock"]}
    assert dock_names == {"Rampa 1", "Rampa 2", "Rampa 3"}
    r2 = next(d for d in data["by_dock"] if d["dock_name"] == "Rampa 2")
    assert r2["blocked_minutes"] > 0
    assert 0 < r2["utilization_percent"] <= 100

    # gunluk trend aralik uzunlugunda
    assert len(data["daily_trend"]) == 30


async def test_reports_range_validation_and_custom_range(client, seeded):
    headers = await admin(client)
    fid = seeded["facility"].id
    today = date.today()

    # 180 gunden uzun aralik -> 422
    start = (today - timedelta(days=200)).isoformat()
    response = await client.get(
        f"/facilities/{fid}/reports/summary?date_from={start}&date_to={today.isoformat()}",
        headers=headers,
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "RANGE_TOO_LARGE"

    # ters aralik -> 422
    response = await client.get(
        f"/facilities/{fid}/reports/summary?date_from={today.isoformat()}"
        f"&date_to={(today - timedelta(days=1)).isoformat()}",
        headers=headers,
    )
    assert response.status_code == 422

    # ozel dar aralik: yalnizca bugun (date_to dahil)
    response = await client.get(
        f"/facilities/{fid}/reports/summary?date_from={today.isoformat()}"
        f"&date_to={today.isoformat()}",
        headers=headers,
    )
    data = response.json()["data"]
    assert len(data["daily_trend"]) == 1
    assert data["totals"]["appointments"] >= 2  # bugunku seed randevulari


async def test_daily_trend_buckets_and_csv_section(client, seeded):
    """Gunluk trend gunleri eksiksiz kapsar ve toplamlarla tutarlidir.

    Regresyon: CSV'nin "iptal" sutunu, daily_trend'de `cancelled` alani
    olmadigi icin sessizce hep 0 yaziyordu.
    """
    headers = await admin(client)
    fid = seeded["facility"].id
    today = date.today()
    start = today - timedelta(days=29)

    response = await client.get(
        f"/facilities/{fid}/reports/summary"
        f"?date_from={start.isoformat()}&date_to={today.isoformat()}",
        headers=headers,
    )
    assert response.status_code == 200
    data = response.json()["data"]
    trend = data["daily_trend"]
    totals = data["totals"]

    # Gunler kesintisiz ve date_to DAHIL
    assert [d["date"] for d in trend] == [
        (start + timedelta(days=i)).isoformat() for i in range(30)
    ]
    for day in trend:
        assert set(day) == {"date", "total", "completed", "pending", "cancelled", "cargo"}

    # Her randevu tam olarak bir gune duser -> gunluk toplamlar = aralik toplamlari
    for field in ("total", "completed", "pending", "cancelled", "cargo"):
        totals_key = "appointments" if field == "total" else field
        assert sum(d[field] for d in trend) == totals[totals_key], field

    # En az bir gunde veri olmali (aksi halde test bos gecerdi)
    assert any(d["total"] > 0 for d in trend)

    # CSV bolumu ayni degerleri tasir (iptal sutunu artik gercek veri)
    csv_response = await client.get(
        f"/facilities/{fid}/reports/summary.csv"
        f"?date_from={start.isoformat()}&date_to={today.isoformat()}",
        headers=headers,
    )
    assert csv_response.status_code == 200
    lines = csv_response.text.splitlines()
    section = lines.index("GUNLUK TREND")
    assert lines[section + 1] == "tarih,toplam,tamamlanan,bekleyen,iptal,kargo"
    csv_rows = [line.split(",") for line in lines[section + 2 : section + 32]]
    assert [r[0] for r in csv_rows] == [d["date"] for d in trend]
    assert sum(int(r[4]) for r in csv_rows) == totals["cancelled"]
    assert sum(int(r[1]) for r in csv_rows) == totals["appointments"]


async def test_reports_sla_and_auto_approved_from_live_flow(client, seeded):
    """Canli create+approve akisi SLA ve auto/manual metriklerine yansir."""
    headers = await admin(client)
    fid = seeded["facility"].id
    day = next_weekday()

    # otomatik onayli (un) -> auto_approved artar
    un = auth_headers(await login(client, "/auth/supplier-login", "tedarikci@anadoluun.com"))
    response = await client.post(
        "/supplier/appointments", headers=un,
        json={
            "product_category_id": str(seeded["product_categories"]["unlu"].id),
            "product_name": "SLA Auto", "quantity": 1,
            "target_date": day.isoformat(),
            "start_at": f"{day.isoformat()}T09:00:00+03:00", "duration_minutes": 60,
        },
    )
    assert response.status_code == 200

    # manuel (soguk) -> approve karari SLA'ya girer
    soguk = auth_headers(
        await login(client, "/auth/supplier-login", "tedarikci@marmarasoguk.com")
    )
    created = await client.post(
        "/supplier/appointments", headers=soguk,
        json={
            "product_category_id": str(seeded["product_categories"]["soguk"].id),
            "product_name": "SLA Manuel", "quantity": 1,
            "target_date": day.isoformat(),
            "start_at": f"{day.isoformat()}T11:00:00+03:00", "duration_minutes": 60,
        },
    )
    appointment_id = created.json()["data"]["id"]
    await client.post(
        f"/facilities/{fid}/appointments/{appointment_id}/approve", headers=headers
    )

    # canli randevular yarinda: araligi hedef gunu kapsayacak sekilde genislet
    date_from = (date.today() - timedelta(days=7)).isoformat()
    response = await client.get(
        f"/facilities/{fid}/reports/summary?date_from={date_from}&date_to={day.isoformat()}",
        headers=headers,
    )
    data = response.json()["data"]
    assert data["totals"]["auto_approved"] >= 1
    assert data["approval_sla"]["average_minutes_to_decision"] is not None
    assert data["approval_sla"]["average_minutes_to_decision"] >= 0


async def test_reports_scope_and_permissions(client, seeded, session_maker):
    from sqlalchemy import select

    from app.models import FacilityMembership

    fid = seeded["facility"].id

    # rampa yoneticisi yalniz R2'ye atanirsa raporda yalniz R2 gorur
    async with session_maker() as db:
        membership = (
            await db.execute(
                select(FacilityMembership).where(
                    FacilityMembership.tenant_user_id == seeded["users"]["dock"].id
                )
            )
        ).scalar_one()
        membership.assigned_dock_ids = [str(seeded["docks"]["d2"].id)]
        await db.commit()

    manager = auth_headers(await login(client, "/auth/login", "rampa@cakesbakes.com"))
    response = await client.get(f"/facilities/{fid}/reports/summary", headers=manager)
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["scope"]["restricted"] is True
    assert [d["dock_name"] for d in data["by_dock"]] == ["Rampa 2"]
    # tum randevular R2 randevulari olmali (soguk zincir agirlikli)
    assert data["totals"]["appointments"] >= 3

    # supplier ve platform 403
    supplier = auth_headers(
        await login(client, "/auth/supplier-login", "tedarikci@anadoluun.com")
    )
    assert (
        await client.get(f"/facilities/{fid}/reports/summary", headers=supplier)
    ).status_code == 403
    platform = await platform_headers(client)
    assert (
        await client.get(f"/facilities/{fid}/reports/summary", headers=platform)
    ).status_code == 403


# ---------- Platform usage ----------


async def test_platform_usage_totals_and_rollups(client, seeded):
    headers = await platform_headers(client)
    response = await client.get("/platform/usage", headers=headers)
    assert response.status_code == 200
    data = response.json()["data"]

    totals = data["totals"]
    assert totals["tenants"] == 1
    assert totals["facilities"] == 1
    assert totals["active_facilities"] == 1
    assert totals["active_docks"] == 3
    assert totals["active_suppliers"] == 3
    assert totals["appointments_created"] >= 15  # created_at bugun (seed)

    tenant_row = data["tenant_usage"][0]
    assert tenant_row["tenant_name"] == "BTA / Cakes & Bakes"
    assert tenant_row["assigned_plan"] == "Professional"
    assert tenant_row["facility_count"] == 1
    assert tenant_row["last_activity_at"] is not None

    facility_row = data["facility_usage"][0]
    assert facility_row["facility_name"] == "Cakes & Bakes Uretim Tesisi"
    assert facility_row["assigned_plan"] == "Professional"  # override yok -> tenant plani
    assert facility_row["active_users"] == 3

    # PII/operasyonel detay sizmasin
    raw = json.dumps(data)
    for forbidden in ("license_plate", "driver", "contact_email", "product_name"):
        assert forbidden not in raw, forbidden


async def test_platform_usage_permissions(client, seeded):
    tenant_admin = await admin(client)
    assert (await client.get("/platform/usage", headers=tenant_admin)).status_code == 403
    # platform user hala operasyonel endpointlere giremiyor
    platform = await platform_headers(client)
    fid = seeded["facility"].id
    assert (
        await client.get(f"/facilities/{fid}/appointments", headers=platform)
    ).status_code == 403


# ---------- Plans ----------


async def test_plan_crud_and_assignment_rules(client, seeded, session_maker):
    headers = await platform_headers(client)
    tenant_id = seeded["tenant"].id
    fid = seeded["facility"].id

    # create (draft)
    response = await client.post(
        "/platform/plans", headers=headers,
        json={"name": "Enterprise", "scope": "tenant", "billing_unit_label": "hybrid"},
    )
    assert response.status_code == 200
    plan_id = response.json()["data"]["id"]
    assert response.json()["data"]["status"] == "draft"

    # draft atanamaz (karar: yalniz active)
    response = await client.post(
        f"/platform/tenants/{tenant_id}/plan-assignment",
        headers=headers, json={"plan_id": plan_id},
    )
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "PLAN_NOT_ASSIGNABLE"

    # aktive et -> atanabilir
    response = await client.patch(
        f"/platform/plans/{plan_id}", headers=headers, json={"status": "active"}
    )
    assert response.json()["data"]["status"] == "active"
    response = await client.post(
        f"/platform/tenants/{tenant_id}/plan-assignment",
        headers=headers, json={"plan_id": plan_id},
    )
    assert response.status_code == 200
    assert response.json()["data"]["plan_name"] == "Enterprise"

    # facility override: Starter ata
    starter_id = None
    response = await client.get("/platform/plans", headers=headers)
    for plan in response.json()["data"]:
        if plan["name"] == "Starter":
            starter_id = plan["id"]
    response = await client.post(
        f"/platform/facilities/{fid}/plan-assignment",
        headers=headers, json={"plan_id": starter_id},
    )
    assert response.status_code == 200

    # usage'da override yansir
    response = await client.get("/platform/usage", headers=headers)
    facility_row = response.json()["data"]["facility_usage"][0]
    assert facility_row["assigned_plan"] == "Starter"
    assert facility_row["plan_is_override"] is True

    # retire -> yeni atama reddedilir
    response = await client.delete(f"/platform/plans/{plan_id}", headers=headers)
    assert response.json()["data"]["status"] == "retired"
    response = await client.post(
        f"/platform/tenants/{tenant_id}/plan-assignment",
        headers=headers, json={"plan_id": plan_id},
    )
    assert response.status_code == 409

    # audit kayitlari
    from sqlalchemy import select

    from app.models import AuditLog

    async with session_maker() as db:
        actions = [
            row[0]
            for row in await db.execute(
                select(AuditLog.action).where(AuditLog.entity_type == "plan")
            )
        ]
    for expected in ("plan.create", "plan.update", "plan.retire",
                     "plan.assign_tenant", "plan.assign_facility_override"):
        assert expected in actions, expected


async def test_plan_endpoints_platform_only(client, seeded):
    tenant_admin = await admin(client)
    response = await client.post(
        "/platform/plans", headers=tenant_admin, json={"name": "Sizma"}
    )
    assert response.status_code == 403


# ---------- Email abstraction ----------


async def test_revise_triggers_emails_to_supplier_and_team(client, seeded):
    """v1.0 davranisi: revize -> tedarikci + ilgili ekibe (log-only) e-posta."""
    headers = await admin(client)
    fid = seeded["facility"].id
    day = next_weekday()

    soguk = auth_headers(
        await login(client, "/auth/supplier-login", "tedarikci@marmarasoguk.com")
    )
    created = await client.post(
        "/supplier/appointments", headers=soguk,
        json={
            "product_category_id": str(seeded["product_categories"]["soguk"].id),
            "product_name": "Email Revize", "quantity": 1,
            "target_date": day.isoformat(),
            "start_at": f"{day.isoformat()}T09:00:00+03:00", "duration_minutes": 60,
        },
    )
    appointment_id = created.json()["data"]["id"]

    response = await client.post(
        f"/facilities/{fid}/appointments/{appointment_id}/revise",
        headers=headers,
        json={
            "new_start_at": f"{day.isoformat()}T14:00:00+03:00",
            "auto_assign_dock": True,
            "note": "Saat degisti",
        },
    )
    assert response.status_code == 200

    response = await client.get(
        f"/facilities/{fid}/email-logs?appointment_id={appointment_id}", headers=headers
    )
    logs = response.json()["data"]["items"]
    templates = [log["template_key"] for log in logs]
    assert "appointment_revised" in templates  # tedarikciye
    assert "appointment_revised_team" in templates  # ilgili ekibe
    supplier_log = next(
        log for log in logs if log["template_key"] == "appointment_revised"
    )
    assert supplier_log["recipient_email"] == "tedarikci@marmarasoguk.com"
    assert supplier_log["status"] == "sent"
    assert supplier_log["provider"] == "log_only"  # gercek SMTP yok
    assert supplier_log["sent_at"] is not None


async def test_approve_reject_cancel_emails(client, seeded):
    headers = await admin(client)
    fid = seeded["facility"].id
    day = next_weekday()
    soguk = auth_headers(
        await login(client, "/auth/supplier-login", "tedarikci@marmarasoguk.com")
    )

    async def create(hour):
        response = await client.post(
            "/supplier/appointments", headers=soguk,
            json={
                "product_category_id": str(seeded["product_categories"]["soguk"].id),
                "product_name": f"Email {hour}", "quantity": 1,
                "target_date": day.isoformat(),
                "start_at": f"{day.isoformat()}T{hour:02d}:00:00+03:00",
                "duration_minutes": 60,
            },
        )
        return response.json()["data"]["id"]

    a1 = await create(9)
    await client.post(f"/facilities/{fid}/appointments/{a1}/approve", headers=headers)
    a2 = await create(11)
    await client.post(
        f"/facilities/{fid}/appointments/{a2}/reject",
        headers=headers, json={"reason": "Eksik evrak"},
    )
    a3 = await create(15)
    await client.post(
        f"/facilities/{fid}/appointments/{a3}/cancel",
        headers=headers, json={"reason": "Operasyon"},
    )

    response = await client.get(f"/facilities/{fid}/email-logs", headers=headers)
    templates = [log["template_key"] for log in response.json()["data"]["items"]]
    for expected in ("appointment_approved", "appointment_rejected", "appointment_cancelled"):
        assert expected in templates, expected


async def test_email_logs_scoped(client, seeded, session_maker):
    fid = seeded["facility"].id
    await _create_other_tenant(session_maker)
    other = auth_headers(await login(client, "/auth/login", "admin@rakip.com"))
    assert (
        await client.get(f"/facilities/{fid}/email-logs", headers=other)
    ).status_code == 403
    supplier = auth_headers(
        await login(client, "/auth/supplier-login", "tedarikci@anadoluun.com")
    )
    assert (
        await client.get(f"/facilities/{fid}/email-logs", headers=supplier)
    ).status_code == 403