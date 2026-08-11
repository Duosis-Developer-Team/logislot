"""Sprint 10: email retry, admin create (+recurring), bulk revise, tercihler, plan uyarilari."""

from datetime import UTC, date, datetime, timedelta

from sqlalchemy import select

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

    def boom(self, message):
        raise ConnectionRefusedError("SMTP kapali")

    monkeypatch.setattr("app.services.email.SMTPEmailProvider._send_sync", boom)


async def _failed_email_log(client, seeded, monkeypatch, *, hour: int = 9) -> tuple[str, dict, str]:
    """SMTP hatasiyla failed e-posta uretir; (email_log_id, admin_headers, appt_id)."""
    use_failing_smtp(monkeypatch)
    day = next_weekday()
    soguk = auth_headers(
        await login(client, "/auth/supplier-login", "tedarikci@marmarasoguk.com")
    )
    created = await client.post(
        "/supplier/appointments",
        headers=soguk,
        json={
            "product_category_id": str(seeded["product_categories"]["soguk"].id),
            "product_name": "Retry Testi",
            "quantity": 1,
            "target_date": day.isoformat(),
            "start_at": f"{day.isoformat()}T{hour:02d}:00:00+03:00",
            "duration_minutes": 60,
        },
    )
    assert created.status_code == 200, created.text
    appointment_id = created.json()["data"]["id"]
    headers = await admin(client)
    fid = seeded["facility"].id
    response = await client.post(
        f"/facilities/{fid}/appointments/{appointment_id}/approve", headers=headers
    )
    assert response.status_code == 200
    logs = (
        await client.get(
            f"/facilities/{fid}/email-logs?appointment_id={appointment_id}", headers=headers
        )
    ).json()["data"]["items"]
    failed = next(log for log in logs if log["status"] == "failed")
    assert failed["next_retry_at"] is not None  # backoff planlandi
    return failed["id"], headers, appointment_id


# ---------------------------------------------------------------- email retry


async def test_email_resend_success_then_already_sent(client, seeded, monkeypatch):
    log_id, headers, _ = await _failed_email_log(client, seeded, monkeypatch)
    fid = seeded["facility"].id

    # Provider duzeldi (log_only'ye don) -> resend basarili
    settings = get_settings()
    monkeypatch.setattr(settings, "email_provider", "log_only")
    response = await client.post(
        f"/facilities/{fid}/email-logs/{log_id}/resend", headers=headers
    )
    assert response.status_code == 200, response.text
    data = response.json()["data"]
    assert data["status"] == "sent"
    assert data["retry_count"] == 1
    assert data["sent_at"] is not None

    # sent kayit TEKRAR gonderilemez
    response = await client.post(
        f"/facilities/{fid}/email-logs/{log_id}/resend", headers=headers
    )
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "EMAIL_ALREADY_SENT"


async def test_email_resend_max_retries(client, seeded, monkeypatch):
    log_id, headers, _ = await _failed_email_log(client, seeded, monkeypatch, hour=10)
    fid = seeded["facility"].id

    # SMTP hala bozuk: 3 deneme de failed doner, sayac artar
    for attempt in (1, 2, 3):
        response = await client.post(
            f"/facilities/{fid}/email-logs/{log_id}/resend", headers=headers
        )
        assert response.status_code == 200
        data = response.json()["data"]
        assert data["status"] == "failed"
        assert data["retry_count"] == attempt

    # max_attempts (3) doldu -> 409
    response = await client.post(
        f"/facilities/{fid}/email-logs/{log_id}/resend", headers=headers
    )
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "EMAIL_MAX_RETRIES_REACHED"


async def test_email_resend_scope(client, seeded, monkeypatch):
    log_id, _, _ = await _failed_email_log(client, seeded, monkeypatch, hour=11)
    fid = seeded["facility"].id

    # Supplier resend YAPAMAZ (facility context tenant ister)
    supplier = auth_headers(
        await login(client, "/auth/supplier-login", "tedarikci@anadoluun.com")
    )
    response = await client.post(
        f"/facilities/{fid}/email-logs/{log_id}/resend", headers=supplier
    )
    assert response.status_code in (403, 404)

    # Platform da erisemez
    p = await platform(client)
    response = await client.post(
        f"/facilities/{fid}/email-logs/{log_id}/resend", headers=p
    )
    assert response.status_code == 403


