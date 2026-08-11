"""Rampa kategorizasyonu, otomatik atama ve rampa degisimi.

Urun kurallari:
1. Rampa yalnizca KABUL ETTIGI urun kategorisindeki randevuyu alir
   (bos kategori listesi = hepsini kabul et, geriye uyumluluk).
2. Rampa secilmezse sistem otomatik atar: uyumlu VE o aralikta bos rampalar
   arasindan gun ici en az dolu olan.
3. Rampa degisimi REVIZE degildir: saat/sure ve DURUM korunur, tedarikciden
   yeniden onay istenmez; tedarikci yalnizca bilgilendirilir.
"""

from datetime import date, timedelta

from tests.conftest import auth_headers, login


def next_weekday() -> date:
    """Seed randevularinin UZAGINDA bir hafta ici gun.

    Seed, -6 ile +4 gun arasina ornek randevu yayar; testler temiz bir gunde
    calismazsa doluluk beklentileri seed verisiyle carpisir.
    """
    day = date.today() + timedelta(days=21)
    while day.weekday() >= 5:
        day += timedelta(days=1)
    return day


async def _admin(client):
    return await login(client, "/auth/login", "admin@cakesbakes.com")


async def _create_admin_appointment(
    client, seeded, token, *, category: str, time: str, dock_id=None, supplier="un"
):
    day = next_weekday()
    body = {
        "supplier_id": str(seeded["suppliers"][supplier].id),
        "product_category_id": str(seeded["product_categories"][category].id),
        "product_name": "Test Yuku",
        "quantity": 1,
        "quantity_unit": "pallet",
        "target_date": day.isoformat(),
        "start_at": f"{day.isoformat()}T{time}:00+03:00",
        "duration_minutes": 60,
    }
    if dock_id is not None:
        # Sema varsayilani auto_assign_dock=True; kapatilmazsa dock_id yok sayilir.
        body["dock_id"] = str(dock_id)
        body["auto_assign_dock"] = False
    response = await client.post(
        f"/facilities/{seeded['facility'].id}/appointments",
        headers=auth_headers(token),
        json=body,
    )
    assert response.status_code == 200, response.text
    return response.json()["data"]


# ---------- 1. kategori -> uygun rampa suzmesi ----------


async def test_dock_options_only_lists_category_compatible_docks(client, seeded):
    """Soguk zincir randevusunda yalnizca soguk kabul eden rampa listelenir.

    Seed: Rampa 1 (unlu/ambalaj/genel), Rampa 2 (soguk/unlu/genel),
    Rampa 3 (genel/ambalaj). Soguk => yalnizca Rampa 2.
    """
    token = await _admin(client)
    appointment = await _create_admin_appointment(
        client, seeded, token, category="soguk", time="09", supplier="soguk"
    )
    response = await client.get(
        f"/facilities/{seeded['facility'].id}/appointments/{appointment['id']}/dock-options",
        headers=auth_headers(token),
    )
    assert response.status_code == 200, response.text
    options = response.json()["data"]["options"]
    assert [o["name"] for o in options] == ["Rampa 2"]
    assert options[0]["is_current"] is True


async def test_dock_options_marks_occupied_docks_unavailable(client, seeded):
    """Uyumlu ama DOLU rampa listeden dusmez; sebebiyle birlikte doner.

    Kullanici "neden secemiyorum" sorusunun cevabini gorebilmeli.
    """
    token = await _admin(client)
    # Ayni saatte iki 'genel' randevu: ikisi farkli rampalara duser.
    first = await _create_admin_appointment(
        client, seeded, token, category="genel", time="10"
    )
    second = await _create_admin_appointment(
        client, seeded, token, category="genel", time="10"
    )
    assert first["dock_id"] != second["dock_id"]

    response = await client.get(
        f"/facilities/{seeded['facility'].id}/appointments/{first['id']}/dock-options",
        headers=auth_headers(token),
    )
    options = {o["name"]: o for o in response.json()["data"]["options"]}
    busy = next(o for o in options.values() if o["dock_id"] == second["dock_id"])
    assert busy["available"] is False
    assert busy["reason_code"] is not None
    assert busy["reason"]  # kullaniciya gosterilecek aciklama


