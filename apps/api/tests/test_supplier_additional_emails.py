"""Tedarikci ek bildirim e-postalari (musteri karari 2026-11: 10'a kadar).

Tedarikciye giden HER e-posta birincil adrese ve ek adreslerin hepsine gider;
her alici ayri EmailLog satiri alir.
"""

from datetime import date, timedelta

from tests.conftest import auth_headers, login


async def admin(client) -> dict:
    return auth_headers(await login(client, "/auth/login", "admin@cakesbakes.com"))


def weekday(offset: int) -> date:
    day = date.today() + timedelta(days=offset)
    while day.weekday() >= 5:
        day += timedelta(days=1)
    return day


async def test_create_and_patch_validate_and_dedupe(client, seeded):
    fid = seeded["facility"].id
    headers = await admin(client)
    response = await client.post(
        f"/facilities/{fid}/suppliers",
        headers=headers,
        json={
            "company_name": "Ek Posta A.S.",
            "code": "EKP-1",
            "contact_email": "yetkili@ekposta.com",
            "additional_emails": [
                "sevkiyat@ekposta.com",
                " Sevkiyat@ekposta.com",
                "muhasebe@ekposta.com",
            ],
            "create_account": False,
        },
    )
    assert response.status_code == 200, response.text
    supplier = response.json()["data"]
    assert supplier["additional_emails"] == ["sevkiyat@ekposta.com", "muhasebe@ekposta.com"]

    response = await client.patch(
        f"/facilities/{fid}/suppliers/{supplier['id']}",
        headers=headers,
        json={"additional_emails": [f"k{i}@ekposta.com" for i in range(11)]},
    )
    assert response.status_code == 422
    response = await client.patch(
        f"/facilities/{fid}/suppliers/{supplier['id']}",
        headers=headers,
        json={"additional_emails": ["gecersiz-adres"]},
    )
    assert response.status_code == 422
    response = await client.patch(
        f"/facilities/{fid}/suppliers/{supplier['id']}",
        headers=headers,
        json={"additional_emails": []},
    )
    assert response.status_code == 200
    assert response.json()["data"]["additional_emails"] == []


async def test_supplier_emails_fan_out_to_additional_addresses(client, seeded):
    fid = seeded["facility"].id
    headers = await admin(client)
    supplier_id = seeded["suppliers"]["soguk"].id
    response = await client.patch(
        f"/facilities/{fid}/suppliers/{supplier_id}",
        headers=headers,
        # birincil adresin tekrari atilir
        json={"additional_emails": ["sevkiyat@marmarasoguk.com", "TEDARIKCI@marmarasoguk.com"]},
    )
    assert response.status_code == 200, response.text

    token = auth_headers(await login(client, "/auth/supplier-login", "tedarikci@marmarasoguk.com"))
    day = weekday(3)
    created = await client.post(
        "/supplier/appointments",
        headers=token,
        json={
            "product_category_id": str(seeded["product_categories"]["soguk"].id),
            "product_name": "Coklu Alici",
            "quantity": 1,
            "target_date": day.isoformat(),
            "start_at": f"{day.isoformat()}T11:00:00+03:00",
            "duration_minutes": 60,
        },
    )
    appointment_id = created.json()["data"]["id"]
    response = await client.post(
        f"/facilities/{fid}/appointments/{appointment_id}/approve", headers=headers
    )
    assert response.status_code == 200, response.text

    logs = (
        await client.get(f"/facilities/{fid}/email-logs?limit=200", headers=headers)
    ).json()["data"]["items"]
    approved = sorted(
        e["recipient_email"]
        for e in logs
        if e["template_key"] == "appointment_approved" and e.get("appointment_id") == appointment_id
    )
    assert approved == ["sevkiyat@marmarasoguk.com", "tedarikci@marmarasoguk.com"]
