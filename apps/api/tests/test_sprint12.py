"""Sprint 12: platform audit, scheduler kilit/kayit, supplier series, readiness."""

from datetime import date, timedelta

from sqlalchemy import select

from tests.conftest import auth_headers, login


def next_weekday(offset_days: int = 1) -> date:
    day = date.today() + timedelta(days=offset_days)
    while day.weekday() >= 5:
        day += timedelta(days=1)
    return day


async def admin(client) -> dict:
    return auth_headers(await login(client, "/auth/login", "admin@cakesbakes.com"))


async def platform(client) -> dict:
    return auth_headers(await login(client, "/auth/platform-login", "admin@logislot.com"))


# ---------------------------------------------------------------- platform audit


async def test_platform_audit_endpoint_and_scope(client, seeded):
    p = await platform(client)
    # Platform aksiyonu uret: tenant olustur
    response = await client.post(
        "/platform/tenants", headers=p,
        json={"commercial_name": "Audit A.S.", "display_name": "Audit", "slug": "audit-t"},
    )
    assert response.status_code == 200

    # Tenant tarafinda operasyonel audit uret (platform gorunumune SIZMAMALI)
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
            "product_name": "Platform Audit Scope",
            "quantity": 1,
            "target_date": day.isoformat(),
            "start_at": f"{day.isoformat()}T09:00:00+03:00",
            "duration_minutes": 60,
        },
    )
    await client.post(
        f"/facilities/{fid}/appointments/{created.json()['data']['id']}/approve",
        headers=headers,
    )

    response = await client.get("/platform/audit-logs?action=tenant.create", headers=p)
    assert response.status_code == 200, response.text
    data = response.json()["data"]
    assert data["total"] >= 1
    entry = data["items"][0]
    assert entry["summary"] == "Tenant oluşturuldu"
    assert entry["actor_name"] == "LogiSlot Admin"
    assert entry["tenant_name"] == "Audit"

    # Kapsam: tenant kullanicisi aktorlu operasyonel kayitlar platformda YOK
    response = await client.get("/platform/audit-logs?limit=200", headers=p)
    items = response.json()["data"]["items"]
    assert all(i["actor_type"] in ("platform_user", "system") for i in items)
    assert not any(i["action"] == "appointment.approve" for i in items)
    # PII taramasi
    assert "tedarikci@" not in response.text

    # Tenant admin ve supplier erisemez
    assert (await client.get("/platform/audit-logs", headers=headers)).status_code == 403
    assert (await client.get("/platform/audit-logs", headers=soguk)).status_code == 403


async def test_platform_audit_masks_sensitive(client, seeded, session_maker):
    from app.core.enums import ActorType
    from app.models import AuditLog

    async with session_maker() as db:
        db.add(
            AuditLog(
                actor_type=ActorType.platform_user,
                actor_id=seeded["platform_admin"].id,
                action="test.platform_sensitive",
                entity_type="test",
                after_json={"smtp_password": "GIZLI", "name": "Acik"},
            )
        )
        await db.commit()

    p = await platform(client)
    response = await client.get(
        "/platform/audit-logs?action=test.platform_sensitive", headers=p
    )
    entry = response.json()["data"]["items"][0]
    assert entry["after"]["smtp_password"] == "***"
    assert entry["after"]["name"] == "Acik"
    assert "GIZLI" not in response.text


# ---------------------------------------------------------------- scheduler


async def test_scheduler_execute_job_records_runs(client, seeded, session_maker, monkeypatch):
    import app.maintenance.scheduler as scheduler
    from app.models import MaintenanceRun

    # Basarili kosum
    async with session_maker() as db:
        run = await scheduler.execute_job(db, scheduler.JOB_EMAIL_RETRY)
        assert run.status == "success"
        assert run.finished_at is not None

    # Kilit alinamadi -> skipped_locked (hata DEGIL)
    async def no_lock(db, job_name, scope=""):
        # Kilit anahtari artik tenant bazli (scope) — imza ona gore.
        return False

    monkeypatch.setattr(scheduler, "try_job_lock", no_lock)
    async with session_maker() as db:
        run = await scheduler.execute_job(db, scheduler.JOB_EMAIL_RETRY)
        assert run.status == "skipped_locked"
    monkeypatch.undo()

    # Worker patlarsa -> failed kaydi, exception yayilmaz
    async def boom(db):
        raise RuntimeError("worker patladi")

    monkeypatch.setitem(scheduler.WORKERS, scheduler.JOB_EMAIL_RETRY, boom)
    async with session_maker() as db:
        run = await scheduler.execute_job(db, scheduler.JOB_EMAIL_RETRY)
        assert run.status == "failed"
        assert "worker patladi" in run.error_message

    async with session_maker() as db:
        rows = list(
            (
                await db.execute(
                    select(MaintenanceRun).where(
                        MaintenanceRun.job_name == scheduler.JOB_EMAIL_RETRY
                    )
                )
            ).scalars()
        )
        assert {r.status for r in rows} == {"success", "skipped_locked", "failed"}


async def test_support_health_scheduler_and_config(client, seeded, session_maker):
    import app.maintenance.scheduler as scheduler

    # email_retry icin bir kosum uret; notification_cleanup HIC kosmasin
    async with session_maker() as db:
        await scheduler.execute_job(db, scheduler.JOB_EMAIL_RETRY)

    p = await platform(client)
    response = await client.get("/platform/support/health", headers=p)
    data = response.json()["data"]
    assert data["scheduler"]["email_retry"]["last_status"] == "success"
    assert data["scheduler"]["email_retry"]["last_finished_at"] is not None
    # Kayit yoksa null -> UI "henuz kosmadi" gosterir (uydurma deger YOK)
    assert data["scheduler"]["notification_cleanup"] is None
    # Readiness icin config gorunurlugu
    config = data["config"]
    assert config["environment"] == "development"
    assert config["email_provider"] in ("log_only", "smtp")
    assert isinstance(config["docs_enabled"], bool)
    assert isinstance(config["rate_limit_enabled"], bool)


