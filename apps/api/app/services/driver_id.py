"""Surucu kimlik numarasi (guvenlik entegrasyonu; musteri karari 2026-11).

Tesis kapisinda guvenlik, gelen aracin surucusunu kimlik numarasiyla dogrular.
Numara KISISEL VERIDIR (KVKK), bu yuzden:

- Alan varsayilan GIZLI; tesis randevu formunda istege bagli/zorunlu acar.
- Dogrulama: 11 haneli ise T.C. kimlik algoritmasi; aksi halde yabanci surucu
  icin pasaport/kimlik (5-20 harf/rakam).
- Saklama: AES-GCM sifreli (app/core/pii.py) + arama icin HMAC ozeti + ekranda
  maskeleme icin son 4 hane. Duz metin hicbir yere yazilmaz (audit, e-posta,
  bildirim, CSV, telafi randevusu dahil).
- Gorme: yalnizca `appt.driver_id.view` izniyle ve her goruntuleme denetim
  kaydina yazilir (deger yazilmaz).
- Saklama suresi: randevu bitiminden N gun sonra (tesis ayari) sifreli deger,
  ozet ve son haneler silinir; yalnizca "silindi" isareti kalir.
"""

import re
from datetime import UTC, datetime
from typing import Any

from app.core.errors import ApiError
from app.core.pii import decrypt, encrypt, lookup_hash

TYPE_TCKN = "tckn"
TYPE_PASSPORT = "passport"

RETENTION_CHOICES = (7, 30, 90, 180, 365)
DEFAULT_RETENTION_DAYS = 30

_PASSPORT = re.compile(r"^[A-Z0-9]{5,20}$")


def is_valid_tckn(value: str) -> bool:
    """T.C. kimlik numarasi algoritmasi (11 hane, ilk hane 0 degil, 2 kontrol hanesi)."""
    if not re.fullmatch(r"[1-9]\d{10}", value):
        return False
    d = [int(c) for c in value]
    tenth = ((d[0] + d[2] + d[4] + d[6] + d[8]) * 7 - (d[1] + d[3] + d[5] + d[7])) % 10
    eleventh = sum(d[:10]) % 10
    return d[9] == tenth and d[10] == eleventh


def normalize_driver_id(raw: str) -> tuple[str, str]:
    """(tip, normalize deger). Gecersizse DRIVER_ID_INVALID (422)."""
    value = re.sub(r"[\s\-.]", "", raw or "").upper()
    if value.isdigit() and len(value) == 11:
        if not is_valid_tckn(value):
            raise ApiError(
                "DRIVER_ID_INVALID",
                "T.C. kimlik numarasi gecersiz (kontrol haneleri tutmuyor)",
                422,
            )
        return TYPE_TCKN, value
    if _PASSPORT.fullmatch(value) and not value.isdigit():
        return TYPE_PASSPORT, value
    if value.isdigit():
        raise ApiError("DRIVER_ID_INVALID", "T.C. kimlik numarasi 11 haneli olmalidir", 422)
    raise ApiError(
        "DRIVER_ID_INVALID",
        "Gecersiz kimlik numarasi: T.C. kimlik no (11 hane) ya da pasaport no (5-20 harf/rakam)",
        422,
    )


def resolve_retention_days(facility: Any) -> int:
    stored = getattr(facility, "appointment_form_json", None)
    stored = stored if isinstance(stored, dict) else {}
    days = stored.get("driver_id_retention_days")
    return days if days in RETENTION_CHOICES else DEFAULT_RETENTION_DAYS


def validate_driver_id(mode: str, raw: str | None) -> tuple[str, str] | None:
    """Form moduna gore dogrular. Gizli alanda gelen deger SAKLANMAZ."""
    if mode == "hidden":
        return None
    if not raw or not raw.strip():
        if mode == "required":
            raise ApiError("DRIVER_ID_REQUIRED", "Surucu kimlik numarasi zorunludur", 422)
        return None
    return normalize_driver_id(raw)


def apply_driver_id(appointment: Any, parsed: tuple[str, str] | None) -> None:
    if parsed is None:
        return
    kind, value = parsed
    appointment.driver_id_type = kind
    appointment.driver_id_ciphertext = encrypt(value)
    appointment.driver_id_hash = lookup_hash(value)
    appointment.driver_id_last4 = value[-4:]


def search_hash(raw: str) -> str:
    """Arama icin: gecerli bir numaranin ozeti (gecersizse 422)."""
    return lookup_hash(normalize_driver_id(raw)[1])


def masked(appointment: Any) -> str | None:
    if not getattr(appointment, "driver_id_last4", None):
        return None
    hidden = 7 if appointment.driver_id_type == TYPE_TCKN else 4
    return "•" * hidden + appointment.driver_id_last4


def reveal(appointment: Any) -> str | None:
    token = getattr(appointment, "driver_id_ciphertext", None)
    return decrypt(token) if token else None


def purge(appointment: Any, now: datetime | None = None) -> None:
    appointment.driver_id_ciphertext = None
    appointment.driver_id_hash = None
    appointment.driver_id_last4 = None
    appointment.driver_id_purged_at = now or datetime.now(UTC)
