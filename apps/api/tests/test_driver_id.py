"""Surucu kimlik numarasi (guvenlik entegrasyonu; musteri karari 2026-11).

Kisisel veri: AES-GCM sifreli saklanir, yanitlarda yalnizca maskeli doner,
acik deger izinli + denetlenen uctan alinir, saklama suresi dolunca silinir.
"""

import uuid
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import select

from app.core.pii import decrypt, encrypt, lookup_hash
from app.maintenance.purge_driver_ids import purge_driver_ids
from app.models import Appointment, AuditLog
from app.services.driver_id import is_valid_tckn, normalize_driver_id
from tests.conftest import auth_headers, login

VALID_TCKN = "10000000146"


def far_weekday(offset: int) -> date:
    day = date.today() + timedelta(days=offset)
    while day.weekday() >= 5:
        day += timedelta(days=1)
    return day


async def admin(client) -> dict:
    return auth_headers(await login(client, "/auth/login", "admin@cakesbakes.com"))


async def supplier(client) -> dict:
    return auth_headers(await login(client, "/auth/supplier-login", "tedarikci@anadoluun.com"))


async def set_form(client, seeded, **body):
    fid = seeded["facility"].id
    response = await client.patch(
        f"/facilities/{fid}/appointment-form", headers=await admin(client), json=body
    )
    assert response.status_code == 200, response.text
    return response.json()["data"]


async def book(client, seeded, token, *, hour: int, driver_id: str | None, offset: int = 15):
    day = far_weekday(offset)
    body = {
        "product_category_id": str(seeded["product_categories"]["unlu"].id),
        "product_name": "Un",
        "quantity": 1,
        "target_date": day.isoformat(),
        "start_at": f"{day.isoformat()}T{hour:02d}:00:00+03:00",
        "duration_minutes": 60,
    }
    if driver_id is not None:
        body["driver_id_number"] = driver_id
    return await client.post("/supplier/appointments", headers=token, json=body)


# ---------------------------------------------------------------- saf


def test_tckn_algorithm_and_passport():
    assert is_valid_tckn(VALID_TCKN)
    assert not is_valid_tckn("10000000147")  # son kontrol hanesi
    assert not is_valid_tckn("00000000146")  # 0 ile baslayamaz
    assert normalize_driver_id(" 100 000 001-46 ") == ("tckn", VALID_TCKN)
    assert normalize_driver_id("u1234567") == ("passport", "U1234567")
    for bad in ("12345", "10000000147", "AB", "ÇÖ12345", "1" * 25):
        try:
            normalize_driver_id(bad)
        except Exception as exc:  # ApiError
            assert getattr(exc, "code", "") == "DRIVER_ID_INVALID"
        else:
            raise AssertionError(bad)


def test_encryption_is_randomized_and_hash_is_stable():
    a, b = encrypt(VALID_TCKN), encrypt(VALID_TCKN)
    assert a != b and a.startswith("v1:") and VALID_TCKN not in a
    assert decrypt(a) == decrypt(b) == VALID_TCKN
    assert lookup_hash(VALID_TCKN) == lookup_hash(VALID_TCKN) != lookup_hash("U1234567")


# ---------------------------------------------------------------- uctan uca


async def test_form_modes_hidden_optional_required(client, seeded, session_maker):
    token = await supplier(client)
    form = await set_form(client, seeded)  # varsayilan
    assert form["driver_id_number"] == "hidden"
    assert form["driver_id_retention_days"] == 30

    # Gizliyken gonderilen deger SAKLANMAZ.
    response = await book(client, seeded, token, hour=8, driver_id=VALID_TCKN)
    assert response.status_code == 200, response.text
    assert response.json()["data"]["driver_id_masked"] is None

    await set_form(client, seeded, driver_id_number="required", driver_id_retention_days=90)
    catalog = (await client.get("/supplier/catalog", headers=token)).json()["data"]
    assert catalog["appointment_form"]["driver_id_number"] == "required"
    response = await book(client, seeded, token, hour=10, driver_id=None)
    assert response.json()["error"]["code"] == "DRIVER_ID_REQUIRED"
    response = await book(client, seeded, token, hour=10, driver_id="10000000147")
    assert response.json()["error"]["code"] == "DRIVER_ID_INVALID"

    response = await book(client, seeded, token, hour=10, driver_id=VALID_TCKN)
    assert response.status_code == 200, response.text
    data = response.json()["data"]
    assert data["driver_id_masked"] == "•••••••0146" and data["driver_id_type"] == "tckn"
    # Yanitta sifreli deger, ozet ya da acik numara YOK.
    assert VALID_TCKN not in response.text and "v1:" not in response.text
    assert "driver_id_hash" not in data and "driver_id_ciphertext" not in data

    async with session_maker() as db:
        row = await db.get(Appointment, uuid.UUID(data["id"]))
        assert row.driver_id_ciphertext and VALID_TCKN not in row.driver_id_ciphertext
        assert decrypt(row.driver_id_ciphertext) == VALID_TCKN
        assert row.driver_id_hash == lookup_hash(VALID_TCKN)

    response = await book(client, seeded, token, hour=13, driver_id="u 1234567")
    assert response.json()["data"]["driver_id_masked"] == "••••4567"