# ---------- 2. otomatik atama ----------


async def test_auto_assignment_skips_busy_docks(client, seeded):
    """Kullanicinin senaryosu: dolu rampalar atlanir, bos olana atanir.

    'genel' kategorisini 3 rampa da kabul eder. Ayni saate ucuncu randevu
    acildiginda ilk ikisi doludur; sistem kalan bos rampaya atar.
    """
    token = await _admin(client)
    created = [
        await _create_admin_appointment(client, seeded, token, category="genel", time="13")
        for _ in range(3)
    ]
    assigned = {a["dock_id"] for a in created}
    assert len(assigned) == 3, "her randevu ayri bir bos rampaya atanmali"

    # Dorduncu randevu: bos rampa kalmadi -> engellenir (sessizce ust uste binmez)
    day = next_weekday()
    overflow = await client.post(
        f"/facilities/{seeded['facility'].id}/appointments",
        headers=auth_headers(token),
        json={
            "supplier_id": str(seeded["suppliers"]["un"].id),
            "product_category_id": str(seeded["product_categories"]["genel"].id),
            "product_name": "Tasma",
            "quantity": 1,
            "quantity_unit": "pallet",
            "target_date": day.isoformat(),
            "start_at": f"{day.isoformat()}T13:00:00+03:00",
            "duration_minutes": 60,
        },
    )
    assert overflow.status_code == 422  # kural ihlali (bos rampa yok)


async def test_auto_assignment_prefers_least_busy_dock(client, seeded):
    """Bos rampalar arasinda gun ici en az dolu olan secilir."""
    token = await _admin(client)
    # Rampa 2'yi gunun baska saatlerinde mesgul et (soguk yalnizca R2'ye duser).
    for hour in ("08", "09", "11"):
        await _create_admin_appointment(
            client, seeded, token, category="soguk", time=hour, supplier="soguk"
        )
    # 15:00'te 'genel': R1/R2/R3 uygun ve bos ama R2 gun icinde daha dolu.
    late = await _create_admin_appointment(
        client, seeded, token, category="genel", time="15"
    )
    assert late["dock_id"] != str(seeded["docks"]["d2"].id)


# ---------- 3. rampa degisimi (revize DEGIL) ----------


async def test_dock_change_keeps_status_and_time(client, seeded):
    """Rampa degisimi durumu ve saati DEGISTIRMEZ (revizeden farki budur)."""
    token = await _admin(client)
    appointment = await _create_admin_appointment(
        client, seeded, token, category="genel", time="14"
    )
    assert appointment["status"] == "approved"  # admin adina olusturma onayli dogar
    target = next(
        d for d in seeded["docks"].values() if str(d.id) != appointment["dock_id"]
    )

    response = await client.post(
        f"/facilities/{seeded['facility'].id}/appointments/{appointment['id']}/dock-change",
        headers=auth_headers(token),
        json={"dock_id": str(target.id), "note": "Sevkiyat yogunlugu"},
    )
    assert response.status_code == 200, response.text
    data = response.json()["data"]
    assert data["dock_id"] == str(target.id)
    assert data["status"] == "approved", "rampa degisimi revizyon bekletmeye DUSURMEZ"
    assert data["scheduled_start_at"] == appointment["scheduled_start_at"]
    assert data["scheduled_end_at"] == appointment["scheduled_end_at"]


