"""Plan limit boyutlari — DINAMIK kota tanimlari.

Plan.limits_json bir key->sayi haritasidir; deger yok/None ise o boyut
SINIRSIZ sayilir. Boyut listesi burada tanimlanir ve platform UI'a
`GET /platform/plan-limit-dimensions` ile servis edilir; boylece yeni bir
limit eklemek icin sema/migration degil, yalnizca bu listeye satir eklemek
yeterlidir.

`enforced_at` alani, limitin nerede ZORLANDIGINI belgeler:
- "assignment": plan atama aninda kontrol edilir (or. max_tenants)
- "usage": kullanim raporlarinda esik uyarisi uretir (bilgilendirme)
"""

from typing import Literal, TypedDict


class LimitDimension(TypedDict):
    key: str
    label: str
    description: str
    unit: str
    enforced_at: Literal["assignment", "usage"]


PLAN_LIMIT_DIMENSIONS: list[LimitDimension] = [
    {
        "key": "max_tenants",
        "label": "Maksimum müşteri hesabı",
        "description": "Bu plana aynı anda atanabilecek müşteri hesabı sayısı.",
        "unit": "hesap",
        "enforced_at": "assignment",
    },
    {
        "key": "monthly_appointments",
        "label": "Aylık randevu",
        "description": "Müşteri başına aylık oluşturulabilecek randevu sayısı.",
        "unit": "randevu/ay",
        "enforced_at": "usage",
    },
    {
        "key": "max_docks",
        "label": "Aktif rampa",
        "description": "Müşteri başına tanımlanabilecek aktif rampa sayısı.",
        "unit": "rampa",
        "enforced_at": "usage",
    },
    {
        "key": "max_suppliers",
        "label": "Aktif tedarikçi",
        "description": "Müşteri başına aktif tedarikçi sayısı.",
        "unit": "tedarikçi",
        "enforced_at": "usage",
    },
    {
        "key": "max_users",
        "label": "Panel kullanıcısı",
        "description": "Müşteri başına yönetim paneli kullanıcı sayısı.",
        "unit": "kullanıcı",
        "enforced_at": "usage",
    },
]

LIMIT_KEYS = {d["key"] for d in PLAN_LIMIT_DIMENSIONS}


def normalize_limits(raw: dict | None) -> dict[str, int]:
    """Bilinen anahtarlari pozitif tam sayiya indirger; digerlerini eler.

    None/0/negatif deger = "sinirsiz" anlamina gelir ve haritadan cikarilir;
    boylece limit yoklugu tek bicimde (anahtar yok) temsil edilir.
    """
    if not raw:
        return {}
    out: dict[str, int] = {}
    for key, value in raw.items():
        if key not in LIMIT_KEYS or value is None:
            continue
        try:
            number = int(value)
        except (TypeError, ValueError):
            continue
        if number > 0:
            out[key] = number
    return out


def limit_of(plan_limits: dict | None, key: str) -> int | None:
    """Tek bir limitin degeri; yoksa None (= sinirsiz)."""
    return normalize_limits(plan_limits).get(key)
