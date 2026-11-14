"""Tedarikci SURE limitleri (musteri karari 2026-11).

Limit randevu sayisi yerine rampada kaplanan sure (dakika) uzerinden:
gunluk + haftalik + aylik; tesis varsayilani + tedarikci bazli ezme
(devral / sinirsiz / ozel). Iptal ve red kullanimdan duser.
"""

from datetime import date, timedelta
from types import SimpleNamespace

from app.services.supplier_limits import (
    effective_limits,
    period_bounds,
    resolve_facility_limits,
    resolve_supplier_overrides,
)
from tests.conftest import auth_headers, login

SUPPLIER_EMAIL = "tedarikci@anadoluun.com"


def far_weekday(offset: int) -> date:
    """Seed demo randevularindan uzak bir hafta ici gunu."""
    day = date.today() + timedelta(days=offset)
    while day.weekday() >= 5:
        day += timedelta(days=1)
    return day


async def admin(client) -> dict:
    return auth_headers(await login(client, "/auth/login", "admin@cakesbakes.com"))


async def supplier(client) -> dict:
    return auth_headers(await login(client, "/auth/supplier-login", SUPPLIER_EMAIL))


async def set_defaults(client, seeded, headers, **limits):
    fid = seeded["facility"].id
    body = {"daily": None, "weekly": None, "monthly": None, **limits}
    response = await client.put(
        f"/facilities/{fid}/supplier-minute-limits", headers=headers, json=body
    )
    assert response.status_code == 200, response.text
    return response.json()["data"]


async def set_override(client, seeded, headers, minute_limits):
    fid = seeded["facility"].id
    sid = seeded["suppliers"]["un"].id
    response = await client.patch(
        f"/facilities/{fid}/suppliers/{sid}", headers=headers, json={"minute_limits": minute_limits}
    )
    assert response.status_code == 200, response.text
    return response.json()["data"]


async def book(client, seeded, token, day: date, hour: int, minutes: int):
    return await client.post("/supplier/appointments", headers=token, json={
        "product_category_id": str(seeded["product_categories"]["unlu"].id),
        "product_name": "Un",
        "quantity": 1,
        "target_date": day.isoformat(),
        "start_at": f"{day.isoformat()}T{hour:02d}:00:00+03:00",
        "duration_minutes": minutes,
    })


async def usage(client, token, day: date) -> dict[str, dict]:
    response = await client.get(
        f"/supplier/minute-usage?target_date={day.isoformat()}", headers=token
    )
    assert response.status_code == 200, response.text
    return {u["dimension"]: u for u in response.json()["data"]["usage"]}


# ---------------------------------------------------------------- saf fonksiyonlar


def test_resolvers_survive_garbage_and_default_to_unlimited():
    facility = SimpleNamespace(
        supplier_minute_limits_json={"daily": "x", "weekly": 0, "monthly": 600}
    )
    assert resolve_facility_limits(facility) == {"daily": None, "weekly": None, "monthly": 600}
    assert resolve_facility_limits(SimpleNamespace(supplier_minute_limits_json=None)) == {
        "daily": None, "weekly": None, "monthly": None,
    }
    supplier = SimpleNamespace(minute_limits_json={
        "daily": {"mode": "custom"},  # dakikasiz ozel -> devral
        "weekly": {"mode": "bogus"},
        "monthly": {"mode": "unlimited", "minutes": 5},
    })
    overrides = resolve_supplier_overrides(supplier)
    assert overrides["daily"]["mode"] == "inherit"
    assert overrides["weekly"]["mode"] == "inherit"
    assert overrides["monthly"] == {"mode": "unlimited", "minutes": None}
    limits = effective_limits(facility, supplier)
    assert limits["monthly"] == {"limit": None, "source": "supplier"}
    assert limits["daily"] == {"limit": None, "source": "facility"}


