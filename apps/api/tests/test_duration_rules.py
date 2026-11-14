"""Islem suresi hesaplama motoru (musteri karari 2026-11).

Sure sevkiyat tipi (birim), miktar, arac tipi ve urun kategorisine gore tesisin
kurallarindan hesaplanir. Kurallar sirayla taranir, ilk eslesen uygulanir;
sabit ya da taban + birim basina; kirpma ve YUKARI yuvarlama. Kilitli modda
tedarikcinin gonderdigi sure yok sayilir.
"""

import uuid
from datetime import date, timedelta
from decimal import Decimal
from types import SimpleNamespace

import pytest

from app.core.enums import DurationCalcType
from app.models import DurationRule
from app.services.duration_rules import (
    compute_rule_minutes,
    estimate_with_rules,
    resolve_duration_policy,
    shadowed_rules,
    sort_by_specificity,
)
from tests.conftest import auth_headers, login

KAMYON, TIR = uuid.uuid4(), uuid.uuid4()
YAG, UN = uuid.uuid4(), uuid.uuid4()
POLICY = {"mode": "computed", "rounding_minutes": 15}


def rule(position=0, **kw) -> DurationRule:
    defaults = dict(
        id=uuid.uuid4(),
        position=position,
        name=None,
        is_active=True,
        vehicle_category_id=None,
        product_category_id=None,
        quantity_unit=None,
        min_quantity=None,
        max_quantity=None,
        calc_type=DurationCalcType.fixed,
        fixed_minutes=None,
        base_minutes=None,
        per_unit_minutes=None,
        min_minutes=None,
        max_minutes=None,
    )
    defaults.update(kw)
    return DurationRule(**defaults)


def category(cid, *, default_vehicle=None, min_block=30):
    return SimpleNamespace(
        id=cid, default_vehicle_category_id=default_vehicle, min_block_minutes=min_block
    )


def estimate(rules, *, cat, vehicle=None, qty, unit="pallet"):
    return estimate_with_rules(
        rules, POLICY, product_category=cat, vehicle_category_id=vehicle,
        quantity=qty, quantity_unit=unit,
    )


# Musterinin toplantida verdigi ornekler: Tir + Un 3 saat (her miktar),
# Tir 10-20 palet 90 dk, Kamyon + Yag 1-5 palet 30 dk, 6-10 palet 45 dk.
CUSTOMER_RULES = [
    rule(0, vehicle_category_id=TIR, product_category_id=UN, fixed_minutes=180),
    rule(1, vehicle_category_id=TIR, quantity_unit="pallet", min_quantity=10, max_quantity=20,
         fixed_minutes=90),
    rule(2, vehicle_category_id=KAMYON, product_category_id=YAG, quantity_unit="pallet",
         min_quantity=1, max_quantity=5, fixed_minutes=30),
    rule(3, vehicle_category_id=KAMYON, product_category_id=YAG, quantity_unit="pallet",
         min_quantity=6, max_quantity=10, fixed_minutes=45),
]


@pytest.mark.parametrize(
    ("vehicle", "cat", "qty", "minutes", "position"),
    [
        (TIR, UN, 12, 180, 0),  # Un icin ozel kural, miktardan bagimsiz
        (TIR, UN, 2, 180, 0),
        (TIR, YAG, 12, 90, 1),  # Tir genel 10-20 palet
        (KAMYON, YAG, 5, 30, 2),
        (KAMYON, YAG, 6, 45, 3),
        (KAMYON, YAG, 10, 45, 3),
    ],
)
def test_customer_examples(vehicle, cat, qty, minutes, position):
    result = estimate(CUSTOMER_RULES, cat=category(cat), vehicle=vehicle, qty=qty)
    assert (result.minutes, result.source, result.rule_position) == (minutes, "rule", position)