async def test_process_due_retries(client, seeded, monkeypatch, session_maker):
    import uuid as uuid_mod

    from app.models import EmailLog
    from app.services.email import process_due_retries

    raw_id, _, _ = await _failed_email_log(client, seeded, monkeypatch, hour=12)
    log_id = uuid_mod.UUID(raw_id)

    # Provider duzeldi; deneme zamanini gecmise cek ve processor'u kos
    settings = get_settings()
    monkeypatch.setattr(settings, "email_provider", "log_only")
    async with session_maker() as db:
        entry = (
            await db.execute(select(EmailLog).where(EmailLog.id == log_id))
        ).scalar_one()
        entry.next_retry_at = datetime.now(UTC) - timedelta(minutes=1)
        await db.commit()

    async with session_maker() as db:
        summary = await process_due_retries(db, limit=10)
        await db.commit()
    assert summary["processed"] >= 1
    assert summary["sent"] >= 1

    async with session_maker() as db:
        entry = (
            await db.execute(select(EmailLog).where(EmailLog.id == log_id))
        ).scalar_one()
        assert entry.status == "sent"


# ---------------------------------------------------------------- admin create


async def test_admin_create_manual_dock(client, seeded):
    headers = await admin(client)
    fid = seeded["facility"].id
    day = next_weekday(4)  # seed randevularindan (yarin) uzak dur
    base = {
        "supplier_id": str(seeded["suppliers"]["un"].id),
        "product_category_id": str(seeded["product_categories"]["unlu"].id),
        "product_name": "Manuel Rampa",
        "quantity": 1,
        "target_date": day.isoformat(),
        "start_at": f"{day.isoformat()}T16:00:00+03:00",
        "duration_minutes": 45,
        "auto_assign_dock": False,
    }
    # Uyumlu rampa (unlu -> Rampa 1) manuel secilebilir
    response = await client.post(
        f"/facilities/{fid}/appointments",
        headers=headers,
        json={**base, "dock_id": str(seeded["docks"]["d1"].id)},
    )
    assert response.status_code == 200, response.text
    data = response.json()["data"]
    assert data["dock_id"] == str(seeded["docks"]["d1"].id)
    assert data["status"] == "approved"  # admin actigi icin onayli

    # Uyumsuz rampa (unlu, Rampa 3 kabul etmez) -> kural engeller
    response = await client.post(
        f"/facilities/{fid}/appointments",
        headers=headers,
        json={
            **base,
            "start_at": f"{day.isoformat()}T17:00:00+03:00",
            "dock_id": str(seeded["docks"]["d3"].id),
        },
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "NO_COMPATIBLE_DOCK"


async def test_admin_create_supplier_rules_enforced(client, seeded):
    """Admin bile tedarikcinin izinli kategori kuralini BYPASS EDEMEZ."""
    headers = await admin(client)
    fid = seeded["facility"].id
    day = next_weekday()
    response = await client.post(
        f"/facilities/{fid}/appointments",
        headers=headers,
        json={
            "supplier_id": str(seeded["suppliers"]["soguk"].id),
            "product_category_id": str(seeded["product_categories"]["unlu"].id),
            "product_name": "Izinsiz Kategori",
            "quantity": 1,
            "target_date": day.isoformat(),
            "start_at": f"{day.isoformat()}T10:00:00+03:00",
            "duration_minutes": 60,
        },
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "SUPPLIER_CATEGORY_NOT_ALLOWED"


async def test_admin_create_dock_manager_scope(client, seeded):
    """Rampa yoneticisi yalnizca ATANMIS rampalarinda randevu acabilir.

    (Seed'deki rampa kullanicisi 3 rampaya da atanmis oldugu icin yalnizca
    R3'e atanmis yeni bir rampa yoneticisiyle test edilir.)"""
    headers = await admin(client)
    fid = seeded["facility"].id
    response = await client.post(
        f"/facilities/{fid}/users",
        headers=headers,
        json={
            "name": "R3 Operatoru", "email": "r3op@cakesbakes.com",
            "role_ids": [str(seeded["roles"]["dock_manager"].id)],
            "assigned_dock_ids": [str(seeded["docks"]["d3"].id)],
            "temporary_password": "R3Op-Gecici1!",
        },
    )
    assert response.status_code == 200, response.text
    login_response = await client.post(
        "/auth/login", json={"email": "r3op@cakesbakes.com", "password": "R3Op-Gecici1!"}
    )
    token = auth_headers(login_response.json()["data"]["access_token"])
    response = await client.post(
        "/auth/change-password", headers=token,
        json={"current_password": "R3Op-Gecici1!", "new_password": "R3OpGuclu123!"},
    )
    dock_mgr = auth_headers(response.json()["data"]["access_token"])
    day = next_weekday(4)

    # Genel kategori R3'te kabul (scope icinde) -> olusur
    response = await client.post(
        f"/facilities/{fid}/appointments",
        headers=dock_mgr,
        json={
            "supplier_id": str(seeded["suppliers"]["un"].id),
            "product_category_id": str(seeded["product_categories"]["genel"].id),
            "product_name": "Scope Ici",
            "quantity": 1,
            "target_date": day.isoformat(),
            "start_at": f"{day.isoformat()}T15:00:00+03:00",
            "duration_minutes": 30,
        },
    )
    assert response.status_code == 200, response.text
    assert response.json()["data"]["dock_id"] == str(seeded["docks"]["d3"].id)

    # Soguk zincir yalnizca R2'de; R2 scope DISI -> hicbir aday yok -> 422
    response = await client.post(
        f"/facilities/{fid}/appointments",
        headers=dock_mgr,
        json={
            "supplier_id": str(seeded["suppliers"]["soguk"].id),
            "product_category_id": str(seeded["product_categories"]["soguk"].id),
            "product_name": "Scope Disi",
            "quantity": 1,
            "target_date": day.isoformat(),
            "start_at": f"{day.isoformat()}T15:00:00+03:00",
            "duration_minutes": 60,
        },
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "NO_COMPATIBLE_DOCK"

    # Manuel scope-disi rampa secimi de reddedilir
    response = await client.post(
        f"/facilities/{fid}/appointments",
        headers=dock_mgr,
        json={
            "supplier_id": str(seeded["suppliers"]["un"].id),
            "product_category_id": str(seeded["product_categories"]["genel"].id),
            "product_name": "Scope Disi Manuel",
            "quantity": 1,
            "target_date": day.isoformat(),
            "start_at": f"{day.isoformat()}T16:00:00+03:00",
            "duration_minutes": 30,
            "auto_assign_dock": False,
            "dock_id": str(seeded["docks"]["d1"].id),
        },
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "NO_COMPATIBLE_DOCK"


async def test_admin_recurring_all_or_nothing(client, seeded):
    headers = await admin(client)
    fid = seeded["facility"].id
    day = next_weekday()
    conflict_day = day + timedelta(days=7)

    # 2. haftayi doldur (soguk -> yalnizca Rampa 2)
    response = await client.post(
        f"/facilities/{fid}/appointments",
        headers=headers,
        json={
            "supplier_id": str(seeded["suppliers"]["soguk"].id),
            "product_category_id": str(seeded["product_categories"]["soguk"].id),
            "product_name": "Blokaj",
            "quantity": 1,
            "target_date": conflict_day.isoformat(),
            "start_at": f"{conflict_day.isoformat()}T11:00:00+03:00",
            "duration_minutes": 90,
        },
    )
    assert response.status_code == 200, response.text

    response = await client.post(
        f"/facilities/{fid}/appointments",
        headers=headers,
        json={
            "supplier_id": str(seeded["suppliers"]["soguk"].id),
            "product_category_id": str(seeded["product_categories"]["soguk"].id),
            "product_name": "Admin Seri Cakisma",
            "quantity": 1,
            "target_date": day.isoformat(),
            "start_at": f"{day.isoformat()}T11:00:00+03:00",
            "duration_minutes": 90,
            "recurring": {"frequency": "weekly", "occurrence_count": 2},
        },
    )
    assert response.status_code == 422
    error = response.json()["error"]
    assert error["code"] == "RECURRING_OCCURRENCE_FAILED"
    assert error["details"]["occurrence_index"] == 2

    # Hicbir seri randevusu olusmadi
    listing = await client.get(
        f"/facilities/{fid}/appointments?limit=500", headers=headers
    )
    assert all(
        a["product_name"] != "Admin Seri Cakisma" for a in listing.json()["data"]
    )


# ---------------------------------------------------------------- bulk revise


async def _series(client, seeded, *, count: int = 3, hour: int = 15) -> dict:
    token = auth_headers(await login(client, "/auth/supplier-login", "tedarikci@anadoluun.com"))
    day = next_weekday(2)
    response = await client.post(
        "/supplier/appointments",
        headers=token,
        json={
            "product_category_id": str(seeded["product_categories"]["unlu"].id),
            "product_name": "Revize Serisi",
            "quantity": 1,
            "target_date": day.isoformat(),
            "start_at": f"{day.isoformat()}T{hour:02d}:00:00+03:00",
            "duration_minutes": 60,
            "recurring": {"frequency": "weekly", "occurrence_count": count},
        },
    )
    assert response.status_code == 200, response.text
    return response.json()["data"]


async def test_series_bulk_revise_success(client, seeded):
    series = await _series(client, seeded)
    headers = await admin(client)
    fid = seeded["facility"].id
    first_id = series["appointments"][0]["id"]

    # 1. occurrence tamamlansin -> revize kapsaminin DISINDA kalmali
    response = await client.post(
        f"/facilities/{fid}/appointments/{first_id}/complete",
        headers=headers, json={"note": "Erken teslim"},
    )
    assert response.status_code == 200

    response = await client.post(
        f"/facilities/{fid}/appointment-series/{series['series_id']}/revise",
        headers=headers,
        json={
            "scope": "future_only",
            "new_time": "09:30",
            "duration_minutes": 45,
            "auto_assign_dock": True,
            "note": "Pilot programi guncellendi",
        },
    )
    assert response.status_code == 200, response.text
    result = response.json()["data"]
    assert result["affected_count"] == 2
    for appt in result["appointments"]:
        assert appt["status"] == "revision_pending"
        assert appt["duration_minutes"] == 45
        assert "06:30" in appt["scheduled_start_at"]  # 09:30 TRT = 06:30 UTC

    # Tamamlanan occurrence dokunulmadi
    detail = await client.get(
        f"/facilities/{fid}/appointment-series/{series['series_id']}", headers=headers
    )
    by_id = {a["id"]: a for a in detail.json()["data"]["appointments"]}
    assert by_id[first_id]["status"] == "completed"

    # Tedarikciye TEK ozet bildirim + TEK e-posta
    supplier = auth_headers(
        await login(client, "/auth/supplier-login", "tedarikci@anadoluun.com")
    )
    notes = (await client.get("/supplier/notifications", headers=supplier)).json()["data"]
    revise_notes = [
        n for n in notes
        if n["type"] == "appointment_revised"
        and n["metadata_json"].get("series_id") == series["series_id"]
    ]
    assert len(revise_notes) == 1
    assert revise_notes[0]["metadata_json"]["affected_count"] == 2

    logs = (
        await client.get(f"/facilities/{fid}/email-logs?limit=200", headers=headers)
    ).json()["data"]["items"]
    series_mails = [
        log for log in logs if log["template_key"] == "appointment_series_revised"
    ]
    assert len(series_mails) == 1


async def test_series_bulk_revise_all_or_nothing(client, seeded):
    """Bir occurrence hedef saatte kurala takilirsa HICBIRI degismez."""
    token = auth_headers(
        await login(client, "/auth/supplier-login", "tedarikci@marmarasoguk.com")
    )
    day = next_weekday(2)
    response = await client.post(
        "/supplier/appointments",
        headers=token,
        json={
            "product_category_id": str(seeded["product_categories"]["soguk"].id),
            "product_name": "Soguk Revize Serisi",
            "quantity": 1,
            "target_date": day.isoformat(),
            "start_at": f"{day.isoformat()}T09:00:00+03:00",
            "duration_minutes": 60,
            "recurring": {"frequency": "weekly", "occurrence_count": 2},
        },
    )
    assert response.status_code == 200, response.text
    series = response.json()["data"]
    original_starts = [a["scheduled_start_at"] for a in series["appointments"]]

    # 2. haftada hedef saati (13:00) tek uyumlu rampada (R2) doldur
    headers = await admin(client)
    fid = seeded["facility"].id
    conflict_day = day + timedelta(days=7)
    response = await client.post(
        f"/facilities/{fid}/appointments",
        headers=headers,
        json={
            "supplier_id": str(seeded["suppliers"]["soguk"].id),
            "product_category_id": str(seeded["product_categories"]["soguk"].id),
            "product_name": "Hedef Blokaj",
            "quantity": 1,
            "target_date": conflict_day.isoformat(),
            "start_at": f"{conflict_day.isoformat()}T13:00:00+03:00",
            "duration_minutes": 90,
        },
    )
    assert response.status_code == 200, response.text

    response = await client.post(
        f"/facilities/{fid}/appointment-series/{series['series_id']}/revise",
        headers=headers,
        json={"scope": "future_only", "new_time": "13:00"},
    )
    assert response.status_code == 422, response.text
    error = response.json()["error"]
    assert error["code"] == "SERIES_REVISE_OCCURRENCE_FAILED"
    assert error["details"]["occurrence_index"] == 2
    assert error["details"]["code"] == "DOCK_TIME_CONFLICT"

    # ALL-OR-NOTHING: 1. occurrence dahil hicbiri degismedi
    detail = await client.get(
        f"/facilities/{fid}/appointment-series/{series['series_id']}", headers=headers
    )
    current = [a["scheduled_start_at"] for a in detail.json()["data"]["appointments"]]
    assert current == original_starts
    assert all(
        a["status"] in ("pending", "approved")
        for a in detail.json()["data"]["appointments"]
    )


# ---------------------------------------------------------------- tercihler


async def test_notification_preferences_endpoints(client, seeded):
    headers = await admin(client)

    response = await client.get("/auth/notification-preferences", headers=headers)
    prefs = response.json()["data"]
    assert prefs["in_app_enabled"] is True
    assert prefs["email_events"]["appointment_revised_team"] is True

    response = await client.patch(
        "/auth/notification-preferences",
        headers=headers,
        json={"email_enabled": False, "email_events": {"appointment_revised_team": False}},
    )
    assert response.status_code == 200
    assert response.json()["data"]["email_enabled"] is False

    # Bilinmeyen event anahtari reddedilir
    response = await client.patch(
        "/auth/notification-preferences",
        headers=headers,
        json={"email_events": {"platform.hack": True}},
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "INVALID_PREFERENCE_EVENT"

    # Platform kullanicisinin tercihi yoktur
    p = await platform(client)
    assert (await client.get("/auth/notification-preferences", headers=p)).status_code == 403


async def test_tenant_prefs_ignore_supplier_event_keys(client, seeded):
    """Eski/onbellekli istemci tedarikci anahtarlarini gonderse de saklanmaz.

    Bu anahtarlar artik tesis politikasina aittir; 422 vermek eski web
    surumunun kaydet butonunu kirardi, bu yuzden sessizce dusurulur.
    """
    headers = await admin(client)
    response = await client.patch(
        "/auth/notification-preferences",
        headers=headers,
        json={
            "email_events": {
                "appointment_revised_team": False,
                "appointment_approved": False,  # tedarikci anahtari
            }
        },
    )
    assert response.status_code == 200
    events = response.json()["data"]["email_events"]
    assert events == {"appointment_revised_team": False}


async def test_supplier_cannot_read_or_write_own_preferences(client, seeded):
    """Tedarikci kendi tercihini ne gorur ne degistirir (yonetim belirler)."""
    supplier = auth_headers(
        await login(client, "/auth/supplier-login", "tedarikci@marmarasoguk.com")
    )
    assert (
        await client.get("/auth/notification-preferences", headers=supplier)
    ).status_code == 403
    assert (
        await client.patch(
            "/auth/notification-preferences",
            headers=supplier,
            json={"email_enabled": False},
        )
    ).status_code == 403


async def test_supplier_notification_policy_endpoints(client, seeded):
    headers = await admin(client)
    fid = seeded["facility"].id
    url = f"/facilities/{fid}/supplier-notification-policy"

    response = await client.get(url, headers=headers)
    assert response.status_code == 200
    policy = response.json()["data"]
    assert policy["in_app_enabled"] is True
    assert policy["email_events"]["appointment_approved"] is True
    assert policy["is_customized"] is False
    # Ekip sablonu tedarikci politikasinda YER ALMAZ
    assert "appointment_revised_team" not in policy["email_events"]

    response = await client.patch(
        url,
        headers=headers,
        json={"email_events": {"appointment_approved": False}},
    )
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["email_events"]["appointment_approved"] is False
    assert data["email_events"]["appointment_rejected"] is True
    assert data["is_customized"] is True

    # Bilinmeyen / tenant'a ait anahtar reddedilir
    for bad_key in ("platform.hack", "appointment_revised_team"):
        response = await client.patch(
            url, headers=headers, json={"email_events": {bad_key: True}}
        )
        assert response.status_code == 422, bad_key
        assert response.json()["error"]["code"] == "INVALID_PREFERENCE_EVENT"

    # Degisiklik denetim izine dusmeli
    logs = (
        await client.get(
            f"/facilities/{fid}/audit-logs?action=supplier_notification_policy.update",
            headers=headers,
        )
    ).json()["data"]["items"]
    assert logs, "politika degisikligi audit'e yazilmali"


async def test_supplier_cannot_reach_notification_policy(client, seeded):
    """Politika ucu tedarikciye ve platform kullanicisina kapalidir."""
    fid = seeded["facility"].id
    url = f"/facilities/{fid}/supplier-notification-policy"
    supplier = auth_headers(
        await login(client, "/auth/supplier-login", "tedarikci@marmarasoguk.com")
    )
    assert (await client.get(url, headers=supplier)).status_code == 403
    assert (
        await client.patch(url, headers=supplier, json={"email_enabled": False})
    ).status_code == 403

    p = await platform(client)
    assert (await client.get(url, headers=p)).status_code == 403


async def test_supplier_email_policy_disables_email(client, seeded):
    # YONETIM tedarikci e-postalarini kapatir
    supplier = auth_headers(
        await login(client, "/auth/supplier-login", "tedarikci@marmarasoguk.com")
    )
    response = await client.patch(
        f"/facilities/{seeded['facility'].id}/supplier-notification-policy",
        headers=await admin(client),
        json={"email_enabled": False},
    )
    assert response.status_code == 200

    # Randevu olustur + onayla -> e-posta URETILMEZ ama panel bildirimi olusur
    day = next_weekday()
    created = await client.post(
        "/supplier/appointments",
        headers=supplier,
        json={
            "product_category_id": str(seeded["product_categories"]["soguk"].id),
            "product_name": "Emailsiz Onay",
            "quantity": 1,
            "target_date": day.isoformat(),
            "start_at": f"{day.isoformat()}T14:00:00+03:00",
            "duration_minutes": 60,
        },
    )
    appointment_id = created.json()["data"]["id"]
    headers = await admin(client)
    fid = seeded["facility"].id
    response = await client.post(
        f"/facilities/{fid}/appointments/{appointment_id}/approve", headers=headers
    )
    assert response.status_code == 200

    logs = (
        await client.get(
            f"/facilities/{fid}/email-logs?appointment_id={appointment_id}", headers=headers
        )
    ).json()["data"]["items"]
    assert logs == []  # e-posta ve EmailLog uretilmedi (MVP karari)

    notes = (await client.get("/supplier/notifications", headers=supplier)).json()["data"]
    approved = [
        n for n in notes
        if n["type"] == "appointment_approved"
        and n["metadata_json"].get("appointment_id") == appointment_id
    ]
    assert len(approved) == 1  # panel bildirimi calisir


async def test_supplier_in_app_policy_and_critical_exception(client, seeded):
    supplier = auth_headers(
        await login(client, "/auth/supplier-login", "tedarikci@marmarasoguk.com")
    )
    response = await client.patch(
        f"/facilities/{seeded['facility'].id}/supplier-notification-policy",
        headers=await admin(client),
        json={"in_app_enabled": False},
    )
    assert response.status_code == 200

    day = next_weekday(4)  # seed randevularindan uzak dur
    created = await client.post(
        "/supplier/appointments",
        headers=supplier,
        json={
            "product_category_id": str(seeded["product_categories"]["soguk"].id),
            "product_name": "Bildirimsiz",
            "quantity": 1,
            "target_date": day.isoformat(),
            "start_at": f"{day.isoformat()}T15:00:00+03:00",
            "duration_minutes": 60,
        },
    )
    appointment_id = created.json()["data"]["id"]
    headers = await admin(client)
    fid = seeded["facility"].id

    # Onay bildirimi URETILMEZ (in-app kapali)
    await client.post(
        f"/facilities/{fid}/appointments/{appointment_id}/approve", headers=headers
    )
    notes = (await client.get("/supplier/notifications", headers=supplier)).json()["data"]
    assert not any(
        n["metadata_json"].get("appointment_id") == appointment_id
        and n["type"] == "appointment_approved"
        for n in notes
    )

    # KRITIK istisna: revize bildirimi in-app kapali olsa da uretilir
    response = await client.post(
        f"/facilities/{fid}/appointments/{appointment_id}/revise",
        headers=headers,
        json={"new_start_at": f"{day.isoformat()}T16:00:00+03:00", "auto_assign_dock": True},
    )
    assert response.status_code == 200, response.text
    notes = (await client.get("/supplier/notifications", headers=supplier)).json()["data"]
    assert any(
        n["metadata_json"].get("appointment_id") == appointment_id
        and n["type"] == "appointment_revised"
        for n in notes
    )


async def test_series_emails_respect_supplier_policy(client, seeded):
    """Seri e-postalari da politikaya uyar (once HICBIR kontrol yoktu)."""
    series = await _series(client, seeded)
    headers = await admin(client)
    fid = seeded["facility"].id

    response = await client.patch(
        f"/facilities/{fid}/supplier-notification-policy",
        headers=headers,
        json={"email_events": {"appointment_series_cancelled": False}},
    )
    assert response.status_code == 200

    response = await client.post(
        f"/facilities/{fid}/appointment-series/{series['series_id']}/cancel",
        headers=headers,
        json={"scope": "future_only", "reason": "Politika testi"},
    )
    assert response.status_code == 200, response.text

    logs = (
        await client.get(f"/facilities/{fid}/email-logs?limit=200", headers=headers)
    ).json()["data"]["items"]
    assert not [
        log for log in logs if log["template_key"] == "appointment_series_cancelled"
    ]

    # Panel bildirimi politikadan bagimsiz degil ama acik: tedarikci haberdar olur
    supplier = auth_headers(
        await login(client, "/auth/supplier-login", "tedarikci@anadoluun.com")
    )
    notes = (await client.get("/supplier/notifications", headers=supplier)).json()["data"]
    assert any(
        n["type"] == "appointment_cancelled"
        and n["metadata_json"].get("series_id") == series["series_id"]
        for n in notes
    )


# ---------------------------------------------------------------- plan uyarilari


async def test_plan_usage_warnings_thresholds(client, seeded):
    headers = await platform(client)
    plan_id = str(seeded["plan"].id)  # Professional (BTA'ya atanmis)

    # Kotayi kucult: mevcut kullanim esigi kesin assin (critical)
    response = await client.patch(
        f"/platform/plans/{plan_id}",
        headers=headers,
        json={
            "rate_card_json": [
                {"dimension": "appointments_created", "included_quota": 2,
                 "unit_price": 0, "overage_rule": "warn_only"},
                {"dimension": "active_docks", "included_quota": 100,
                 "unit_price": 0, "overage_rule": "warn_only"},
            ]
        },
    )
    assert response.status_code == 200, response.text

    response = await client.get("/platform/usage/warnings", headers=headers)
    assert response.status_code == 200
    warnings = response.json()["data"]["warnings"]
    appt_warning = next(
        w for w in warnings if w["dimension"] == "appointments_created"
    )
    assert appt_warning["severity"] == "critical"
    assert appt_warning["percent"] >= 120
    assert appt_warning["included_quota"] == 2
    assert "%" in appt_warning["message"]
    # Esik altindaki boyut uyari URETMEZ
    assert not any(w["dimension"] == "active_docks" for w in warnings)

    # Kota buyukse uyari yok
    response = await client.patch(
        f"/platform/plans/{plan_id}",
        headers=headers,
        json={
            "rate_card_json": [
                {"dimension": "appointments_created", "included_quota": 100000,
                 "unit_price": 0, "overage_rule": "warn_only"}
            ]
        },
    )
    response = await client.get("/platform/usage/warnings", headers=headers)
    assert response.json()["data"]["warnings"] == []


async def test_plan_usage_warnings_no_pii_and_permissions(client, seeded):
    headers = await platform(client)
    response = await client.get("/platform/usage/warnings", headers=headers)
    text = response.text
    for forbidden in ("tedarikci@", "cakesbakes.com", "driver", "license_plate", "Demo123"):
        assert forbidden not in text

    # Tenant admin'i platform endpoint'ine erisemez
    tenant_admin = await admin(client)
    response = await client.get("/platform/usage/warnings", headers=tenant_admin)
    assert response.status_code == 403
