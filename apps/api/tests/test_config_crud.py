"""Sprint 2: facility konfigurasyon CRUD + izolasyon + availability entegrasyonu."""

from datetime import date, timedelta

from sqlalchemy import select

from app.models import AuditLog
from tests.conftest import auth_headers, login
from tests.test_isolation import _create_other_tenant


def next_weekday(extra: int = 1) -> date:
    day = date.today() + timedelta(days=extra)
    while day.weekday() >= 5:
        day += timedelta(days=1)
    return day


async def admin(client):
    return auth_headers(await login(client, "/auth/login", "admin@cakesbakes.com"))


# ---------- Product Category CRUD ----------


async def test_product_category_crud_cycle(client, seeded, session_maker):
    headers = await admin(client)
    fid = seeded["facility"].id
    base = f"/facilities/{fid}/categories"

    # create
    response = await client.post(
        base,
        headers=headers,
        json={
            "name": "Kuru Gida",
            "display_name": "Kuru Gida",
            "min_block_minutes": 40,
            "default_vehicle_category_id": str(seeded["vehicle_categories"]["kamyon"].id),
        },
    )
    assert response.status_code == 200, response.text
    created = response.json()["data"]
    assert created["min_block_minutes"] == 40

    # duplicate name -> 409
    response = await client.post(
        base, headers=headers, json={"name": "Kuru Gida", "display_name": "X"}
    )
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "DUPLICATE_NAME"

    # patch
    response = await client.patch(
        f"{base}/{created['id']}", headers=headers, json={"min_block_minutes": 55}
    )
    assert response.json()["data"]["min_block_minutes"] == 55

    # deactivate (soft delete)
    response = await client.delete(f"{base}/{created['id']}", headers=headers)
    assert response.status_code == 200
    assert response.json()["data"]["is_active"] is False

    # audit kayitlari uretildi
    async with session_maker() as db:
        actions = [
            row[0]
            for row in await db.execute(
                select(AuditLog.action).where(AuditLog.entity_type == "product_category")
            )
        ]
    assert "product_category.create" in actions
    assert "product_category.update" in actions
    assert "product_category.deactivate" in actions


