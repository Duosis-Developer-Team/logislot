"""Tedarikci iptal kurallari (musteri talebi 2026-10, Cakes&Bakes).

Tesis politikasi acikken tedarikci randevu iptalinde sabit listeden sebep ve
alternatif gonderim tarihi girmek zorundadir; randevuya kural suresinden az
kalinca portaldan iptal edemez. Politika kapaliyken eski davranis surer;
yonetim iptali hicbir zaman bu kurallara tabi degildir.
"""

import uuid
from datetime import UTC, date, datetime, timedelta
from types import SimpleNamespace

import pytest

from app.models import Appointment
from app.services.cancellation_policy import (
    MAX_NOTICE_HOURS,
    reason_text,
    resolve_cancellation_policy,
)
from tests.conftest import auth_headers, login
from tests.test_sprint12 import _series

POLICY_24H = {
    "require_reason": True,
    "require_alternative_date": True,
    "min_notice_hours": 24,
}


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


async def create_appointment(client, seeded, token, *, starts_in: timedelta, session_maker):
    """Portaldan randevu acar, sonra baslangicini `now + starts_in`'e ceker.

    Bildirim penceresi saate bagli oldugu icin test saatin kacta kostugundan
    bagimsiz olmali; olusturma kurallari (calisma saati vb.) burada konu degil.
    """
    day = date.today() + timedelta(days=2)
    while day.weekday() >= 5:
        day += timedelta(days=1)
    response = await client.post(
        "/supplier/appointments",
        headers=token,
        json={
            "product_category_id": str(seeded["product_categories"]["soguk"].id),
            "product_name": "Iptal Kurali",
            "quantity": 1,
            "target_date": day.isoformat(),
            "start_at": f"{day.isoformat()}T10:00:00+03:00",
            "duration_minutes": 60,
        },
    )
    assert response.status_code == 200, response.text
    appointment_id = response.json()["data"]["id"]
    start = datetime.now(UTC) + starts_in
    async with session_maker() as db:
        row = await db.get(Appointment, uuid.UUID(appointment_id))
        row.scheduled_start_at = start
        row.scheduled_end_at = start + timedelta(minutes=60)
        await db.commit()
    return appointment_id


async def cancel(client, token, appointment_id, body=None):
    return await client.post(
        f"/supplier/appointments/{appointment_id}/cancel", headers=token, json=body
    )


# ---------------------------------------------------------------- politika


def test_policy_defaults_to_no_rules_and_survives_garbage():
    assert resolve_cancellation_policy(SimpleNamespace()) == {
        "require_reason": False,
        "require_alternative_date": False,
        "min_notice_hours": 0,
    }
    broken = SimpleNamespace(
        supplier_cancellation_policy_json={
            "require_reason": "yes",
            "require_alternative_date": 1,
            "min_notice_hours": True,
            "unknown": 5,
        }
    )
    assert resolve_cancellation_policy(broken) == {
        "require_reason": False,
        "require_alternative_date": False,
        "min_notice_hours": 0,
    }
    too_long = SimpleNamespace(supplier_cancellation_policy_json={"min_notice_hours": 99999})
    assert resolve_cancellation_policy(too_long)["min_notice_hours"] == MAX_NOTICE_HOURS


def test_reason_text_combines_label_and_note():
    assert reason_text("vehicle_issue", None) == "Araç / nakliye sorunu"
    assert reason_text("other", "Fabrika bakimda") == "Diğer — Fabrika bakimda"
    assert reason_text(None, "Serbest metin") == "Serbest metin"
    assert reason_text(None, None) is None


async def test_admin_reads_and_patches_policy_with_audit(client, seeded):
    headers = await admin(client)
    fid = seeded["facility"].id

    response = await client.get(f"/facilities/{fid}/supplier-cancellation-policy", headers=headers)
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["is_customized"] is False
    assert data["min_notice_hours"] == 0

    data = await set_policy(client, seeded, headers, min_notice_hours=24)
    assert data == {
        "require_reason": False,
        "require_alternative_date": False,
        "min_notice_hours": 24,
        "is_customized": True,
        "max_notice_hours": MAX_NOTICE_HOURS,
    }
    # Gonderilmeyen alan oldugu gibi kalir
    data = await set_policy(client, seeded, headers, require_reason=True)
    assert data["min_notice_hours"] == 24 and data["require_reason"] is True

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
    response = await client.patch(
        f"/facilities/{fid}/supplier-cancellation-policy",
        headers=viewer,
        json={"min_notice_hours": 1},
    )
    assert response.status_code == 403
    token = await supplier(client)
    response = await client.get(f"/facilities/{fid}/supplier-cancellation-policy", headers=token)
    assert response.status_code in (401, 403)