def test_no_match_falls_back_to_category_minimum():
    result = estimate(CUSTOMER_RULES, cat=category(YAG, min_block=60), vehicle=KAMYON, qty=11)
    assert result.source == "fallback" and result.minutes == 60
    assert "Eşleşen kural yok" in result.steps[0]


def test_vehicle_defaults_to_category_vehicle():
    result = estimate(CUSTOMER_RULES, cat=category(UN, default_vehicle=TIR), qty=3)
    assert result.minutes == 180


def test_unit_condition_separates_shipment_types():
    rules = [
        rule(0, quantity_unit="sack", calc_type=DurationCalcType.per_unit, base_minutes=10,
             per_unit_minutes=Decimal("0.5")),
        rule(1, quantity_unit="pallet", calc_type=DurationCalcType.per_unit, base_minutes=15,
             per_unit_minutes=Decimal("3")),
    ]
    sack = estimate(rules, cat=category(UN), qty=100, unit="sack")
    pallet = estimate(rules, cat=category(UN), qty=10, unit="pallet")
    assert (sack.minutes, pallet.minutes) == (60, 45)


def test_per_unit_rounds_up_and_clamps():
    per_unit = rule(calc_type=DurationCalcType.per_unit, base_minutes=20,
                    per_unit_minutes=Decimal("2.5"), min_minutes=30, max_minutes=120)
    assert compute_rule_minutes(per_unit, 1, 15)[0] == 30  # 22.5 -> alt sinir 30
    minutes, steps = compute_rule_minutes(per_unit, 9, 15)  # 42.5 -> 45
    assert minutes == 45
    assert steps[0] == "20 dk taban + 9 × 2,5 dk = 42,5 dk"
    assert "yukarı yuvarlandı: 45 dk" in steps[-1]
    assert compute_rule_minutes(per_unit, 60, 15)[0] == 120  # 170 -> ust sinir 120
    assert compute_rule_minutes(per_unit, 9, 1)[0] == 43  # yuvarlama yok -> tavan
    assert compute_rule_minutes(per_unit, 9, 30)[0] == 60


def test_inactive_rules_are_skipped():
    rules = [rule(0, is_active=False, fixed_minutes=5), rule(1, fixed_minutes=50)]
    assert estimate(rules, cat=category(UN), qty=1).minutes == 60  # 50 -> 15'e yukari


def test_shadowed_rules_and_specificity_sort():
    general = rule(0, vehicle_category_id=TIR, fixed_minutes=60)
    specific = rule(1, vehicle_category_id=TIR, product_category_id=UN, fixed_minutes=180)
    other = rule(2, vehicle_category_id=KAMYON, fixed_minutes=30)
    assert shadowed_rules([general, specific, other]) == {specific.id: general.id}
    ordered = sort_by_specificity([general, specific, other])
    assert ordered[0] is specific
    assert shadowed_rules(ordered) == {}
    # Daha dar miktar araligi geneli golgelemez
    narrow = rule(0, min_quantity=1, max_quantity=5, fixed_minutes=10)
    wide = rule(1, min_quantity=0, max_quantity=50, fixed_minutes=20)
    assert shadowed_rules([narrow, wide]) == {}


def test_policy_resolver_survives_garbage():
    default = {"mode": "supplier", "rounding_minutes": 15}
    assert resolve_duration_policy(SimpleNamespace()) == default
    bad = SimpleNamespace(duration_policy_json={"mode": "magic", "rounding_minutes": 7})
    assert resolve_duration_policy(bad) == {"mode": "supplier", "rounding_minutes": 15}


# ---------------------------------------------------------------- API


def _duration(response) -> tuple[int, str]:
    data = response.json()["data"]
    return data["duration_minutes"], data["duration_source"]


async def admin(client) -> dict:
    return auth_headers(await login(client, "/auth/login", "admin@cakesbakes.com"))


def weekday(offset: int) -> date:
    day = date.today() + timedelta(days=offset)
    while day.weekday() >= 5:
        day += timedelta(days=1)
    return day


