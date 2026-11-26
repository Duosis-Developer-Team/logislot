"""Tedarikci iptal kurallari (musteri talebi 2026-10, 2026-11 toplantisi revizyonu).

Tesis politikasi acikken tedarikci iptalinde firmanin listesinden sebep secer
(aciklama istege bagli, sebep bazinda zorunlu yapilabilir), telafi randevusunu
AYNI islemde acar ve randevuya kural suresinden az kalinca portaldan iptal
edemez. Politika kapaliyken eski davranis surer; yonetim iptali hicbir zaman bu
kurallara tabi degildir.
"""

import uuid
from datetime import UTC, date, datetime, timedelta
from types import SimpleNamespace

import pytest

from app.models import Appointment
from app.models.cancellation import DEFAULT_CANCELLATION_REASONS
from app.services.cancellation_policy import (
    MAX_NOTICE_HOURS,
    reason_text,
    resolve_cancellation_policy,
)
from tests.conftest import auth_headers, login
from tests.test_sprint12 import _series

POLICY = {"require_reason": True, "require_makeup": True, "min_notice_hours": 24}


async def admin(client) -> dict:
    return auth_headers(await login(client, "/auth/login", "admin@cakesbakes.com"))


async def supplier(client, email="tedarikci@marmarasoguk.com") -> dict:
    return auth_headers(await login(client, "/auth/supplier-login", email))


async def set_policy(client, seeded, headers, **body) -> dict:
    fid = seeded["facility"].id
    response = await client.patch(
        f"/facilities/{fid}/supplier-cancellation-policy", headers=headers, json=body
    )
    assert response.status_code == 200, response.text
    return response.json()["data"]


async def reasons(client, seeded, headers) -> list[dict]:
    fid = seeded["facility"].id
    response = await client.get(f"/facilities/{fid}/cancellation-reasons", headers=headers)
    assert response.status_code == 200, response.text
    return response.json()["data"]


def weekday(offset: int) -> date:
    day = date.today() + timedelta(days=offset)
    while day.weekday() >= 5:
        day += timedelta(days=1)
    return day


async def book(client, seeded, token, *, day: date, hour: int = 10, name="Iptal Kurali"):
    response = await client.post(
        "/supplier/appointments",
        headers=token,
        json={
            "product_category_id": str(seeded["product_categories"]["soguk"].id),
            "product_name": name,
            "quantity": 1,
            "target_date": day.isoformat(),
            "start_at": f"{day.isoformat()}T{hour:02d}:00:00+03:00",
            "duration_minutes": 60,
        },
    )
    assert response.status_code == 200, response.text
    return response.json()["data"]["id"]


async def create_appointment(client, seeded, token, *, starts_in: timedelta, session_maker):
    """Portaldan randevu acar, sonra baslangicini `now + starts_in`'e ceker.

    Bildirim penceresi saate bagli oldugu icin test saatin kacta kostugundan
    bagimsiz olmali; olusturma kurallari (calisma saati vb.) burada konu degil.
    """
    appointment_id = await book(client, seeded, token, day=weekday(2))
    start = datetime.now(UTC) + starts_in
    async with session_maker() as db:
        row = await db.get(Appointment, uuid.UUID(appointment_id))
        row.scheduled_start_at = start
        row.scheduled_end_at = start + timedelta(minutes=60)
        await db.commit()
    return appointment_id


def makeup_slot(day: date | None = None, hour: int = 11) -> dict:
    day = day or weekday(6)
    return {"target_date": day.isoformat(), "start_at": f"{day.isoformat()}T{hour:02d}:00:00+03:00"}


async def cancel(client, token, appointment_id, body=None):
    return await client.post(
        f"/supplier/appointments/{appointment_id}/cancel", headers=token, json=body
    )


async def supplier_rows(client, token) -> dict[str, dict]:
    rows = (await client.get("/supplier/appointments", headers=token)).json()["data"]
    return {a["id"]: a for a in rows}


# ---------------------------------------------------------------- politika


def test_policy_defaults_to_no_rules_and_survives_garbage():
    assert resolve_cancellation_policy(SimpleNamespace()) == {
        "require_reason": False,
        "require_makeup": False,
        "min_notice_hours": 0,
    }
    broken = SimpleNamespace(
        supplier_cancellation_policy_json={
            "require_reason": "yes",
            "require_makeup": 1,
            "min_notice_hours": True,
            # ilk surumden kalmis anahtar sessizce dusurulur
            "require_alternative_date": True,
        }
    )
    assert resolve_cancellation_policy(broken) == {
        "require_reason": False,
        "require_makeup": False,
        "min_notice_hours": 0,
    }
    too_long = SimpleNamespace(supplier_cancellation_policy_json={"min_notice_hours": 99999})
    assert resolve_cancellation_policy(too_long)["min_notice_hours"] == MAX_NOTICE_HOURS


