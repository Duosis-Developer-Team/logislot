"""Randevu formu ayarlari (tesis bazli alan gorunurlugu/zorunlulugu).

Musteri karari (2026-11 toplantisi): randevuda siparis no zorunlu ve coklu
olabilir. LogiSlot genel bir urun oldugu icin alan herkese zorla acilmaz;
tesis yonetimi alan bazinda "gizli / istege bagli / zorunlu" secer.
None = varsayilanlar: yeni alanlar GIZLI, yani mevcut tenant'larin formu
degismez.

Kural sunucuda zorlanir (tedarikci portali, yonetim adina olusturma ve seri
olusturma ayni `create_appointment` yolundan gecer); arayuz yalnizca formu
buna gore kurar.
"""

import re
from typing import Any

from app.core.errors import ApiError

FIELD_MODES = ("hidden", "optional", "required")

#: Ayarlanabilir alanlar ve varsayilan modlari.
DEFAULT_APPOINTMENT_FORM: dict[str, str] = {
    "order_numbers": "hidden",
    # Surucu kimlik numarasi (guvenlik). Kisisel veri: bkz. services/driver_id.py.
    "driver_id_number": "hidden",
}

#: Bir randevudaki en fazla siparis numarasi ve tek numaranin uzunlugu.
MAX_ORDER_NUMBERS = 20
ORDER_NUMBER_MAX_LENGTH = 64

_SPLIT = re.compile(r"[,;\n\r\t]+")


def resolve_appointment_form(facility: Any) -> dict[str, str]:
    """Kayitli ayari varsayilanlarin uzerine bindirir; bozuk deger varsayilana duser."""
    stored = getattr(facility, "appointment_form_json", None)
    stored = stored if isinstance(stored, dict) else {}
    return {
        key: (stored.get(key) if stored.get(key) in FIELD_MODES else default)
        for key, default in DEFAULT_APPOINTMENT_FORM.items()
    }


def normalize_order_numbers(values: list[str] | None) -> list[str]:
    """Kirpar, virgul/satir ile yapistirilmis listeleri boler, tekrarlari atar.

    Sira korunur (kullanicinin yazdigi sira). Bos girdiler sessizce dusulur.
    """
    result: list[str] = []
    seen: set[str] = set()
    for raw in values or []:
        for part in _SPLIT.split(raw or ""):
            value = part.strip()
            if not value:
                continue
            if len(value) > ORDER_NUMBER_MAX_LENGTH:
                raise ApiError(
                    "ORDER_NUMBER_TOO_LONG",
                    f"Siparis numarasi en fazla {ORDER_NUMBER_MAX_LENGTH} karakter olabilir",
                    422,
                    details={"value": value[:80]},
                )
            key = value.casefold()
            if key in seen:
                continue
            seen.add(key)
            result.append(value)
    if len(result) > MAX_ORDER_NUMBERS:
        raise ApiError(
            "ORDER_NUMBERS_TOO_MANY",
            f"Bir randevuya en fazla {MAX_ORDER_NUMBERS} siparis numarasi girilebilir",
            422,
        )
    return result


def validate_order_numbers(facility: Any, values: list[str] | None) -> list[str] | None:
    """Tesis ayarina gore siparis numaralarini dogrular ve normalize eder.

    Gizli alanda gonderilen deger SAKLANMAZ (None): ayar kapatildiktan sonra
    eski istemcinin gonderdigi veri sessizce yazilmasin.
    """
    mode = resolve_appointment_form(facility)["order_numbers"]
    if mode == "hidden":
        return None
    numbers = normalize_order_numbers(values)
    if mode == "required" and not numbers:
        raise ApiError("ORDER_NUMBER_REQUIRED", "En az bir siparis numarasi girilmelidir", 422)
    return numbers or None
