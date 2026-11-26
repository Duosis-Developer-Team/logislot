"""Tedarikci SURE limitleri (gunluk / haftalik / aylik dakika).

Musteri karari (2026-11 toplantisi): tedarikci limiti randevu sayisi yerine
rampada kaplanan SURE uzerinden olsun; tesisin genel bir varsayilani olsun,
tedarikci bazinda ozellestirilebilsin.

MODEL
- Tesis varsayilani: facilities.supplier_minute_limits_json
    {"daily": int|None, "weekly": int|None, "monthly": int|None}  (None = sinirsiz)
- Tedarikci ezmesi:   suppliers.minute_limits_json, boyut bazinda
    {"daily": {"mode": "inherit" | "unlimited" | "custom", "minutes": int}}
  Kayit yoksa (None) ya da boyut eksikse "inherit" (tesis varsayilani).

DONEMLER tesisin yerel saatiyle: gun; hafta Pazartesi-Pazar; takvim ayi.
Randevu, BASLANGIC saatinin dustugu doneme sayilir.

KULLANIM iptal ve red haric tum randevularin `duration_minutes` toplamidir
(kargo dahil: kargo da rampa suresi ayirir). Mevcut adet kotasiyla ayni
kapsam: her olusturma yolunda (tedarikci, yonetim adina, seri, telafi)
uygulanir; yonetimin revizesinde uygulanmaz (eski adet kotasi gibi).
Telafi randevusunda kaynak randevu ONCE iptal edildigi icin onun suresi
kullanimdan dusmus olur.
"""

import uuid
from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import AppointmentStatus
from app.models import Appointment

DIMENSIONS = ("daily", "weekly", "monthly")
OVERRIDE_MODES = ("inherit", "unlimited", "custom")
#: Donem uzunluguna gore anlamli ust sinirlar (dakika).
MAX_MINUTES = {"daily": 1440, "weekly": 7 * 1440, "monthly": 31 * 1440}
DIMENSION_LABELS = {"daily": "Gunluk", "weekly": "Haftalik", "monthly": "Aylik"}


def _valid_minutes(value: Any, dimension: str) -> int | None:
    if isinstance(value, bool) or not isinstance(value, int):
        return None
    if value < 1 or value > MAX_MINUTES[dimension]:
        return None
    return value


def resolve_facility_limits(facility: Any) -> dict[str, int | None]:
    """Tesis varsayilani; bozuk/eksik deger sinirsiz sayilir (eski davranis)."""
    stored = getattr(facility, "supplier_minute_limits_json", None)
    stored = stored if isinstance(stored, dict) else {}
    return {d: _valid_minutes(stored.get(d), d) for d in DIMENSIONS}


def resolve_supplier_overrides(supplier: Any) -> dict[str, dict[str, Any]]:
    stored = getattr(supplier, "minute_limits_json", None)
    stored = stored if isinstance(stored, dict) else {}
    out: dict[str, dict[str, Any]] = {}
    for d in DIMENSIONS:
        raw = stored.get(d)
        raw = raw if isinstance(raw, dict) else {}
        mode = raw.get("mode") if raw.get("mode") in OVERRIDE_MODES else "inherit"
        minutes = _valid_minutes(raw.get("minutes"), d)
        if mode == "custom" and minutes is None:
            mode = "inherit"  # bozuk ozel deger: guvenli taraf tesis varsayilani
        out[d] = {"mode": mode, "minutes": minutes if mode == "custom" else None}
    return out


def effective_limits(facility: Any, supplier: Any) -> dict[str, dict[str, Any]]:
    """Boyut bazinda gecerli limit ve kaynagi ("facility" | "supplier")."""
    defaults = resolve_facility_limits(facility)
    overrides = resolve_supplier_overrides(supplier)
    out: dict[str, dict[str, Any]] = {}
    for d in DIMENSIONS:
        o = overrides[d]
        if o["mode"] == "custom":
            out[d] = {"limit": o["minutes"], "source": "supplier"}
        elif o["mode"] == "unlimited":
            out[d] = {"limit": None, "source": "supplier"}
        else:
            out[d] = {"limit": defaults[d], "source": "facility"}
    return out


def period_bounds(dimension: str, day: date, tz_name: str) -> tuple[date, date]:
    """[baslangic, bitis) yerel tarih araligi."""
    if dimension == "daily":
        return day, day + timedelta(days=1)
    if dimension == "weekly":
        start = day - timedelta(days=day.weekday())
        return start, start + timedelta(days=7)
    start = day.replace(day=1)
    nxt = (start + timedelta(days=32)).replace(day=1)
    return start, nxt


