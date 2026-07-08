"""Sprint 9: SMTP, must_change_password, first-admin onboarding, seri iptali."""

from datetime import date, timedelta

from app.core.config import get_settings
from tests.conftest import DEMO_PASSWORD, auth_headers, login


def next_weekday(offset_days: int = 1) -> date:
    day = date.today() + timedelta(days=offset_days)
    while day.weekday() >= 5:
        day += timedelta(days=1)
    return day


async def admin(client) -> dict:
    return auth_headers(await login(client, "/auth/login", "admin@cakesbakes.com"))


async def platform(client) -> dict:
    return auth_headers(await login(client, "/auth/platform-login", "admin@logislot.com"))


def use_smtp(monkeypatch, host: str = "smtp.test.local") -> None:
    settings = get_settings()
    monkeypatch.setattr(settings, "email_provider", "smtp")
    monkeypatch.setattr(settings, "smtp_host", host)
    monkeypatch.setattr(settings, "smtp_from_email", "noreply@logislot.test")


async def _approved_appointment(client, seeded, *, hour: int = 9) -> tuple[str, dict]:
    """Manuel onayli tedarikciyle pending randevu olusturur; (id, admin_headers)."""
    day = next_weekday()
    soguk = auth_headers(
        await login(client, "/auth/supplier-login", "tedarikci@marmarasoguk.com")
    )
    created = await client.post(
        "/supplier/appointments",
        headers=soguk,
        json={
            "product_category_id": str(seeded["product_categories"]["soguk"].id),
            "product_name": "SMTP Test Randevusu",
            "quantity": 1,
            "target_date": day.isoformat(),
            "start_at": f"{day.isoformat()}T{hour:02d}:00:00+03:00",
            "duration_minutes": 60,
        },
    )
    assert created.status_code == 200, created.text
    return created.json()["data"]["id"], await admin(client)


# ---------------------------------------------------------------- SMTP


async def test_log_only_provider_still_default(client, seeded):
    appointment_id, headers = await _approved_appointment(client, seeded)
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
    assert logs[0]["provider"] == "log_only"
    assert logs[0]["status"] == "sent"


async def test_smtp_provider_success(client, seeded, monkeypatch):
    use_smtp(monkeypatch)
    monkeypatch.setattr(
        "app.services.email.SMTPEmailProvider._send_sync",
        lambda self, message: "<mid-123@logislot.test>",
    )
    appointment_id, headers = await _approved_appointment(client, seeded, hour=10)
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
    approved = next(log for log in logs if log["template_key"] == "appointment_approved")
    assert approved["provider"] == "smtp"
    assert approved["status"] == "sent"
    assert approved["sent_at"] is not None


async def test_smtp_failure_does_not_break_lifecycle(client, seeded, monkeypatch):
    use_smtp(monkeypatch)

    def boom(self, message):
        raise ConnectionRefusedError("SMTP sunucusuna baglanilamadi")

    monkeypatch.setattr("app.services.email.SMTPEmailProvider._send_sync", boom)
    appointment_id, headers = await _approved_appointment(client, seeded, hour=11)
    fid = seeded["facility"].id

    # E-posta patlasa da onay AKISI BOZULMAZ (fail-safe karari)
    response = await client.post(
        f"/facilities/{fid}/appointments/{appointment_id}/approve", headers=headers
    )
    assert response.status_code == 200
    assert response.json()["data"]["status"] == "approved"

    logs = (
        await client.get(
            f"/facilities/{fid}/email-logs?appointment_id={appointment_id}", headers=headers
        )
    ).json()["data"]["items"]
    failed = next(log for log in logs if log["template_key"] == "appointment_approved")
    assert failed["provider"] == "smtp"
    assert failed["status"] == "failed"
    assert "baglanilamadi" in failed["error_message"]
    assert failed["sent_at"] is None


async def test_smtp_missing_config_logs_failed(client, seeded, monkeypatch):
    """Karar: eksik SMTP konfigurasyonunda API boot etmeye devam eder,
    gonderim failed olarak loglanir (operasyon durmaz, sorun gorunur kalir)."""
    settings = get_settings()
    monkeypatch.setattr(settings, "email_provider", "smtp")
    monkeypatch.setattr(settings, "smtp_host", "")
    monkeypatch.setattr(settings, "smtp_from_email", "")

    appointment_id, headers = await _approved_appointment(client, seeded, hour=12)
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
    failed = next(log for log in logs if log["template_key"] == "appointment_approved")
    assert failed["status"] == "failed"
    assert "LOGISLOT_SMTP_HOST" in failed["error_message"]


