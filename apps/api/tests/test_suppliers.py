"""Sprint 3: supplier CRUD, hesap yonetimi, portal katalogu, cancel kurallari."""

from datetime import UTC, datetime, timedelta

from sqlalchemy import select

from app.core.enums import AppointmentStatus
from app.models import Appointment, AuditLog
from tests.conftest import auth_headers, login
from tests.test_config_crud import admin, next_weekday
from tests.test_isolation import _create_other_tenant

# ---------- Supplier CRUD ----------


async def test_account_password_is_generated_not_a_fixed_default(client, seeded):
    """Parola verilmezse RASTGELE uretilir; sabit `Demo123!` varsayilani YOKTUR.

    Sabit varsayilan prod'da gercek bir acikti: parola alani bos birakilan her
    hesap ayni, herkesin bildigi parolayla dogar. Uretilen deger yalnizca create
    yanitinda doner (kaydedilmez), yonetici kullaniciya kendisi iletir.
    """
    headers = await admin(client)
    base = f"/facilities/{seeded['facility'].id}/suppliers"

    response = await client.post(
        base, headers=headers,
        json={
            "company_name": "Rastgele Parola A.S.",
            "code": "SUP-RND",
            "account_email": "portal@rastgele.example.com",
        },
    )
    assert response.status_code == 200, response.text
    generated = response.json()["data"]["account_password"]
    assert generated and generated != "Demo123!"

    # Eski sabit varsayilan ARTIK calismiyor.
    response = await client.post(
        "/auth/supplier-login",
        json={"email": "portal@rastgele.example.com", "password": "Demo123!"},
    )
    assert response.status_code == 401

    # Uretilen parola calisiyor.
    response = await client.post(
        "/auth/supplier-login",
        json={"email": "portal@rastgele.example.com", "password": generated},
    )
    assert response.status_code == 200, response.text



async def test_supplier_crud_cycle(client, seeded, session_maker):
    headers = await admin(client)
    fid = seeded["facility"].id
    base = f"/facilities/{fid}/suppliers"

    # create (hesap dahil)
    response = await client.post(
        base,
        headers=headers,
        json={
            "company_name": "Ege Ambalaj San.",
            "code": "SUP-100",
            "contact_name": "Zeynep Ak",
            "contact_email": "satis@egeambalaj.example.com",
            "allowed_product_category_ids": [str(seeded["product_categories"]["ambalaj"].id)],
            "min_block_minutes": 30,
            "max_block_minutes": 90,
            "weekly_quota": 5,
            "auto_approval_enabled": False,
            "notes": "Yeni tedarikci",
            "account_email": "portal@egeambalaj.example.com",
            "account_password": "Gecici123!",
        },
    )
    assert response.status_code == 200, response.text
    created = response.json()["data"]
    assert created["account_email"] == "portal@egeambalaj.example.com"
    assert created["account_active"] is True
    assert created["is_active"] is True

    # yeni hesapla (ozel parolayla) login olunabiliyor
    response = await client.post(
        "/auth/supplier-login",
        json={"email": "portal@egeambalaj.example.com", "password": "Gecici123!"},
    )
    assert response.status_code == 200, response.text

    # duplicate code -> 409 DUPLICATE_CODE
    response = await client.post(
        base, headers=headers,
        json={"company_name": "X", "code": "SUP-100", "create_account": False},
    )
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "DUPLICATE_CODE"

    # duplicate account email -> 409 DUPLICATE_EMAIL
    response = await client.post(
        base, headers=headers,
        json={
            "company_name": "Y", "code": "SUP-101",
            "account_email": "portal@egeambalaj.example.com",
        },
    )
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "DUPLICATE_EMAIL"

    # patch: kategoriler + kota
    response = await client.patch(
        f"{base}/{created['id']}", headers=headers,
        json={
            "allowed_product_category_ids": [
                str(seeded["product_categories"]["ambalaj"].id),
                str(seeded["product_categories"]["genel"].id),
            ],
            "weekly_quota": 8,
        },
    )
    assert response.status_code == 200
    assert response.json()["data"]["weekly_quota"] == 8
    assert len(response.json()["data"]["allowed_product_category_ids"]) == 2

    # min > max -> 422
    response = await client.patch(
        f"{base}/{created['id']}", headers=headers,
        json={"min_block_minutes": 120, "max_block_minutes": 60},
    )
    assert response.status_code == 422

    # soft delete
    response = await client.delete(f"{base}/{created['id']}", headers=headers)
    assert response.json()["data"]["is_active"] is False

    # audit uretildi
    async with session_maker() as db:
        actions = [
            row[0]
            for row in await db.execute(
                select(AuditLog.action).where(
                    AuditLog.entity_type.in_(["supplier", "supplier_user"])
                )
            )
        ]
    assert "supplier.create" in actions
    assert "supplier_user.create" in actions
    assert "supplier.update" in actions
    assert "supplier.deactivate" in actions