async def add_rule(client, seeded, headers, body) -> list[dict]:
    fid = seeded["facility"].id
    response = await client.post(f"/facilities/{fid}/duration-rules", headers=headers, json=body)
    assert response.status_code == 200, response.text
    return response.json()["data"]


async def set_policy(client, seeded, headers, **body):
    fid = seeded["facility"].id
    response = await client.patch(f"/facilities/{fid}/duration-policy", headers=headers, json=body)
    assert response.status_code == 200, response.text
    return response.json()["data"]


async def test_rule_crud_order_evaluate_and_audit(client, seeded):
    headers = await admin(client)
    fid = seeded["facility"].id
    tir = str(seeded["vehicle_categories"]["tir"].id)
    unlu = str(seeded["product_categories"]["unlu"].id)

    rules = await add_rule(client, seeded, headers, {
        "name": "Tir genel", "vehicle_category_id": tir, "calc_type": "per_unit",
        "base_minutes": 20, "per_unit_minutes": 2.5,
    })
    rules = await add_rule(client, seeded, headers, {
        "name": "Tir + Un", "vehicle_category_id": tir, "product_category_id": unlu,
        "fixed_minutes": 180,
    })
    assert [r["name"] for r in rules] == ["Tir genel", "Tir + Un"]
    assert rules[1]["shadowed_by"] == rules[0]["id"]  # genel kural ozeli golgeliyor

    response = await client.put(
        f"/facilities/{fid}/duration-rules/order", headers=headers, json={"by_specificity": True}
    )
    rules = response.json()["data"]
    assert [r["name"] for r in rules] == ["Tir + Un", "Tir genel"]
    assert all(r["shadowed_by"] is None for r in rules)

    response = await client.post(
        f"/facilities/{fid}/duration-rules/evaluate",
        headers=headers,
        json={"scenarios": [
            {"product_category_id": unlu, "vehicle_category_id": tir, "quantity": 12},
            {"product_category_id": str(seeded["product_categories"]["genel"].id),
             "vehicle_category_id": tir, "quantity": 12},
        ]},
    )
    results = response.json()["data"]["results"]
    assert [r["minutes"] for r in results] == [180, 60]  # 20 + 12x2.5 = 50 -> 60

    general = rules[1]
    response = await client.patch(
        f"/facilities/{fid}/duration-rules/{general['id']}",
        headers=headers,
        json={**{k: general[k] for k in ("name", "vehicle_category_id", "product_category_id")},
              "calc_type": "fixed", "fixed_minutes": 75},
    )
    assert response.json()["data"][1]["fixed_minutes"] == 75
    response = await client.delete(
        f"/facilities/{fid}/duration-rules/{general['id']}", headers=headers
    )
    assert len(response.json()["data"]) == 1

    actions = {
        e["action"]
        for e in (await client.get(f"/facilities/{fid}/audit-logs?limit=200", headers=headers))
        .json()["data"]["items"]
    }
    assert {"duration_rule.create", "duration_rule.reorder", "duration_rule.update",
            "duration_rule.delete"} <= actions


async def test_rule_validation_and_permissions(client, seeded):
    headers = await admin(client)
    fid = seeded["facility"].id
    for body in (
        {"calc_type": "fixed"},
        {"calc_type": "per_unit", "base_minutes": 10},
        {"fixed_minutes": 30, "min_quantity": 10, "max_quantity": 5},
        {"fixed_minutes": 30, "quantity_unit": "litre"},
    ):
        response = await client.post(
            f"/facilities/{fid}/duration-rules", headers=headers, json=body
        )
        assert response.status_code == 422, body
    response = await client.post(
        f"/facilities/{fid}/duration-rules", headers=headers,
        json={"fixed_minutes": 30, "product_category_id": str(uuid.uuid4())},
    )
    assert response.json()["error"]["code"] == "INVALID_REFERENCE"
    response = await client.patch(
        f"/facilities/{fid}/duration-policy", headers=headers, json={"rounding_minutes": 7}
    )
    assert response.status_code == 422

    viewer = auth_headers(await login(client, "/auth/login", "izleyici@cakesbakes.com"))
    response = await client.post(
        f"/facilities/{fid}/duration-rules", headers=viewer, json={"fixed_minutes": 30}
    )
    assert response.status_code == 403