async def test_smtp_revise_supplier_and_team(client, seeded, monkeypatch):
    use_smtp(monkeypatch)
    monkeypatch.setattr(
        "app.services.email.SMTPEmailProvider._send_sync",
        lambda self, message: "<mid-revise@logislot.test>",
    )
    appointment_id, headers = await _approved_appointment(client, seeded, hour=13)
    fid = seeded["facility"].id
    day = next_weekday()
    response = await client.post(
        f"/facilities/{fid}/appointments/{appointment_id}/revise",
        headers=headers,
        json={
            "new_start_at": f"{day.isoformat()}T14:00:00+03:00",
            "auto_assign_dock": True,
            "note": "SMTP revize testi",
        },
    )
    assert response.status_code == 200
    logs = (
        await client.get(
            f"/facilities/{fid}/email-logs?appointment_id={appointment_id}", headers=headers
        )
    ).json()["data"]["items"]
    templates = [log["template_key"] for log in logs]
    assert "appointment_revised" in templates
    assert "appointment_revised_team" in templates
    assert all(log["provider"] == "smtp" and log["status"] == "sent" for log in logs)


# --------------------------------------------- must_change_password akisi


async def test_login_returns_must_change_flag(client, seeded):
    response = await client.post(
        "/auth/login", json={"email": "admin@cakesbakes.com", "password": DEMO_PASSWORD}
    )
    assert response.json()["data"]["must_change_password"] is False


async def test_must_change_password_full_flow(client, seeded):
    headers = await admin(client)
    fid = seeded["facility"].id
    viewer_role_id = str(seeded["roles"]["viewer"].id)

    # Gecici parolali kullanici olustur -> must_change_password=True doner
    response = await client.post(
        f"/facilities/{fid}/users",
        headers=headers,
        json={"name": "Gecici Kullanici", "email": "gecici@cakesbakes.com",
              "role_ids": [viewer_role_id], "temporary_password": "Gecici1!"},
    )
    assert response.status_code == 200, response.text

    login_response = await client.post(
        "/auth/login", json={"email": "gecici@cakesbakes.com", "password": "Gecici1!"}
    )
    data = login_response.json()["data"]
    assert data["must_change_password"] is True
    token = auth_headers(data["access_token"])
    old_refresh = data["refresh_token"]

    # Normal endpoint 403 PASSWORD_CHANGE_REQUIRED; /auth/me serbest
    response = await client.get(f"/facilities/{fid}/appointments", headers=token)
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "PASSWORD_CHANGE_REQUIRED"
    assert (await client.get("/auth/me", headers=token)).status_code == 200

    # Yanlis mevcut parola / ayni parola / zayif parola reddedilir
    response = await client.post(
        "/auth/change-password", headers=token,
        json={"current_password": "yanlis", "new_password": "YeniGuclu123!"},
    )
    assert response.json()["error"]["code"] == "INVALID_CURRENT_PASSWORD"
    response = await client.post(
        "/auth/change-password", headers=token,
        json={"current_password": "Gecici1!", "new_password": "Gecici1!"},
    )
    assert response.json()["error"]["code"] == "SAME_PASSWORD"
    response = await client.post(
        "/auth/change-password", headers=token,
        json={"current_password": "Gecici1!", "new_password": "Kisa1!"},
    )
    assert response.json()["error"]["code"] == "WEAK_PASSWORD"
    response = await client.post(
        "/auth/change-password", headers=token,
        json={"current_password": "Gecici1!", "new_password": "SadeceHarflerBir"},
    )
    assert response.json()["error"]["code"] == "WEAK_PASSWORD"

    # Basarili degisim: yeni token cifti doner, flag temizlenir
    response = await client.post(
        "/auth/change-password", headers=token,
        json={"current_password": "Gecici1!", "new_password": "YeniGuclu123!"},
    )
    assert response.status_code == 200, response.text
    changed = response.json()["data"]
    assert changed["must_change_password"] is False
    new_token = auth_headers(changed["access_token"])

    # Yeni token ile normal endpoint calisir; eski refresh dusuruldu
    response = await client.get(f"/facilities/{fid}/appointments", headers=new_token)
    assert response.status_code == 200
    response = await client.post("/auth/refresh", json={"refresh_token": old_refresh})
    assert response.status_code == 401

    # Yeni parolayla login normal (flag false)
    response = await client.post(
        "/auth/login", json={"email": "gecici@cakesbakes.com", "password": "YeniGuclu123!"}
    )
    assert response.status_code == 200
    assert response.json()["data"]["must_change_password"] is False


