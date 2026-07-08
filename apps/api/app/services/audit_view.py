"""Audit goruntuleme yardimcilari — facility ve platform audit AYNI maskeleme
ve ozet fonksiyonlarini kullanir (Sprint 11/12).

Hicbir snapshot ham parola/token/secret degeri donduremez.
"""

import json
from typing import Any

#: Anahtar adinda gectiginde degeri maskelenen parcalar.
SENSITIVE_KEY_PARTS = ("password", "token", "secret", "hash", "authorization", "jti")

MAX_SNAPSHOT_CHARS = 4000

#: Aksiyon -> Turkce ozet (facility + platform ortak sozluk).
ACTION_LABELS = {
    "appointment.create": "Randevu oluşturuldu",
    "appointment.create_admin": "Randevu tesis adına oluşturuldu",
    "appointment.approve": "Randevu onaylandı",
    "appointment.reject": "Randevu reddedildi",
    "appointment.revise": "Randevu revize edildi",
    "appointment.complete": "Randevu tamamlandı",
    "appointment.cancel": "Randevu iptal edildi",
    "appointment.create_note": "Randevu notu eklendi",
    "appointment_series.create": "Tekrarlayan seri oluşturuldu",
    "appointment_series.create_admin": "Seri tesis adına oluşturuldu",
    "appointment_series.cancel": "Seri toplu iptal edildi",
    "appointment_series.revise": "Seri toplu revize edildi",
    "appointment_series.approve": "Seri toplu onaylandı",
    "supplier.create": "Tedarikçi oluşturuldu",
    "supplier.update": "Tedarikçi güncellendi",
    "supplier.deactivate": "Tedarikçi pasifleştirildi",
    "supplier_user.create": "Tedarikçi portal hesabı açıldı",
    "supplier_user.reset_password": "Tedarikçi parolası sıfırlandı",
    "user.create": "Kullanıcı oluşturuldu",
    "user.update": "Kullanıcı güncellendi",
    "user.deactivate": "Kullanıcı pasifleştirildi",
    "user.reset_password": "Kullanıcı parolası sıfırlandı",
    "role.create": "Rol oluşturuldu",
    "role.update": "Rol güncellendi",
    "role.deactivate": "Rol pasifleştirildi",
    "email.resend": "E-posta yeniden gönderildi",
    "email.bulk_resend": "E-postalar toplu yeniden gönderildi",
    "email.retry_process": "E-posta retry işlemcisi koştu",
    "branding.update": "Marka ayarları güncellendi",
    "branding.reset": "Marka varsayılana sıfırlandı",
    "notification_preferences.update": "Bildirim tercihleri güncellendi",
    "auth.login": "Giriş yapıldı",
    "auth.login_failed": "Başarısız giriş denemesi",
    "auth.logout": "Çıkış yapıldı",
    "auth.change_password": "Parola değiştirildi",
    # Platform aksiyonlari
    "tenant.create": "Tenant oluşturuldu",
    "tenant.update": "Tenant güncellendi",
    "facility.create": "Tesis oluşturuldu",
    "facility.update": "Tesis güncellendi",
    "facility_admin.bootstrap": "İlk tesis yöneticisi oluşturuldu",
    "tenant_user.create": "Kullanıcı oluşturuldu (platform)",
    "plan.create": "Plan oluşturuldu",
    "plan.update": "Plan güncellendi",
    "plan.retire": "Plan emekli edildi",
    "plan.assign_tenant": "Tenant planı atandı",
    "plan.assign_facility": "Tesis plan override'ı atandı",
    "platform.usage.view": "Platform kullanım verisi görüntülendi",
}


def mask_sensitive(value: Any) -> Any:
    """Snapshot icindeki hassas anahtarlari rekursif maskeler."""
    if isinstance(value, dict):
        return {
            key: (
                "***"
                if any(part in key.lower() for part in SENSITIVE_KEY_PARTS)
                else mask_sensitive(item)
            )
            for key, item in value.items()
        }
    if isinstance(value, list):
        return [mask_sensitive(item) for item in value]
    return value


def safe_snapshot(value: dict | None) -> dict | None:
    if value is None:
        return None
    masked = mask_sensitive(value)
    if len(json.dumps(masked, default=str)) > MAX_SNAPSHOT_CHARS:
        return {"_truncated": True, "_note": "Snapshot çok büyük; kırpıldı."}
    return masked