async def test_supplier_profile_exposes_policy(client, seeded):
    token = await supplier(client)
    profile = (await client.get("/supplier/profile", headers=token)).json()["data"]
    assert profile["cancellation_policy"]["min_notice_hours"] == 0

    await set_policy(client, seeded, await admin(client), **POLICY_24H)
    profile = (await client.get("/supplier/profile", headers=token)).json()["data"]
    assert profile["cancellation_policy"] == POLICY_24H


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
    assert data["cancellation_reason_code"] is None
    assert data["cancellation_alternative_date"] is None


async def test_cancel_inside_notice_window_is_rejected(client, seeded, session_maker):
    await set_policy(client, seeded, await admin(client), **POLICY_24H)
    token = await supplier(client)
    appointment_id = await create_appointment(
        client, seeded, token, starts_in=timedelta(hours=23), session_maker=session_maker
    )
    tomorrow = (date.today() + timedelta(days=2)).isoformat()
    response = await cancel(
        client,
        token,
        appointment_id,
        {"reason_code": "vehicle_issue", "alternative_date": tomorrow},
    )
    assert response.status_code == 409
    error = response.json()["error"]
    assert error["code"] == "CANCELLATION_NOTICE_TOO_SHORT"
    assert error["details"] == {"min_notice_hours": 24}


async def test_yonetim_can_still_cancel_inside_window(client, seeded, session_maker):
    headers = await admin(client)
    await set_policy(client, seeded, headers, **POLICY_24H)
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
    assert response.json()["data"]["cancellation_reason_code"] is None


@pytest.mark.parametrize(
    ("body", "code"),
    [
        (None, "CANCELLATION_REASON_REQUIRED"),
        ({"alternative_date": "TOMORROW"}, "CANCELLATION_REASON_REQUIRED"),
        ({"reason_code": "vehicle_issue"}, "ALTERNATIVE_DATE_REQUIRED"),
        ({"reason_code": "other", "alternative_date": "TOMORROW"}, "CANCELLATION_NOTE_REQUIRED"),
        (
            {"reason_code": "other", "reason": "  ", "alternative_date": "TOMORROW"},
            "CANCELLATION_NOTE_REQUIRED",
        ),
        (
            {"reason_code": "vehicle_issue", "alternative_date": "YESTERDAY"},
            "ALTERNATIVE_DATE_INVALID",
        ),
        (
            {"reason_code": "vehicle_issue", "alternative_date": "FAR"},
            "ALTERNATIVE_DATE_INVALID",
        ),
    ],
)
async def test_required_fields_are_enforced(client, seeded, session_maker, body, code):
    await set_policy(client, seeded, await admin(client), **POLICY_24H)
    token = await supplier(client)
    appointment_id = await create_appointment(
        client, seeded, token, starts_in=timedelta(days=3), session_maker=session_maker
    )
    dates = {
        "TOMORROW": (date.today() + timedelta(days=1)).isoformat(),
        "YESTERDAY": (date.today() - timedelta(days=2)).isoformat(),
        "FAR": (date.today() + timedelta(days=400)).isoformat(),
    }
    if body and "alternative_date" in body:
        body = {**body, "alternative_date": dates[body["alternative_date"]]}
    response = await cancel(client, token, appointment_id, body)
    assert response.status_code == 422, response.text
    assert response.json()["error"]["code"] == code

    # Reddedilen istek randevuya dokunmaz
    rows = (await client.get("/supplier/appointments", headers=token)).json()["data"]
    assert next(a for a in rows if a["id"] == appointment_id)["status"] != "cancelled"


async def test_unknown_reason_code_is_rejected(client, seeded, session_maker):
    token = await supplier(client)
    appointment_id = await create_appointment(
        client, seeded, token, starts_in=timedelta(days=3), session_maker=session_maker
    )
    response = await cancel(client, token, appointment_id, {"reason_code": "bilmiyorum"})
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"