def test_reason_text_combines_label_and_note():
    assert reason_text("Araç / nakliye sorunu", None) == "Araç / nakliye sorunu"
    assert reason_text("Diğer", "Fabrika bakimda") == "Diğer — Fabrika bakimda"
    assert reason_text(None, "Serbest metin") == "Serbest metin"
    assert reason_text(None, None) is None


async def test_admin_reads_and_patches_policy_with_audit(client, seeded):
    headers = await admin(client)
    fid = seeded["facility"].id

    response = await client.get(f"/facilities/{fid}/supplier-cancellation-policy", headers=headers)
    data = response.json()["data"]
    assert data["is_customized"] is False
    assert data["require_makeup"] is False

    data = await set_policy(client, seeded, headers, min_notice_hours=24)
    assert data == {
        "require_reason": False,
        "require_makeup": False,
        "min_notice_hours": 24,
        "is_customized": True,
        "max_notice_hours": MAX_NOTICE_HOURS,
    }
    data = await set_policy(client, seeded, headers, require_makeup=True)
    assert data["min_notice_hours"] == 24 and data["require_makeup"] is True

    response = await client.patch(
        f"/facilities/{fid}/supplier-cancellation-policy",
        headers=headers,
        json={"min_notice_hours": MAX_NOTICE_HOURS + 1},
    )
    assert response.status_code == 422

    logs = (
        await client.get(
            f"/facilities/{fid}/audit-logs?action=supplier_cancellation_policy.update",
            headers=headers,
        )
    ).json()["data"]["items"]
    assert len(logs) == 2
    assert logs[0]["summary"] == "Tedarikçi iptal kuralları güncellendi"


async def test_policy_endpoints_need_supplier_manage(client, seeded):
    fid = seeded["facility"].id
    viewer = auth_headers(await login(client, "/auth/login", "izleyici@cakesbakes.com"))
    for method, path, body in (
        ("patch", "supplier-cancellation-policy", {"min_notice_hours": 1}),
        ("put", "cancellation-reasons", {"reasons": [{"label": "X sebep"}]}),
    ):
        response = await getattr(client, method)(
            f"/facilities/{fid}/{path}", headers=viewer, json=body
        )
        assert response.status_code == 403
    token = await supplier(client)
    response = await client.get(f"/facilities/{fid}/cancellation-reasons", headers=token)
    assert response.status_code in (401, 403)


# ---------------------------------------------------------------- sebep listesi


async def test_new_facility_gets_default_reasons_all_note_optional(client, seeded):
    rows = await reasons(client, seeded, await admin(client))
    assert [r["label"] for r in rows] == list(DEFAULT_CANCELLATION_REASONS)
    assert all(r["is_active"] and not r["note_required"] for r in rows)


async def test_admin_rewrites_reason_list(client, seeded):
    headers = await admin(client)
    fid = seeded["facility"].id
    current = await reasons(client, seeded, headers)
    first, second, *_ = current
    body = {
        "reasons": [
            {"id": second["id"], "label": "  Araç arızası ", "note_required": True},
            {"id": first["id"], "label": first["label"], "is_active": False},
            {"label": "Hammadde gecikmesi"},
        ]
    }
    response = await client.put(
        f"/facilities/{fid}/cancellation-reasons", headers=headers, json=body
    )
    assert response.status_code == 200, response.text
    data = response.json()["data"]
    assert [(r["label"], r["note_required"], r["is_active"]) for r in data] == [
        ("Araç arızası", True, True),
        (first["label"], False, False),
        ("Hammadde gecikmesi", False, True),
    ]
    assert data[0]["id"] == second["id"]  # mevcut sebep guncellendi, yeni acilmadi

    # Tedarikci yalnizca AKTIF sebepleri, siraya gore gorur
    profile = (await client.get("/supplier/profile", headers=await supplier(client))).json()["data"]
    assert [r["label"] for r in profile["cancellation_reasons"]] == [
        "Araç arızası",
        "Hammadde gecikmesi",
    ]

    logs = (
        await client.get(
            f"/facilities/{fid}/audit-logs?action=cancellation_reasons.update", headers=headers
        )
    ).json()["data"]["items"]
    assert logs[0]["summary"] == "İptal sebebi listesi güncellendi"