async def test_tenant_password_reset_sets_must_change(client, seeded):
    headers = await admin(client)
    fid = seeded["facility"].id
    viewer_id = str(seeded["users"]["viewer"].id)
    response = await client.post(
        f"/facilities/{fid}/users/{viewer_id}/reset-password",
        headers=headers, json={"new_password": "ResetSifre1!"},
    )
    assert response.status_code == 200
    response = await client.post(
        "/auth/login", json={"email": "izleyici@cakesbakes.com", "password": "ResetSifre1!"}
    )
    data = response.json()["data"]
    assert data["must_change_password"] is True
    token = auth_headers(data["access_token"])
    response = await client.get(f"/facilities/{fid}/appointments", headers=token)
    assert response.json()["error"]["code"] == "PASSWORD_CHANGE_REQUIRED"


async def test_supplier_password_reset_sets_must_change(client, seeded):
    headers = await admin(client)
    fid = seeded["facility"].id
    supplier_id = seeded["suppliers"]["un"].id
    response = await client.post(
        f"/facilities/{fid}/suppliers/{supplier_id}/reset-password",
        headers=headers, json={"new_password": "TedarikciReset1!"},
    )
    assert response.status_code == 200

    response = await client.post(
        "/auth/supplier-login",
        json={"email": "tedarikci@anadoluun.com", "password": "TedarikciReset1!"},
    )
    data = response.json()["data"]
    assert data["must_change_password"] is True
    token = auth_headers(data["access_token"])
    response = await client.get("/supplier/appointments", headers=token)
    assert response.json()["error"]["code"] == "PASSWORD_CHANGE_REQUIRED"

    # Supplier da ayni endpoint'ten parola degistirir
    response = await client.post(
        "/auth/change-password", headers=token,
        json={"current_password": "TedarikciReset1!", "new_password": "YeniTedarikci123!"},
    )
    assert response.status_code == 200
    new_token = auth_headers(response.json()["data"]["access_token"])
    assert (await client.get("/supplier/appointments", headers=new_token)).status_code == 200


async def test_password_policy_production_blocks_common(client, seeded, monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "environment", "production")
    monkeypatch.setattr(settings, "password_require_special", False)
    headers = await admin(client)
    response = await client.post(
        "/auth/change-password", headers=headers,
        json={"current_password": DEMO_PASSWORD, "new_password": "Logislot123"},
    )
    assert response.status_code == 422
    assert "yaygın" in response.json()["error"]["message"]


# --------------------------------------------- first admin onboarding


async def test_first_admin_onboarding_flow(client, seeded):
    headers = await platform(client)
    response = await client.post(
        "/platform/tenants", headers=headers,
        json={"commercial_name": "Onboard A.S.", "display_name": "Onboard",
              "slug": "onboard"},
    )
    tenant_id = response.json()["data"]["id"]

    response = await client.post(
        f"/platform/tenants/{tenant_id}/facilities",
        headers=headers,
        json={
            "name": "Onboard Tesisi",
            "bootstrap_defaults": True,
            "initial_admin": {"name": "Onboard Yonetici", "email": "yonetici@onboard.com"},
        },
    )
    assert response.status_code == 200, response.text
    data = response.json()["data"]
    fid = data["id"]
    initial = data["initial_admin"]
    # Gecici parola verilmedi -> guclu random uretildi; yanitta BIR kez doner
    assert len(initial["temporary_password"]) >= 12
    assert initial["must_change_password"] is True

    # Sonraki okumalarda parola YOKTUR (one-time gosterim)
    detail = await client.get(f"/platform/tenants/{tenant_id}", headers=headers)
    assert "temporary_password" not in str(detail.json())

    # Yeni yonetici login olur -> parola degistirmeden API kapali
    login_response = await client.post(
        "/auth/login",
        json={"email": "yonetici@onboard.com", "password": initial["temporary_password"]},
    )
    data = login_response.json()["data"]
    assert data["must_change_password"] is True
    token = auth_headers(data["access_token"])
    response = await client.get(f"/facilities/{fid}/users", headers=token)
    assert response.json()["error"]["code"] == "PASSWORD_CHANGE_REQUIRED"

    # Parola degistirince tam yetkili sistem yoneticisi olarak calisir
    response = await client.post(
        "/auth/change-password", headers=token,
        json={"current_password": initial["temporary_password"],
              "new_password": "OnboardGuclu123!"},
    )
    assert response.status_code == 200
    new_token = auth_headers(response.json()["data"]["access_token"])
    users = (await client.get(f"/facilities/{fid}/users", headers=new_token)).json()["data"]
    assert users[0]["email"] == "yonetici@onboard.com"
    assert users[0]["roles"][0]["name"] == "Sistem Yoneticisi"

    # Son yonetici korumasi ilk yonetici icin de gecerli
    response = await client.delete(
        f"/facilities/{fid}/users/{users[0]['id']}", headers=new_token
    )
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "LAST_ADMIN"


