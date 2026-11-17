"""Outlook tarzi tekrar deseni: saf uretec + seri API'si (yeni ve eski payload)."""

from datetime import date, timedelta

import pytest
from sqlalchemy import func, select

from app.services.recurrence import (
    MAX_OCCURRENCES,
    RecurrenceError,
    describe_rule_tr,
    generate_occurrence_dates,
)
from tests.conftest import auth_headers, login

# ---------------------------------------------------------------- saf uretec

MON = date(2026, 1, 5)  # Pazartesi


def test_daily_interval():
    dates = generate_occurrence_dates(MON, {"type": "daily", "interval": 3, "count": 4})
    assert dates == [MON + timedelta(days=d) for d in (0, 3, 6, 9)]


def test_daily_weekdays_only_skips_weekend():
    friday = date(2026, 1, 9)
    dates = generate_occurrence_dates(
        friday, {"type": "daily", "weekdays_only": True, "interval": 5, "count": 3}
    )
    assert dates == [friday, date(2026, 1, 12), date(2026, 1, 13)]
    assert all(d.weekday() < 5 for d in dates)


def test_weekly_multi_day_with_interval():
    # Her 2 haftada bir Pzt + Per, 5 tekrar
    dates = generate_occurrence_dates(
        MON, {"type": "weekly", "interval": 2, "weekdays": [0, 3], "count": 5}
    )
    assert dates == [
        date(2026, 1, 5), date(2026, 1, 8),
        date(2026, 1, 19), date(2026, 1, 22),
        date(2026, 2, 2),
    ]


def test_weekly_start_not_on_pattern_day():
    # Baslangic Sali, desen Pzt+Per -> ilk tekrar Persembe (Outlook davranisi)
    tuesday = date(2026, 1, 6)
    dates = generate_occurrence_dates(
        tuesday, {"type": "weekly", "weekdays": [0, 3], "count": 3}
    )
    assert dates == [date(2026, 1, 8), date(2026, 1, 12), date(2026, 1, 15)]


def test_weekly_default_weekday_is_start_day():
    dates = generate_occurrence_dates(MON, {"type": "weekly", "count": 3})
    assert dates == [MON, MON + timedelta(weeks=1), MON + timedelta(weeks=2)]


def test_monthly_day_31_clamps_to_month_end():
    dates = generate_occurrence_dates(
        date(2026, 1, 31), {"type": "monthly", "day_of_month": 31, "count": 4}
    )
    assert dates == [date(2026, 1, 31), date(2026, 2, 28), date(2026, 3, 31), date(2026, 4, 30)]


def test_monthly_every_two_months_day_x():
    dates = generate_occurrence_dates(
        date(2026, 1, 20), {"type": "monthly", "interval": 2, "day_of_month": 15, "count": 3}
    )
    # Ocak 15 baslangictan once -> atlanir
    assert dates == [date(2026, 3, 15), date(2026, 5, 15), date(2026, 7, 15)]


def test_monthly_last_friday():
    dates = generate_occurrence_dates(
        date(2026, 1, 1),
        {
            "type": "monthly", "monthly_mode": "nth_weekday",
            "week_of_month": -1, "weekday": 4, "count": 3,
        },
    )
    assert dates == [date(2026, 1, 30), date(2026, 2, 27), date(2026, 3, 27)]
    assert all(d.weekday() == 4 for d in dates)


def test_monthly_second_tuesday():
    dates = generate_occurrence_dates(
        date(2026, 1, 1),
        {
            "type": "monthly", "monthly_mode": "nth_weekday",
            "week_of_month": 2, "weekday": 1, "count": 2,
        },
    )
    assert dates == [date(2026, 1, 13), date(2026, 2, 10)]


def test_end_by_date_inclusive():
    dates = generate_occurrence_dates(
        MON, {"type": "weekly", "weekdays": [0, 2], "end_type": "until", "until": "2026-01-19"}
    )
    assert dates == [
        date(2026, 1, 5), date(2026, 1, 7), date(2026, 1, 12), date(2026, 1, 14),
        date(2026, 1, 19),
    ]


def test_cap_enforced():
    with pytest.raises(RecurrenceError) as exc:
        generate_occurrence_dates(MON, {"type": "daily", "count": MAX_OCCURRENCES + 1})
    assert exc.value.code == "RECURRENCE_TOO_MANY"
    with pytest.raises(RecurrenceError) as exc:
        generate_occurrence_dates(
            MON, {"type": "daily", "end_type": "until", "until": "2026-06-01"}
        )
    assert exc.value.code == "RECURRENCE_TOO_MANY"
    assert len(generate_occurrence_dates(MON, {"type": "daily", "count": 52})) == 52


def test_until_validation():
    with pytest.raises(RecurrenceError):
        generate_occurrence_dates(
            MON, {"type": "daily", "end_type": "until", "until": "2026-01-01"}
        )
    with pytest.raises(RecurrenceError) as exc:
        generate_occurrence_dates(
            MON, {"type": "monthly", "end_type": "until", "until": "2028-01-01"}
        )
    assert exc.value.code == "RECURRENCE_TOO_LONG"


def test_describe_rule_tr():
    assert (
        describe_rule_tr({"type": "weekly", "interval": 2, "weekdays": [0, 3], "count": 10})
        == "Her 2 haftada bir Pzt, Per · 10 tekrar"
    )
    assert describe_rule_tr({"type": "daily", "weekdays_only": True, "count": 5}).startswith(
        "Her iş günü"
    )
    text = describe_rule_tr(
        {"type": "monthly", "monthly_mode": "nth_weekday", "week_of_month": -1, "weekday": 4,
         "end_type": "until", "until": "2026-06-30"}
    )
    assert text == "Her ay, ayın son Cuma günü · 30.06.2026 tarihine kadar"