def test_period_bounds_are_local_calendar_periods():
    wednesday = date(2026, 11, 18)
    tz = "Europe/Istanbul"
    assert period_bounds("daily", wednesday, tz) == (wednesday, date(2026, 11, 19))
    assert period_bounds("weekly", wednesday, tz) == (date(2026, 11, 16), date(2026, 11, 23))
    assert period_bounds("monthly", wednesday, tz) == (date(2026, 11, 1), date(2026, 12, 1))
    december = (date(2026, 12, 1), date(2027, 1, 1))
    assert period_bounds("monthly", date(2026, 12, 31), "UTC") == december


# ---------------------------------------------------------------- uctan uca


async def test_facility_daily_default_blocks_with_details_and_cancel_frees(client, seeded):
    headers = await admin(client)
    token = await supplier(client)
    day = far_weekday(22)
    defaults = await set_defaults(client, seeded, headers, daily=120)
    assert defaults["daily"] == 120 and defaults["is_customized"] is True

    first = await book(client, seeded, token, day, 8, 60)
    assert first.status_code == 200, first.text
    assert (await book(client, seeded, token, day, 10, 60)).status_code == 200

    blocked = await book(client, seeded, token, day, 13, 45)
    assert blocked.status_code == 422
    error = blocked.json()["error"]
    assert error["code"] == "SUPPLIER_MINUTE_LIMIT_EXCEEDED"
    assert error["details"]["dimension"] == "daily"
    assert (error["details"]["limit"], error["details"]["used"], error["details"]["requested"]) == (
        120, 120, 45,
    )

    daily = (await usage(client, token, day))["daily"]
    assert (daily["limit"], daily["used"], daily["remaining"], daily["source"]) == (
        120, 120, 0, "facility",
    )

    # Iptal kullanimdan duser
    cancel = await client.post(
        f"/supplier/appointments/{first.json()['data']['id']}/cancel", headers=token
    )
    assert cancel.status_code == 200, cancel.text
    assert (await usage(client, token, day))["daily"]["used"] == 60
    assert (await book(client, seeded, token, day, 13, 45)).status_code == 200


async def test_supplier_override_custom_unlimited_and_back_to_inherit(client, seeded):
    headers = await admin(client)
    token = await supplier(client)
    day = far_weekday(23)
    await set_defaults(client, seeded, headers, daily=60)
    assert (await book(client, seeded, token, day, 8, 60)).status_code == 200
    assert (await book(client, seeded, token, day, 10, 60)).status_code == 422

    out = await set_override(client, seeded, headers, {"daily": {"mode": "custom", "minutes": 180}})
    assert out["minute_limits"]["daily"] == {"mode": "custom", "minutes": 180}
    assert out["minute_limits"]["weekly"]["mode"] == "inherit"
    assert (await book(client, seeded, token, day, 10, 60)).status_code == 200
    assert (await usage(client, token, day))["daily"]["source"] == "supplier"

    await set_override(client, seeded, headers, {"daily": {"mode": "unlimited"}})
    assert (await book(client, seeded, token, day, 12, 90)).status_code == 200
    assert (await usage(client, token, day))["daily"]["limit"] is None

    out = await set_override(client, seeded, headers, None)  # tesis varsayilanina don
    assert out["minute_limits"]["daily"]["mode"] == "inherit"
    assert (await book(client, seeded, token, day, 15, 45)).status_code == 422

    fid = seeded["facility"].id
    logs = (await client.get(f"/facilities/{fid}/audit-logs?limit=200", headers=headers)).json()
    actions = {e["action"] for e in logs["data"]["items"]}
    assert {"supplier_minute_limits.update", "supplier.update"} <= actions