def _utc(day: date, tz: ZoneInfo) -> datetime:
    return datetime.combine(day, time.min, tz).astimezone(UTC)


async def booked_minutes(
    db: AsyncSession, supplier_id: uuid.UUID, start: datetime, end: datetime
) -> int:
    result = await db.execute(
        select(func.coalesce(func.sum(Appointment.duration_minutes), 0)).where(
            Appointment.supplier_id == supplier_id,
            Appointment.status.notin_([AppointmentStatus.cancelled, AppointmentStatus.rejected]),
            Appointment.scheduled_start_at >= start,
            Appointment.scheduled_start_at < end,
        )
    )
    return int(result.scalar_one())


@dataclass
class MinuteUsage:
    dimension: str
    limit: int | None
    source: str
    used: int
    period_start: date
    period_end: date  # dahil (son gun)

    @property
    def remaining(self) -> int | None:
        return None if self.limit is None else max(self.limit - self.used, 0)

    def as_dict(self) -> dict[str, Any]:
        return {
            "dimension": self.dimension,
            "limit": self.limit,
            "source": self.source,
            "used": self.used,
            "remaining": self.remaining,
            "period_start": self.period_start.isoformat(),
            "period_end": self.period_end.isoformat(),
        }


async def minute_usage(
    db: AsyncSession, facility: Any, supplier: Any, day: date
) -> list[MinuteUsage]:
    """Hedef gunun icinde bulundugu donemlerdeki kullanim.

    Sinirsiz boyutlar icin de kullanim hesaplanir (ekranda bilgi olarak).
    """
    tz = ZoneInfo(facility.timezone)
    limits = effective_limits(facility, supplier)
    out: list[MinuteUsage] = []
    for d in DIMENSIONS:
        start, end = period_bounds(d, day, facility.timezone)
        used = await booked_minutes(db, supplier.id, _utc(start, tz), _utc(end, tz))
        out.append(
            MinuteUsage(
                dimension=d,
                limit=limits[d]["limit"],
                source=limits[d]["source"],
                used=used,
                period_start=start,
                period_end=end - timedelta(days=1),
            )
        )
    return out


def first_violation(usage: list[MinuteUsage], duration: int) -> MinuteUsage | None:
    """Bu sure eklenince asilan ilk (en dar) donem; yoksa None."""
    for u in usage:
        if u.limit is not None and u.used + duration > u.limit:
            return u
    return None


def violation_message(u: MinuteUsage, duration: int) -> str:
    return (
        f"{DIMENSION_LABELS[u.dimension]} sure limiti asiliyor: limit {u.limit} dk, "
        f"kullanilan {u.used} dk, bu randevu {duration} dk"
    )


def violation_details(u: MinuteUsage, duration: int) -> dict[str, Any]:
    return {**u.as_dict(), "requested": duration}


# ---------------------------------------------------------------- dogrulama


def normalize_facility_limits(body: dict[str, Any]) -> dict[str, int | None]:
    """PATCH govdesi -> saklanacak sekil. Gecersiz deger ValueError."""
    out: dict[str, int | None] = {}
    for d in DIMENSIONS:
        value = body.get(d)
        if value is None:
            out[d] = None
            continue
        if _valid_minutes(value, d) is None:
            raise ValueError(f"{d}: 1-{MAX_MINUTES[d]} dakika arasinda olmali")
        out[d] = value
    return out


def normalize_supplier_overrides(body: dict[str, Any] | None) -> dict[str, Any] | None:
    """Tedarikci ezmesi -> saklanacak sekil (hepsi inherit ise None)."""
    if body is None:
        return None
    out: dict[str, Any] = {}
    for d in DIMENSIONS:
        raw = body.get(d) or {"mode": "inherit"}
        if not isinstance(raw, dict) or raw.get("mode") not in OVERRIDE_MODES:
            raise ValueError(f"{d}: mod inherit / unlimited / custom olmali")
        if raw["mode"] == "custom":
            if _valid_minutes(raw.get("minutes"), d) is None:
                raise ValueError(f"{d}: 1-{MAX_MINUTES[d]} dakika arasinda olmali")
            out[d] = {"mode": "custom", "minutes": raw["minutes"]}
        else:
            out[d] = {"mode": raw["mode"], "minutes": None}
    if all(v["mode"] == "inherit" for v in out.values()):
        return None
    return out