async def test_valid_cancel_records_reason_date_notification_and_audit(
    client, seeded, session_maker
):
    headers = await admin(client)
    await set_policy(client, seeded, headers, **POLICY_24H)
    token = await supplier(client)
    appointment_id = await create_appointment(
        client, seeded, token, starts_in=timedelta(hours=25), session_maker=session_maker
    )
    alternative = date.today() + timedelta(days=5)
    response = await cancel(
        client,
        token,
        appointment_id,
        {
            "reason_code": "other",
            "reason": "  Fabrika bakimda  ",
            "alternative_date": alternative.isoformat(),
        },
    )
    assert response.status_code == 200, response.text
    data = response.json()["data"]
    assert data["status"] == "cancelled"
    assert data["cancellation_reason_code"] == "other"
    assert data["cancellation_reason"] == "Fabrika bakimda"
    assert data["cancellation_alternative_date"] == alternative.isoformat()

    fid = seeded["facility"].id
    detail = (
        await client.get(f"/facilities/{fid}/appointments/{appointment_id}", headers=headers)
    ).json()["data"]
    assert detail["cancellation_reason_code"] == "other"
    assert detail["cancellation_alternative_date"] == alternative.isoformat()

    notes = (await client.get(f"/facilities/{fid}/notifications", headers=headers)).json()["data"]
    note = next(
        n for n in notes
        if n["type"] == "appointment_cancelled"
        and n["metadata_json"].get("appointment_id") == appointment_id
    )
    assert "Diğer — Fabrika bakimda" in note["body"]
    assert alternative.strftime("%d.%m.%Y") in note["body"]
    assert note["metadata_json"]["reason_code"] == "other"
    assert note["metadata_json"]["alternative_date"] == alternative.isoformat()

    logs = (
        await client.get(
            f"/facilities/{fid}/audit-logs?action=appointment.cancel&entity_id={appointment_id}",
            headers=headers,
        )
    ).json()["data"]["items"]
    assert logs[0]["after"] == {
        "status": "cancelled",
        "reason_code": "other",
        "reason": "Fabrika bakimda",
        "alternative_date": alternative.isoformat(),
    }


async def test_optional_fields_are_kept_when_policy_is_off(client, seeded, session_maker):
    token = await supplier(client)
    appointment_id = await create_appointment(
        client, seeded, token, starts_in=timedelta(hours=2), session_maker=session_maker
    )
    response = await cancel(client, token, appointment_id, {"reason_code": "weather_road"})
    assert response.status_code == 200, response.text
    assert response.json()["data"]["cancellation_reason_code"] == "weather_road"


# ---------------------------------------------------------------- seri iptali


async def _move_first_occurrence(session_maker, series, *, starts_in: timedelta):
    start = datetime.now(UTC) + starts_in
    async with session_maker() as db:
        row = await db.get(Appointment, uuid.UUID(series["appointments"][0]["id"]))
        row.scheduled_start_at = start
        row.scheduled_end_at = start + timedelta(minutes=60)
        await db.commit()


async def test_series_cancel_keeps_occurrences_inside_window(client, seeded, session_maker):
    headers = await admin(client)
    await set_policy(client, seeded, headers, **POLICY_24H)
    series = await _series(client, seeded, count=3)
    await _move_first_occurrence(session_maker, series, starts_in=timedelta(hours=5))
    token = await supplier(client, "tedarikci@anadoluun.com")

    row = next(
        r for r in (await client.get("/supplier/appointment-series", headers=token)).json()["data"]
        if r["id"] == series["series_id"]
    )
    assert row["future_cancellable_count"] == 2
    assert row["can_cancel_series"] is True

    # Kural acikken serbest metin tek basina yetmez; liste ve tarih zorunlu
    url = f"/supplier/appointment-series/{series['series_id']}/cancel"
    response = await client.post(url, headers=token, json={"reason": "Uretim degisti"})
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "CANCELLATION_REASON_REQUIRED"
    response = await client.post(url, headers=token, json={"reason_code": "order_changed"})
    assert response.json()["error"]["code"] == "ALTERNATIVE_DATE_REQUIRED"

    alternative = date.today() + timedelta(days=30)
    response = await client.post(
        url,
        headers=token,
        json={"reason_code": "order_changed", "alternative_date": alternative.isoformat()},
    )
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
        assert appointment["cancellation_reason_code"] == "order_changed"
        assert appointment["cancellation_alternative_date"] == alternative.isoformat()

    fid = seeded["facility"].id
    notes = (await client.get(f"/facilities/{fid}/notifications", headers=headers)).json()["data"]
    note = next(
        n for n in notes
        if n["metadata_json"].get("series_id") == series["series_id"]
        and n["type"] == "appointment_cancelled"
    )
    assert "Sipariş iptal edildi / değişti" in note["body"]
    assert "1 randevu iptal edilmedi" in note["body"]

    # Kalan tek occurrence pencere icinde: ikinci iptal net sebeple reddedilir
    response = await client.post(
        url,
        headers=token,
        json={"reason_code": "order_changed", "alternative_date": alternative.isoformat()},
    )
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
