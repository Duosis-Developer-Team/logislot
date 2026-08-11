"""Randevu olusturma + lifecycle API testleri (seed evreni uzerinde)."""

from datetime import date, timedelta

from tests.conftest import auth_headers, login


def next_weekday() -> date:
    """Hafta ici bir sonraki gun (cumartesi kisitlarina takilmamak icin)."""
    day = date.today() + timedelta(days=1)
    while day.weekday() >= 5:
        day += timedelta(days=1)
    return day


async def test_auto_approval_supplier_creates_approved(client, seeded):
    token = await login(client, "/auth/supplier-login", "tedarikci@anadoluun.com")
    day = next_weekday()
    response = await client.post(
        "/supplier/appointments",
        headers=auth_headers(token),
        json={
            "product_category_id": str(seeded["product_categories"]["unlu"].id),
            "product_name": "Un Cuvali",
            "quantity": 5,
            "quantity_unit": "pallet",
            "target_date": day.isoformat(),
            "start_at": f"{day.isoformat()}T10:00:00+03:00",
            "duration_minutes": 60,
        },
    )
    assert response.status_code == 200, response.text
    data = response.json()["data"]
    assert data["status"] == "approved"  # otomatik onay
    assert data["dock_id"] is not None  # sistem rampa atadi
    # Varsayilan arac kategorisi kategoriden cozuldu (TIR)
    assert data["vehicle_category_id"] == str(seeded["vehicle_categories"]["tir"].id)


async def test_manual_approval_supplier_creates_pending(client, seeded):
    token = await login(client, "/auth/supplier-login", "tedarikci@marmarasoguk.com")
    day = next_weekday()
    response = await client.post(
        "/supplier/appointments",
        headers=auth_headers(token),
        json={
            "product_category_id": str(seeded["product_categories"]["soguk"].id),
            "product_name": "Donuk Krema",
            "quantity": 3,
            "quantity_unit": "box",
            "target_date": day.isoformat(),
            "start_at": f"{day.isoformat()}T09:00:00+03:00",
            "duration_minutes": 90,
        },
    )
    assert response.status_code == 200, response.text
    data = response.json()["data"]
    assert data["status"] == "pending"
    # Soguk zinciri yalnizca Rampa 2 kabul eder
    assert data["dock_id"] == str(seeded["docks"]["d2"].id)