async def test_first_admin_duplicate_email_rolls_back(client, seeded):
    headers = await platform(client)
    tenant_id = str(seeded["tenant"].id)
    response = await client.post(
        f"/platform/tenants/{tenant_id}/facilities",
        headers=headers,
        json={
            "name": "Cakisan Tesis",
            "initial_admin": {"name": "Kopya", "email": "admin@cakesbakes.com"},
        },
    )
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "DUPLICATE_EMAIL"
    # ALL-OR-NOTHING: tesis de olusmadi
    facilities = (await client.get("/platform/facilities", headers=headers)).json()["data"]
    assert all(f["name"] != "Cakisan Tesis" for f in facilities)


async def test_first_admin_without_bootstrap_gets_sysadmin_role(client, seeded):
    """Bootstrap kapaliyken de sistem yoneticisi rolu garanti edilir."""
    headers = await platform(client)
    response = await client.post(
        "/platform/tenants", headers=headers,
        json={"commercial_name": "Rolsuz A.S.", "display_name": "Rolsuz", "slug": "rolsuz"},
    )
    tenant_id = response.json()["data"]["id"]
    response = await client.post(
        f"/platform/tenants/{tenant_id}/facilities",
        headers=headers,
        json={
            "name": "Rolsuz Tesis",
            "bootstrap_defaults": False,
            "initial_admin": {
                "name": "Tek Yonetici", "email": "tek@rolsuz.com",
                "temporary_password": "RolsuzGecici1!",
            },
        },
    )
    assert response.status_code == 200, response.text
    fid = response.json()["data"]["id"]

    login_response = await client.post(
        "/auth/login", json={"email": "tek@rolsuz.com", "password": "RolsuzGecici1!"}
    )
    token = auth_headers(login_response.json()["data"]["access_token"])
    response = await client.post(
        "/auth/change-password", headers=token,
        json={"current_password": "RolsuzGecici1!", "new_password": "RolsuzGuclu123!"},
    )
    new_token = auth_headers(response.json()["data"]["access_token"])
    roles = (await client.get(f"/facilities/{fid}/roles", headers=new_token)).json()["data"]
    assert any(r["name"] == "Sistem Yoneticisi" and r["is_system"] for r in roles)


# --------------------------------------------- seri toplu iptali


async def _create_series(client, seeded, *, count: int = 3, hour: int = 15) -> dict:
    token = auth_headers(await login(client, "/auth/supplier-login", "tedarikci@anadoluun.com"))
    day = next_weekday(2)
    response = await client.post(
        "/supplier/appointments",
        headers=token,
        json={
            "product_category_id": str(seeded["product_categories"]["unlu"].id),
            "product_name": "Iptal Edilecek Seri",
            "quantity": 1,
            "target_date": day.isoformat(),
            "start_at": f"{day.isoformat()}T{hour:02d}:00:00+03:00",
            "duration_minutes": 60,
            "recurring": {"frequency": "weekly", "occurrence_count": count},
        },
    )
    assert response.status_code == 200, response.text
    return response.json()["data"]