async def test_reveal_requires_permission_and_is_audited(client, seeded, session_maker):
    token = await supplier(client)
    await set_form(client, seeded, driver_id_number="optional")
    appointment_id = (await book(client, seeded, token, hour=9, driver_id=VALID_TCKN)).json()[
        "data"
    ]["id"]
    fid = seeded["facility"].id
    url = f"/facilities/{fid}/appointments/{appointment_id}/driver-id/reveal"

    viewer = auth_headers(await login(client, "/auth/login", "izleyici@cakesbakes.com"))
    assert (await client.post(url, headers=viewer)).status_code == 403
    detail = (await client.get(f"/facilities/{fid}/appointments/{appointment_id}", headers=viewer))
    assert detail.json()["data"]["driver_id_masked"] == "•••••••0146"

    headers = await admin(client)
    response = await client.post(url, headers=headers)
    assert response.status_code == 200, response.text
    assert response.json()["data"] == {"type": "tckn", "value": VALID_TCKN}

    async with session_maker() as db:
        logs = (
            await db.execute(
                select(AuditLog).where(AuditLog.action == "appointment.driver_id_reveal")
            )
        ).scalars().all()
        assert len(logs) == 1
        for log in (await db.execute(select(AuditLog))).scalars():
            dumped = f"{log.before_json} {log.after_json} {log.metadata_json}"
            assert VALID_TCKN not in dumped

    # Kimlikle arama (guvenlik kapisi): izinli kullanici bulur, izleyici bulamaz.
    search = f"/facilities/{fid}/appointments/search-by-driver-id"
    found = await client.post(search, headers=headers, json={"driver_id": "100 000 00146"})
    assert [a["id"] for a in found.json()["data"]] == [appointment_id]
    none = await client.post(search, headers=headers, json={"driver_id": "U9999999"})
    assert none.json()["data"] == []
    assert (
        await client.post(search, headers=viewer, json={"driver_id": VALID_TCKN})
    ).status_code == 403


async def test_retention_purge(client, seeded, session_maker):
    token = await supplier(client)
    await set_form(client, seeded, driver_id_number="optional", driver_id_retention_days=7)
    appointment_id = (await book(client, seeded, token, hour=11, driver_id=VALID_TCKN)).json()[
        "data"
    ]["id"]
    async with session_maker() as db:
        assert await purge_driver_ids(db) == 0  # gelecekteki randevu: dokunulmaz
        row = await db.get(Appointment, uuid.UUID(appointment_id))
        past = datetime.now(UTC) - timedelta(days=8)
        row.scheduled_start_at, row.scheduled_end_at = past - timedelta(hours=1), past
        await db.commit()
        assert await purge_driver_ids(db, dry_run=True) == 1
        assert await purge_driver_ids(db) == 1
    async with session_maker() as db:
        row = await db.get(Appointment, uuid.UUID(appointment_id))
        assert row.driver_id_ciphertext is None and row.driver_id_hash is None
        assert row.driver_id_last4 is None and row.driver_id_purged_at is not None

    fid = seeded["facility"].id
    headers = await admin(client)
    response = await client.post(
        f"/facilities/{fid}/appointments/{appointment_id}/driver-id/reveal", headers=headers
    )
    assert response.json()["error"]["code"] == "DRIVER_ID_PURGED"
    detail = await client.get(f"/facilities/{fid}/appointments/{appointment_id}", headers=headers)
    assert detail.json()["data"]["driver_id_masked"] is None
    assert detail.json()["data"]["driver_id_purged_at"] is not None
