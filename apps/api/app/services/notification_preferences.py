"""Bildirim/e-posta tercihleri (Sprint 10).

MVP sekli (rapor karari):
- global `in_app_enabled` (panel bildirimleri)
- global `email_enabled` (tum e-postalar)
- event bazli YALNIZCA e-posta anahtarlari (`email_events`)

Kritik istisna: `appointment_revised` panel bildirimi KAPATILAMAZ —
tedarikcinin fiziksel lojistigini etkileyen saat degisikligi mutlaka
gorunur kalir. E-postalarin tamami kapatilabilir (panel her zaman kaynak
gercektir).
"""

from typing import Any

#: Event bazli e-posta anahtarlari (template_key ile ayni sozluk).
EMAIL_EVENT_KEYS = [
    "appointment_approved",
    "appointment_rejected",
    "appointment_revised",
    "appointment_cancelled",
    "appointment_revised_team",
    "appointment_series_cancelled",
    "appointment_series_revised",
]

#: in_app_enabled=false olsa bile URETILEN kritik panel bildirimleri.
CRITICAL_IN_APP_EVENTS = {"appointment_revised"}

DEFAULT_PREFERENCES: dict[str, Any] = {
    "in_app_enabled": True,
    "email_enabled": True,
    "email_events": {key: True for key in EMAIL_EVENT_KEYS},
}


def resolve_preferences(user) -> dict[str, Any]:
    """Kayitli tercihleri varsayilanlarin uzerine bindirir (None = hepsi acik)."""
    stored = getattr(user, "notification_preferences_json", None) or {}
    resolved = {
        "in_app_enabled": stored.get("in_app_enabled", True),
        "email_enabled": stored.get("email_enabled", True),
        "email_events": {
            key: stored.get("email_events", {}).get(key, True)
            for key in EMAIL_EVENT_KEYS
        },
    }
    return resolved


def in_app_allowed(user, event_type: str) -> bool:
    """Panel bildirimi uretilsin mi? (Kapaliysa satir HIC uretilmez — karar.)"""
    if user is None:
        return True
    if event_type in CRITICAL_IN_APP_EVENTS:
        return True
    return resolve_preferences(user)["in_app_enabled"]


def email_allowed(user, template_key: str) -> bool:
    """E-posta gonderilsin mi? Kapaliysa EmailLog da uretilmez (MVP karari)."""
    if user is None:
        return True
    resolved = resolve_preferences(user)
    if not resolved["email_enabled"]:
        return False
    return resolved["email_events"].get(template_key, True)