async def test_series_cancel_future_only(client, seeded):
    series = await _create_series(client, seeded)
    headers = await admin(client)
    fid = seeded["facility"].id
    first_id = series["appointments"][0]["id"]

    # 1. occurrence'i tamamla -> iptal kapsaminin DISINDA kalmali
    response = await client.post(
        f"/facilities/{fid}/appointments/{first_id}/complete",
        headers=headers, json={"note": "Erken teslim"},
    )
    assert response.status_code == 200

    response = await client.post(
        f"/facilities/{fid}/appointment-series/{series['series_id']}/cancel",
        headers=headers,
        json={"scope": "future_only", "reason": "Tedarikçi talebiyle seri iptal edildi."},
    )
    assert response.status_code == 200, response.text
    result = response.json()["data"]
    assert result["affected_count"] == 2
    assert result["status"] == "cancelled"
    assert first_id not in result["cancelled_appointment_ids"]

    # Tamamlanan randevu DOKUNULMADI; digerleri cancelled + sebep yazildi
    detail = await client.get(
        f"/facilities/{fid}/appointment-series/{series['series_id']}", headers=headers
    )
    by_id = {a["id"]: a for a in detail.json()["data"]["appointments"]}
    assert by_id[first_id]["status"] == "completed"
    cancelled = [a for a in by_id.values() if a["status"] == "cancelled"]
    assert len(cancelled) == 2
    assert all(
        a["cancellation_reason"] == "Tedarikçi talebiyle seri iptal edildi."
        for a in cancelled
    )

    # Tedarikciye TEK ozet bildirim (occurrence basina degil)
    supplier = auth_headers(
        await login(client, "/auth/supplier-login", "tedarikci@anadoluun.com")
    )
    notes = (await client.get("/supplier/notifications", headers=supplier)).json()["data"]
    cancel_notes = [
        n for n in notes
        if n["type"] == "appointment_cancelled"
        and n["metadata_json"].get("series_id") == series["series_id"]
    ]
    assert len(cancel_notes) == 1
    assert cancel_notes[0]["metadata_json"]["affected_count"] == 2

    # Adminin zilinde de TEK ozet
    admin_notes = (
        await client.get(f"/facilities/{fid}/notifications", headers=headers)
    ).json()["data"]
    admin_cancel = [
        n for n in admin_notes
        if n["type"] == "appointment_cancelled"
        and n["metadata_json"].get("series_id") == series["series_id"]
    ]
    assert len(admin_cancel) == 1

    # Tedarikciye TEK seri iptal e-postasi
    logs = (
        await client.get(f"/facilities/{fid}/email-logs?limit=200", headers=headers)
    ).json()["data"]["items"]
    series_mails = [
        log for log in logs if log["template_key"] == "appointment_series_cancelled"
    ]
    assert len(series_mails) == 1
    assert series_mails[0]["status"] == "sent"

    # Ikinci iptal: gelecek occurrence kalmadi -> 409
    response = await client.post(
        f"/facilities/{fid}/appointment-series/{series['series_id']}/cancel",
        headers=headers, json={"scope": "future_only"},
    )
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "NO_FUTURE_OCCURRENCES"


async def test_series_cancel_requires_cancel_permission(client, seeded):
    series = await _create_series(client, seeded, hour=10)
    fid = seeded["facility"].id
    viewer = auth_headers(await login(client, "/auth/login", "izleyici@cakesbakes.com"))
    response = await client.post(
        f"/facilities/{fid}/appointment-series/{series['series_id']}/cancel",
        headers=viewer, json={"scope": "future_only"},
    )
    assert response.status_code == 403


async def test_series_cancel_dock_scope_all_or_nothing(client, seeded):
    """Rampa yoneticisi, scope'u DISINDA occurrence iceren seriyi iptal edemez."""
    series = await _create_series(client, seeded, hour=11)  # unlu -> Rampa 1/2
    headers = await admin(client)
    fid = seeded["facility"].id

    # Yalnizca Rampa 3'e atanmis rampa yoneticisi olustur
    response = await client.post(
        f"/facilities/{fid}/users",
        headers=headers,
        json={
            "name": "R3 Sorumlusu", "email": "r3@cakesbakes.com",
            "role_ids": [str(seeded["roles"]["dock_manager"].id)],
            "assigned_dock_ids": [str(seeded["docks"]["d3"].id)],
            "temporary_password": "R3Gecici1!",
        },
    )
    assert response.status_code == 200, response.text
    login_response = await client.post(
        "/auth/login", json={"email": "r3@cakesbakes.com", "password": "R3Gecici1!"}
    )
    token = auth_headers(login_response.json()["data"]["access_token"])
    response = await client.post(
        "/auth/change-password", headers=token,
        json={"current_password": "R3Gecici1!", "new_password": "R3Guclu12345!"},
    )
    r3_token = auth_headers(response.json()["data"]["access_token"])

    response = await client.post(
        f"/facilities/{fid}/appointment-series/{series['series_id']}/cancel",
        headers=r3_token, json={"scope": "future_only"},
    )
    assert response.status_code == 403
    assert "sistem yoneticisi" in response.json()["error"]["message"].lower()