async def test_weekly_limit_spans_days_and_admin_on_behalf_is_bound(client, seeded):
    headers = await admin(client)
    token = await supplier(client)
    monday = far_weekday(29)
    monday -= timedelta(days=monday.weekday())
    await set_defaults(client, seeded, headers, weekly=150)
    assert (await book(client, seeded, token, monday, 8, 90)).status_code == 200
    tuesday = monday + timedelta(days=1)
    week = (await usage(client, token, tuesday))["weekly"]
    assert (week["used"], week["remaining"]) == (90, 60)
    assert week["period_start"] == monday.isoformat()
    assert week["period_end"] == (monday + timedelta(days=6)).isoformat()
    assert (await book(client, seeded, token, tuesday, 8, 90)).status_code == 422

    # Yonetim adina olusturma da ayni limite tabi (adet kotasiyla ayni kapsam)
    fid = seeded["facility"].id
    response = await client.post(f"/facilities/{fid}/appointments", headers=headers, json={
        "supplier_id": str(seeded["suppliers"]["un"].id),
        "product_category_id": str(seeded["product_categories"]["unlu"].id),
        "product_name": "Un", "quantity": 1, "target_date": tuesday.isoformat(),
        "start_at": f"{tuesday.isoformat()}T10:00:00+03:00", "duration_minutes": 90,
    })
    assert response.json()["error"]["code"] == "SUPPLIER_MINUTE_LIMIT_EXCEEDED"
    # Admin kullanim gorunumu
    response = await client.get(
        f"/facilities/{fid}/suppliers/{seeded['suppliers']['un'].id}/minute-usage"
        f"?target_date={tuesday.isoformat()}",
        headers=headers,
    )
    assert {u["dimension"]: u["used"] for u in response.json()["data"]["usage"]}["weekly"] == 90
    # Sonraki hafta yeni donem
    assert (await book(client, seeded, token, monday + timedelta(days=7), 8, 90)).status_code == 200


async def test_series_counts_its_own_occurrences(client, seeded):
    headers = await admin(client)
    token = await supplier(client)
    day = far_weekday(36)
    # Her hafta 60 dk; haftalik 100 dk limit -> tekrarlar ayri haftalarda, gecer.
    await set_defaults(client, seeded, headers, weekly=100)
    body = {
        "product_category_id": str(seeded["product_categories"]["unlu"].id),
        "product_name": "Seri", "quantity": 1, "target_date": day.isoformat(),
        "start_at": f"{day.isoformat()}T08:00:00+03:00", "duration_minutes": 60,
        "recurring": {"frequency": "weekly", "occurrence_count": 3},
    }
    response = await client.post("/supplier/appointments", headers=token, json=body)
    assert response.status_code == 200, response.text
    # Ayni gunlere ikinci seri: ilk tekrar haftalik limiti asar, hepsi geri alinir.
    response = await client.post(
        "/supplier/appointments", headers=token,
        json={**body, "start_at": f"{day.isoformat()}T11:00:00+03:00"},
    )
    error = response.json()["error"]
    assert error["code"] == "RECURRING_OCCURRENCE_FAILED"
    assert error["details"]["code"] == "SUPPLIER_MINUTE_LIMIT_EXCEEDED"
    assert (await usage(client, token, day))["weekly"]["used"] == 60


async def test_validation_and_permissions(client, seeded):
    headers = await admin(client)
    fid = seeded["facility"].id
    for body in ({"daily": 2000}, {"weekly": 0}, {"monthly": 50000}):
        response = await client.put(
            f"/facilities/{fid}/supplier-minute-limits", headers=headers, json=body
        )
        assert response.status_code == 422, body
    sid = seeded["suppliers"]["un"].id
    for limits in (
        {"daily": {"mode": "custom"}},
        {"daily": {"mode": "custom", "minutes": 2000}},
        {"weekly": {"mode": "sometimes"}},
    ):
        response = await client.patch(
            f"/facilities/{fid}/suppliers/{sid}", headers=headers, json={"minute_limits": limits}
        )
        assert response.status_code == 422, limits

    viewer = auth_headers(await login(client, "/auth/login", "izleyici@cakesbakes.com"))
    response = await client.put(
        f"/facilities/{fid}/supplier-minute-limits", headers=viewer, json={"daily": 60}
    )
    assert response.status_code == 403
    # Okuma APPT_VIEW ile acik (randevu formunda kalan sure gostermek icin)
    response = await client.get(f"/facilities/{fid}/supplier-minute-limits", headers=viewer)
    assert response.status_code == 200
