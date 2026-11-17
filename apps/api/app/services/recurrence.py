"""Outlook tarzi tekrar deseni -> occurrence tarihleri (SAF fonksiyonlar).

Tek dogruluk kaynagi: API seri olusturma bu modulu kullanir; web onizlemesi
(apps/web/src/lib/recurrence.ts) ve mobil (logislot-mobile/lib/recurrence.ts)
ayni algoritmanin birebir aynasidir — degisiklik UC yerde birlikte yapilir.

Kurallar:
- Tarihler, baslangic tarihinden (dahil) itibaren desene UYAN gunlerdir
  (Outlook davranisi). Baslangic gunu desene uymuyorsa ilk uyan gun ilk tekrardir.
- Gunluk: her N gunde bir, ya da "her is gunu" (Pzt-Cum; aralik yok sayilir).
- Haftalik: baslangic haftasindan (Pazartesi baslangicli) itibaren her N haftada
  bir, secili gunlerde (0=Pzt .. 6=Paz). Gun secilmezse baslangic gunu.
- Aylik "ayin X. gunu": ayda X. gun yoksa (orn. 31 -> Subat) AYIN SON GUNUNE
  KIRPILIR (Outlook ve eski "monthly" davranisi ile ayni).
- Aylik "ayin [1.-4./son] [gun]": week_of_month -1 = son.
- Bitis: N tekrardan sonra ya da tarih (dahil, en fazla 1 yil ileri). Her
  durumda MAX_OCCURRENCES ust siniri; asilirsa RecurrenceError (sessiz kirpma
  yok — seri olusturma all-or-nothing).
"""

from __future__ import annotations

import calendar
from collections.abc import Iterator
from dataclasses import dataclass, field
from datetime import date, timedelta

MAX_OCCURRENCES = 52
MAX_HORIZON_DAYS = 366

WEEKDAY_SHORT_TR = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"]
WEEKDAY_LONG_TR = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"]
ORDINAL_TR = {1: "ilk", 2: "ikinci", 3: "üçüncü", 4: "dördüncü", -1: "son"}


class RecurrenceError(ValueError):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


@dataclass
class Rule:
    type: str  # daily | weekly | monthly
    interval: int = 1
    weekdays_only: bool = False
    weekdays: list[int] = field(default_factory=list)
    monthly_mode: str = "day_of_month"  # day_of_month | nth_weekday
    day_of_month: int | None = None
    week_of_month: int | None = None  # 1..4 | -1 (son)
    weekday: int | None = None
    end_type: str = "count"  # count | until
    count: int | None = None
    until: date | None = None

    @classmethod
    def from_dict(cls, data: dict) -> Rule:
        until = data.get("until")
        if isinstance(until, str):
            until = date.fromisoformat(until)
        return cls(
            type=data["type"],
            interval=int(data.get("interval") or 1),
            weekdays_only=bool(data.get("weekdays_only")),
            weekdays=list(data.get("weekdays") or []),
            monthly_mode=data.get("monthly_mode") or "day_of_month",
            day_of_month=data.get("day_of_month"),
            week_of_month=data.get("week_of_month"),
            weekday=data.get("weekday"),
            end_type=data.get("end_type") or "count",
            count=data.get("count"),
            until=until,
        )


def _clamped_day(year: int, month: int, day: int) -> date:
    return date(year, month, min(day, calendar.monthrange(year, month)[1]))


def _nth_weekday(year: int, month: int, week: int, weekday: int) -> date:
    if week == -1:
        last = date(year, month, calendar.monthrange(year, month)[1])
        return last - timedelta(days=(last.weekday() - weekday) % 7)
    first = date(year, month, 1)
    return first + timedelta(days=(weekday - first.weekday()) % 7 + 7 * (week - 1))