@pytest.mark.parametrize(
    ("body", "status", "code"),
    [
        ({"reasons": [{"label": "Aynı"}, {"label": "aynı"}]}, 409, "DUPLICATE_NAME"),
        (
            {"reasons": [{"label": "Tek sebep", "is_active": False}]},
            422,
            "CANCELLATION_REASONS_EMPTY",
        ),
        ({"reasons": [{"id": str(uuid.uuid4()), "label": "Yabanci"}]}, 404, "NOT_FOUND"),
    ],
)
async def test_reason_list_validation(client, seeded, body, status, code):
    fid = seeded["facility"].id
    response = await client.put(
        f"/facilities/{fid}/cancellation-reasons", headers=await admin(client), json=body
    )
    assert response.status_code == status, response.text
    assert response.json()["error"]["code"] == code


# ---------------------------------------------------------------- tekil iptal


async def test_without_policy_legacy_empty_cancel_still_works(client, seeded, session_maker):
    token = await supplier(client)
    appointment_id = await create_appointment(
        client, seeded, token, starts_in=timedelta(hours=2), session_maker=session_maker
    )
    response = await cancel(client, token, appointment_id)
    assert response.status_code == 200, response.text
    data = response.json()["data"]
    assert data["status"] == "cancelled"
    assert data["cancellation_reason_id"] is None
    assert data["makeup_appointment"] is None


async def test_cancel_inside_notice_window_is_rejected(client, seeded, session_maker):
    await set_policy(client, seeded, await admin(client), **POLICY)
    token = await supplier(client)
    appointment_id = await create_appointment(
        client, seeded, token, starts_in=timedelta(hours=23), session_maker=session_maker
    )
    reason = (await reasons(client, seeded, await admin(client)))[1]
    response = await cancel(
        client, token, appointment_id, {"reason_id": reason["id"], "makeup": makeup_slot()}
    )
    assert response.status_code == 409
    error = response.json()["error"]
    assert error["code"] == "CANCELLATION_NOTICE_TOO_SHORT"
    assert error["details"] == {"min_notice_hours": 24}


async def test_yonetim_can_still_cancel_inside_window(client, seeded, session_maker):
    headers = await admin(client)
    await set_policy(client, seeded, headers, **POLICY)
    token = await supplier(client)
    appointment_id = await create_appointment(
        client, seeded, token, starts_in=timedelta(hours=2), session_maker=session_maker
    )
    fid = seeded["facility"].id
    response = await client.post(
        f"/facilities/{fid}/appointments/{appointment_id}/cancel",
        headers=headers,
        json={"reason": "Operasyon iptali"},
    )
    assert response.status_code == 200, response.text
    data = response.json()["data"]
    assert data["cancellation_reason"] == "Operasyon iptali"
    assert data["makeup_appointment_id"] is None


async def test_reason_and_makeup_rules_are_enforced(client, seeded, session_maker):
    headers = await admin(client)
    await set_policy(client, seeded, headers, **POLICY)
    token = await supplier(client)
    appointment_id = await create_appointment(
        client, seeded, token, starts_in=timedelta(days=3), session_maker=session_maker
    )
    all_reasons = await reasons(client, seeded, headers)
    reason_id = all_reasons[1]["id"]

    cases = [
        (None, "CANCELLATION_REASON_REQUIRED"),
        ({"makeup": makeup_slot()}, "CANCELLATION_REASON_REQUIRED"),
        ({"reason_id": str(uuid.uuid4()), "makeup": makeup_slot()}, "CANCELLATION_REASON_INVALID"),
        ({"reason_id": reason_id}, "MAKEUP_REQUIRED"),
    ]
    for body, code in cases:
        response = await cancel(client, token, appointment_id, body)
        assert response.status_code == 422, (body, response.text)
        assert response.json()["error"]["code"] == code

    # Pasif sebep secilemez
    fid = seeded["facility"].id
    await client.put(
        f"/facilities/{fid}/cancellation-reasons",
        headers=headers,
        json={
            "reasons": [
                {"id": r["id"], "label": r["label"], "is_active": r["id"] != reason_id,
                 "note_required": r["label"] == "Diğer"}
                for r in all_reasons
            ]
        },
    )
    response = await cancel(
        client, token, appointment_id, {"reason_id": reason_id, "makeup": makeup_slot()}
    )
    assert response.json()["error"]["code"] == "CANCELLATION_REASON_INVALID"

    # Aciklama zorunlu yapilan sebep aciklamasiz secilemez
    other = next(r for r in all_reasons if r["label"] == "Diğer")
    response = await cancel(
        client, token, appointment_id,
        {"reason_id": other["id"], "reason": "  ", "makeup": makeup_slot()},
    )
    assert response.json()["error"]["code"] == "CANCELLATION_NOTE_REQUIRED"

    # Reddedilen istekler randevuya dokunmaz
    assert (await supplier_rows(client, token))[appointment_id]["status"] != "cancelled"


