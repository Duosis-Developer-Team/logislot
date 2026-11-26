"""Siparis numarasi (musteri karari 2026-11: zorunlu, coklu olabilir).

Alanin zorunlulugu tesisin randevu formu ayaridir; varsayilan GIZLI oldugu icin
mevcut tenant'larin formu degismez. Kural sunucuda, tum olusturma yollarinda
(portal, yonetim adina, seri) ayni servisten zorlanir.
"""

import uuid
from datetime import UTC, date, datetime, timedelta

import pytest

from app.models import Appointment
from app.services.appointment_form import MAX_ORDER_NUMBERS, normalize_order_numbers
from tests.conftest import auth_headers, login
from tests.test_sprint12 import _series


async def admin(client) -> dict:
    return auth_headers(await login(client, "/auth/login", "admin@cakesbakes.com"))


async def supplier(client, email="tedarikci@marmarasoguk.com") -> dict:
    return auth_headers(await login(client, "/auth/supplier-login", email))


def weekday(offset: int) -> date:
    day = date.today() + timedelta(days=offset)
    while day.weekday() >= 5:
        day += timedelta(days=1)
    return day


async def set_mode(client, seeded, mode: str) -> dict:
    fid = seeded["facility"].id
    response = await client.patch(
        f"/facilities/{fid}/appointment-form",
        headers=await admin(client),
        json={"order_numbers": mode},
    )
    assert response.status_code == 200, response.text
    return response.json()["data"]


def booking(seeded, *, day: date | None = None, hour: int = 10, **extra) -> dict:
    day = day or weekday(2)
    return {
        "product_category_id": str(seeded["product_categories"]["soguk"].id),
        "product_name": "Siparis Testi",
        "quantity": 4,
        "target_date": day.isoformat(),
        "start_at": f"{day.isoformat()}T{hour:02d}:00:00+03:00",
        "duration_minutes": 60,
        **extra,
    }


def test_normalize_splits_trims_and_dedupes():
    assert normalize_order_numbers([" 4500123 , 4500124", "4500123", "", "x;y\nZ"]) == [
        "4500123",
        "4500124",
        "x",
        "y",
        "Z",
    ]
    assert normalize_order_numbers(["ABC", "abc"]) == ["ABC"]  # buyuk/kucuk harf tekrari
    assert normalize_order_numbers(None) == []


async def test_default_is_hidden_and_values_are_not_stored(client, seeded):
    fid = seeded["facility"].id
    response = await client.get(f"/facilities/{fid}/appointment-form", headers=await admin(client))
    form = response.json()["data"]
    assert form["order_numbers"] == "hidden" and form["is_customized"] is False

    token = await supplier(client)
    catalog = (await client.get("/supplier/catalog", headers=token)).json()["data"]
    assert catalog["appointment_form"] == {
        "order_numbers": "hidden",
        "driver_id_number": "hidden",
        "description": "hidden",
    }
    assert catalog["max_order_numbers"] == MAX_ORDER_NUMBERS

    response = await client.post(
        "/supplier/appointments", headers=token, json=booking(seeded, order_numbers=["4500123"])
    )
    assert response.status_code == 200, response.text
    assert response.json()["data"]["order_numbers"] == []


async def test_form_patch_needs_supplier_manage_and_is_audited(client, seeded):
    fid = seeded["facility"].id
    viewer = auth_headers(await login(client, "/auth/login", "izleyici@cakesbakes.com"))
    assert (
        await client.get(f"/facilities/{fid}/appointment-form", headers=viewer)
    ).status_code == 200
    response = await client.patch(
        f"/facilities/{fid}/appointment-form", headers=viewer, json={"order_numbers": "required"}
    )
    assert response.status_code == 403
    response = await client.patch(
        f"/facilities/{fid}/appointment-form",
        headers=await admin(client),
        json={"order_numbers": "mandatory"},
    )
    assert response.status_code == 422

    data = await set_mode(client, seeded, "required")
    assert data["order_numbers"] == "required" and data["is_customized"] is True
    logs = (
        await client.get(
            f"/facilities/{fid}/audit-logs?action=appointment_form.update",
            headers=await admin(client),
        )
    ).json()["data"]["items"]
    assert logs[0]["summary"] == "Randevu formu ayarları güncellendi"
    assert logs[0]["after"]["order_numbers"] == "required"
    assert logs[0]["before"]["order_numbers"] == "hidden"


async def test_required_mode_enforced_and_values_normalized(client, seeded):
    await set_mode(client, seeded, "required")
    token = await supplier(client)

    for body, code in (
        ({}, "ORDER_NUMBER_REQUIRED"),
        ({"order_numbers": ["  ", ","]}, "ORDER_NUMBER_REQUIRED"),
        (
            {"order_numbers": [str(i) for i in range(MAX_ORDER_NUMBERS + 1)]},
            "ORDER_NUMBERS_TOO_MANY",
        ),
        ({"order_numbers": ["X" * 65]}, "ORDER_NUMBER_TOO_LONG"),
    ):
        response = await client.post(
            "/supplier/appointments", headers=token, json=booking(seeded, **body)
        )
        assert response.status_code == 422, response.text
        assert response.json()["error"]["code"] == code

    response = await client.post(
        "/supplier/appointments",
        headers=token,
        json=booking(seeded, order_numbers=["4500123, 4500124", " 4500123 "]),
    )
    assert response.status_code == 200, response.text
    assert response.json()["data"]["order_numbers"] == ["4500123", "4500124"]


