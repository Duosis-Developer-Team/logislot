# Feature Parity Matrix — Web / Mobile

Durumlar: ✅ tam · 🟡 kısmi · ❌ yok · — kapsam dışı
Güncelleme kuralı: her feature sprint'inde bu matris güncellenir (bkz. WEB_MOBILE_PARITY.md).

_Son güncelleme: 2026-08-25 (Hermes Ticket Hub entegrasyonu: müşteri destek portalı + Platform ticket yönlendirmesi)_

| Feature | Backend | Web | Mobile | Status | Notes |
|---|---|---|---|---|---|
| **Auth** |
| Public portal seçici (YALNIZ Tedarikçi+Yönetim) | ✅ | ✅ | ✅ | OK | Platform seçicide YOK (hidden); portal-specific login, switcher kaldırıldı |
| Portal-aware login (opsiyonel `portal` parametresi) | ✅ | ✅ | ✅ | OK | Backward-compatible; yanlış portalda doğrulanmış kimliğe net hata |
| Hidden platform login | ✅ | ✅ | — | Kapsam dışı | Yalnız web :30086 (direkt URL); mobile'da bilinçli yok |
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
| Randevu listesi — sütundan sıralama | — | ✅ | ❌ | Backlog | Tablo başlığı etkileşimi; mobilde liste kart tabanlı, karşılığı ayrı bir sıralama kontrolü gerektirir |
| Randevu listesi — CSV dışa aktarım | — | ✅ | ❌ | Backlog | Web'de istemci tarafı (ekranda ne varsa o); mobilde Share sheet ile yapılabilir, rapor CSV'sindeki desen kullanılır |
| Randevu detay + Onayla/Reddet/Revize/Tamamla/İptal | ✅ | ✅ | ✅ | OK | allowed_actions haritasına göre; revize mobile'da auto-dock |
| Aktif kapsam göstergesi | ✅ | ✅ | ✅ | OK | 1 hesap = 1 tesis: seçici yerine sade etiket (web: header, mobile: Menü → Hesap kartı) |
| Admin adına randevu oluşturma | ✅ | ✅ | ✅ | OK | Tedarikçi/kategori/limit kuralları UI'da; seri desteği dahil; onaylı doğar |
| Seri yönetimi (liste/toplu iptal/revize/onay) | ✅ | ✅ | ✅ | OK | future_only; occurrence detayından randevuya gidilir |
| Config CRUD: kategoriler/araçlar/rampalar/çakışma/istisnalar | ✅ | ✅ | ✅ | OK | Rampa: çalışma saatleri editörü + çoklu kategori seçimi dahil |
| Tedarikçi yönetimi + portal hesabı | ✅ | ✅ | ✅ | OK | CRUD + hesap oluştur/parola sıfırla/aktif-pasif |
| Kullanıcılar & roller (RBAC) | ✅ | ✅ | ✅ | OK | Kullanıcı CRUD + parola reset + rol CRUD (izin grupları; sistem rolleri kilitli) |
| Raporlar + CSV | ✅ | ✅ | ✅ | OK | Mobile: CSV Share sheet ile paylaşılır (özet + randevu detay) |
| E-posta logları + resend | ✅ | ✅ | ✅ | OK | Filtre + sayfalama + tekil/toplu resend (toplu: user.manage) |
| Denetim izleri | ✅ | ✅ | ✅ | OK | Filtre + sayfalama + before/after JSON detayı |
| Bildirim zili + tercihler | ✅ | ✅ | ✅ | OK | Zil dashboard'da; tercihler Menü → Bildirim Tercihleri |
| **Destek Ticketları (Hermes Ticket Hub)** — canonical sistem Hermes'tir; LogiSlot projeksiyon tutar |
| Ticket listesi (durum sekmeleri + arama) | ✅ | ✅ | ✅ | OK | Web: kart listesi + arama; mobile: chip şeridi + kart listesi |
| Ticket açma (kategori/etki/başlık/detay) | ✅ | ✅ | ✅ | OK | Hedef ekip READONLY gösterilir; grup seçici HİÇBİR yüzeyde yok |
| Opsiyonel alanlar (adımlar/beklenen/gerçekleşen/hata kodu/zaman) | ✅ | ✅ | 🟡 | Partial | Mobile'da collapsible detay alanları v1'de yok; zorunlu alanlar tam |
| Güvenli otomatik tanılama (allowlist) | ✅ | ✅ | ✅ | OK | Web: tarayıcı/OS/sayfa; mobile: cihaz/dil/zaman dilimi. Query string, cookie, token ASLA |
| Ek dosya: sürükle-bırak + panodan yapıştır + seçici | ✅ | ✅ | ❌ | **Bilinçli erteleme** | Mobile'da native dosya seçici + izin akışı yeni bağımlılık gerektirir; kullanıcı web portalına yönlendirilir (ekranda yazılı) |
| Ek dosya indirme (kısa ömürlü yetkili URL) | ✅ | ✅ | 🟡 | Partial | Mobile'da ek adı ve tarama durumu görünür; indirme web'de |
| Ticket detay + public yazışma | ✅ | ✅ | ✅ | OK | İç notlar hiçbir yüzeye çıkmaz (backend + DB kısıtı) |
| Yanıt yazma / yeniden açma / çözümü onaylama | ✅ | ✅ | ✅ | OK | Ağ hatasında metin korunur; outbox ile yeniden denenir |
| Talep iptali (agent çalışmaya başlamadan) | ✅ | ✅ | ❌ | Backlog | Mobile'da v1 dışı; web'de mevcut |
| Tedarikçi destek portalı (yalnız kendi talepleri) | ✅ | ✅ | ✅ | OK | Mobile: Profil → Destek Talepleri |
| Bildirim (alındı/yanıt/bilgi bekleniyor/çözüldü) | ✅ | ✅ | ✅ | OK | Mevcut bildirim merkezine düşer; olay başına TEK bildirim |
| **Platform** — hidden internal web portalı (:30086); mobile'da GİRİŞ YOKTUR (bilinçli karar, bkz. PORTAL_ISOLATION_AND_ROUTING.md) |
| Genel bakış / kullanım (agregat, 30 gün) | ✅ | ✅ | — | Kapsam dışı | Mobile ekran kodu mevcut ama erişilemez (login yolu yok) |
| Müşteri hesabı dizini + tek adımda açılış (kapsam + bootstrap + ilk yönetici) | ✅ | ✅ | — | Kapsam dışı | Ayrı tesis ekranı KALDIRILDI; eski rota yönlendirir |
| Planlar + atama | ✅ | ✅ | — | Kapsam dışı | |
| Dinamik plan limitleri (kota editörü) | ✅ | ✅ | — | Kapsam dışı | Boyut kataloğu backend'den; `max_tenants` atamada zorlanır |
| Sistem sağlığı (eski adı "Pilot Destek") | ✅ | ✅ | — | Kapsam dışı | Ticket entegrasyonu sayaçları eklendi; ticket İÇERİĞİ gösterilmez |
| Ticket yönlendirmesi (tenant → tek Hermes ekibi) | ✅ | ✅ | — | Kapsam dışı | Mobile ekran kodu mevcut ama erişilemez (platform login yolu yok) |
| Platform denetim izleri | ✅ | ✅ | — | Kapsam dışı | |
| **Ortak** |
| Light/dark/system tema | — | ✅ | ✅ | OK | Aynı navy/blue palet |
| Marka logo/ikon assetleri | — | ✅ | ✅ | OK | Aynı assetler; app icon + splash dahil |
| Shared types/contract | ✅ | ✅ | 🟡 | Partial | Şimdilik senkron kopya (types/shared/email-labels); shared paket çıkarımı backlog |
| Push bildirimleri (mobile-native) | ❌ | — | ❌ | Backlog | Backend push altyapısı gerekiyor; in-app bildirim merkezi mevcut |
| Markalı alan adı yönlendirmesi | ✅ | ✅ | — | N/A | Tarayıcıya özgü: mobilde adres çubuğu yok, uygulama API'ye doğrudan bağlanır. Oturum devri (`/auth/handoff/*`) yalnızca origin sınırı olan web için gerekli. |
