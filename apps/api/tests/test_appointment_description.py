"""Randevu aciklamasi (musteri karari 2026-11, Cakes & Bakes).

Ayni sevkiyatta birden fazla urun geldigi icin randevuya serbest metin
"Aciklama". Urun adi aynen kalir. Alanin gorunurlugu/zorunlulugu tesisin
randevu formu ayaridir; varsayilan GIZLI (mevcut tenant'larin formu degismez).
Kural sunucuda tum olusturma yollarinda (portal, yonetim adina, seri) zorlanir;
telafi randevusu kaynaginin aciklamasini tasir.
"""

import uuid
from datetime import UTC, datetime, timedelta

import pytest

from app.models import Appointment
from app.services.appointment_form import DESCRIPTION_MAX_LENGTH
from tests.test_order_numbers import admin, booking, supplier, weekday
from tests.test_sprint12 import _series


async def set_mode(client, seeded, mode: str) -> dict:
    fid = seeded["facility"].id
    response = await client.patch(
        f"/facilities/{fid}/appointment-form",
        headers=await admin(client),
        json={"description": mode},
    )
    assert response.status_code == 200, response.text
    return response.json()["data"]


async def test_default_is_hidden_and_values_are_not_stored(client, seeded):
    fid = seeded["facility"].id
    form = (
        await client.get(f"/facilities/{fid}/appointment-form", headers=await admin(client))
    ).json()["data"]
    assert form["description"] == "hidden"
    assert form["description_max_length"] == DESCRIPTION_MAX_LENGTH

    token = await supplier(client)
    catalog = (await client.get("/supplier/catalog", headers=token)).json()["data"]
    assert catalog["appointment_form"]["description"] == "hidden"
    assert catalog["description_max_length"] == DESCRIPTION_MAX_LENGTH

    response = await client.post(
        "/supplier/appointments", headers=token, json=booking(seeded, description="Not")
    )
    assert response.status_code == 200, response.text
    assert response.json()["data"]["description"] is None


async def test_patch_keeps_other_fields_and_rejects_bad_mode(client, seeded):
    fid = seeded["facility"].id
    response = await client.patch(
        f"/facilities/{fid}/appointment-form",
        headers=await admin(client),
        json={"description": "mandatory"},
    )
    assert response.status_code == 422

    await client.patch(
        f"/facilities/{fid}/appointment-form",
        headers=await admin(client),
        json={"order_numbers": "optional"},
    )
    data = await set_mode(client, seeded, "required")
    assert data["description"] == "required"
    assert data["order_numbers"] == "optional"


async def test_required_mode_enforced_trimmed_and_length_limited(client, seeded):
    await set_mode(client, seeded, "required")
    token = await supplier(client)

    for body, code in (
        ({}, "DESCRIPTION_REQUIRED"),
        ({"description": "   \n "}, "DESCRIPTION_REQUIRED"),
        ({"description": "x" * (DESCRIPTION_MAX_LENGTH + 1)}, "DESCRIPTION_TOO_LONG"),
    ):
        response = await client.post(
            "/supplier/appointments", headers=token, json=booking(seeded, **body)
        )
        assert response.status_code == 422, response.text
        assert response.json()["error"]["code"] == code

    text = "Un, seker, maya\nKarisik sevkiyat"
    response = await client.post(
        "/supplier/appointments", headers=token, json=booking(seeded, description=f"  {text}  ")
    )
    assert response.status_code == 200, response.text
    assert response.json()["data"]["description"] == text
    # Urun adi alani aynen kalir
    assert response.json()["data"]["product_name"] == "Siparis Testi"

    # Tam sinirdaki metin kabul edilir (kirpildiktan sonra sayilir)
    response = await client.post(
        "/supplier/appointments",
        headers=token,
        json=booking(seeded, hour=13, description=" " + "y" * DESCRIPTION_MAX_LENGTH + " "),
    )
    assert response.status_code == 200, response.text


async def test_optional_mode_empty_becomes_null(client, seeded):
    await set_mode(client, seeded, "optional")
    response = await client.post(
        "/supplier/appointments",
        headers=await supplier(client),
        json=booking(seeded, description="   "),
    )
    assert response.status_code == 200, response.text
    assert response.json()["data"]["description"] is None


async def test_admin_create_and_series_follow_the_same_rule(client, seeded):
    await set_mode(client, seeded, "required")
    fid = seeded["facility"].id
    headers = await admin(client)
    body = booking(seeded, supplier_id=str(seeded["suppliers"]["soguk"].id))
    response = await client.post(f"/facilities/{fid}/appointments", headers=headers, json=body)
    assert response.json()["error"]["code"] == "DESCRIPTION_REQUIRED"
    response = await client.post(
        f"/facilities/{fid}/appointments",
        headers=headers,
        json={**body, "description": "Yonetim adina"},
    )
    assert response.status_code == 200, response.text
    assert response.json()["data"]["description"] == "Yonetim adina"

    with pytest.raises(AssertionError):
        await _series(client, seeded, count=2)  # aciklama yok -> 422
    token = await supplier(client, "tedarikci@anadoluun.com")
    day = weekday(2)
    response = await client.post(
        "/supplier/appointments",
        headers=token,
        json={
            "product_category_id": str(seeded["product_categories"]["unlu"].id),
            "product_name": "Seri Aciklama",
            "quantity": 1,
            "target_date": day.isoformat(),
            "start_at": f"{day.isoformat()}T15:00:00+03:00",
            "duration_minutes": 60,
            "description": "Haftalik karisik sevkiyat",
            "recurring": {"frequency": "weekly", "occurrence_count": 2},
        },
    )
    assert response.status_code == 200, response.text
    occurrences = response.json()["data"]["appointments"]
    assert all(a["description"] == "Haftalik karisik sevkiyat" for a in occurrences)


async def test_makeup_inherits_description_even_when_rule_added_later(
    client, seeded, session_maker
):
    token = await supplier(client)
    response = await client.post("/supplier/appointments", headers=token, json=booking(seeded))
    appointment_id = response.json()["data"]["id"]
    start = datetime.now(UTC) + timedelta(days=3)
    async with session_maker() as db:
        row = await db.get(Appointment, uuid.UUID(appointment_id))
        row.scheduled_start_at = start
        row.scheduled_end_at = start + timedelta(minutes=60)
        row.description = "Eski aciklama"
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
    assert response.json()["data"]["makeup_appointment"]["description"] == "Eski aciklama"


async def test_csv_export_has_description_column(client, seeded):
    await set_mode(client, seeded, "optional")
    token = await supplier(client)
    await client.post(
        "/supplier/appointments",
        headers=token,
        json=booking(seeded, description="Karisik un ve seker"),
    )
    fid = seeded["facility"].id
    day = weekday(2)
    response = await client.get(
        f"/facilities/{fid}/reports/appointments.csv?date_from={day.isoformat()}"
        f"&date_to={(day + timedelta(days=1)).isoformat()}",
        headers=await admin(client),
    )
    assert response.status_code == 200, response.text
    header, *lines = response.text.lstrip("﻿").splitlines()
    assert "aciklama" in header
    assert any("Karisik un ve seker" in line for line in lines)
