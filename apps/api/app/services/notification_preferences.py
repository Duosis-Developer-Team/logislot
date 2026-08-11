"""Bildirim/e-posta tercihleri.

IKI AYRI TERCIH UZAYI vardir ve asla birlesmez:

1. TENANT KULLANICISI — kendi tercihi (`tenant_users.notification_preferences_json`).
   Kullanici kendi panel/e-posta bildirimlerini kendi yonetir.

2. TEDARIKCI — tesis politikasi (`facilities.supplier_notification_policy_json`).
   Urun karari (2026-08): tedarikciye hangi bildirimlerin gidecegine YONETIM
   karar verir. Tedarikci bu tercihleri kendi panelinde ne gorur ne degistirir;
   politika tesis genelinde tektir (1 tenant = 1 tesis).

   Onceden tercih tedarikci portal hesabinda (`supplier_users`) yasiyordu ve
   `supplier.users[0]` ile cozuluyordu; birden fazla portal hesabi olan
   tedarikcide hangi hesabin tercihinin gecerli oldugu belirsizdi. Tesis
   politikasi bu belirsizligi de kaldirir.

Kritik istisna: `appointment_revised` ve `appointment_dock_changed` panel
bildirimleri KAPATILAMAZ — tedarikcinin fiziksel lojistigini etkileyen
saat/rampa degisikligi mutlaka gorunur kalir. E-postalarin tamami
kapatilabilir (panel her zaman kaynak gercektir).
"""

from typing import Any

#: Tedarikciye giden e-posta sablonlari (tesis politikasi bunlari yonetir).
SUPPLIER_EMAIL_EVENT_KEYS = [
    "appointment_approved",
    "appointment_rejected",
    "appointment_revised",
    "appointment_dock_changed",
    "appointment_cancelled",
    "appointment_series_cancelled",
    "appointment_series_revised",
]

#: Tenant ekibine giden e-posta sablonlari (kullanicinin kendi tercihi).
#: Diger sablonlarin alicisi tedarikcidir; tenant kullanicisina hic gitmez,
#: bu yuzden kendi tercih ekraninda gosterilmezler.
TENANT_EMAIL_EVENT_KEYS = [
    "appointment_revised_team",
]

#: Gecerli kabul edilen tum anahtarlar (PATCH dogrulamasi icin).
EMAIL_EVENT_KEYS = [*SUPPLIER_EMAIL_EVENT_KEYS, *TENANT_EMAIL_EVENT_KEYS]

#: in_app_enabled=false olsa bile URETILEN kritik panel bildirimleri.
#: Rampa degisimi de buradadir: saat degismese bile surucunun gidecegi
#: fiziksel yer degisir, sessizce gecistirilemez.
CRITICAL_IN_APP_EVENTS = {"appointment_revised", "appointment_dock_changed"}

DEFAULT_TENANT_PREFERENCES: dict[str, Any] = {
    "in_app_enabled": True,
    "email_enabled": True,
    "email_events": {key: True for key in TENANT_EMAIL_EVENT_KEYS},
}

DEFAULT_SUPPLIER_POLICY: dict[str, Any] = {
    "in_app_enabled": True,
    "email_enabled": True,
    "email_events": {key: True for key in SUPPLIER_EMAIL_EVENT_KEYS},
}


def _resolve(stored: Any, event_keys: list[str]) -> dict[str, Any]:
    """Kayitli tercihleri varsayilanlarin uzerine bindirir (eksik = acik).

    Bozuk/eski sekildeki veri sistemi bozmaz; her alan tek tek ve tipi
    dogrulanarak okunur, taninmayan anahtarlar sessizce dusurulur.
    """
    stored = stored if isinstance(stored, dict) else {}
    stored_events = stored.get("email_events")
    stored_events = stored_events if isinstance(stored_events, dict) else {}
    return {
        "in_app_enabled": _as_bool(stored.get("in_app_enabled"), True),
        "email_enabled": _as_bool(stored.get("email_enabled"), True),
        "email_events": {
            key: _as_bool(stored_events.get(key), True) for key in event_keys
        },
    }


def _as_bool(value: Any, default: bool) -> bool:
    return value if isinstance(value, bool) else default


def resolve_preferences(user) -> dict[str, Any]:
    """TENANT kullanicisinin kendi tercihleri (None = hepsi acik)."""
    return _resolve(getattr(user, "notification_preferences_json", None), TENANT_EMAIL_EVENT_KEYS)


def resolve_supplier_policy(facility) -> dict[str, Any]:
    """Tesisin tedarikci bildirim politikasi (None = hepsi acik)."""
    return _resolve(
        getattr(facility, "supplier_notification_policy_json", None),
        SUPPLIER_EMAIL_EVENT_KEYS,
    )


def prefs_in_app_allowed(prefs: dict[str, Any] | None, event_type: str) -> bool:
    """Panel bildirimi uretilsin mi? (Kapaliysa satir HIC uretilmez — karar.)"""
    if prefs is None:
        return True
    if event_type in CRITICAL_IN_APP_EVENTS:
        return True
    return prefs["in_app_enabled"]


def prefs_email_allowed(prefs: dict[str, Any] | None, template_key: str) -> bool:
    """E-posta gonderilsin mi? Kapaliysa EmailLog da uretilmez (MVP karari)."""
    if prefs is None:
        return True
    if not prefs["email_enabled"]:
        return False
    return prefs["email_events"].get(template_key, True)


def in_app_allowed(user, event_type: str) -> bool:
    """TENANT kullanicisi icin panel bildirimi uretilsin mi?"""
    if user is None:
        return True
    return prefs_in_app_allowed(resolve_preferences(user), event_type)


def email_allowed(user, template_key: str) -> bool:
    """TENANT kullanicisi icin e-posta gonderilsin mi?"""
    if user is None:
        return True
    return prefs_email_allowed(resolve_preferences(user), template_key)


def supplier_in_app_allowed(facility, event_type: str) -> bool:
    """Tedarikciye panel bildirimi uretilsin mi? (tesis politikasi)"""
    if facility is None:
        return True
    return prefs_in_app_allowed(resolve_supplier_policy(facility), event_type)


def supplier_email_allowed(facility, template_key: str) -> bool:
    """Tedarikciye e-posta gonderilsin mi? (tesis politikasi)"""
    if facility is None:
        return True
    return prefs_email_allowed(resolve_supplier_policy(facility), template_key)