async def test_unknown_reason_payload_is_rejected(client, seeded, session_maker):
    token = await supplier(client)
    appointment_id = await create_appointment(
        client, seeded, token, starts_in=timedelta(days=3), session_maker=session_maker
    )
    response = await cancel(client, token, appointment_id, {"reason_id": "bilmiyorum"})
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"


async def test_cancel_with_makeup_creates_flagged_linked_appointment(client, seeded, session_maker):
    headers = await admin(client)
    await set_policy(client, seeded, headers, **POLICY)
    token = await supplier(client)
    appointment_id = await create_appointment(
        client, seeded, token, starts_in=timedelta(hours=25), session_maker=session_maker
    )
    reason = (await reasons(client, seeded, headers))[1]
    slot = makeup_slot()
    response = await cancel(
        client,
        token,
        appointment_id,
        {"reason_id": reason["id"], "reason": "  Arac arizasi  ", "makeup": slot},
    )
    assert response.status_code == 200, response.text
    data = response.json()["data"]
    makeup = data["makeup_appointment"]
    assert data["status"] == "cancelled"
    assert data["cancellation_reason_id"] == reason["id"]
    assert data["cancellation_reason_label"] == reason["label"]
    assert data["cancellation_reason"] == "Arac arizasi"
    assert data["makeup_appointment_id"] == makeup["id"]
    assert makeup["is_makeup"] is True
    assert makeup["makeup_of_id"] == appointment_id
    assert makeup["status"] == "pending"  # marmara manuel onayli
    assert makeup["product_name"] == "Iptal Kurali"
    assert makeup["scheduled_start_at"].startswith(slot["target_date"])

    fid = seeded["facility"].id
    detail = (
        await client.get(f"/facilities/{fid}/appointments/{appointment_id}", headers=headers)
    ).json()["data"]
    assert detail["makeup_appointment"]["id"] == makeup["id"]
    back = (
        await client.get(f"/facilities/{fid}/appointments/{makeup['id']}", headers=headers)
    ).json()["data"]
    assert back["makeup_of"]["id"] == appointment_id

    notes = (await client.get(f"/facilities/{fid}/notifications", headers=headers)).json()["data"]
    note = next(
        n for n in notes
        if n["type"] == "appointment_cancelled"
        and n["metadata_json"].get("appointment_id") == appointment_id
    )
    assert f"{reason['label']} — Arac arizasi" in note["body"]
    assert "Telafi randevusu:" in note["body"] and "onay bekliyor" in note["body"]
    assert note["metadata_json"]["makeup_appointment_id"] == makeup["id"]

    logs = (
        await client.get(
            f"/facilities/{fid}/audit-logs?action=appointment.create_makeup", headers=headers
        )
    ).json()["data"]["items"]
    assert logs[0]["entity_id"] == makeup["id"]
    assert logs[0]["summary"] == "Telafi randevusu oluşturuldu"


async def test_unavailable_makeup_slot_rolls_back_cancellation(client, seeded, session_maker):
    await set_policy(client, seeded, await admin(client), **POLICY)
    token = await supplier(client)
    appointment_id = await create_appointment(
        client, seeded, token, starts_in=timedelta(days=3), session_maker=session_maker
    )
    reason = (await reasons(client, seeded, await admin(client)))[0]
    # Gece 03:00 calisma saati disinda: telafi olusamaz, iptal de olmamali.
    response = await cancel(
        client, token, appointment_id,
        {"reason_id": reason["id"], "makeup": makeup_slot(hour=3)},
    )
    assert response.status_code == 422, response.text
    rows = await supplier_rows(client, token)
    assert rows[appointment_id]["status"] != "cancelled"
    assert not any(a["is_makeup"] for a in rows.values())


