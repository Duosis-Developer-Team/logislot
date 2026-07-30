"""Sprint 8: kullanici/rol CRUD, tekrarlayan seri, vendor onboarding."""

from datetime import date, datetime, timedelta

from tests.conftest import DEMO_PASSWORD, auth_headers, login


def next_weekday(offset_days: int = 1) -> date:
    day = date.today() + timedelta(days=offset_days)
    while day.weekday() >= 5:
        day += timedelta(days=1)
    return day


def first_monday_of_month_after_next() -> date:
    """Seed randevularindan (yakin gelecek) etkilenmeyen temiz bir ay."""
    today = date.today()
    month = today.month - 1 + 2
    year = today.year + month // 12
    month = month % 12 + 1
    day = date(year, month, 1)
    while day.weekday() != 0:
        day += timedelta(days=1)
    return day


async def admin(client) -> dict:
    return auth_headers(await login(client, "/auth/login", "admin@cakesbakes.com"))


async def platform(client) -> dict:
    return auth_headers(await login(client, "/auth/platform-login", "admin@logislot.com"))


async def supplier_token(client, email: str) -> dict:
    return auth_headers(await login(client, "/auth/supplier-login", email))


# ---------------------------------------------------------------- user CRUD


async def test_user_create_login_and_duplicate_email(client, seeded):
    headers = await admin(client)
    fid = seeded["facility"].id
    viewer_role_id = str(seeded["roles"]["viewer"].id)

    response = await client.post(
        f"/facilities/{fid}/users",
        headers=headers,
        json={"name": "Yeni Planlamaci", "email": "planlama@cakesbakes.com",
              "role_ids": [viewer_role_id]},
    )
    assert response.status_code == 200, response.text
    created = response.json()["data"]
    assert created["is_active"] is True
    assert [r["name"] for r in created["roles"]] == ["Izleyici / Planlama"]

    # Gecici parola (varsayilan) ile login olabilir
    token = await login(client, "/auth/login", "planlama@cakesbakes.com")
    assert token

    # E-posta GLOBAL unique
    response = await client.post(
        f"/facilities/{fid}/users",
        headers=headers,
        json={"name": "Kopya", "email": "planlama@cakesbakes.com",
              "role_ids": [viewer_role_id]},
    )
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "DUPLICATE_EMAIL"