async def test_dock_change_rejects_incompatible_dock(client, seeded):
    """Kategoriyi kabul etmeyen rampaya tasima reddedilir."""
    token = await _admin(client)
    appointment = await _create_admin_appointment(
        client, seeded, token, category="soguk", time="09", supplier="soguk"
    )
    # Rampa 1 soguk zincir kabul etmiyor
    response = await client.post(
        f"/facilities/{seeded['facility'].id}/appointments/{appointment['id']}/dock-change",
        headers=auth_headers(token),
        json={"dock_id": str(seeded["docks"]["d1"].id)},
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "NO_COMPATIBLE_DOCK"


async def test_dock_change_rejects_occupied_dock(client, seeded):
    """Hedef rampa o aralikta doluysa tasima reddedilir (ust uste binme yok)."""
    token = await _admin(client)
    first = await _create_admin_appointment(
        client, seeded, token, category="genel", time="10"
    )
    second = await _create_admin_appointment(
        client, seeded, token, category="genel", time="10"
    )
    response = await client.post(
        f"/facilities/{seeded['facility'].id}/appointments/{first['id']}/dock-change",
        headers=auth_headers(token),
        json={"dock_id": second["dock_id"]},
    )
    assert response.status_code == 422


async def test_dock_change_auto_moves_to_less_busy_dock(client, seeded):
    """dock_id verilmezse sistem gun ici EN AZ dolu bos rampaya tasir."""
    token = await _admin(client)
    d1, d2 = seeded["docks"]["d1"], seeded["docks"]["d2"]
    # Randevu bilerek Rampa 1'e sabitlenir, sonra Rampa 1 gun icinde doldurulur.
    appointment = await _create_admin_appointment(
        client, seeded, token, category="genel", time="16", dock_id=d1.id
    )
    assert appointment["dock_id"] == str(d1.id)
    for hour in ("08", "09", "11"):
        await _create_admin_appointment(
            client, seeded, token, category="genel", time=hour, dock_id=d1.id
        )

    response = await client.post(
        f"/facilities/{seeded['facility'].id}/appointments/{appointment['id']}/dock-change",
        headers=auth_headers(token),
        json={},
    )
    assert response.status_code == 200, response.text
    moved = response.json()["data"]
    assert moved["dock_id"] == str(d2.id), "gun ici daha bos olan rampaya tasinmali"
    assert moved["scheduled_start_at"] == appointment["scheduled_start_at"]


async def test_dock_change_is_noop_when_already_optimal(client, seeded):
    """Zaten en uygun rampadaysa gereksiz degisiklik/bildirim uretilmez."""
    token = await _admin(client)
    appointment = await _create_admin_appointment(
        client, seeded, token, category="soguk", time="09", supplier="soguk"
    )
    response = await client.post(
        f"/facilities/{seeded['facility'].id}/appointments/{appointment['id']}/dock-change",
        headers=auth_headers(token),
        json={},
    )
    assert response.status_code == 200, response.text
    assert response.json()["data"]["dock_id"] == appointment["dock_id"]


async def test_dock_change_notifies_supplier(client, seeded):
    """Saat degismese de tedarikci bilgilendirilir (surucu dogru rampaya gitsin)."""
    supplier_token = await login(
        client, "/auth/supplier-login", "tedarikci@anadoluun.com"
    )
    admin_token = await _admin(client)
    appointment = await _create_admin_appointment(
        client, seeded, admin_token, category="genel", time="14"
    )
    target = next(
        d for d in seeded["docks"].values() if str(d.id) != appointment["dock_id"]
    )
    await client.post(
        f"/facilities/{seeded['facility'].id}/appointments/{appointment['id']}/dock-change",
        headers=auth_headers(admin_token),
        json={"dock_id": str(target.id)},
    )
    notifications = await client.get(
        "/supplier/notifications", headers=auth_headers(supplier_token)
    )
    assert notifications.status_code == 200, notifications.text
    types = [n["type"] for n in notifications.json()["data"]]
    assert "appointment_dock_changed" in types


async def test_dock_change_blocked_after_completion(client, seeded):
    """Tamamlanmis randevunun rampasi degistirilemez (gecmis kayit korunur)."""
    token = await _admin(client)
    appointment = await _create_admin_appointment(
        client, seeded, token, category="genel", time="14"
    )
    base = f"/facilities/{seeded['facility'].id}/appointments/{appointment['id']}"
    completed = await client.post(f"{base}/complete", headers=auth_headers(token))
    assert completed.status_code == 200, completed.text

    response = await client.post(f"{base}/dock-change", headers=auth_headers(token), json={})
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "INVALID_STATUS_TRANSITION"