async def test_supplier_cross_facility_category_rejected(client, seeded, session_maker):
    headers = await admin(client)
    other_facility = await _create_other_tenant(session_maker)
    other_headers = auth_headers(await login(client, "/auth/login", "admin@rakip.com"))
    response = await client.post(
        f"/facilities/{other_facility.id}/categories",
        headers=other_headers,
        json={"name": "Rakip Kat", "display_name": "R"},
    )
    foreign_category = response.json()["data"]["id"]

    response = await client.post(
        f"/facilities/{seeded['facility'].id}/suppliers",
        headers=headers,
        json={
            "company_name": "Sizinti A.S.",
            "code": "SUP-666",
            "create_account": False,
            "allowed_product_category_ids": [foreign_category],
        },
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "INVALID_REFERENCE"


async def test_supplier_mutation_permissions(client, seeded):
    fid = seeded["facility"].id
    body = {"company_name": "X", "code": "SUP-900", "create_account": False}

    viewer = auth_headers(await login(client, "/auth/login", "izleyici@cakesbakes.com"))
    response = await client.post(f"/facilities/{fid}/suppliers", headers=viewer, json=body)
    assert response.status_code == 403

    supplier = auth_headers(await login(client, "/auth/supplier-login", "tedarikci@anadoluun.com"))
    response = await client.post(f"/facilities/{fid}/suppliers", headers=supplier, json=body)
    assert response.status_code == 403

    platform = auth_headers(await login(client, "/auth/platform-login", "admin@logislot.com"))
    response = await client.post(f"/facilities/{fid}/suppliers", headers=platform, json=body)
    assert response.status_code == 403


# ---------- Hesap yonetimi ----------


async def test_password_reset_and_account_status(client, seeded):
    headers = await admin(client)
    fid = seeded["facility"].id
    supplier_id = seeded["suppliers"]["un"].id
    base = f"/facilities/{fid}/suppliers/{supplier_id}"

    # reset: eski parola calismaz, yenisi calisir
    response = await client.post(
        f"{base}/reset-password", headers=headers, json={"new_password": "YeniSifre1!"}
    )
    assert response.status_code == 200
    response = await client.post(
        "/auth/supplier-login",
        json={"email": "tedarikci@anadoluun.com", "password": "Demo123!"},
    )
    assert response.status_code == 401
    response = await client.post(
        "/auth/supplier-login",
        json={"email": "tedarikci@anadoluun.com", "password": "YeniSifre1!"},
    )
    assert response.status_code == 200

    # hesap pasif -> login reddedilir
    response = await client.patch(
        f"{base}/user-status", headers=headers, json={"is_active": False}
    )
    assert response.json()["data"]["account_active"] is False
    response = await client.post(
        "/auth/supplier-login",
        json={"email": "tedarikci@anadoluun.com", "password": "YeniSifre1!"},
    )
    assert response.status_code == 401


async def test_inactive_supplier_blocked_everywhere(client, seeded):
    headers = await admin(client)
    fid = seeded["facility"].id
    supplier_id = seeded["suppliers"]["soguk"].id

    # once token al (firma aktifken)
    token = await login(client, "/auth/supplier-login", "tedarikci@marmarasoguk.com")

    # firmayi pasiflestir
    await client.delete(f"/facilities/{fid}/suppliers/{supplier_id}", headers=headers)

    # yeni login reddedilir
    response = await client.post(
        "/auth/supplier-login",
        json={"email": "tedarikci@marmarasoguk.com", "password": "Demo123!"},
    )
    assert response.status_code == 401

    # eldeki token ile de endpointler 403 doner
    response = await client.get("/supplier/appointments", headers=auth_headers(token))
    assert response.status_code == 403

    # admin on-behalf create bile engellenir
    day = next_weekday()
    response = await client.post(
        f"/facilities/{fid}/appointments",
        headers=headers,
        json={
            "supplier_id": str(supplier_id),
            "product_category_id": str(seeded["product_categories"]["soguk"].id),
            "product_name": "X",
            "quantity": 1,
            "target_date": day.isoformat(),
            "start_at": f"{day.isoformat()}T09:00:00+03:00",
            "duration_minutes": 60,
        },
    )
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "SUPPLIER_INACTIVE"


# ---------- Supplier portal katalogu ----------


async def test_supplier_catalog(client, seeded):
    token = auth_headers(await login(client, "/auth/supplier-login", "tedarikci@anadoluun.com"))
    response = await client.get("/supplier/catalog", headers=token)
    assert response.status_code == 200
    data = response.json()["data"]
    names = [c["name"] for c in data["product_categories"]]
    # yalnizca izinli kategoriler (unlu + genel), soguk zincir YOK
    assert "Unlu Mamul Hammaddesi" in names and "Genel" in names
    assert "Soguk Zincir" not in names
    assert len(data["vehicle_categories"]) == 5
    assert data["limits"]["auto_approval_enabled"] is True
    assert data["limits"]["max_block_minutes"] == 120
    assert {"value": "pallet", "label": "Palet"} in data["quantity_units"]
    assert "morning" in data["cargo_windows"]


# ---------- Kargo teslimat izni (tedarikci bazinda) ----------


async def test_catalog_delivery_types_follow_cargo_flag(client, seeded):
    """Kargo kapaliyken katalogda YALNIZCA standart listelenir."""
    closed = auth_headers(await login(client, "/auth/supplier-login", "tedarikci@anadoluun.com"))
    data = (await client.get("/supplier/catalog", headers=closed)).json()["data"]
    assert data["delivery_types"] == ["standard"]
    assert data["limits"]["cargo_enabled"] is False

    # seed'de kargo yalnizca bu tedarikci icin acik
    opened = auth_headers(await login(client, "/auth/supplier-login", "tedarikci@hizlikargo.com"))
    data = (await client.get("/supplier/catalog", headers=opened)).json()["data"]
    assert data["delivery_types"] == ["standard", "cargo"]
    assert data["limits"]["cargo_enabled"] is True


async def test_cargo_rejected_when_supplier_flag_closed(client, seeded):
    """UI gizlese de API savunur: kapali tedarikcinin kargo istegi 422."""
    token = auth_headers(await login(client, "/auth/supplier-login", "tedarikci@anadoluun.com"))
    day = next_weekday()
    body = {
        "product_category_id": str(seeded["product_categories"]["unlu"].id),
        "product_name": "Kargo Denemesi",
        "quantity": 1,
        "target_date": day.isoformat(),
        "delivery_type": "cargo",
        "cargo_window": "morning",
    }
    response = await client.post("/supplier/appointments", headers=token, json=body)
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "CARGO_NOT_ENABLED"

    # Musaitlik sorgusu da ayni kurala tabidir
    response = await client.post(
        "/supplier/availability/evaluate",
        headers=token,
        json={
            "product_category_id": str(seeded["product_categories"]["unlu"].id),
            "target_date": day.isoformat(),
            "delivery_type": "cargo",
            "cargo_window": "morning",
        },
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "CARGO_NOT_ENABLED"

    # Standart teslimat kapali tedarikcide DAIMA calisir
    response = await client.post(
        "/supplier/appointments",
        headers=token,
        json={
            **body,
            "delivery_type": "standard",
            "cargo_window": None,
            "start_at": f"{day.isoformat()}T10:00:00+03:00",
            "duration_minutes": 60,
        },
    )
    assert response.status_code == 200, response.text


async def test_admin_opens_cargo_then_supplier_can_use_it(client, seeded):
    """Yonetim anahtari acinca secenek katalogda belirir ve create gecer."""
    headers = await admin(client)
    fid = seeded["facility"].id
    supplier_id = seeded["suppliers"]["un"].id

    response = await client.patch(
        f"/facilities/{fid}/suppliers/{supplier_id}",
        headers=headers,
        json={"cargo_enabled": True},
    )
    assert response.status_code == 200, response.text
    assert response.json()["data"]["cargo_enabled"] is True

    token = auth_headers(await login(client, "/auth/supplier-login", "tedarikci@anadoluun.com"))
    data = (await client.get("/supplier/catalog", headers=token)).json()["data"]
    assert "cargo" in data["delivery_types"]

    day = next_weekday()
    response = await client.post(
        "/supplier/appointments",
        headers=token,
        json={
            "product_category_id": str(seeded["product_categories"]["unlu"].id),
            "product_name": "Kargo Denemesi",
            "quantity": 1,
            "target_date": day.isoformat(),
            "delivery_type": "cargo",
            "cargo_window": "morning",
        },
    )
    assert response.status_code == 200, response.text
    assert response.json()["data"]["delivery_type"] == "cargo"


async def test_admin_on_behalf_cargo_blocked_when_closed(client, seeded):
    """Admin tedarikci ADINA acsa bile kapali tedarikcide kargo olusmaz."""
    headers = await admin(client)
    fid = seeded["facility"].id
    day = next_weekday()
    response = await client.post(
        f"/facilities/{fid}/appointments",
        headers=headers,
        json={
            "supplier_id": str(seeded["suppliers"]["un"].id),
            "product_category_id": str(seeded["product_categories"]["unlu"].id),
            "product_name": "Kargo Denemesi",
            "quantity": 1,
            "target_date": day.isoformat(),
            "delivery_type": "cargo",
            "cargo_window": "morning",
        },
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "CARGO_NOT_ENABLED"


async def test_catalog_hides_deactivated_category(client, seeded):
    headers = await admin(client)
    fid = seeded["facility"].id
    await client.delete(
        f"/facilities/{fid}/categories/{seeded['product_categories']['genel'].id}",
        headers=headers,
    )
    token = auth_headers(await login(client, "/auth/supplier-login", "tedarikci@anadoluun.com"))
    response = await client.get("/supplier/catalog", headers=token)
    names = [c["name"] for c in response.json()["data"]["product_categories"]]
    assert "Genel" not in names


async def test_me_alias_and_profile(client, seeded):
    token = auth_headers(await login(client, "/auth/supplier-login", "tedarikci@anadoluun.com"))
    for path in ("/supplier/profile", "/supplier/me"):
        response = await client.get(path, headers=token)
        assert response.status_code == 200
        data = response.json()["data"]
        assert data["company_name"] == "Anadolu Un A.S."
        assert data["is_active"] is True
        assert data["facility"]["name"] == "Cakes & Bakes Uretim Tesisi"


# ---------- Cancel kurallari ----------


async def test_supplier_cancel_future_pending_ok_past_denied(client, seeded, session_maker):
    token = auth_headers(
        await login(client, "/auth/supplier-login", "tedarikci@marmarasoguk.com")
    )
    day = next_weekday()
    created = await client.post(
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
    appointment_id = created.json()["data"]["id"]

    # gelecek pending -> iptal edilebilir
    response = await client.post(
        f"/supplier/appointments/{appointment_id}/cancel", headers=token
    )
    assert response.status_code == 200
    assert response.json()["data"]["status"] == "cancelled"

    # iptal edilmis tekrar iptal edilemez
    response = await client.post(
        f"/supplier/appointments/{appointment_id}/cancel", headers=token
    )
    assert response.status_code == 409

    # gecmis randevu iptal edilemez (dogrudan DB'ye gecmis pending ekle)
    async with session_maker() as db:
        past = Appointment(
            tenant_id=seeded["tenant"].id,
            facility_id=seeded["facility"].id,
            supplier_id=seeded["suppliers"]["soguk"].id,
            dock_id=seeded["docks"]["d2"].id,
            product_category_id=seeded["product_categories"]["soguk"].id,
            product_name="Gecmis",
            quantity=1,
            scheduled_start_at=datetime.now(UTC) - timedelta(days=2),
            scheduled_end_at=datetime.now(UTC) - timedelta(days=2) + timedelta(hours=1),
            duration_minutes=60,
            status=AppointmentStatus.pending,
        )
        db.add(past)
        await db.commit()
        past_id = past.id

    response = await client.post(f"/supplier/appointments/{past_id}/cancel", headers=token)
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "APPOINTMENT_IN_PAST"


# ---------- Randevu create ek dogrulamalari ----------


async def test_inactive_vehicle_category_rejected(client, seeded):
    headers = await admin(client)
    fid = seeded["facility"].id
    await client.delete(
        f"/facilities/{fid}/vehicle-categories/{seeded['vehicle_categories']['kamyonet'].id}",
        headers=headers,
    )
    token = auth_headers(await login(client, "/auth/supplier-login", "tedarikci@anadoluun.com"))
    day = next_weekday()
    response = await client.post(
        "/supplier/appointments",
        headers=token,
        json={
            "product_category_id": str(seeded["product_categories"]["unlu"].id),
            "product_name": "Un",
            "quantity": 1,
            "vehicle_category_id": str(seeded["vehicle_categories"]["kamyonet"].id),
            "target_date": day.isoformat(),
            "start_at": f"{day.isoformat()}T10:00:00+03:00",
            "duration_minutes": 60,
        },
    )
    assert response.status_code == 404  # aktif degil -> bulunamadi


async def test_quota_near_limit_supplier(client, seeded):
    """Seed: hizlikargo weekly_quota=2, 1 kargo randevusu mevcut -> 1 hak kaldi."""
    token = auth_headers(await login(client, "/auth/supplier-login", "tedarikci@hizlikargo.com"))
    day = next_weekday()

    async def create(product: str):
        return await client.post(
            "/supplier/appointments",
            headers=token,
            json={
                "product_category_id": str(seeded["product_categories"]["genel"].id),
                "product_name": product,
                "quantity": 1,
                "target_date": day.isoformat(),
                "start_at": f"{day.isoformat()}T14:00:00+03:00",
                "duration_minutes": 30,
            },
        )

    # Kotanin ne zaman dolacagi seed randevusunun BUGUNUN haftasina dusup
    # dusmedigine bagliydi ve test belirli gunlerde duyuyordu (28 Agu 2026'da
    # tam bu yasandi: seed randevusu baska haftaya dustu, iki create de gecti,
    # 422 ucuncude gelecekti). Onemli olan kotanin BIR NOKTADA devreye girmesi.
    WEEKLY_QUOTA = 2
    statuses = []
    for attempt in range(WEEKLY_QUOTA + 1):
        response = await create(f"Koli {attempt + 1}")
        statuses.append(response.status_code)
        if response.status_code == 422:
            assert response.json()["error"]["code"] == "SUPPLIER_QUOTA_EXCEEDED"
            break
    else:
        raise AssertionError(f"haftalik kota hic devreye girmedi: {statuses}")


# ---------- Users/Roles readonly ----------


async def test_users_and_roles_endpoints(client, seeded):
    headers = await admin(client)
    fid = seeded["facility"].id

    response = await client.get(f"/facilities/{fid}/users", headers=headers)
    assert response.status_code == 200
    users = response.json()["data"]
    assert len(users) == 3
    dock_manager = next(u for u in users if "Rampa" in u["name"])
    assert dock_manager["assigned_dock_ids"] is not None
    # Sprint 8: roller artik id+ad objesi olarak doner (editor UI icin)
    assert "Rampa / Depo Yoneticisi" in [r["name"] for r in dock_manager["roles"]]

    response = await client.get(f"/facilities/{fid}/roles", headers=headers)
    roles = response.json()["data"]
    assert {r["name"] for r in roles} >= {"Sistem Yoneticisi", "Izleyici / Planlama"}
    sysadmin = next(r for r in roles if r["name"] == "Sistem Yoneticisi")
    assert "supplier.manage" in sysadmin["permissions"]

    # izleyici user.manage olmadigi icin goremez
    viewer = auth_headers(await login(client, "/auth/login", "izleyici@cakesbakes.com"))
    assert (await client.get(f"/facilities/{fid}/users", headers=viewer)).status_code == 403


async def test_me_returns_facility_permissions(client, seeded):
    token = auth_headers(await login(client, "/auth/login", "rampa@cakesbakes.com"))
    response = await client.get("/auth/me", headers=token)
    data = response.json()["data"]
    fid = str(seeded["facility"].id)
    assert fid in data["facility_permissions"]
    assert "appt.approve" in data["facility_permissions"][fid]
    assert "supplier.manage" not in data["facility_permissions"][fid]