async def _supplier_booking(client, seeded, *, duration=None, quantity=12, hour=9, offset=8):
    token = auth_headers(await login(client, "/auth/supplier-login", "tedarikci@anadoluun.com"))
    # Seed demo randevularinin uzaginda bir gun (test slotlari cakismasin).
    day = weekday(offset)
    body = {
        "product_category_id": str(seeded["product_categories"]["unlu"].id),
        "product_name": "Un",
        "quantity": quantity,
        "quantity_unit": "pallet",
        "target_date": day.isoformat(),
        "start_at": f"{day.isoformat()}T{hour:02d}:00:00+03:00",
    }
    if duration is not None:
        body["duration_minutes"] = duration
    return token, await client.post("/supplier/appointments", headers=token, json=body)


async def test_computed_mode_ignores_supplier_duration_and_exceeds_category_max(client, seeded):
    headers = await admin(client)
    tir = str(seeded["vehicle_categories"]["tir"].id)
    unlu = str(seeded["product_categories"]["unlu"].id)
    # Un kategorisinin ust siniri 180 dk; kural 210 dk diyor: kural kazanir.
    await add_rule(client, seeded, headers, {
        "vehicle_category_id": tir, "product_category_id": unlu, "fixed_minutes": 210,
    })
    await set_policy(client, seeded, headers, mode="computed")

    token, response = await _supplier_booking(client, seeded, duration=45, hour=8)
    assert response.status_code == 200, response.text
    data = response.json()["data"]
    assert data["duration_minutes"] == 210 and data["duration_source"] == "rule"

    catalog = (await client.get("/supplier/catalog", headers=token)).json()["data"]
    assert catalog["duration_policy"] == {"mode": "computed", "rounding_minutes": 15}
    response = await client.post(
        "/supplier/duration/estimate", headers=token,
        json={"product_category_id": unlu, "quantity": 3},
    )
    estimate = response.json()["data"]
    assert (estimate["minutes"], estimate["source"], estimate["mode"]) == (210, "rule", "computed")

    # Kilitli modda slotlar sunucu suresiyle aranir (istemci 30 dk dese de)
    day = weekday(9)
    slots = (await client.post("/supplier/availability/evaluate", headers=token, json={
        "product_category_id": unlu, "target_date": day.isoformat(), "duration_minutes": 30,
        "quantity": 5, "quantity_unit": "pallet",
    })).json()["data"]
    from datetime import datetime
    first = slots[0]
    span = datetime.fromisoformat(first["end"]) - datetime.fromisoformat(first["start"])
    assert span == timedelta(minutes=210)


async def test_suggested_mode_lets_supplier_deviate_and_fallback(client, seeded):
    headers = await admin(client)
    tir = str(seeded["vehicle_categories"]["tir"].id)
    await add_rule(client, seeded, headers, {
        "vehicle_category_id": tir, "calc_type": "per_unit", "base_minutes": 15,
        "per_unit_minutes": 2.5, "max_minutes": 150,
    })
    await set_policy(client, seeded, headers, mode="suggested")

    _, response = await _supplier_booking(client, seeded, quantity=12, hour=8)
    assert response.json()["data"]["duration_minutes"] == 45  # 15 + 30 = 45
    assert response.json()["data"]["duration_source"] == "rule"
    _, response = await _supplier_booking(client, seeded, duration=60, hour=11)
    assert response.json()["data"]["duration_source"] == "manual"
    assert response.json()["data"]["duration_minutes"] == 60

    # Kural disi (kamyon) -> kategori taban suresi, kaynak fallback
    token = auth_headers(await login(client, "/auth/supplier-login", "tedarikci@anadoluun.com"))
    day = weekday(10)
    response = await client.post("/supplier/appointments", headers=token, json={
        "product_category_id": str(seeded["product_categories"]["unlu"].id),
        "vehicle_category_id": str(seeded["vehicle_categories"]["kamyon"].id),
        "product_name": "Un", "quantity": 4, "target_date": day.isoformat(),
        "start_at": f"{day.isoformat()}T14:00:00+03:00",
    })
    assert response.status_code == 200, response.text
    assert _duration(response) == (45, "fallback")


