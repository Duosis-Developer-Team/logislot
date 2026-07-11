# Feature Parity Matrix — Web / Mobile

Durumlar: ✅ tam · 🟡 kısmi · ❌ yok · — kapsam dışı
Güncelleme kuralı: her feature sprint'inde bu matris güncellenir (bkz. WEB_MOBILE_PARITY.md).

_Son güncelleme: 2026-07-11 (Mobile Foundation Sprint)_

| Feature | Backend | Web | Mobile | Status | Notes |
|---|---|---|---|---|---|
| **Auth** |
| Login + portal seçimi (3 portal) | ✅ | ✅ | ✅ | OK | Aynı endpoint'ler (login/supplier-login/platform-login) |
| Refresh token (rotation, tek-uçuş) | ✅ | ✅ | ✅ | OK | Aynı algoritma; mobile SecureStore |
| Logout (logout-everywhere + client temizliği) | ✅ | ✅ | ✅ | OK | |
| Geçici parola / change-password | ✅ | ✅ | ✅ | OK | |
| Role-based yönlendirme + RBAC görünürlüğü | ✅ | ✅ | ✅ | OK | Mobile: RoleGuard + can() |
| **Tedarikçi** |
| Randevularım (liste + sayaçlar + yaklaşan/geçmiş) | ✅ | ✅ | ✅ | OK | Mobile: pull-to-refresh'li liste |
| Yeni randevu sihirbazı (3 adım, gerçek müsaitlik) | ✅ | ✅ | ✅ | OK | Mobile: chip/slot dokunmatik UX |
| Kargo teslimat talebi (pencere seçimi) | ✅ | ✅ | ✅ | OK | |
| Randevu detay + iptal | ✅ | ✅ | ✅ | OK | |
| Tekrarlayan seri OLUŞTURMA | ✅ | ✅ | ❌ | Partial | Mobile sihirbazda yok — sonraki sprint |
| Seri görüntüleme / seri iptali | ✅ | ✅ | 🟡 | Partial | Mobile: özet listeleniyor; detay/iptal yok |
| Profil + bildirim tercihleri | ✅ | ✅ | 🟡 | Partial | Mobile: profil var; bildirim tercihleri yok |
| **Yönetim (Admin)** |
| Dashboard (KPI + bekleyen + yaklaşan) | ✅ | ✅ | ✅ | OK | |
| Takvim | ✅ | ✅ | ✅ | OK | Web: saat-ızgara; mobile: agenda (gün okları + rampa grupları) |
| Randevu listesi (statü filtreli) | ✅ | ✅ | ✅ | OK | |
| Randevu detay + Onayla/Reddet/Revize/Tamamla/İptal | ✅ | ✅ | ✅ | OK | allowed_actions haritasına göre; revize mobile'da auto-dock |
| Tesis seçici (multi-facility) | ✅ | ✅ | ✅ | OK | Mobile: Menü ekranında |
| Admin adına randevu oluşturma | ✅ | ✅ | ❌ | Partial | Sonraki sprint |
| Seri yönetimi (liste/toplu iptal/revize/onay) | ✅ | ✅ | ❌ | Partial | Sonraki sprint |
| Config CRUD: kategoriler/araçlar/rampalar/çakışma/istisnalar | ✅ | ✅ | ❌ | Partial | Mobile'da web'e yönlendirme notu var |
| Tedarikçi yönetimi + portal hesabı | ✅ | ✅ | ❌ | Partial | |
| Kullanıcılar & roller (RBAC) | ✅ | ✅ | ❌ | Partial | |
| Raporlar + CSV | ✅ | ✅ | ❌ | Partial | |
| E-posta logları + resend | ✅ | ✅ | ❌ | Partial | |
| Denetim izleri | ✅ | ✅ | ❌ | Partial | |
| Bildirim zili + tercihler | ✅ | ✅ | ❌ | Partial | Mobile push bildirimleri ayrıca planlanmalı |
| **Platform** |
| Genel bakış / kullanım (agregat, 30 gün) | ✅ | ✅ | ✅ | OK | |
| Tenant dizini | ✅ | ✅ | ✅ | OK | Mobile: read-only kartlar (create/edit web'de) |
| Tesis dizini | ✅ | ✅ | ✅ | OK | Mobile: read-only |
| Planlar + atama | ✅ | ✅ | ❌ | Partial | |
| Destek sağlığı | ✅ | ✅ | ❌ | Partial | |
| Platform denetim izleri | ✅ | ✅ | ❌ | Partial | |
| **Ortak** |
| Light/dark/system tema | — | ✅ | ✅ | OK | Aynı navy/blue palet |
| Marka logo/ikon assetleri | — | ✅ | ✅ | OK | Aynı assetler; app icon + splash dahil |
| Shared types/contract | ✅ | ✅ | 🟡 | Partial | Şimdilik senkron kopya; shared paket çıkarımı backlog |
