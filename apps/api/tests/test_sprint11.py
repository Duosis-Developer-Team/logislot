"""Sprint 11: email ops, audit UI backend, plan banner, seri onayi, CSV, support."""

import asyncio
import uuid as uuid_mod
from datetime import date, timedelta

from app.core.config import get_settings
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


def use_failing_smtp(monkeypatch) -> None:
    settings = get_settings()
    monkeypatch.setattr(settings, "email_provider", "smtp")
    monkeypatch.setattr(settings, "smtp_host", "smtp.test.local")
    monkeypatch.setattr(settings, "smtp_from_email", "noreply@logislot.test")
    monkeypatch.setattr(
        "app.services.email.SMTPEmailProvider._send_sync",
        lambda self, message: (_ for _ in ()).throw(ConnectionRefusedError("SMTP kapali")),
    )


async def _make_email_logs(client, seeded, monkeypatch) -> tuple[dict, str, str]:
    """Bir failed + bir sent e-posta logu uretir; (headers, failed_id, sent_id)."""
    fid = seeded["facility"].id
    day = next_weekday()
    soguk = auth_headers(
        await login(client, "/auth/supplier-login", "tedarikci@marmarasoguk.com")
    )

    async def make(hour, product):
        created = await client.post(
            "/supplier/appointments",
            headers=soguk,
            json={
                "product_category_id": str(seeded["product_categories"]["soguk"].id),
                "product_name": product,
                "quantity": 1,
                "target_date": day.isoformat(),
                "start_at": f"{day.isoformat()}T{hour:02d}:00:00+03:00",
                "duration_minutes": 60,
            },
        )
        assert created.status_code == 200, created.text
        return created.json()["data"]["id"]

    headers = await admin(client)
    # failed: SMTP bozukken onay
    use_failing_smtp(monkeypatch)
    appt_failed = await make(9, "Failed Email")
    await client.post(f"/facilities/{fid}/appointments/{appt_failed}/approve", headers=headers)
    # sent: log_only'ye don ve baska randevu onayla
    monkeypatch.setattr(get_settings(), "email_provider", "log_only")
    appt_sent = await make(10, "Sent Email")
    await client.post(f"/facilities/{fid}/appointments/{appt_sent}/approve", headers=headers)

    data = (
        await client.get(f"/facilities/{fid}/email-logs?limit=100", headers=headers)
    ).json()["data"]
    failed_id = next(e["id"] for e in data["items"] if e["status"] == "failed")
    sent_id = next(e["id"] for e in data["items"] if e["status"] == "sent")
    return headers, failed_id, sent_id


# ---------------------------------------------------------------- email ops


async def test_email_logs_filters_and_summary(client, seeded, monkeypatch):
    headers, failed_id, _ = await _make_email_logs(client, seeded, monkeypatch)
    fid = seeded["facility"].id

    response = await client.get(
        f"/facilities/{fid}/email-logs?status=failed", headers=headers
    )
    data = response.json()["data"]
    assert data["total"] >= 1
    assert all(e["status"] == "failed" for e in data["items"])
    assert data["summary"]["sent"] >= 1 and data["summary"]["failed"] >= 1

    # has_error + recipient filtresi
    response = await client.get(
        f"/facilities/{fid}/email-logs?has_error=true&recipient_email=marmarasoguk",
        headers=headers,
    )
    items = response.json()["data"]["items"]
    assert items and all(e["error_message"] for e in items)
    assert all("marmarasoguk" in e["recipient_email"] for e in items)

    # sayfalama
    response = await client.get(
        f"/facilities/{fid}/email-logs?limit=1&offset=0", headers=headers
    )
    data = response.json()["data"]
    assert len(data["items"]) == 1 and data["limit"] == 1


