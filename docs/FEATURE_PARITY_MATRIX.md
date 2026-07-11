# Feature Parity Matrix — Web / Mobile

Durumlar: ✅ tam · 🟡 kısmi · ❌ yok · — kapsam dışı
Güncelleme kuralı: her feature sprint'inde bu matris güncellenir (bkz. WEB_MOBILE_PARITY.md).

_Son güncelleme: 2026-07-11 (Full Parity Sprint — tüm web özellikleri mobile'a taşındı)_

| Feature | Backend | Web | Mobile | Status | Notes |
|---|---|---|---|---|---|
| **Auth** |
| Login + portal seçimi (3 portal) | ✅ | ✅ | ✅ | OK | Aynı endpoint'ler (login/supplier-login/platform-login) |
| Refresh token (rotation, tek-uçuş) | ✅ | ✅ | ✅ | OK | Aynı algoritma; mobile SecureStore |
| Logout (logout-everywhere + client temizliği) | ✅ | ✅ | ✅ | OK | |
| Geçici parola / change-password | ✅ | ✅ | ✅ | OK | |
| Role-based yönlendirme + RBAC görünürlüğü | ✅ | ✅ | ✅ | OK | Mobile: RoleGuard + can(); menü girişleri izinle filtrelenir |
| **Tedarikçi** |
| Randevularım (liste + sayaçlar + yaklaşan/geçmiş) | ✅ | ✅ | ✅ | OK | Mobile: pull-to-refresh'li liste |
| Yeni randevu sihirbazı (3 adım, gerçek müsaitlik) | ✅ | ✅ | ✅ | OK | Mobile: chip/slot dokunmatik UX |
| Kargo teslimat talebi (pencere seçimi) | ✅ | ✅ | ✅ | OK | |
| Randevu detay + iptal | ✅ | ✅ | ✅ | OK | |
| Tekrarlayan seri OLUŞTURMA | ✅ | ✅ | ✅ | OK | Sihirbazda sıklık + tekrar sayısı + tarih önizleme; hepsi-ya-hiç |
| Seri görüntüleme / seri iptali | ✅ | ✅ | ✅ | OK | Seri kartları + occurrence detayı + sebep zorunlu gelecek-iptal |
| Profil + bildirim tercihleri | ✅ | ✅ | ✅ | OK | Panel/e-posta tercihleri profil ekranında |
| Bildirim zili + bildirim listesi | ✅ | ✅ | ✅ | OK | Mobile: tam ekran bildirim merkezi + unread rozeti |
| **Yönetim (Admin)** |
| Dashboard (KPI + bekleyen + yaklaşan) | ✅ | ✅ | ✅ | OK | Mobile: + bildirim zili |
| Takvim | ✅ | ✅ | ✅ | OK | Web: saat-ızgara; mobile: agenda (gün okları + rampa grupları) |
| Randevu listesi (statü filtreli) | ✅ | ✅ | ✅ | OK | |
| Randevu detay + Onayla/Reddet/Revize/Tamamla/İptal | ✅ | ✅ | ✅ | OK | allowed_actions haritasına göre; revize mobile'da auto-dock |
| Tesis seçici (multi-facility) | ✅ | ✅ | ✅ | OK | Mobile: Menü ekranında |
| Admin adına randevu oluşturma | ✅ | ✅ | ✅ | OK | Tedarikçi/kategori/limit kuralları UI'da; seri desteği dahil; onaylı doğar |
| Seri yönetimi (liste/toplu iptal/revize/onay) | ✅ | ✅ | ✅ | OK | future_only; occurrence detayından randevuya gidilir |
| Config CRUD: kategoriler/araçlar/rampalar/çakışma/istisnalar | ✅ | ✅ | ✅ | OK | Rampa: çalışma saatleri editörü + çoklu kategori seçimi dahil |
| Tedarikçi yönetimi + portal hesabı | ✅ | ✅ | ✅ | OK | CRUD + hesap oluştur/parola sıfırla/aktif-pasif |
| Kullanıcılar & roller (RBAC) | ✅ | ✅ | ✅ | OK | Kullanıcı CRUD + parola reset + rol CRUD (izin grupları; sistem rolleri kilitli) |
| Raporlar + CSV | ✅ | ✅ | ✅ | OK | Mobile: CSV Share sheet ile paylaşılır (özet + randevu detay) |
| E-posta logları + resend | ✅ | ✅ | ✅ | OK | Filtre + sayfalama + tekil/toplu resend (toplu: user.manage) |
| Denetim izleri | ✅ | ✅ | ✅ | OK | Filtre + sayfalama + before/after JSON detayı |
| Bildirim zili + tercihler | ✅ | ✅ | ✅ | OK | Zil dashboard'da; tercihler Menü → Bildirim Tercihleri |
| **Platform** |
| Genel bakış / kullanım (agregat, 30 gün) | ✅ | ✅ | ✅ | OK | + tenant/tesis kullanım listeleri + plan kullanım uyarıları |
| Tenant dizini + oluştur/düzenle | ✅ | ✅ | ✅ | OK | Slug otomatik türetme; kimlik alanları düzenlemede kilitli |
| Tesis dizini + oluştur/düzenle | ✅ | ✅ | ✅ | OK | Bootstrap + ilk yönetici + tek-seferlik geçici parola paneli |
| Planlar + atama | ✅ | ✅ | ✅ | OK | Plan CRUD + emekliye ayırma + tenant/tesis plan atama (Genel Bakış) |
| Destek sağlığı | ✅ | ✅ | ✅ | OK | Sağlık kartları + scheduler durumu + ortam bilgisi |
| Platform denetim izleri | ✅ | ✅ | ✅ | OK | Ortak audit bileşeni |
| **Ortak** |
| Light/dark/system tema | — | ✅ | ✅ | OK | Aynı navy/blue palet |
| Marka logo/ikon assetleri | — | ✅ | ✅ | OK | Aynı assetler; app icon + splash dahil |
| Shared types/contract | ✅ | ✅ | 🟡 | Partial | Şimdilik senkron kopya (types/shared/email-labels); shared paket çıkarımı backlog |
| Push bildirimleri (mobile-native) | ❌ | — | ❌ | Backlog | Backend push altyapısı gerekiyor; in-app bildirim merkezi mevcut |