async def test_supplier_cannot_use_forbidden_category(client, seeded):
    token = await login(client, "/auth/supplier-login", "tedarikci@marmarasoguk.com")
    day = next_weekday()
    response = await client.post(
        "/supplier/appointments",
        headers=auth_headers(token),
        json={
            "product_category_id": str(seeded["product_categories"]["unlu"].id),
            "product_name": "Izinsiz Urun",
            "quantity": 1,
            "target_date": day.isoformat(),
            "start_at": f"{day.isoformat()}T09:00:00+03:00",
            "duration_minutes": 60,
        },
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "SUPPLIER_CATEGORY_NOT_ALLOWED"


async def test_cargo_creation_uses_window(client, seeded):
    token = await login(client, "/auth/supplier-login", "tedarikci@hizlikargo.com")
    day = next_weekday()
    response = await client.post(
        "/supplier/appointments",
        headers=auth_headers(token),
        json={
            "product_category_id": str(seeded["product_categories"]["genel"].id),
            "product_name": "Koli Bandi",
            "quantity": 20,
            "quantity_unit": "carton",
            "delivery_type": "cargo",
            "cargo_window": "morning",
            "target_date": day.isoformat(),
        },
    )
    assert response.status_code == 200, response.text
    data = response.json()["data"]
    assert data["delivery_type"] == "cargo"
    assert data["cargo_window"] == "morning"
    assert data["cargo_min_block_minutes"] == 90
    assert data["scheduled_start_at"].endswith("+00:00") or "T" in data["scheduled_start_at"]


async def test_lifecycle_approve_revise_complete(client, seeded, session_maker):
    supplier_token = await login(
        client, "/auth/supplier-login", "tedarikci@marmarasoguk.com"
    )
    day = next_weekday()
    created = await client.post(
        "/supplier/appointments",
        headers=auth_headers(supplier_token),
        json={
            "product_category_id": str(seeded["product_categories"]["soguk"].id),
            "product_name": "Sut Kremasi",
            "quantity": 2,
            "target_date": day.isoformat(),
            "start_at": f"{day.isoformat()}T11:00:00+03:00",
            "duration_minutes": 60,
        },
    )
    appointment_id = created.json()["data"]["id"]
    facility_id = seeded["facility"].id

    admin_token = await login(client, "/auth/login", "rampa@cakesbakes.com")
    base = f"/facilities/{facility_id}/appointments/{appointment_id}"

    # Revize: eski/yeni aralik saklanir, statu revision_pending olur
    response = await client.post(
        f"{base}/revise",
        headers=auth_headers(admin_token),
        json={
            "new_start_at": f"{day.isoformat()}T14:00:00+03:00",
            "new_duration_minutes": 90,
            "note": "Oglen yogunlugu nedeniyle",
        },
    )
    assert response.status_code == 200, response.text
    data = response.json()["data"]
    assert data["status"] == "revision_pending"
    assert data["original_start_at"] is not None
    assert data["duration_minutes"] == 90

    # Onayla
    response = await client.post(f"{base}/approve", headers=auth_headers(admin_token))
    assert response.json()["data"]["status"] == "approved"

    # Tamamla
    response = await client.post(f"{base}/complete", headers=auth_headers(admin_token))
    assert response.json()["data"]["status"] == "completed"

    # Tamamlanan randevu iptal edilemez
    response = await client.post(f"{base}/cancel", headers=auth_headers(admin_token))
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "INVALID_STATUS_TRANSITION"

    # Tedarikci detayda revizyon gecmisini gorur
    response = await client.get(
        f"/supplier/appointments/{appointment_id}", headers=auth_headers(supplier_token)
    )
    revisions = response.json()["data"]["revisions"]
    assert len(revisions) == 1
    assert revisions[0]["note"] == "Oglen yogunlugu nedeniyle"


async def test_reject_requires_reason(client, seeded, session_maker):
    from sqlalchemy import select

    from app.core.enums import AppointmentStatus
    from app.models import Appointment

    async with session_maker() as db:
        result = await db.execute(
            select(Appointment).where(Appointment.status == AppointmentStatus.pending)
        )
        pending = result.scalars().first()

    admin_token = await login(client, "/auth/login", "admin@cakesbakes.com")
    facility_id = seeded["facility"].id
    base = f"/facilities/{facility_id}/appointments/{pending.id}"

    response = await client.post(f"{base}/reject", headers=auth_headers(admin_token), json={})
    assert response.status_code == 422  # reason zorunlu

    response = await client.post(
        f"{base}/reject", headers=auth_headers(admin_token), json={"reason": "Kapasite dolu"}
    )
    assert response.status_code == 200
    assert response.json()["data"]["status"] == "rejected"
    assert response.json()["data"]["rejection_reason"] == "Kapasite dolu"


async def test_availability_conflict_group_via_api(client, seeded):
    """TIR randevusu R1'deyken R2 ayni saatte bloke olmali (kosullu grup)."""
    token = await login(client, "/auth/supplier-login", "tedarikci@anadoluun.com")
    day = next_weekday()
    # once R1'e TIR randevusu koy (unlu mamul default TIR)
    first = await client.post(
        "/supplier/appointments",
        headers=auth_headers(token),
        json={
            "product_category_id": str(seeded["product_categories"]["unlu"].id),
            "product_name": "Un",
            "quantity": 1,
            "target_date": day.isoformat(),
            "start_at": f"{day.isoformat()}T10:00:00+03:00",
            "duration_minutes": 60,
        },
    )
    assert first.status_code == 200
    # ayni saate ikinci TIR: R1 dolu, R2 grup nedeniyle bloke -> hata
    second = await client.post(
        "/supplier/appointments",
        headers=auth_headers(token),
        json={
            "product_category_id": str(seeded["product_categories"]["unlu"].id),
            "product_name": "Un 2",
            "quantity": 1,
            "target_date": day.isoformat(),
            "start_at": f"{day.isoformat()}T10:00:00+03:00",
            "duration_minutes": 60,
        },
    )
    assert second.status_code == 422
    assert second.json()["error"]["code"] in (
        "DOCK_TIME_CONFLICT",
        "DOCK_CONFLICT_GROUP_BLOCKED",
    )


# ---------- kategori bazli sure araligi (min_block / max_block) ----------


async def test_category_max_block_rejects_longer_appointment(client, seeded):
    """Kategori ust siniri, tedarikci limitinden DAHA dar oldugunda o gecerlidir.

    Seed: Soguk Zincir 60-120 dk, tedarikci limiti 60-180 dk.
    """
    token = await login(client, "/auth/supplier-login", "tedarikci@marmarasoguk.com")
    day = next_weekday()
    response = await client.post(
        "/supplier/appointments",
        headers=auth_headers(token),
        json={
            "product_category_id": str(seeded["product_categories"]["soguk"].id),
            "product_name": "Donuk Et",
            "quantity": 4,
            "target_date": day.isoformat(),
            "start_at": f"{day.isoformat()}T09:00:00+03:00",
            "duration_minutes": 150,
        },
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "DURATION_ABOVE_CATEGORY_MAXIMUM"


async def test_category_without_max_block_is_unbounded(client, seeded):
    """max NULL olan kategoride yalnizca tedarikci limiti gecerli kalir."""
    token = await login(client, "/auth/supplier-login", "tedarikci@anadoluun.com")
    day = next_weekday()
    response = await client.post(
        "/supplier/appointments",
        headers=auth_headers(token),
        json={
            # "Genel" kategorisinde max_block_minutes NULL; sup_un limiti 30-120.
            "product_category_id": str(seeded["product_categories"]["genel"].id),
            "product_name": "Karisik Malzeme",
            "quantity": 1,
            "target_date": day.isoformat(),
            "start_at": f"{day.isoformat()}T09:00:00+03:00",
            "duration_minutes": 120,
        },
    )
    assert response.status_code == 200, response.text


async def test_revise_enforces_category_max_only_when_duration_changes(client, seeded):
    """Limit sonradan daraltilsa bile mevcut randevunun SAATI tasinabilir.

    Canli veri guvenligi: limit yalnizca yeni bir sure secildiginde uygulanir.
    """
    supplier_token = await login(
        client, "/auth/supplier-login", "tedarikci@marmarasoguk.com"
    )
    day = next_weekday()
    created = await client.post(
        "/supplier/appointments",
        headers=auth_headers(supplier_token),
        json={
            "product_category_id": str(seeded["product_categories"]["soguk"].id),
            "product_name": "Dondurma",
            "quantity": 2,
            "target_date": day.isoformat(),
            "start_at": f"{day.isoformat()}T09:00:00+03:00",
            "duration_minutes": 120,
        },
    )
    assert created.status_code == 200, created.text
    appointment_id = created.json()["data"]["id"]
    fid = seeded["facility"].id
    admin_token = auth_headers(await login(client, "/auth/login", "admin@cakesbakes.com"))

    # Yonetici kategori araligini 60-120 -> 60-60 daraltir (mevcut randevu 120 dk).
    patched = await client.patch(
        f"/facilities/{fid}/categories/{seeded['product_categories']['soguk'].id}",
        headers=admin_token,
        json={"max_block_minutes": 60},
    )
    assert patched.status_code == 200, patched.text

    base = f"/facilities/{fid}/appointments/{appointment_id}"

    # 1) Sure DEGISMEDEN saat tasima -> hala mumkun (mevcut randevular kilitlenmez)
    response = await client.post(
        f"{base}/revise",
        headers=admin_token,
        json={"new_start_at": f"{day.isoformat()}T14:00:00+03:00"},
    )
    assert response.status_code == 200, response.text
    assert response.json()["data"]["duration_minutes"] == 120

    # 2) Yeni sure secildiginde guncel limit uygulanir
    response = await client.post(
        f"{base}/revise",
        headers=admin_token,
        json={
            "new_start_at": f"{day.isoformat()}T15:00:00+03:00",
            "new_duration_minutes": 90,
        },
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "DURATION_ABOVE_CATEGORY_MAXIMUM"

    # 3) Limite uyan yeni sure kabul edilir
    response = await client.post(
        f"{base}/revise",
        headers=admin_token,
        json={
            "new_start_at": f"{day.isoformat()}T15:00:00+03:00",
            "new_duration_minutes": 60,
        },
    )
    assert response.status_code == 200, response.text
    assert response.json()["data"]["duration_minutes"] == 60