async def test_optional_mode_accepts_empty(client, seeded):
    await set_mode(client, seeded, "optional")
    response = await client.post(
        "/supplier/appointments", headers=await supplier(client), json=booking(seeded)
    )
    assert response.status_code == 200, response.text
    assert response.json()["data"]["order_numbers"] == []


async def test_admin_create_and_series_follow_the_same_rule(client, seeded):
    await set_mode(client, seeded, "required")
    fid = seeded["facility"].id
    headers = await admin(client)
    body = booking(seeded, supplier_id=str(seeded["suppliers"]["soguk"].id))
    response = await client.post(f"/facilities/{fid}/appointments", headers=headers, json=body)
    assert response.json()["error"]["code"] == "ORDER_NUMBER_REQUIRED"
    response = await client.post(
        f"/facilities/{fid}/appointments",
        headers=headers,
        json={**body, "order_numbers": ["PO-77"]},
    )
    assert response.status_code == 200, response.text
    assert response.json()["data"]["order_numbers"] == ["PO-77"]

    # Seri: her tekrar ayni siparis numaralarini tasir
    with pytest.raises(AssertionError):
        await _series(client, seeded, count=2)  # siparis no yok -> 422
    token = await supplier(client, "tedarikci@anadoluun.com")
    day = weekday(2)
    response = await client.post(
        "/supplier/appointments",
        headers=token,
        json={
            "product_category_id": str(seeded["product_categories"]["unlu"].id),
            "product_name": "Seri Siparis",
            "quantity": 1,
            "target_date": day.isoformat(),
            "start_at": f"{day.isoformat()}T15:00:00+03:00",
            "duration_minutes": 60,
            "order_numbers": ["SR-1", "SR-2"],
            "recurring": {"frequency": "weekly", "occurrence_count": 2},
        },
    )
    assert response.status_code == 200, response.text
    occurrences = response.json()["data"]["appointments"]
    assert all(a["order_numbers"] == ["SR-1", "SR-2"] for a in occurrences)


async def test_makeup_inherits_order_numbers_even_when_rule_added_later(
    client, seeded, session_maker
):
    token = await supplier(client)
    # Kural yokken alinmis randevu (siparis no yok)
    response = await client.post("/supplier/appointments", headers=token, json=booking(seeded))
    appointment_id = response.json()["data"]["id"]
    start = datetime.now(UTC) + timedelta(days=3)
    async with session_maker() as db:
        row = await db.get(Appointment, uuid.UUID(appointment_id))
        row.scheduled_start_at = start
        row.scheduled_end_at = start + timedelta(minutes=60)
        row.order_numbers = ["OLD-1"]
        await db.commit()

    await set_mode(client, seeded, "required")
    fid = seeded["facility"].id
    await client.patch(
        f"/facilities/{fid}/supplier-cancellation-policy",
        headers=await admin(client),
        json={"require_makeup": True},
    )
    day = weekday(6)
    response = await client.post(
        f"/supplier/appointments/{appointment_id}/cancel",
        headers=token,
        json={
            "makeup": {
                "target_date": day.isoformat(),
                "start_at": f"{day.isoformat()}T11:00:00+03:00",
            }
        },
    )
    assert response.status_code == 200, response.text
    assert response.json()["data"]["makeup_appointment"]["order_numbers"] == ["OLD-1"]


async def test_list_search_and_csv_export(client, seeded):
    await set_mode(client, seeded, "optional")
    token = await supplier(client)
    await client.post(
        "/supplier/appointments", headers=token, json=booking(seeded, order_numbers=["4500777"])
    )
    fid = seeded["facility"].id
    headers = await admin(client)
    rows = (
        await client.get(f"/facilities/{fid}/appointments?order_no=500777", headers=headers)
    ).json()["data"]
    assert [r["order_numbers"] for r in rows] == [["4500777"]]
    rows = (
        await client.get(f"/facilities/{fid}/appointments?order_no=nope-%25", headers=headers)
    ).json()["data"]
    assert rows == []

    day = weekday(2)
    response = await client.get(
        f"/facilities/{fid}/reports/appointments.csv?date_from={day.isoformat()}"
        f"&date_to={(day + timedelta(days=1)).isoformat()}",
        headers=headers,
    )
    assert response.status_code == 200, response.text
    header, *lines = response.text.lstrip("﻿").splitlines()
    assert "siparis_no" in header and "telafi" in header
    assert any("4500777" in line for line in lines)