def _candidates(start: date, rule: Rule) -> Iterator[date]:
    """Desene uyan tarihleri artan sirada uretir (sonsuz; cagiran keser)."""
    interval = max(1, rule.interval)
    if rule.type == "daily":
        day = start
        while True:
            if not rule.weekdays_only or day.weekday() < 5:
                yield day
            day += timedelta(days=1 if rule.weekdays_only else interval)
    elif rule.type == "weekly":
        weekdays = sorted(set(rule.weekdays)) or [start.weekday()]
        week_start = start - timedelta(days=start.weekday())
        while True:
            for wd in weekdays:
                day = week_start + timedelta(days=wd)
                if day >= start:
                    yield day
            week_start += timedelta(weeks=interval)
    elif rule.type == "monthly":
        year, month = start.year, start.month
        while True:
            if rule.monthly_mode == "nth_weekday":
                week = rule.week_of_month if rule.week_of_month is not None else 1
                wd = rule.weekday if rule.weekday is not None else start.weekday()
                day = _nth_weekday(year, month, week, wd)
            else:
                day = _clamped_day(year, month, rule.day_of_month or start.day)
            if day >= start:
                yield day
            month += interval
            year += (month - 1) // 12
            month = (month - 1) % 12 + 1
    else:
        raise RecurrenceError("RECURRENCE_INVALID", f"Bilinmeyen tekrar deseni: {rule.type}")


def generate_occurrence_dates(start: date, rule: Rule | dict) -> list[date]:
    """Kurala gore occurrence tarihleri. Ust sinir asilirsa RecurrenceError."""
    if isinstance(rule, dict):
        rule = Rule.from_dict(rule)
    too_many = RecurrenceError(
        "RECURRENCE_TOO_MANY", f"En fazla {MAX_OCCURRENCES} tekrar oluşturulabilir"
    )
    if rule.end_type == "until":
        if rule.until is None:
            raise RecurrenceError("RECURRENCE_INVALID", "Bitiş tarihi zorunlu")
        if rule.until < start:
            raise RecurrenceError(
                "RECURRENCE_INVALID", "Bitiş tarihi başlangıç tarihinden önce olamaz"
            )
        if (rule.until - start).days > MAX_HORIZON_DAYS:
            raise RecurrenceError(
                "RECURRENCE_TOO_LONG", "Bitiş tarihi başlangıçtan en fazla 1 yıl sonra olabilir"
            )
        limit = None
    else:
        if not rule.count or rule.count < 1:
            raise RecurrenceError("RECURRENCE_INVALID", "Tekrar sayısı zorunlu")
        if rule.count > MAX_OCCURRENCES:
            raise too_many
        limit = rule.count

    result: list[date] = []
    for day in _candidates(start, rule):
        if rule.until is not None and rule.end_type == "until" and day > rule.until:
            break
        result.append(day)
        if limit is not None and len(result) >= limit:
            break
        if len(result) > MAX_OCCURRENCES:
            raise too_many
    return result


def describe_rule_tr(rule: Rule | dict) -> str:
    """Bildirim/ozet icin kisa Turkce aciklama: 'Her 2 haftada bir Pzt, Per · 10 tekrar'."""
    if isinstance(rule, dict):
        rule = Rule.from_dict(rule)
    n = max(1, rule.interval)
    if rule.type == "daily":
        if rule.weekdays_only:
            pattern = "Her iş günü"
        else:
            pattern = "Her gün" if n == 1 else f"Her {n} günde bir"
    elif rule.type == "weekly":
        days = ", ".join(WEEKDAY_SHORT_TR[d] for d in sorted(set(rule.weekdays)))
        pattern = ("Her hafta" if n == 1 else f"Her {n} haftada bir") + (f" {days}" if days else "")
    else:
        head = "Her ay" if n == 1 else f"Her {n} ayda bir"
        if rule.monthly_mode == "nth_weekday":
            ordinal = ORDINAL_TR.get(rule.week_of_month or 1, "")
            wd = WEEKDAY_LONG_TR[rule.weekday or 0]
            pattern = f"{head}, ayın {ordinal} {wd} günü"
        else:
            pattern = f"{head}, ayın {rule.day_of_month}. günü"
    if rule.end_type == "until" and rule.until is not None:
        end = f"{rule.until:%d.%m.%Y} tarihine kadar"
    else:
        end = f"{rule.count} tekrar"
    return f"{pattern} · {end}"