async def test_admin_can_override_in_computed_mode(client, seeded):
    headers = await admin(client)
    tir = str(seeded["vehicle_categories"]["tir"].id)
    await add_rule(client, seeded, headers, {"vehicle_category_id": tir, "fixed_minutes": 90})
    await set_policy(client, seeded, headers, mode="computed")
    fid = seeded["facility"].id
    day = weekday(8)
    body = {
        "supplier_id": str(seeded["suppliers"]["un"].id),
        "product_category_id": str(seeded["product_categories"]["unlu"].id),
        "product_name": "Un", "quantity": 4, "target_date": day.isoformat(),
        "start_at": f"{day.isoformat()}T13:00:00+03:00",
    }
    response = await client.post(f"/facilities/{fid}/appointments", headers=headers, json=body)
    assert _duration(response) == (90, "rule")
    response = await client.post(
        f"/facilities/{fid}/appointments", headers=headers,
        json={**body, "start_at": f"{day.isoformat()}T16:00:00+03:00", "duration_minutes": 60},
    )
    assert _duration(response) == (60, "manual")


async def test_supplier_mode_keeps_legacy_behaviour(client, seeded):
    _, response = await _supplier_booking(client, seeded, duration=60, hour=10)
    assert response.status_code == 200, response.text
    assert _duration(response) == (60, "manual")


async def test_suggested_availability_uses_same_duration_as_create(client, seeded):
    """Slot aramasi olusturmayla ayni sureyi kullanir.

    "Sistem onerir" modunda sure gonderilmezse olusturma kuralin suresini
    (210 dk; kategori ust siniri 180'in ustunde) alir; slotlar da bu sureyle
    aranmali, kategori tabaniyla degil.
    """
    headers = await admin(client)
    tir = str(seeded["vehicle_categories"]["tir"].id)
    unlu = str(seeded["product_categories"]["unlu"].id)
    await add_rule(client, seeded, headers, {
        "vehicle_category_id": tir, "product_category_id": unlu, "fixed_minutes": 210,
    })
    await set_policy(client, seeded, headers, mode="suggested")
    token = auth_headers(await login(client, "/auth/supplier-login", "tedarikci@anadoluun.com"))
    day = weekday(9)

    async def slots(**extra):
        response = await client.post("/supplier/availability/evaluate", headers=token, json={
            "product_category_id": unlu, "target_date": day.isoformat(), **extra,
        })
        assert response.status_code == 200, response.text
        return response.json()["data"]

    from datetime import datetime
    for extra in ({"duration_minutes": 210}, {}):
        found = await slots(quantity=5, quantity_unit="pallet", **extra)
        open_slots = [s for s in found if s["status"] != "full"]
        assert open_slots, extra
        span = datetime.fromisoformat(found[0]["end"]) - datetime.fromisoformat(found[0]["start"])
        assert span == timedelta(minutes=210)

    # Miktar bilgisi yoksa hesap yapilamaz: eski davranis (kategori tabani).
    found = await slots()
    span = datetime.fromisoformat(found[0]["end"]) - datetime.fromisoformat(found[0]["start"])
    assert span == timedelta(minutes=seeded["product_categories"]["unlu"].min_block_minutes)