async def test_reason_is_optional_when_policy_off(client, seeded, session_maker):
    token = await supplier(client)
    appointment_id = await create_appointment(
        client, seeded, token, starts_in=timedelta(hours=2), session_maker=session_maker
    )
    reason = (await reasons(client, seeded, await admin(client)))[4]
    response = await cancel(client, token, appointment_id, {"reason_id": reason["id"]})
    assert response.status_code == 200, response.text
    assert response.json()["data"]["cancellation_reason_label"] == reason["label"]


# ---------------------------------------------------------------- seri iptali


async def _move_first_occurrence(session_maker, series, *, starts_in: timedelta):
    start = datetime.now(UTC) + starts_in
    async with session_maker() as db:
        row = await db.get(Appointment, uuid.UUID(series["appointments"][0]["id"]))
        row.scheduled_start_at = start
        row.scheduled_end_at = start + timedelta(minutes=60)
        await db.commit()


async def test_series_cancel_blocked_when_makeup_required(client, seeded):
    await set_policy(client, seeded, await admin(client), **POLICY)
    series = await _series(client, seeded, count=2)
    token = await supplier(client, "tedarikci@anadoluun.com")
    row = next(
        r for r in (await client.get("/supplier/appointment-series", headers=token)).json()["data"]
        if r["id"] == series["series_id"]
    )
    assert row["can_cancel_series"] is False
    reason = (await reasons(client, seeded, await admin(client)))[0]
    response = await client.post(
        f"/supplier/appointment-series/{series['series_id']}/cancel",
        headers=token,
        json={"reason_id": reason["id"]},
    )
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "MAKEUP_SERIES_BLOCKED"


async def test_series_cancel_keeps_occurrences_inside_window(client, seeded, session_maker):
    headers = await admin(client)
    await set_policy(client, seeded, headers, require_reason=True, min_notice_hours=24)
    series = await _series(client, seeded, count=3)
    await _move_first_occurrence(session_maker, series, starts_in=timedelta(hours=5))
    token = await supplier(client, "tedarikci@anadoluun.com")

    row = next(
        r for r in (await client.get("/supplier/appointment-series", headers=token)).json()["data"]
        if r["id"] == series["series_id"]
    )
    assert row["future_cancellable_count"] == 2
    assert row["can_cancel_series"] is True

    url = f"/supplier/appointment-series/{series['series_id']}/cancel"
    response = await client.post(url, headers=token, json={"reason": "Uretim degisti"})
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "CANCELLATION_REASON_REQUIRED"

    reason = (await reasons(client, seeded, headers))[3]
    response = await client.post(url, headers=token, json={"reason_id": reason["id"]})
    assert response.status_code == 200, response.text
    result = response.json()["data"]
    assert result["affected_count"] == 2
    assert result["kept_within_notice_count"] == 1

    detail = (
        await client.get(f"/supplier/appointment-series/{series['series_id']}", headers=token)
    ).json()["data"]
    first, *rest = sorted(detail["appointments"], key=lambda a: a["occurrence_index"])
    assert first["status"] == "approved"  # pencere icinde: dokunulmadi
    for appointment in rest:
        assert appointment["status"] == "cancelled"
        assert appointment["cancellation_reason_label"] == reason["label"]

    fid = seeded["facility"].id
    notes = (await client.get(f"/facilities/{fid}/notifications", headers=headers)).json()["data"]
    note = next(
        n for n in notes
        if n["metadata_json"].get("series_id") == series["series_id"]
        and n["type"] == "appointment_cancelled"
    )
    assert reason["label"] in note["body"]
    assert "1 randevu iptal edilmedi" in note["body"]

    response = await client.post(url, headers=token, json={"reason_id": reason["id"]})
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "CANCELLATION_NOTICE_TOO_SHORT"


async def test_series_cancel_without_policy_keeps_legacy_reason(client, seeded):
    series = await _series(client, seeded, count=2)
    token = await supplier(client, "tedarikci@anadoluun.com")
    url = f"/supplier/appointment-series/{series['series_id']}/cancel"
    response = await client.post(url, headers=token, json={"reason": "ab"})
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "CANCELLATION_REASON_REQUIRED"
    response = await client.post(url, headers=token, json={"reason": "Uretim plani degisti"})
    assert response.status_code == 200, response.text
    assert response.json()["data"]["kept_within_notice_count"] == 0