async def test_bulk_resend_partial_result(client, seeded, monkeypatch):
    headers, failed_id, sent_id = await _make_email_logs(client, seeded, monkeypatch)
    fid = seeded["facility"].id
    fake_id = str(uuid_mod.uuid4())

    # log_only aktif (helper sonunda donduruldu) -> failed olan gonderilebilir
    response = await client.post(
        f"/facilities/{fid}/email-logs/bulk-resend",
        headers=headers,
        json={"email_log_ids": [failed_id, sent_id, fake_id]},
    )
    assert response.status_code == 200, response.text
    data = response.json()["data"]
    by_id = {r["id"]: r for r in data["results"]}
    assert by_id[failed_id]["result"] == "sent"
    assert by_id[sent_id]["result"] == "skipped"
    assert by_id[sent_id]["reason"] == "ALREADY_SENT"
    assert by_id[fake_id]["result"] == "skipped"
    assert data["sent"] == 1

    # 50'den fazla kayit -> 422
    response = await client.post(
        f"/facilities/{fid}/email-logs/bulk-resend",
        headers=headers,
        json={"email_log_ids": [str(uuid_mod.uuid4()) for _ in range(51)]},
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "BULK_TOO_LARGE"


async def test_bulk_resend_requires_user_manage(client, seeded, monkeypatch):
    """Karar: tekil resend appt.view; TOPLU resend user.manage ister."""
    headers, failed_id, _ = await _make_email_logs(client, seeded, monkeypatch)
    fid = seeded["facility"].id

    # Rampa yoneticisinde user.manage yok -> bulk 403; tekil resend calisir
    dock_mgr = auth_headers(await login(client, "/auth/login", "rampa@cakesbakes.com"))
    response = await client.post(
        f"/facilities/{fid}/email-logs/bulk-resend",
        headers=dock_mgr,
        json={"email_log_ids": [failed_id]},
    )
    assert response.status_code == 403
    response = await client.post(
        f"/facilities/{fid}/email-logs/{failed_id}/resend", headers=dock_mgr
    )
    assert response.status_code == 200


# ---------------------------------------------------------------- audit logs


async def test_audit_logs_filters_and_actor(client, seeded):
    headers = await admin(client)
    fid = seeded["facility"].id
    day = next_weekday()

    # Bir onay audit'i uret
    soguk = auth_headers(
        await login(client, "/auth/supplier-login", "tedarikci@marmarasoguk.com")
    )
    created = await client.post(
        "/supplier/appointments",
        headers=soguk,
        json={
            "product_category_id": str(seeded["product_categories"]["soguk"].id),
            "product_name": "Audit Testi",
            "quantity": 1,
            "target_date": day.isoformat(),
            "start_at": f"{day.isoformat()}T11:00:00+03:00",
            "duration_minutes": 60,
        },
    )
    appointment_id = created.json()["data"]["id"]
    await client.post(f"/facilities/{fid}/appointments/{appointment_id}/approve", headers=headers)

    response = await client.get(
        f"/facilities/{fid}/audit-logs?action=appointment.approve", headers=headers
    )
    assert response.status_code == 200, response.text
    data = response.json()["data"]
    assert data["total"] >= 1
    entry = next(e for e in data["items"] if e["entity_id"] == appointment_id)
    assert entry["summary"] == "Randevu onaylandı"
    assert entry["actor_name"] == seeded["users"]["admin"].name
    assert entry["before"] == {"status": "pending"}

    # entity_id filtresi
    response = await client.get(
        f"/facilities/{fid}/audit-logs?entity_id={appointment_id}", headers=headers
    )
    assert all(e["entity_id"] == appointment_id for e in response.json()["data"]["items"])


async def test_audit_logs_masks_sensitive_fields(client, seeded, session_maker):
    from app.core.enums import ActorType
    from app.models import AuditLog

    fid = seeded["facility"].id
    async with session_maker() as db:
        db.add(
            AuditLog(
                actor_type=ActorType.tenant_user,
                actor_id=seeded["users"]["admin"].id,
                tenant_id=seeded["tenant"].id,
                facility_id=fid,
                action="test.sensitive",
                entity_type="test",
                before_json={
                    "password_hash": "GIZLI",
                    "refresh_token": "GIZLI",
                    "nested": {"api_secret": "GIZLI", "name": "Acik Veri"},
                },
                after_json={"big": "x" * 5000},
            )
        )
        await db.commit()

    headers = await admin(client)
    response = await client.get(
        f"/facilities/{fid}/audit-logs?action=test.sensitive", headers=headers
    )
    entry = response.json()["data"]["items"][0]
    assert entry["before"]["password_hash"] == "***"
    assert entry["before"]["refresh_token"] == "***"
    assert entry["before"]["nested"]["api_secret"] == "***"
    assert entry["before"]["nested"]["name"] == "Acik Veri"
    assert "GIZLI" not in response.text
    # Buyuk snapshot kirpilir
    assert entry["after"].get("_truncated") is True


async def test_audit_logs_permission(client, seeded):
    fid = seeded["facility"].id
    # Izleyicide audit.view YOK -> 403
    viewer = auth_headers(await login(client, "/auth/login", "izleyici@cakesbakes.com"))
    response = await client.get(f"/facilities/{fid}/audit-logs", headers=viewer)
    assert response.status_code == 403
    # Supplier hic erisemez
    supplier = auth_headers(
        await login(client, "/auth/supplier-login", "tedarikci@anadoluun.com")
    )
    response = await client.get(f"/facilities/{fid}/audit-logs", headers=supplier)
    assert response.status_code in (403, 404)


# ---------------------------------------------------------------- plan banner


async def test_facility_plan_warnings(client, seeded):
    p = await platform(client)
    plan_id = str(seeded["plan"].id)
    await client.patch(
        f"/platform/plans/{plan_id}",
        headers=p,
        json={
            "rate_card_json": [
                {"dimension": "appointments_created", "included_quota": 2,
                 "unit_price": 0, "overage_rule": "warn_only"}
            ]
        },
    )

    headers = await admin(client)
    fid = seeded["facility"].id
    response = await client.get(f"/facilities/{fid}/plan/warnings", headers=headers)
    assert response.status_code == 200, response.text
    data = response.json()["data"]
    assert data["effective_plan"]["name"] == "Professional"
    assert data["effective_plan"]["is_override"] is False
    warning = data["warnings"][0]
    assert warning["severity"] == "critical"
    assert "engellemez" in warning["message"]

    # Uyari randevu olusturmayi ENGELLEMEZ
    day = next_weekday(4)  # seed yogunlugundan (TIR cakisma grubu) uzak dur
    token = auth_headers(await login(client, "/auth/supplier-login", "tedarikci@anadoluun.com"))
    response = await client.post(
        "/supplier/appointments",
        headers=token,
        json={
            "product_category_id": str(seeded["product_categories"]["unlu"].id),
            "product_name": "Kota Ustu Ama Serbest",
            "quantity": 1,
            "target_date": day.isoformat(),
            "start_at": f"{day.isoformat()}T16:00:00+03:00",
            "duration_minutes": 45,
        },
    )
    assert response.status_code == 200, response.text

    # Supplier plan uyarisina erisemez
    response = await client.get(f"/facilities/{fid}/plan/warnings", headers=token)
    assert response.status_code in (403, 404)


# ---------------------------------------------------------------- seri onayi


async def _revised_series(client, seeded, *, supplier_email, category, hour=9, count=2):
    token = auth_headers(await login(client, "/auth/supplier-login", supplier_email))
    day = next_weekday(3)
    response = await client.post(
        "/supplier/appointments",
        headers=token,
        json={
            "product_category_id": str(seeded["product_categories"][category].id),
            "product_name": "Onay Serisi",
            "quantity": 1,
            "target_date": day.isoformat(),
            "start_at": f"{day.isoformat()}T{hour:02d}:00:00+03:00",
            "duration_minutes": 60,
            "recurring": {"frequency": "weekly", "occurrence_count": count},
        },
    )
    assert response.status_code == 200, response.text
    series = response.json()["data"]

    headers = await admin(client)
    fid = seeded["facility"].id
    response = await client.post(
        f"/facilities/{fid}/appointment-series/{series['series_id']}/revise",
        headers=headers,
        json={"scope": "future_only", "new_time": f"{hour + 2:02d}:00"},
    )
    assert response.status_code == 200, response.text
    return series, headers, fid


async def test_series_bulk_approve_success(client, seeded):
    series, headers, fid = await _revised_series(
        client, seeded, supplier_email="tedarikci@anadoluun.com", category="unlu", count=3
    )

    response = await client.post(
        f"/facilities/{fid}/appointment-series/{series['series_id']}/approve",
        headers=headers,
        json={"scope": "revision_pending_future_only", "note": "Revize seri onaylandı."},
    )
    assert response.status_code == 200, response.text
    data = response.json()["data"]
    assert data["affected_count"] == 3
    assert all(a["status"] == "approved" for a in data["appointments"])

    # Tedarikciye TEK ozet bildirim + TEK e-posta
    supplier = auth_headers(
        await login(client, "/auth/supplier-login", "tedarikci@anadoluun.com")
    )
    notes = (await client.get("/supplier/notifications", headers=supplier)).json()["data"]
    approve_notes = [
        n for n in notes
        if n["type"] == "appointment_approved"
        and n["metadata_json"].get("series_id") == series["series_id"]
        and n["metadata_json"].get("affected_count") == 3
    ]
    assert len(approve_notes) == 1

    logs = (
        await client.get(f"/facilities/{fid}/email-logs?limit=100", headers=headers)
    ).json()["data"]["items"]
    # En az bir seri onay e-postasi uretilmis olmali
    assert any(e["template_key"] == "appointment_approved" for e in logs)

    # Ikinci onay: revize bekleyen kalmadi -> 409
    response = await client.post(
        f"/facilities/{fid}/appointment-series/{series['series_id']}/approve",
        headers=headers, json={},
    )
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "NO_REVISION_PENDING_OCCURRENCES"


async def test_series_bulk_approve_conflict_all_or_nothing(client, seeded):
    """Onay aninda slot gecersizlesmisse HICBIR occurrence onaylanmaz."""
    series, headers, fid = await _revised_series(
        client, seeded, supplier_email="tedarikci@marmarasoguk.com", category="soguk"
    )
    # Revize ile onay arasinda rampa (soguk -> yalnizca R2) pasiflesti
    response = await client.patch(
        f"/facilities/{fid}/docks/{seeded['docks']['d2'].id}",
        headers=headers,
        json={"is_active": False},
    )
    assert response.status_code == 200, response.text

    response = await client.post(
        f"/facilities/{fid}/appointment-series/{series['series_id']}/approve",
        headers=headers, json={},
    )
    assert response.status_code == 422, response.text
    error = response.json()["error"]
    assert error["code"] == "SERIES_APPROVE_OCCURRENCE_FAILED"
    assert error["details"]["occurrence_index"] == 1

    # ALL-OR-NOTHING: hepsi revision_pending kaldi
    detail = await client.get(
        f"/facilities/{fid}/appointment-series/{series['series_id']}", headers=headers
    )
    assert all(
        a["status"] == "revision_pending"
        for a in detail.json()["data"]["appointments"]
    )


async def test_series_bulk_approve_permission(client, seeded):
    series, _, fid = await _revised_series(
        client, seeded, supplier_email="tedarikci@anadoluun.com", category="unlu", hour=13
    )
    viewer = auth_headers(await login(client, "/auth/login", "izleyici@cakesbakes.com"))
    response = await client.post(
        f"/facilities/{fid}/appointment-series/{series['series_id']}/approve",
        headers=viewer, json={},
    )
    assert response.status_code == 403


# ---------------------------------------------------------------- CSV export


async def test_reports_csv_exports(client, seeded):
    headers = await admin(client)
    fid = seeded["facility"].id

    response = await client.get(f"/facilities/{fid}/reports/summary.csv", headers=headers)
    assert response.status_code == 200
    assert "text/csv" in response.headers["content-type"]
    assert "attachment" in response.headers["content-disposition"]
    assert "TOPLAMLAR" in response.text
    assert "KATEGORIYE GORE" in response.text

    response = await client.get(
        f"/facilities/{fid}/reports/appointments.csv", headers=headers
    )
    assert response.status_code == 200
    header_line = response.text.splitlines()[0]
    assert "tedarikci" in header_line and "durum" in header_line
    # PII karari: plaka/surucu export EDILMEZ
    assert "plaka" not in header_line and "surucu" not in header_line

    # Izleyici (report.view var) indirebilir; supplier erisemez
    viewer = auth_headers(await login(client, "/auth/login", "izleyici@cakesbakes.com"))
    assert (
        await client.get(f"/facilities/{fid}/reports/summary.csv", headers=viewer)
    ).status_code == 200
    supplier = auth_headers(
        await login(client, "/auth/supplier-login", "tedarikci@anadoluun.com")
    )
    assert (
        await client.get(f"/facilities/{fid}/reports/appointments.csv", headers=supplier)
    ).status_code in (403, 404)


async def test_csv_export_neutralizes_formula_injection(client, seeded):
    """Tedarikcinin serbest metni Excel'de formul olarak calismamali.

    Urun adi tedarikci tarafindan girilir ve CSV'yi tesis yoneticisi acar;
    "=" ile baslayan hucre onun makinesinde formul olur.
    """
    fid = seeded["facility"].id
    day = next_weekday()
    payload = "=cmd|'/c calc'!A0"

    supplier = auth_headers(
        await login(client, "/auth/supplier-login", "tedarikci@anadoluun.com")
    )
    created = await client.post(
        "/supplier/appointments", headers=supplier,
        json={
            "product_category_id": str(seeded["product_categories"]["unlu"].id),
            "product_name": payload, "quantity": 1,
            "target_date": day.isoformat(),
            "start_at": f"{day.isoformat()}T14:00:00+03:00", "duration_minutes": 60,
        },
    )
    assert created.status_code == 200

    headers = await admin(client)
    response = await client.get(
        f"/facilities/{fid}/reports/appointments.csv"
        f"?date_from={date.today().isoformat()}&date_to={day.isoformat()}",
        headers=headers,
    )
    assert response.status_code == 200
    assert payload in response.text  # veri kaybolmuyor
    assert f"'{payload}" in response.text  # tirnakla etkisizlestirilmis
    assert f",{payload}" not in response.text  # ham formul olarak yazilmamis


async def test_platform_usage_csv_no_pii(client, seeded):
    p = await platform(client)
    response = await client.get("/platform/usage.csv", headers=p)
    assert response.status_code == 200
    assert "text/csv" in response.headers["content-type"]
    assert "TENANT KULLANIMI" in response.text
    for forbidden in ("tedarikci@", "@cakesbakes", "plaka", "Demo123"):
        assert forbidden not in response.text

    # Tenant admin platform CSV'sine erisemez
    headers = await admin(client)
    assert (await client.get("/platform/usage.csv", headers=headers)).status_code == 403


# ---------------------------------------------------------------- support


async def test_support_health(client, seeded, monkeypatch):
    # Bir failed e-posta uret ki sayac dolu olsun
    await _make_email_logs(client, seeded, monkeypatch)

    p = await platform(client)
    response = await client.get("/platform/support/health", headers=p)
    assert response.status_code == 200, response.text
    data = response.json()["data"]
    for key in (
        "failed_email_count", "due_email_retry_count", "pending_appointment_count",
        "revision_pending_appointment_count", "tenant_count", "active_facility_count",
        "plan_warning_count", "unread_critical_notification_count",
    ):
        assert isinstance(data[key], int)
    assert data["failed_email_count"] >= 1
    assert data["tenant_count"] >= 1
    for forbidden in ("tedarikci@", "@cakesbakes"):
        assert forbidden not in response.text

    # Tenant admin erisemez
    headers = await admin(client)
    assert (await client.get("/platform/support/health", headers=headers)).status_code == 403


# ---------------------------------------------------------------- scheduler


async def test_scheduler_loop_survives_errors(monkeypatch):
    """execute_job patlasa bile _loop olmez, tekrar dener (Sprint 12 imzasi)."""
    import app.maintenance.scheduler as scheduler

    calls = {"n": 0}

    async def bad_execute(db, job_name, scope=""):
        calls["n"] += 1
        raise RuntimeError("boom")

    # Scheduler artik her tenant veri alani icin ayri kosuyor; testte tek
    # (control-plane) alan yeterli.
    async def one_location():
        return [scheduler.CONTROL_LOCATION]

    monkeypatch.setattr(scheduler, "scheduler_locations", one_location)
    monkeypatch.setattr(scheduler, "execute_job", bad_execute)
    task = asyncio.create_task(scheduler._loop("email_retry", 0))
    await asyncio.sleep(0.05)
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass
    assert calls["n"] >= 2  # hata almasina ragmen dongu devam etti