# ---------------------------------------------------------------- supplier series


async def _series(client, seeded, *, count: int = 3, hour: int = 15) -> dict:
    token = auth_headers(await login(client, "/auth/supplier-login", "tedarikci@anadoluun.com"))
    day = next_weekday(2)
    response = await client.post(
        "/supplier/appointments",
        headers=token,
        json={
            "product_category_id": str(seeded["product_categories"]["unlu"].id),
            "product_name": "Supplier Seri UX",
            "quantity": 1,
            "target_date": day.isoformat(),
            "start_at": f"{day.isoformat()}T{hour:02d}:00:00+03:00",
            "duration_minutes": 60,
            "recurring": {"frequency": "weekly", "occurrence_count": count},
        },
    )
    assert response.status_code == 200, response.text
    return response.json()["data"]


async def test_supplier_series_list_and_detail(client, seeded):
    series = await _series(client, seeded)
    token = auth_headers(await login(client, "/auth/supplier-login", "tedarikci@anadoluun.com"))

    response = await client.get("/supplier/appointment-series", headers=token)
    assert response.status_code == 200, response.text
    rows = response.json()["data"]
    row = next(r for r in rows if r["id"] == series["series_id"])
    assert row["frequency"] == "weekly"
    assert row["status_counts"] == {"approved": 3}
    assert row["next_appointment_at"] is not None
    assert row["can_cancel_series"] is True
    assert row["future_cancellable_count"] == 3
    assert row["product_name"] == "Supplier Seri UX"

    response = await client.get(
        f"/supplier/appointment-series/{series['series_id']}", headers=token
    )
    detail = response.json()["data"]
    assert len(detail["appointments"]) == 3
    assert detail["appointments"][0]["dock_name"] is not None

    # Baska tedarikci bu seriyi GOREMEZ
    other = auth_headers(
        await login(client, "/auth/supplier-login", "tedarikci@marmarasoguk.com")
    )
    response = await client.get(
        f"/supplier/appointment-series/{series['series_id']}", headers=other
    )
    assert response.status_code == 404
    rows = (await client.get("/supplier/appointment-series", headers=other)).json()["data"]
    assert all(r["id"] != series["series_id"] for r in rows)


async def test_supplier_series_cancel(client, seeded):
    series = await _series(client, seeded, hour=10)
    token = auth_headers(await login(client, "/auth/supplier-login", "tedarikci@anadoluun.com"))
    headers = await admin(client)
    fid = seeded["facility"].id
    first_id = series["appointments"][0]["id"]

    # 1. occurrence tamamlansin -> iptal kapsaminin DISINDA kalmali
    response = await client.post(
        f"/facilities/{fid}/appointments/{first_id}/complete",
        headers=headers, json={"note": "Erken teslim"},
    )
    assert response.status_code == 200

    # Sebepsiz istek reddedilir (zorunlu alan)
    response = await client.post(
        f"/supplier/appointment-series/{series['series_id']}/cancel",
        headers=token, json={},
    )
    assert response.status_code == 422

    response = await client.post(
        f"/supplier/appointment-series/{series['series_id']}/cancel",
        headers=token,
        json={"reason": "Uretim plani degisti"},
    )
    assert response.status_code == 200, response.text
    assert response.json()["data"]["affected_count"] == 2

    # Tamamlanan dokunulmadi; digerleri iptal
    detail = (
        await client.get(f"/supplier/appointment-series/{series['series_id']}", headers=token)
    ).json()["data"]
    by_id = {a["id"]: a for a in detail["appointments"]}
    assert by_id[first_id]["status"] == "completed"
    assert sum(1 for a in by_id.values() if a["status"] == "cancelled") == 2

    # Adminlere TEK ozet bildirim ("tedarikci tarafindan"); tedarikciye uretim YOK
    admin_notes = (
        await client.get(f"/facilities/{fid}/notifications", headers=headers)
    ).json()["data"]
    series_cancel_notes = [
        n for n in admin_notes
        if n["metadata_json"].get("series_id") == series["series_id"]
        and n["type"] == "appointment_cancelled"
    ]
    assert len(series_cancel_notes) == 1
    assert "tedarikçi" in series_cancel_notes[0]["title"].lower()

    supplier_notes = (
        await client.get("/supplier/notifications", headers=token)
    ).json()["data"]
    assert not any(
        n["metadata_json"].get("series_id") == series["series_id"]
        and n["type"] == "appointment_cancelled"
        for n in supplier_notes
    )

    # Seri iptal e-postasi da uretilmedi (islemi tedarikci yapti)
    logs = (
        await client.get(f"/facilities/{fid}/email-logs?limit=200", headers=headers)
    ).json()["data"]["items"]
    assert not any(e["template_key"] == "appointment_series_cancelled" for e in logs)

    # Ikinci iptal: kalan yok -> 409
    response = await client.post(
        f"/supplier/appointment-series/{series['series_id']}/cancel",
        headers=token, json={"reason": "tekrar"},
    )
    assert response.status_code == 409

    # Baska tedarikcinin serisi iptal EDILEMEZ (404)
    other_series = await _series(client, seeded, hour=13)
    other = auth_headers(
        await login(client, "/auth/supplier-login", "tedarikci@marmarasoguk.com")
    )
    response = await client.post(
        f"/supplier/appointment-series/{other_series['series_id']}/cancel",
        headers=other, json={"reason": "baskasinin serisi"},
    )
    assert response.status_code == 404