async def test_user_requires_min_one_role_and_same_facility_refs(client, seeded):
    headers = await admin(client)
    fid = seeded["facility"].id

    # rol listesi bos -> 422 (pydantic min_length=1)
    response = await client.post(
        f"/facilities/{fid}/users",
        headers=headers,
        json={"name": "Rolsuz", "email": "rolsuz@cakesbakes.com", "role_ids": []},
    )
    assert response.status_code == 422

    # baska tesisin rolu -> INVALID_REFERENCE (uydurma uuid ayni etki)
    response = await client.post(
        f"/facilities/{fid}/users",
        headers=headers,
        json={"name": "Yanlis Rol", "email": "yanlis@cakesbakes.com",
              "role_ids": ["00000000-0000-0000-0000-000000000001"]},
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "INVALID_REFERENCE"


async def test_last_admin_protection(client, seeded):
    headers = await admin(client)
    fid = seeded["facility"].id
    admin_id = str(seeded["users"]["admin"].id)
    viewer_role_id = str(seeded["roles"]["viewer"].id)

    # Tek yonetici: pasiflestirilemez (DELETE ve PATCH is_active=false)
    response = await client.delete(f"/facilities/{fid}/users/{admin_id}", headers=headers)
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "LAST_ADMIN"

    response = await client.patch(
        f"/facilities/{fid}/users/{admin_id}", headers=headers, json={"is_active": False}
    )
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "LAST_ADMIN"

    # user.manage yetkisini dusuren rol degisikligi de engellenir
    response = await client.patch(
        f"/facilities/{fid}/users/{admin_id}",
        headers=headers,
        json={"role_ids": [viewer_role_id]},
    )
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "LAST_ADMIN"

    # Ikinci bir yonetici eklenince ilki pasiflestirilebilir
    sysadmin_role_id = str(seeded["roles"]["sysadmin"].id)
    response = await client.post(
        f"/facilities/{fid}/users",
        headers=headers,
        json={"name": "Yedek Yonetici", "email": "yedek@cakesbakes.com",
              "role_ids": [sysadmin_role_id]},
    )
    assert response.status_code == 200, response.text
    response = await client.delete(f"/facilities/{fid}/users/{admin_id}", headers=headers)
    assert response.status_code == 200
    assert response.json()["data"]["is_active"] is False


async def test_deactivated_user_sessions_revoked(client, seeded):
    headers = await admin(client)
    fid = seeded["facility"].id
    viewer_id = str(seeded["users"]["viewer"].id)

    # Izleyici login olur, refresh token alir
    response = await client.post(
        "/auth/login",
        json={"email": "izleyici@cakesbakes.com", "password": DEMO_PASSWORD},
    )
    refresh_token = response.json()["data"]["refresh_token"]

    # Admin pasiflestirir -> oturumlar duser
    response = await client.delete(f"/facilities/{fid}/users/{viewer_id}", headers=headers)
    assert response.status_code == 200

    # Refresh reddedilir, login reddedilir
    response = await client.post("/auth/refresh", json={"refresh_token": refresh_token})
    assert response.status_code == 401
    response = await client.post(
        "/auth/login",
        json={"email": "izleyici@cakesbakes.com", "password": DEMO_PASSWORD},
    )
    assert response.status_code == 401


async def test_password_reset_revokes_sessions(client, seeded):
    headers = await admin(client)
    fid = seeded["facility"].id
    viewer_id = str(seeded["users"]["viewer"].id)

    response = await client.post(
        "/auth/login",
        json={"email": "izleyici@cakesbakes.com", "password": DEMO_PASSWORD},
    )
    old_refresh = response.json()["data"]["refresh_token"]

    response = await client.post(
        f"/facilities/{fid}/users/{viewer_id}/reset-password",
        headers=headers,
        json={"new_password": "YeniSifre1!"},
    )
    assert response.status_code == 200

    # Eski oturum dusmustur; yeni parola ile login olur
    response = await client.post("/auth/refresh", json={"refresh_token": old_refresh})
    assert response.status_code == 401
    response = await client.post(
        "/auth/login", json={"email": "izleyici@cakesbakes.com", "password": "YeniSifre1!"}
    )
    assert response.status_code == 200


# ---------------------------------------------------------------- role CRUD


async def test_role_crud_platform_permission_rejected(client, seeded):
    headers = await admin(client)
    fid = seeded["facility"].id

    # platform.* izinleri tenant rolune ASLA eklenemez
    response = await client.post(
        f"/facilities/{fid}/roles",
        headers=headers,
        json={"name": "Sizinti Denemesi",
              "permission_codes": ["appt.view", "platform.tenant.manage"]},
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "INVALID_PERMISSION"

    # Gecerli custom rol olusur
    response = await client.post(
        f"/facilities/{fid}/roles",
        headers=headers,
        json={"name": "Vardiya Sefi", "display_name": "Vardiya Şefi",
              "description": "Yalnizca onay/red",
              "permission_codes": ["appt.view", "appt.approve", "appt.reject"]},
    )
    assert response.status_code == 200, response.text
    role = response.json()["data"]
    assert role["is_system"] is False
    assert sorted(role["permissions"]) == ["appt.approve", "appt.reject", "appt.view"]

    # PATCH ile izin guncellenir; platform.* yine reddedilir
    response = await client.patch(
        f"/facilities/{fid}/roles/{role['id']}",
        headers=headers,
        json={"permission_codes": ["appt.view", "platform.analytics.view"]},
    )
    assert response.status_code == 422
    response = await client.patch(
        f"/facilities/{fid}/roles/{role['id']}",
        headers=headers,
        json={"permission_codes": ["appt.view", "calendar.view"]},
    )
    assert response.status_code == 200
    assert response.json()["data"]["permissions"] == ["appt.view", "calendar.view"]


async def test_system_role_locked(client, seeded):
    headers = await admin(client)
    fid = seeded["facility"].id
    sysadmin_id = str(seeded["roles"]["sysadmin"].id)

    for payload in (
        {"permission_codes": ["appt.view"]},
        {"is_active": False},
        {"name": "Baska Ad"},
    ):
        response = await client.patch(
            f"/facilities/{fid}/roles/{sysadmin_id}", headers=headers, json=payload
        )
        assert response.status_code == 409, payload
        assert response.json()["error"]["code"] == "SYSTEM_ROLE_LOCKED"

    # Gorunen ad/aciklama duzenlenebilir
    response = await client.patch(
        f"/facilities/{fid}/roles/{sysadmin_id}",
        headers=headers,
        json={"display_name": "Sistem Yöneticisi", "description": "Tam yetki"},
    )
    assert response.status_code == 200

    # System rol silinemez
    response = await client.delete(f"/facilities/{fid}/roles/{sysadmin_id}", headers=headers)
    assert response.status_code == 409


async def test_inactive_role_not_assignable(client, seeded):
    headers = await admin(client)
    fid = seeded["facility"].id

    response = await client.post(
        f"/facilities/{fid}/roles",
        headers=headers,
        json={"name": "Gecici Rol", "permission_codes": ["appt.view"]},
    )
    role_id = response.json()["data"]["id"]

    # Soft delete -> is_active False
    response = await client.delete(f"/facilities/{fid}/roles/{role_id}", headers=headers)
    assert response.status_code == 200
    assert response.json()["data"]["is_active"] is False

    # Pasif rol kullaniciya atanamaz
    response = await client.post(
        f"/facilities/{fid}/users",
        headers=headers,
        json={"name": "Deneme", "email": "pasifrol@cakesbakes.com", "role_ids": [role_id]},
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "INVALID_REFERENCE"


async def test_permission_catalog_tenant_only(client, seeded):
    headers = await admin(client)
    fid = seeded["facility"].id
    response = await client.get(f"/facilities/{fid}/permission-catalog", headers=headers)
    assert response.status_code == 200
    permissions = response.json()["data"]["permissions"]
    assert "appt.approve" in permissions
    assert not any(p.startswith("platform.") for p in permissions)

    # izleyici (user.manage yok) katalogu goremez
    viewer = auth_headers(await login(client, "/auth/login", "izleyici@cakesbakes.com"))
    response = await client.get(f"/facilities/{fid}/permission-catalog", headers=viewer)
    assert response.status_code == 403


# ---------------------------------------------------------------- recurring


async def test_recurring_weekly_series_created(client, seeded):
    token = await supplier_token(client, "tedarikci@anadoluun.com")
    day = next_weekday()
    response = await client.post(
        "/supplier/appointments",
        headers=token,
        json={
            "product_category_id": str(seeded["product_categories"]["unlu"].id),
            "product_name": "Haftalik Un Sevkiyati",
            "quantity": 4,
            "quantity_unit": "pallet",
            "target_date": day.isoformat(),
            "start_at": f"{day.isoformat()}T11:00:00+03:00",
            "duration_minutes": 60,
            "recurring": {"frequency": "weekly", "occurrence_count": 4},
        },
    )
    assert response.status_code == 200, response.text
    data = response.json()["data"]
    assert data["frequency"] == "weekly"
    assert data["occurrence_count"] == 4
    appointments = data["appointments"]
    assert len(appointments) == 4
    for index, appt in enumerate(appointments):
        assert appt["status"] == "approved"  # auto-approve tedarikci
        assert appt["series_id"] == data["series_id"]
        assert appt["occurrence_index"] == index + 1
        expected = day + timedelta(days=7 * index)
        start = datetime.fromisoformat(appt["scheduled_start_at"])
        assert start.date() == expected  # 11:00 TRT = 08:00 UTC, gun kaymaz

    # Tedarikci listesinde seri gorunur
    response = await client.get("/supplier/appointments", headers=token)
    mine = [a for a in response.json()["data"] if a["series_id"] == data["series_id"]]
    assert len(mine) == 4

    # Tedarikci detayinda seri ozeti vardir
    response = await client.get(f"/supplier/appointments/{appointments[0]['id']}", headers=token)
    series_info = response.json()["data"]["series"]
    assert series_info["occurrence_count"] == 4
    assert series_info["occurrence_index"] == 1

    # Bildirim spam yok: tedarikciye seriye ait TEK ozet bildirim
    response = await client.get("/supplier/notifications", headers=token)
    series_notifications = [
        n for n in response.json()["data"]
        if n["metadata_json"].get("series_id") == data["series_id"]
    ]
    assert len(series_notifications) == 1
    assert "4" in series_notifications[0]["title"]

    # Adminlere de TEK ozet bildirim
    headers = await admin(client)
    fid = seeded["facility"].id
    response = await client.get(f"/facilities/{fid}/notifications", headers=headers)
    admin_series = [
        n for n in response.json()["data"]
        if n["metadata_json"].get("series_id") == data["series_id"]
    ]
    assert len(admin_series) == 1

    # Admin seri listesi + detayi
    response = await client.get(f"/facilities/{fid}/appointment-series", headers=headers)
    rows = [s for s in response.json()["data"] if s["id"] == data["series_id"]]
    assert len(rows) == 1
    assert rows[0]["status_counts"] == {"approved": 4}
    response = await client.get(
        f"/facilities/{fid}/appointment-series/{data['series_id']}", headers=headers
    )
    detail = response.json()["data"]
    assert len(detail["appointments"]) == 4
    assert detail["supplier_name"] == "Anadolu Un A.S."

    # Admin drawer'inda seri ozeti
    response = await client.get(
        f"/facilities/{fid}/appointments/{appointments[2]['id']}", headers=headers
    )
    assert response.json()["data"]["series"]["occurrence_index"] == 3


async def test_recurring_all_or_nothing_on_conflict(client, seeded):
    """2. occurrence dolu rampaya denk gelirse HICBIR randevu olusmaz."""
    token = await supplier_token(client, "tedarikci@marmarasoguk.com")
    day = next_weekday()
    conflict_day = day + timedelta(days=7)

    # Soguk zincir yalnizca Rampa 2'de: 2. haftayi onceden doldur
    response = await client.post(
        "/supplier/appointments",
        headers=token,
        json={
            "product_category_id": str(seeded["product_categories"]["soguk"].id),
            "product_name": "Blokaj Randevusu",
            "quantity": 1,
            "target_date": conflict_day.isoformat(),
            "start_at": f"{conflict_day.isoformat()}T09:00:00+03:00",
            "duration_minutes": 90,
        },
    )
    assert response.status_code == 200, response.text

    before = await client.get("/supplier/appointments", headers=token)
    count_before = len(before.json()["data"])

    response = await client.post(
        "/supplier/appointments",
        headers=token,
        json={
            "product_category_id": str(seeded["product_categories"]["soguk"].id),
            "product_name": "Haftalik Soguk Seri",
            "quantity": 2,
            "target_date": day.isoformat(),
            "start_at": f"{day.isoformat()}T09:00:00+03:00",
            "duration_minutes": 90,
            "recurring": {"frequency": "weekly", "occurrence_count": 2},
        },
    )
    assert response.status_code == 422, response.text
    error = response.json()["error"]
    assert error["code"] == "RECURRING_OCCURRENCE_FAILED"
    assert error["details"]["occurrence_index"] == 2
    assert error["details"]["code"] == "DOCK_TIME_CONFLICT"
    assert error["details"]["occurrence_date"] == conflict_day.isoformat()

    # ALL-OR-NOTHING: 1. occurrence dahil hicbiri olusmadi
    after = await client.get("/supplier/appointments", headers=token)
    rows = after.json()["data"]
    assert len(rows) == count_before
    assert all(a["series_id"] is None for a in rows)


async def test_recurring_all_or_nothing_on_quota(client, seeded):
    """Kota TUM occurrence'lar icin kontrol edilir (aylik kota ornegi)."""
    headers = await admin(client)
    fid = seeded["facility"].id
    supplier_id = str(seeded["suppliers"]["un"].id)

    response = await client.patch(
        f"/facilities/{fid}/suppliers/{supplier_id}",
        headers=headers,
        json={"monthly_quota": 2},
    )
    assert response.status_code == 200, response.text

    token = await supplier_token(client, "tedarikci@anadoluun.com")
    day = first_monday_of_month_after_next()  # 4 occurrence ayni takvim ayinda
    response = await client.post(
        "/supplier/appointments",
        headers=token,
        json={
            "product_category_id": str(seeded["product_categories"]["unlu"].id),
            "product_name": "Kota Zorlayan Seri",
            "quantity": 1,
            "target_date": day.isoformat(),
            "start_at": f"{day.isoformat()}T10:00:00+03:00",
            "duration_minutes": 60,
            "recurring": {"frequency": "weekly", "occurrence_count": 4},
        },
    )
    assert response.status_code == 422, response.text
    error = response.json()["error"]
    assert error["code"] == "RECURRING_OCCURRENCE_FAILED"
    assert error["details"]["occurrence_index"] == 3
    assert error["details"]["code"] == "SUPPLIER_QUOTA_EXCEEDED"

    # Hicbir occurrence olusmadi
    response = await client.get("/supplier/appointments", headers=token)
    assert all(a["series_id"] is None for a in response.json()["data"])


async def test_recurring_limits_and_cargo_rejected(client, seeded):
    token = await supplier_token(client, "tedarikci@anadoluun.com")
    day = next_weekday()
    base = {
        "product_category_id": str(seeded["product_categories"]["unlu"].id),
        "product_name": "Limit Testi",
        "quantity": 1,
        "target_date": day.isoformat(),
        "start_at": f"{day.isoformat()}T10:00:00+03:00",
        "duration_minutes": 60,
    }

    # 12'den fazla occurrence -> 422
    response = await client.post(
        "/supplier/appointments", headers=token,
        json={**base, "recurring": {"frequency": "weekly", "occurrence_count": 13}},
    )
    assert response.status_code == 422

    # Aylik frekansta 6'dan fazla -> 422 (~6 ay ufku)
    response = await client.post(
        "/supplier/appointments", headers=token,
        json={**base, "recurring": {"frequency": "monthly", "occurrence_count": 7}},
    )
    assert response.status_code == 422

    # Kargo + tekrarlayan birlesmez
    response = await client.post(
        "/supplier/appointments", headers=token,
        json={
            **base,
            "delivery_type": "cargo",
            "cargo_window": "morning",
            "start_at": None,
            "recurring": {"frequency": "weekly", "occurrence_count": 2},
        },
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "RECURRING_CARGO_NOT_SUPPORTED"


def test_add_months_clamped_month_end():
    """Ay sonu tasmasi: hedef ayda gun yoksa ayin son gunune kirpilir."""
    from datetime import UTC

    from app.services.appointments import _add_months_clamped, _occurrence_start

    jan31 = datetime(2026, 1, 31, 10, 0, tzinfo=UTC)
    assert _add_months_clamped(jan31, 1).day == 28  # Subat 2026
    assert _add_months_clamped(jan31, 2).day == 31  # Mart
    assert _add_months_clamped(jan31, 3).day == 30  # Nisan
    assert _add_months_clamped(datetime(2024, 1, 31, 8, 0, tzinfo=UTC), 1).day == 29  # artik yil

    # occurrence tarih uretimi: weekly 7 gun, biweekly 14 gun, monthly ay bazli
    base = datetime(2026, 7, 6, 9, 0, tzinfo=UTC)
    assert _occurrence_start(base, "weekly", 2) == base + timedelta(days=14)
    assert _occurrence_start(base, "biweekly", 2) == base + timedelta(days=28)
    assert _occurrence_start(base, "monthly", 2).month == 9


async def test_admin_create_single_and_recurring(client, seeded):
    """Sprint 10: admin on-behalf recurring artik DESTEKLENIR (ayni seri
    servisi); tekil admin create ONAYLI dogar."""
    headers = await admin(client)
    fid = seeded["facility"].id
    day = next_weekday()
    payload = {
        "supplier_id": str(seeded["suppliers"]["un"].id),
        "product_category_id": str(seeded["product_categories"]["unlu"].id),
        "product_name": "Admin Tekil",
        "quantity": 1,
        "target_date": day.isoformat(),
        "start_at": f"{day.isoformat()}T14:00:00+03:00",
        "duration_minutes": 45,
    }
    # Tekil create: admin actigi icin approved dogar
    response = await client.post(
        f"/facilities/{fid}/appointments", headers=headers, json=payload
    )
    assert response.status_code == 200, response.text
    data = response.json()["data"]
    assert data["series_id"] is None
    assert data["status"] == "approved"

    # Recurring: seri olusur, tum occurrence'lar onayli
    response = await client.post(
        f"/facilities/{fid}/appointments",
        headers=headers,
        json={
            **payload,
            "product_name": "Admin Seri",
            "start_at": f"{day.isoformat()}T15:00:00+03:00",
            "recurring": {"frequency": "weekly", "occurrence_count": 3},
        },
    )
    assert response.status_code == 200, response.text
    series = response.json()["data"]
    assert series["occurrence_count"] == 3
    assert all(a["status"] == "approved" for a in series["appointments"])


# ---------------------------------------------------------------- onboarding


async def test_platform_onboarding_tenant_and_facility_bootstrap(client, seeded):
    """1 tenant = 1 tesis: musteri hesabi acilirken kapsami da otomatik kurulur."""
    headers = await platform(client)

    response = await client.post(
        "/platform/tenants",
        headers=headers,
        json={"commercial_name": "Pilot Gida A.S.", "display_name": "Pilot Gida",
              "slug": "pilot-gida", "status": "trial", "address": "OSB 3. Cadde",
              "bootstrap_defaults": True},
    )
    assert response.status_code == 200, response.text
    data = response.json()["data"]
    tenant_id = data["id"]

    # Tesis ayri adim DEGIL: ayni yanitta kapsam ve bootstrap ozeti gelir.
    assert data["facility_id"] is not None
    assert data["address"] == "OSB 3. Cadde"
    assert data["bootstrap"] == {
        "vehicle_categories": 3, "product_categories": 1, "docks": 1, "roles": 3,
    }

    # Operasyonel kapsam listede gorunur ve tenant adiyla acilmistir.
    response = await client.get("/platform/facilities", headers=headers)
    facility = next(f for f in response.json()["data"] if f["id"] == data["facility_id"])
    assert facility["name"] == "Pilot Gida"

    # Ikinci tesis eklenemez (1-1 kisiti).
    response = await client.post(
        f"/platform/tenants/{tenant_id}/facilities",
        headers=headers,
        json={"name": "Ikinci Tesis", "timezone": "Europe/Istanbul"},
    )
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "TENANT_FACILITY_EXISTS"


async def test_tenant_patch_syncs_facility(client, seeded):
    """tenant=tesis: ad/adres/durum tek kayitmis gibi senkron guncellenir."""
    headers = await platform(client)
    created = await client.post(
        "/platform/tenants",
        headers=headers,
        json={"commercial_name": "Senkron A.S.", "display_name": "Senkron",
              "slug": "senkron", "status": "trial"},
    )
    tenant_id = created.json()["data"]["id"]

    response = await client.patch(
        f"/platform/tenants/{tenant_id}",
        headers=headers,
        json={"display_name": "Senkron Gida", "address": "Yeni Adres"},
    )
    assert response.status_code == 200, response.text
    assert response.json()["data"]["address"] == "Yeni Adres"

    facilities = (await client.get("/platform/facilities", headers=headers)).json()["data"]
    facility = next(f for f in facilities if f["tenant_id"] == tenant_id)
    assert facility["name"] == "Senkron Gida"
    assert facility["address"] == "Yeni Adres"


async def test_archived_tenant_cannot_get_new_facility(client, seeded):
    headers = await platform(client)
    response = await client.post(
        "/platform/tenants",
        headers=headers,
        json={"commercial_name": "Eski Musteri", "display_name": "Eski Musteri",
              "slug": "eski-musteri"},
    )
    tenant_id = response.json()["data"]["id"]

    response = await client.patch(
        f"/platform/tenants/{tenant_id}", headers=headers, json={"status": "archived"}
    )
    assert response.status_code == 200

    response = await client.post(
        f"/platform/tenants/{tenant_id}/facilities",
        headers=headers,
        json={"name": "Olmamasi Gereken Tesis"},
    )
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "TENANT_ARCHIVED"


async def test_tenant_create_plan_override_must_be_assignable(client, seeded):
    """Plan override artik musteri hesabi acilirken verilir (tenant=tesis)."""
    headers = await platform(client)

    # Draft plan atanamaz
    response = await client.post(
        "/platform/plans", headers=headers,
        json={"name": "Taslak Plan", "status": "draft"},
    )
    draft_plan_id = response.json()["data"]["id"]

    response = await client.post(
        "/platform/tenants", headers=headers,
        json={"commercial_name": "Plan Denemesi A.S.", "display_name": "Plan Denemesi",
              "slug": "plan-denemesi", "plan_override_id": draft_plan_id},
    )
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "PLAN_NOT_ASSIGNABLE"

    # Aktif plan override calisir
    active_plan_id = str(seeded["plan"].id)
    response = await client.post(
        "/platform/tenants", headers=headers,
        json={"commercial_name": "Plan Denemesi 2 A.S.", "display_name": "Plan Denemesi 2",
              "slug": "plan-denemesi-2", "plan_override_id": active_plan_id},
    )
    assert response.status_code == 200, response.text
    facility_id = response.json()["data"]["facility_id"]
    facilities = (await client.get("/platform/facilities", headers=headers)).json()["data"]
    facility = next(f for f in facilities if f["id"] == facility_id)
    assert facility["plan_override_id"] == active_plan_id


async def test_plan_limits_are_dynamic_and_enforced(client, seeded):
    """Plan kotalari dinamiktir; max_tenants atama aninda ZORLANIR."""
    headers = await platform(client)

    # 1 musteri hesabi limitli plan
    created = await client.post(
        "/platform/plans", headers=headers,
        json={"name": "Limitli Plan", "status": "active",
              "limits_json": {"max_tenants": 1, "monthly_appointments": 250,
                              "bilinmeyen_anahtar": 5, "max_docks": 0}},
    )
    assert created.status_code == 200, created.text
    plan = created.json()["data"]
    plan_id = plan["id"]
    # Bilinmeyen anahtar elenir; 0/negatif = sinirsiz kabul edilip cikarilir.
    assert plan["limits_json"] == {"max_tenants": 1, "monthly_appointments": 250}

    # Limit dinamik olarak degistirilebilir
    patched = await client.patch(
        f"/platform/plans/{plan_id}", headers=headers,
        json={"limits_json": {"max_tenants": 2, "max_users": 10}},
    )
    assert patched.json()["data"]["limits_json"] == {"max_tenants": 2, "max_users": 10}

    # Limiti 1'e cek ve iki tenant atamayi dene
    await client.patch(
        f"/platform/plans/{plan_id}", headers=headers, json={"limits_json": {"max_tenants": 1}}
    )
    first = await client.post(
        "/platform/tenants", headers=headers,
        json={"commercial_name": "Kota Bir", "display_name": "Kota Bir", "slug": "kota-bir"},
    )
    second = await client.post(
        "/platform/tenants", headers=headers,
        json={"commercial_name": "Kota Iki", "display_name": "Kota Iki", "slug": "kota-iki"},
    )
    ok_assign = await client.post(
        f"/platform/tenants/{first.json()['data']['id']}/plan-assignment",
        headers=headers, json={"plan_id": plan_id},
    )
    assert ok_assign.status_code == 200, ok_assign.text

    blocked = await client.post(
        f"/platform/tenants/{second.json()['data']['id']}/plan-assignment",
        headers=headers, json={"plan_id": plan_id},
    )
    assert blocked.status_code == 409
    assert blocked.json()["error"]["code"] == "PLAN_TENANT_LIMIT_REACHED"

    # Limit yukseltilince atama gecer (dinamiklik kaniti)
    await client.patch(
        f"/platform/plans/{plan_id}", headers=headers, json={"limits_json": {"max_tenants": 5}}
    )
    retry = await client.post(
        f"/platform/tenants/{second.json()['data']['id']}/plan-assignment",
        headers=headers, json={"plan_id": plan_id},
    )
    assert retry.status_code == 200, retry.text


async def test_plan_limit_dimensions_catalog(client, seeded):
    """UI limit editorunu dinamik kurar; katalog uctan gelir."""
    headers = await platform(client)
    response = await client.get("/platform/plan-limit-dimensions", headers=headers)
    assert response.status_code == 200
    keys = [d["key"] for d in response.json()["data"]["dimensions"]]
    assert "max_tenants" in keys and "monthly_appointments" in keys