# ---------------------------------------------------------------- API


def _next_monday(weeks_ahead: int = 1) -> date:
    today = date.today()
    return today + timedelta(days=(7 - today.weekday()) % 7 or 7) + timedelta(weeks=weeks_ahead - 1)


async def _supplier(client) -> dict:
    return auth_headers(await login(client, "/auth/supplier-login", "tedarikci@anadoluun.com"))


def _payload(seeded, day: date, recurring: dict, hour: int = 11) -> dict:
    return {
        "product_category_id": str(seeded["product_categories"]["unlu"].id),
        "product_name": "Outlook Seri",
        "quantity": 1,
        "target_date": day.isoformat(),
        "start_at": f"{day.isoformat()}T{hour:02d}:00:00+03:00",
        "duration_minutes": 60,
        "recurring": recurring,
    }


async def test_api_new_recurrence_creates_series(client, seeded):
    token = await _supplier(client)
    monday = _next_monday()
    response = await client.post(
        "/supplier/appointments", headers=token,
        json=_payload(
            seeded, monday,
            {"recurrence": {"type": "weekly", "interval": 2, "weekdays": [0, 3], "count": 4}},
        ),
    )
    assert response.status_code == 200, response.text
    data = response.json()["data"]
    assert data["frequency"] == "weekly"
    assert data["occurrence_count"] == 4
    assert data["recurrence"]["weekdays"] == [0, 3]
    assert data["recurrence_description"] == "Her 2 haftada bir Pzt, Per · 4 tekrar"
    starts = [a["scheduled_start_at"][:10] for a in data["appointments"]]
    expected = [monday, monday + timedelta(days=3), monday + timedelta(days=14),
                monday + timedelta(days=17)]
    assert starts == [d.isoformat() for d in expected]
    # Yerel saat korunur (11:00 +03:00 -> 08:00 UTC)
    assert all("T08:00:00" in a["scheduled_start_at"] for a in data["appointments"])
    assert [a["occurrence_index"] for a in data["appointments"]] == [1, 2, 3, 4]

    detail = (
        await client.get(f"/supplier/appointment-series/{data['series_id']}", headers=token)
    ).json()["data"]
    assert detail["recurrence"]["type"] == "weekly"
    assert detail["recurrence_description"].startswith("Her 2 haftada bir")


async def test_api_legacy_payload_unchanged(client, seeded):
    token = await _supplier(client)
    monday = _next_monday()
    response = await client.post(
        "/supplier/appointments", headers=token,
        json=_payload(seeded, monday, {"frequency": "biweekly", "occurrence_count": 3}, hour=14),
    )
    assert response.status_code == 200, response.text
    data = response.json()["data"]
    assert data["frequency"] == "biweekly"
    assert data["occurrence_count"] == 3
    assert data["recurrence"] is None
    starts = [a["scheduled_start_at"][:10] for a in data["appointments"]]
    assert starts == [(monday + timedelta(days=14 * i)).isoformat() for i in range(3)]
    assert all(a["recurring_rule"] == "biweekly" for a in data["appointments"])

    # Eski limitler aynen: monthly > 6 reddedilir
    response = await client.post(
        "/supplier/appointments", headers=token,
        json=_payload(seeded, monday, {"frequency": "monthly", "occurrence_count": 7}),
    )
    assert response.status_code == 422


async def test_api_recurrence_all_or_nothing(client, seeded, session_maker):
    from app.models import Appointment, AppointmentSeries

    async with session_maker() as db:
        before_series = (await db.execute(select(func.count(AppointmentSeries.id)))).scalar()
        before_appts = (await db.execute(select(func.count(Appointment.id)))).scalar()

    token = await _supplier(client)
    friday = _next_monday() + timedelta(days=4)
    # Her gun (hafta sonu dahil) -> Pazar tesis kapali: onceki tekrarlar dahil
    # tum seri reddedilir
    response = await client.post(
        "/supplier/appointments", headers=token,
        json=_payload(seeded, friday, {"recurrence": {"type": "daily", "count": 3}}, hour=9),
    )
    assert response.status_code == 422, response.text
    error = response.json()["error"]
    assert error["code"] == "RECURRING_OCCURRENCE_FAILED"
    assert error["details"]["occurrence_index"] == 3

    async with session_maker() as db:
        series_count = (await db.execute(select(func.count(AppointmentSeries.id)))).scalar()
        assert series_count == before_series
        assert (await db.execute(select(func.count(Appointment.id)))).scalar() == before_appts


async def test_api_recurrence_cap_and_validation(client, seeded):
    token = await _supplier(client)
    monday = _next_monday()
    response = await client.post(
        "/supplier/appointments", headers=token,
        json=_payload(seeded, monday, {"recurrence": {"type": "daily", "count": 53}}),
    )
    assert response.status_code == 422
    response = await client.post(
        "/supplier/appointments", headers=token,
        json=_payload(
            seeded, monday,
            {"recurrence": {"type": "daily", "end_type": "until",
                            "until": (monday + timedelta(days=200)).isoformat()}},
        ),
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "RECURRENCE_TOO_MANY"
    # Tek tarihe dusen seri reddedilir (en az 2)
    response = await client.post(
        "/supplier/appointments", headers=token,
        json=_payload(
            seeded, monday,
            {"recurrence": {"type": "weekly", "end_type": "until",
                            "until": (monday + timedelta(days=2)).isoformat()}},
        ),
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "RECURRENCE_TOO_FEW"