async def test_product_category_validation(client, seeded, session_maker):
    headers = await admin(client)
    fid = seeded["facility"].id
    base = f"/facilities/{fid}/categories"

    # min_block_minutes pozitif olmali
    response = await client.post(
        base, headers=headers,
        json={"name": "X", "display_name": "X", "min_block_minutes": 0},
    )
    assert response.status_code == 422

    # cross-facility default vehicle reddedilir
    other_facility = await _create_other_tenant(session_maker)
    other_headers = auth_headers(await login(client, "/auth/login", "admin@rakip.com"))
    response = await client.post(
        f"/facilities/{other_facility.id}/vehicle-categories",
        headers=other_headers,
        json={"name": "Yabanci Arac", "display_name": "Yabanci"},
    )
    foreign_vehicle_id = response.json()["data"]["id"]

    response = await client.post(
        base, headers=headers,
        json={
            "name": "Sizinti Deneme",
            "display_name": "X",
            "default_vehicle_category_id": foreign_vehicle_id,
        },
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "INVALID_REFERENCE"


async def test_product_category_block_range(client, seeded):
    """Kategori bazli sure araligi: max opsiyonel, ama min'in altina inemez."""
    headers = await admin(client)
    base = f"/facilities/{seeded['facility'].id}/categories"

    # max < min -> create reddedilir
    response = await client.post(
        base, headers=headers,
        json={
            "name": "Ters Aralik", "display_name": "Ters",
            "min_block_minutes": 60, "max_block_minutes": 30,
        },
    )
    assert response.status_code == 422

    # gecerli aralik
    response = await client.post(
        base, headers=headers,
        json={
            "name": "Et", "display_name": "Et Urunleri",
            "min_block_minutes": 30, "max_block_minutes": 120,
        },
    )
    assert response.status_code == 200, response.text
    created = response.json()["data"]
    assert created["max_block_minutes"] == 120

    # SONUC durum kontrolu: tek basina min yukseltmek araligi bozamaz
    response = await client.patch(
        f"{base}/{created['id']}", headers=headers, json={"min_block_minutes": 150}
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"

    # ...ve tek basina max dusurmek de bozamaz
    response = await client.patch(
        f"{base}/{created['id']}", headers=headers, json={"max_block_minutes": 15}
    )
    assert response.status_code == 422

    # max = null -> ust sinir kaldirilir (geriye uyumlu davranis)
    response = await client.patch(
        f"{base}/{created['id']}", headers=headers, json={"max_block_minutes": None}
    )
    assert response.status_code == 200, response.text
    assert response.json()["data"]["max_block_minutes"] is None

    # ust sinir yokken min serbestce yukseltilebilir
    response = await client.patch(
        f"{base}/{created['id']}", headers=headers, json={"min_block_minutes": 150}
    )
    assert response.status_code == 200


async def test_block_minutes_reject_out_of_range_values(client, seeded):
    """Tamsayi tasmasi 500 yerine temiz 422 dondurmeli (kategori + tedarikci)."""
    headers = await admin(client)
    fid = seeded["facility"].id

    for value in (1441, 2_147_483_648, 10**30):
        response = await client.post(
            f"/facilities/{fid}/categories",
            headers=headers,
            json={
                "name": f"Asiri {value}", "display_name": "X",
                "min_block_minutes": 30, "max_block_minutes": value,
            },
        )
        assert response.status_code == 422, f"{value} icin 422 bekleniyordu"

    response = await client.post(
        f"/facilities/{fid}/suppliers",
        headers=headers,
        json={
            "company_name": "Asiri Limit A.S.", "code": "SUP-CAP",
            "min_block_minutes": 30, "max_block_minutes": 2_147_483_648,
            "create_account": False,
        },
    )
    assert response.status_code == 422


async def test_product_category_max_block_defaults_to_null(client, seeded):
    """Mevcut entegrasyonlar alani hic gondermezse davranis degismez."""
    headers = await admin(client)
    base = f"/facilities/{seeded['facility'].id}/categories"
    response = await client.post(
        base, headers=headers, json={"name": "Sinirsiz", "display_name": "Sinirsiz"}
    )
    assert response.status_code == 200, response.text
    assert response.json()["data"]["max_block_minutes"] is None


async def test_inactive_category_rejected_in_appointment_create(client, seeded):
    headers = await admin(client)
    fid = seeded["facility"].id
    category_id = seeded["product_categories"]["genel"].id

    # kategoriyi pasiflestir
    await client.delete(f"/facilities/{fid}/categories/{category_id}", headers=headers)

    # tedarikci listede goremez
    supplier_token = await login(client, "/auth/supplier-login", "tedarikci@anadoluun.com")
    response = await client.get(
        f"/facilities/{fid}/categories", headers=auth_headers(supplier_token)
    )
    names = [c["name"] for c in response.json()["data"]]
    assert "Genel" not in names

    # create akisi 404 doner (aktif degil)
    day = next_weekday()
    response = await client.post(
        "/supplier/appointments",
        headers=auth_headers(supplier_token),
        json={
            "product_category_id": str(category_id),
            "product_name": "X",
            "quantity": 1,
            "target_date": day.isoformat(),
            "start_at": f"{day.isoformat()}T10:00:00+03:00",
            "duration_minutes": 60,
        },
    )
    assert response.status_code == 404


# ---------- Vehicle Category CRUD ----------


async def test_vehicle_category_crud_cycle(client, seeded):
    headers = await admin(client)
    fid = seeded["facility"].id
    base = f"/facilities/{fid}/vehicle-categories"

    response = await client.post(
        base, headers=headers,
        json={
            "name": "Panelvan",
            "display_name": "Panelvan",
            "physical_note": "Alcak tavan",
        },
    )
    assert response.status_code == 200
    vid = response.json()["data"]["id"]

    response = await client.post(
        base, headers=headers, json={"name": "Panelvan", "display_name": "Y"}
    )
    assert response.status_code == 409

    response = await client.patch(
        f"{base}/{vid}", headers=headers, json={"description": "Kucuk teslimatlar"}
    )
    assert response.json()["data"]["description"] == "Kucuk teslimatlar"

    response = await client.delete(f"{base}/{vid}", headers=headers)
    assert response.json()["data"]["is_active"] is False


# ---------- Dock CRUD ----------


async def test_dock_crud_and_cross_facility_refs(client, seeded, session_maker):
    headers = await admin(client)
    fid = seeded["facility"].id
    base = f"/facilities/{fid}/docks"

    response = await client.post(
        base, headers=headers,
        json={
            "name": "Rampa 4",
            "note": "Yeni genisleme",
            "accepted_product_category_ids": [str(seeded["product_categories"]["genel"].id)],
            "accepted_vehicle_category_ids": [],
            "working_hours_json": {"mon": {"start": "09:00", "end": "17:00"}, "sun": None},
        },
    )
    assert response.status_code == 200, response.text
    dock = response.json()["data"]
    assert dock["accepted_vehicle_category_ids"] == []  # bos = tum araclar

    # cross-facility kategori baglanamaz
    other_facility = await _create_other_tenant(session_maker)
    other_headers = auth_headers(await login(client, "/auth/login", "admin@rakip.com"))
    response = await client.post(
        f"/facilities/{other_facility.id}/categories",
        headers=other_headers,
        json={"name": "Rakip Kategori", "display_name": "R"},
    )
    foreign_category_id = response.json()["data"]["id"]

    response = await client.patch(
        f"{base}/{dock['id']}", headers=headers,
        json={"accepted_product_category_ids": [foreign_category_id]},
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "INVALID_REFERENCE"

    # gecersiz working hours reddedilir
    response = await client.patch(
        f"{base}/{dock['id']}", headers=headers,
        json={"working_hours_json": {"mon": {"start": "18:00", "end": "08:00"}}},
    )
    assert response.status_code == 422


async def test_deactivated_dock_removed_from_availability(client, seeded):
    headers = await admin(client)
    fid = seeded["facility"].id
    day = next_weekday()

    async def slot_count() -> int:
        response = await client.post(
            f"/facilities/{fid}/availability/evaluate",
            headers=headers,
            json={
                "supplier_id": str(seeded["suppliers"]["soguk"].id),
                "product_category_id": str(seeded["product_categories"]["soguk"].id),
                "target_date": day.isoformat(),
            },
        )
        return len(response.json()["data"])

    # Soguk zinciri yalnizca Rampa 2 kabul eder -> pasiflesince aday kalmaz
    assert await slot_count() > 0
    response = await client.delete(
        f"/facilities/{fid}/docks/{seeded['docks']['d2'].id}", headers=headers
    )
    assert response.json()["data"]["is_active"] is False
    assert await slot_count() == 0


# ---------- Conflict Group CRUD ----------


async def test_conflict_group_crud_and_validation(client, seeded):
    headers = await admin(client)
    fid = seeded["facility"].id
    base = f"/facilities/{fid}/dock-conflict-groups"
    d1 = str(seeded["docks"]["d1"].id)
    d3 = str(seeded["docks"]["d3"].id)

    # tek uye -> 422
    response = await client.post(
        base, headers=headers,
        json={"name": "Eksik", "relation_type": "mutual_block", "member_dock_ids": [d1]},
    )
    assert response.status_code == 422

    # conditional trigger'siz -> 422
    response = await client.post(
        base, headers=headers,
        json={
            "name": "Trigersiz",
            "relation_type": "conditional",
            "member_dock_ids": [d1, d3],
        },
    )
    assert response.status_code == 422

    # gecerli mutual_block grubu
    response = await client.post(
        base, headers=headers,
        json={
            "name": "R1-R3 Ortak Manevra",
            "relation_type": "mutual_block",
            "member_dock_ids": [d1, d3],
        },
    )
    assert response.status_code == 200, response.text
    group = response.json()["data"]
    assert sorted(group["member_dock_ids"]) == sorted([d1, d3])

    # patch: pasiflestir
    response = await client.delete(f"{base}/{group['id']}", headers=headers)
    assert response.json()["data"]["is_active"] is False


async def test_conflict_group_created_via_api_affects_availability(client, seeded):
    """CRUD -> rule engine entegrasyonu: yeni mutual grup kardes rampayi bloke eder."""
    headers = await admin(client)
    fid = seeded["facility"].id
    day = next_weekday()
    d1 = str(seeded["docks"]["d1"].id)
    d2 = str(seeded["docks"]["d2"].id)

    # once R1'e standart randevu koy (Unlu Mamul, TIR degil -> kamyonet secelim ki
    # mevcut kosullu TIR grubu tetiklenmesin)
    supplier_token = await login(client, "/auth/supplier-login", "tedarikci@anadoluun.com")
    response = await client.post(
        "/supplier/appointments",
        headers=auth_headers(supplier_token),
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
    assert response.status_code == 200, response.text
    assigned_dock = response.json()["data"]["dock_id"]
    assert assigned_dock == d1  # en az dolu + alfabetik ilk

    def slot_at(slots, hhmm):
        return next(s for s in slots if s["start"][11:16] == hhmm)

    async def availability():
        response = await client.post(
            f"/facilities/{fid}/availability/evaluate",
            headers=headers,
            json={
                "supplier_id": str(seeded["suppliers"]["un"].id),
                "product_category_id": str(seeded["product_categories"]["unlu"].id),
                "vehicle_category_id": str(seeded["vehicle_categories"]["kamyonet"].id),
                "target_date": day.isoformat(),
                "duration_minutes": 60,
            },
        )
        return response.json()["data"]

    # Grup yokken: 10:00 slotunda R2 hala aday (partial)
    slots = await availability()
    assert d2 in slot_at(slots, "10:00")["candidate_dock_ids"]

    # Simdi R1-R2 KOSULSUZ mutual_block grubu olustur
    response = await client.post(
        f"/facilities/{fid}/dock-conflict-groups",
        headers=headers,
        json={
            "name": "R1-R2 Tam Blok",
            "relation_type": "mutual_block",
            "member_dock_ids": [d1, d2],
        },
    )
    assert response.status_code == 200

    # Ayni slotta R2 artik aday DEGIL (grup blokaji)
    slots = await availability()
    assert d2 not in slot_at(slots, "10:00")["candidate_dock_ids"]


# ---------- Override CRUD + availability ----------


async def test_override_crud_validation(client, seeded):
    headers = await admin(client)
    fid = seeded["facility"].id
    base = f"/facilities/{fid}/dock-overrides"
    d1 = str(seeded["docks"]["d1"].id)
    day = next_weekday(5)

    # extra_hours saatsiz -> 422
    response = await client.post(
        base, headers=headers,
        json={"dock_id": d1, "date": day.isoformat(), "type": "extra_hours"},
    )
    assert response.status_code == 422

    # end <= start -> 422
    response = await client.post(
        base, headers=headers,
        json={
            "dock_id": d1, "date": day.isoformat(), "type": "extra_hours",
            "start_time": "14:00", "end_time": "12:00",
        },
    )
    assert response.status_code == 422

    # rampasiz istek -> 422
    response = await client.post(
        base, headers=headers, json={"date": day.isoformat(), "type": "closed"}
    )
    assert response.status_code == 422

    # gecerli closed (tekil dock_id geriye uyumlu; yanit her zaman liste)
    response = await client.post(
        base, headers=headers,
        json={"dock_id": d1, "date": day.isoformat(), "type": "closed", "reason": "Bakim"},
    )
    assert response.status_code == 200
    created = response.json()["data"]
    assert len(created) == 1
    override_id = created[0]["id"]

    # ayni rampa+gun icin ikinci aktif istisna -> 422
    response = await client.post(
        base, headers=headers,
        json={"dock_ids": [d1], "date": day.isoformat(), "type": "closed"},
    )
    assert response.status_code == 422

    # patch + deactivate
    response = await client.patch(
        f"{base}/{override_id}", headers=headers, json={"reason": "Uzatilan bakim"}
    )
    assert response.json()["data"]["reason"] == "Uzatilan bakim"
    response = await client.delete(f"{base}/{override_id}", headers=headers)
    assert response.json()["data"]["is_active"] is False


async def test_override_multi_dock_create(client, seeded):
    """Coklu secim: tek istekte birden fazla rampaya ayni istisna yazilir."""
    headers = await admin(client)
    fid = seeded["facility"].id
    base = f"/facilities/{fid}/dock-overrides"
    d1 = str(seeded["docks"]["d1"].id)
    d2 = str(seeded["docks"]["d2"].id)
    day = next_weekday(6)

    response = await client.post(
        base, headers=headers,
        json={
            "dock_ids": [d1, d2, d1],  # tekrar eden id tekillestirilir
            "date": day.isoformat(),
            "type": "closed",
            "reason": "Sayim",
        },
    )
    assert response.status_code == 200
    created = response.json()["data"]
    assert len(created) == 2
    assert {row["dock_id"] for row in created} == {d1, d2}
    assert all(row["reason"] == "Sayim" for row in created)

    # Her rampa icin ayri kayit listelenir
    listed = (await client.get(base, headers=headers)).json()["data"]
    same_day = [row for row in listed if row["date"] == day.isoformat()]
    assert len(same_day) == 2


async def test_override_rejects_foreign_dock_in_multi_select(client, seeded, session_maker):
    """Coklu secim baska tesisin rampasini sizdirmamali (kismi yazma da yok)."""
    headers = await admin(client)
    fid = seeded["facility"].id
    base = f"/facilities/{fid}/dock-overrides"
    d1 = str(seeded["docks"]["d1"].id)
    day = next_weekday(9)

    other_facility = await _create_other_tenant(session_maker)
    other_headers = auth_headers(await login(client, "/auth/login", "admin@rakip.com"))
    response = await client.post(
        f"/facilities/{other_facility.id}/docks",
        headers=other_headers,
        json={"name": "Rakip Rampa"},
    )
    foreign_dock_id = response.json()["data"]["id"]

    response = await client.post(
        base,
        headers=headers,
        json={"dock_ids": [d1, foreign_dock_id], "date": day.isoformat(), "type": "closed"},
    )
    assert response.status_code == 422
    listed = (await client.get(base, headers=headers)).json()["data"]
    assert [row for row in listed if row["date"] == day.isoformat()] == []


async def test_closed_override_closes_availability(client, seeded):
    headers = await admin(client)
    fid = seeded["facility"].id
    day = next_weekday()
    d2 = str(seeded["docks"]["d2"].id)

    async def availability():
        response = await client.post(
            f"/facilities/{fid}/availability/evaluate",
            headers=headers,
            json={
                "supplier_id": str(seeded["suppliers"]["soguk"].id),
                "product_category_id": str(seeded["product_categories"]["soguk"].id),
                "target_date": day.isoformat(),
            },
        )
        return response.json()["data"]

    assert len(await availability()) > 0

    # Soguk zincirin tek rampasi R2'yi o gun kapat
    response = await client.post(
        f"/facilities/{fid}/dock-overrides",
        headers=headers,
        json={"dock_id": d2, "date": day.isoformat(), "type": "closed"},
    )
    override_id = response.json()["data"][0]["id"]
    assert await availability() == []

    # Override pasiflesince gun tekrar acilir
    await client.delete(f"/facilities/{fid}/dock-overrides/{override_id}", headers=headers)
    assert len(await availability()) > 0


async def test_extra_hours_override_opens_sunday(client, seeded):
    headers = await admin(client)
    fid = seeded["facility"].id
    d2 = str(seeded["docks"]["d2"].id)
    # onumuzdeki pazar (working profile: sun=None -> normalde kapali)
    today = date.today()
    sunday = today + timedelta(days=((6 - today.weekday()) % 7) or 7)

    async def availability():
        response = await client.post(
            f"/facilities/{fid}/availability/evaluate",
            headers=headers,
            json={
                "supplier_id": str(seeded["suppliers"]["soguk"].id),
                "product_category_id": str(seeded["product_categories"]["soguk"].id),
                "target_date": sunday.isoformat(),
            },
        )
        return response.json()["data"]

    assert await availability() == []  # pazar kapali

    response = await client.post(
        f"/facilities/{fid}/dock-overrides",
        headers=headers,
        json={
            "dock_id": d2, "date": sunday.isoformat(), "type": "extra_hours",
            "start_time": "09:00", "end_time": "13:00", "reason": "Ek mesai",
        },
    )
    assert response.status_code == 200
    slots = await availability()
    assert len(slots) > 0
    assert slots[0]["start"][11:16] == "09:00"


async def test_override_dock_scope_enforced(client, seeded, session_maker):
    """Rampa scope'lu uyelik yalnizca kendi rampalarina istisna yazabilir."""
    from app.core.permissions import TenantPermission
    from app.models import FacilityMembership, Role

    fid = seeded["facility"].id
    d1 = str(seeded["docks"]["d1"].id)
    d2 = str(seeded["docks"]["d2"].id)
    day = next_weekday(7)

    # Rampa yoneticisini yalniz R1'e scope'la ve rolune calendar.override ekle
    # (varsayilan rolde yoktur; bu izin verilse bile scope disina cikamamali).
    async with session_maker() as db:
        membership = (
            await db.execute(
                select(FacilityMembership).where(
                    FacilityMembership.tenant_user_id == seeded["users"]["dock"].id
                )
            )
        ).scalar_one()
        membership.assigned_dock_ids = [d1]
        role = (
            await db.execute(select(Role).where(Role.name == "Rampa / Depo Yoneticisi"))
        ).scalar_one()
        role.permissions_json = [*role.permissions_json, TenantPermission.CALENDAR_OVERRIDE]
        await db.commit()

    manager = auth_headers(await login(client, "/auth/login", "rampa@cakesbakes.com"))
    base = f"/facilities/{fid}/dock-overrides"

    # Scope disi rampa -> 403
    response = await client.post(
        base, headers=manager, json={"dock_ids": [d2], "date": day.isoformat(), "type": "closed"}
    )
    assert response.status_code == 403

    # Karisik secimde de hicbir kayit olusmamali (kismi yazma yok)
    response = await client.post(
        base,
        headers=manager,
        json={"dock_ids": [d1, d2], "date": day.isoformat(), "type": "closed"},
    )
    assert response.status_code == 403
    listed = (await client.get(base, headers=manager)).json()["data"]
    assert [row for row in listed if row["date"] == day.isoformat()] == []

    # Kendi rampasi -> 200
    response = await client.post(
        base, headers=manager, json={"dock_ids": [d1], "date": day.isoformat(), "type": "closed"}
    )
    assert response.status_code == 200

    # Scope disi mevcut istisnayi duzenleyemez/pasiflestiremez (seed: R3 bakim)
    admin_headers = await admin(client)
    all_rows = (await client.get(base, headers=admin_headers)).json()["data"]
    foreign = next(row for row in all_rows if row["dock_id"] not in (d1, d2))
    assert (
        await client.patch(f"{base}/{foreign['id']}", headers=manager, json={"reason": "x"})
    ).status_code == 403
    assert (await client.delete(f"{base}/{foreign['id']}", headers=manager)).status_code == 403


async def test_legacy_duplicate_overrides_closed_wins(client, seeded, session_maker):
    """Kural oncesi olusmus cift istisnada KAPALI kazanir (deterministik secim).

    API artik ayni rampa+gun icin ikinci aktif istisnaya izin vermiyor; bu test
    eski verinin musaitlik ve takvimde tutarli davrandigini garanti eder.
    """
    from datetime import time

    from app.core.enums import DockOverrideType
    from app.models import DockOverride

    headers = await admin(client)
    fid = seeded["facility"].id
    facility = seeded["facility"]
    d2 = seeded["docks"]["d2"]
    day = next_weekday(8)

    async with session_maker() as db:
        db.add_all(
            [
                # Once EK MESAI, sonra KAPALI: "ilk eslesen" mantigi ek mesaiyi
                # secerdi; kapali kazanmali.
                DockOverride(
                    tenant_id=facility.tenant_id, facility_id=facility.id, dock_id=d2.id,
                    date=day, type=DockOverrideType.extra_hours,
                    start_time=time(9, 0), end_time=time(13, 0),
                ),
                DockOverride(
                    tenant_id=facility.tenant_id, facility_id=facility.id, dock_id=d2.id,
                    date=day, type=DockOverrideType.closed, reason="Bakim",
                ),
            ]
        )
        await db.commit()

    # Musaitlik: soguk zincirin tek rampasi R2 kapali -> slot yok
    response = await client.post(
        f"/facilities/{fid}/availability/evaluate",
        headers=headers,
        json={
            "supplier_id": str(seeded["suppliers"]["soguk"].id),
            "product_category_id": str(seeded["product_categories"]["soguk"].id),
            "target_date": day.isoformat(),
        },
    )
    assert response.json()["data"] == []

    # Takvim gunluk gorunumu ayni sonucu vermeli
    response = await client.get(
        f"/facilities/{fid}/calendar/day?date={day.isoformat()}", headers=headers
    )
    dock_row = next(
        d for d in response.json()["data"]["docks"] if d["id"] == str(d2.id)
    )
    assert dock_row["day_window"] is None


# ---------- Permission / izolasyon ----------


async def test_viewer_cannot_mutate_config(client, seeded):
    headers = auth_headers(await login(client, "/auth/login", "izleyici@cakesbakes.com"))
    fid = seeded["facility"].id
    response = await client.post(
        f"/facilities/{fid}/categories",
        headers=headers,
        json={"name": "Yetkisiz", "display_name": "X"},
    )
    assert response.status_code == 403
    response = await client.delete(
        f"/facilities/{fid}/docks/{seeded['docks']['d1'].id}", headers=headers
    )
    assert response.status_code == 403


async def test_supplier_cannot_access_config_mutation(client, seeded):
    headers = auth_headers(
        await login(client, "/auth/supplier-login", "tedarikci@anadoluun.com")
    )
    fid = seeded["facility"].id
    response = await client.post(
        f"/facilities/{fid}/categories",
        headers=headers,
        json={"name": "Sizma", "display_name": "X"},
    )
    assert response.status_code == 403
    # docks listesi de tedarikciye kapali
    response = await client.get(f"/facilities/{fid}/docks", headers=headers)
    assert response.status_code == 403


async def test_platform_admin_cannot_mutate_operational_config(client, seeded):
    headers = auth_headers(await login(client, "/auth/platform-login", "admin@logislot.com"))
    fid = seeded["facility"].id
    response = await client.post(
        f"/facilities/{fid}/categories",
        headers=headers,
        json={"name": "Platform Sizma", "display_name": "X"},
    )
    assert response.status_code == 403


async def test_other_tenant_admin_cannot_touch_config(client, seeded, session_maker):
    await _create_other_tenant(session_maker)
    headers = auth_headers(await login(client, "/auth/login", "admin@rakip.com"))
    fid = seeded["facility"].id
    response = await client.post(
        f"/facilities/{fid}/vehicle-categories",
        headers=headers,
        json={"name": "Sizinti", "display_name": "X"},
    )
    assert response.status_code == 403
    # var olan kaydi ID ile de okuyamaz
    response = await client.get(
        f"/facilities/{fid}/docks/{seeded['docks']['d1'].id}", headers=headers
    )
    assert response.status_code == 403