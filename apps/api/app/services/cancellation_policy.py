"""Tedarikcinin randevu iptal kurallari (tesis politikasi).

Musteri talebi (2026-10, Cakes&Bakes): tedarikci randevu iptal ederken sabit
listeden SEBEP secmek ve ALTERNATIF GONDERIM TARIHI girmek zorunda olsun;
randevuya belirli bir sureden (orn. 24 saat) az kalinca portaldan iptal
edemesin.

Kurallar tesis bazlidir ve YONETIM belirler
(`facilities.supplier_cancellation_policy_json`). None = kural yok, yani eski
davranis: sebep/tarih istenmez, baslangica kadar iptal serbesttir. Boylece
kurali istemeyen tenant'lar etkilenmez.

Yonetim iptali bu kurallardan ETKILENMEZ: tesis kendi randevusunu her zaman
iptal edebilir. Kurallar yalnizca tedarikci portalindan gelen tekil ve seri
iptallerinde uygulanir; seri iptali bir kacis yolu olmasin diye ayni
dogrulamadan gecer.
"""

from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from app.core.enums import SupplierCancellationReason
from app.core.errors import ApiError
from app.core.timeutils import to_utc

#: Bildirim kuralinin ust siniri (30 gun). Daha uzun bir pencere tedarikcinin
#: portaldan iptal hakkini fiilen ortadan kaldirir.
MAX_NOTICE_HOURS = 720
#: Alternatif tarih en fazla bu kadar gun ileride olabilir.
MAX_ALTERNATIVE_DAYS = 365
#: `other` secildiginde istenen aciklamanin en kisa uzunlugu.
NOTE_MIN_LENGTH = 3

DEFAULT_CANCELLATION_POLICY: dict[str, Any] = {
    "require_reason": False,
    "require_alternative_date": False,
    "min_notice_hours": 0,
}

#: Bildirim metinleri sunucuda Turkce uretilir (diger bildirimlerle ayni);
#: arayuzler kodu kendi sozluklerinden cevirir.
REASON_LABELS: dict[str, str] = {
    SupplierCancellationReason.product_not_ready: "Ürün / stok hazır değil",
    SupplierCancellationReason.vehicle_issue: "Araç / nakliye sorunu",
    SupplierCancellationReason.driver_unavailable: "Sürücü bulunamadı",
    SupplierCancellationReason.order_changed: "Sipariş iptal edildi / değişti",
    SupplierCancellationReason.weather_road: "Hava / yol koşulları",
    SupplierCancellationReason.booked_by_mistake: "Randevu yanlışlıkla oluşturuldu",
    SupplierCancellationReason.other: "Diğer",
}


@dataclass(frozen=True)
class SupplierCancellation:
    """Dogrulanmis ve normalize edilmis tedarikci iptal girdisi."""

    reason_code: str | None
    note: str | None
    alternative_date: date | None


def _as_bool(value: Any, default: bool) -> bool:
    return value if isinstance(value, bool) else default


def _as_hours(value: Any) -> int:
    # bool da int'tir; yanlislikla saklanmis true/false 1/0 saat sayilmasin.
    if isinstance(value, bool) or not isinstance(value, int):
        return 0
    return min(max(value, 0), MAX_NOTICE_HOURS)


def resolve_cancellation_policy(facility: Any) -> dict[str, Any]:
    """Kayitli politikayi varsayilanlarin uzerine bindirir.

    Bozuk/eski sekildeki veri sistemi bozmaz: her alan tipi dogrulanarak
    okunur, taninmayan anahtarlar dusurulur.
    """
    stored = getattr(facility, "supplier_cancellation_policy_json", None)
    stored = stored if isinstance(stored, dict) else {}
    return {
        "require_reason": _as_bool(stored.get("require_reason"), False),
        "require_alternative_date": _as_bool(stored.get("require_alternative_date"), False),
        "min_notice_hours": _as_hours(stored.get("min_notice_hours")),
    }


def notice_cutoff(policy: dict[str, Any], now: datetime) -> datetime:
    """Tedarikcinin iptal edebilecegi en erken baslangic ani (dahil)."""
    return now + timedelta(hours=policy["min_notice_hours"])


def ensure_cancellation_notice(
    policy: dict[str, Any], start_at: datetime, now: datetime
) -> None:
    """Randevuya kural suresinden az kaldiysa tedarikci iptalini reddeder."""
    hours = policy["min_notice_hours"]
    if hours and to_utc(start_at) < notice_cutoff(policy, now):
        raise ApiError(
            "CANCELLATION_NOTICE_TOO_SHORT",
            f"Randevuya {hours} saatten az kaldigi icin portaldan iptal edilemez; "
            "lutfen tesisle iletisime gecin",
            409,
            details={"min_notice_hours": hours},
        )


def validate_supplier_cancellation(
    facility: Any,
    *,
    reason_code: SupplierCancellationReason | None,
    note: str | None,
    alternative_date: date | None,
    now: datetime | None = None,
) -> SupplierCancellation:
    """Sebep ve alternatif tarihi tesis politikasina gore dogrular."""
    policy = resolve_cancellation_policy(facility)
    note = (note or "").strip() or None

    if reason_code is None and policy["require_reason"]:
        raise ApiError("CANCELLATION_REASON_REQUIRED", "Iptal sebebi secilmelidir", 422)
    if reason_code == SupplierCancellationReason.other and (
        note is None or len(note) < NOTE_MIN_LENGTH
    ):
        raise ApiError(
            "CANCELLATION_NOTE_REQUIRED",
            "'Diger' secildiginde aciklama yazilmalidir",
            422,
        )

    if alternative_date is None:
        if policy["require_alternative_date"]:
            raise ApiError(
                "ALTERNATIVE_DATE_REQUIRED", "Alternatif gonderim tarihi girilmelidir", 422
            )
    else:
        tz = ZoneInfo(getattr(facility, "timezone", None) or "Europe/Istanbul")
        today = (now or datetime.now(UTC)).astimezone(tz).date()
        latest = today + timedelta(days=MAX_ALTERNATIVE_DAYS)
        if not today <= alternative_date <= latest:
            raise ApiError(
                "ALTERNATIVE_DATE_INVALID",
                "Alternatif gonderim tarihi bugunden once veya bir yildan sonra olamaz",
                422,
                details={"min": today.isoformat(), "max": latest.isoformat()},
            )

    return SupplierCancellation(
        reason_code=reason_code.value if reason_code else None,
        note=note,
        alternative_date=alternative_date,
    )


def reason_text(reason_code: str | None, note: str | None) -> str | None:
    """Bildirim/denetim metni: "Arac / nakliye sorunu — aciklama"."""
    label = REASON_LABELS.get(reason_code) if reason_code else None
    if label and note:
        return f"{label} — {note}"
    return label or note
