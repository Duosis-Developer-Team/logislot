# Sprint 7 Raporu — White-label & Polish & QA

Tarih: 8 Temmuz 2026

## 1. Özet

LogiSlot pilot/satış demosuna hazırlandı. **White-label MVP** tamam: tesis
bazlı marka ayarları (ad, logo URL, ana/vurgu/kenar-çubuğu renkleri, başlık
stili, alt bilgi) backend'de kalıcı, audit'li ve doğrulamalı; admin ve supplier
portalları markayı CSS token'ları üzerinden **anında** uygular; platform paneli
LogiSlot kimliğinde kalır; **statü ve kargo anlam renkleri markadan bilinçli
olarak bağımsızdır**. Güvenlik sertleştirildi: login/create/parola-reset **rate
limit** (429 `RATE_LIMITED`), **refresh token rotation** (AuthSession tablosu —
eski token tek kullanımlık, logout-everywhere, pasif tedarikçi refresh edemez),
güvenlik header'ları ve production'da docs kapatma bayrağı. Bildirim saklama
komutu (okunmuş >90 gün silinir, okunmamış asla) ve **18 adımlık tek komutluk
demo smoke script'i** eklendi — canlıda 18/18 geçti. Backend 110/110 test,
frontend 28/28 route build + lint temiz.

## 2. Değişen/Oluşturulan Dosyalar

Backend:
- `app/routers/branding.py` (yeni) — GET/PATCH/DELETE branding + `effective_branding` fallback
- `app/core/ratelimit.py` (yeni) — in-memory sliding-window limiter (env ile kapatılabilir; Redis'e geçiş arayüz değişmeden)
- `app/models/auth_session.py` (yeni) + `alembic/versions/4f355445323d_auth_sessions.py` (up/down doğrulandı)
- `app/services/auth_sessions.py` (yeni) — open/rotate/revoke oturum yönetimi
- `app/core/security.py` — refresh token'a `jti`; `app/core/config.py` — rate limit + docs ayarları
- `app/auth/router.py` — login'lerde rate limit + oturum açma; refresh rotation + aktiflik kontrolü; logout-everywhere
- `app/routers/supplier_portal.py` — create rate limit; `app/routers/suppliers.py` — reset-password limiti + parola değişiminde/pasifleştirmede oturum düşürme
- `app/main.py` — güvenlik header middleware'i + `LOGISLOT_ENABLE_DOCS`
- `app/maintenance/cleanup_notifications.py` (yeni) — saklama politikası komutu
- `tests/conftest.py` — testlerde rate limit varsayılan kapalı (deterministik)
- `tests/test_branding_security.py` (yeni, 10 test)

Frontend:
- `src/lib/api/branding.ts` (yeni) + `src/components/domain/apply-branding.tsx` (yeni — hex→HSL, yalnız `--primary/--primary-hover/--accent`, unmount'ta temizlik)
- `src/app/(admin)/admin/layout.tsx` — BrandMark + sidebar rengi + özel footer
- `src/app/(supplier)/supplier/layout.tsx` — tedarikçinin tesis markası
- `src/app/(admin)/admin/settings/branding/page.tsx` (yeni) — form + canlı önizleme + sıfırlama
- Settings index'e Marka kartı (user.manage); polish: supplier kartlarında `break-words`/`min-w-0`, wizard stepper `truncate`

Scripts/Docs: `scripts/demo_smoke.py` (yeni, 18 adım), README (bakım + güvenlik env notları), `docs/SPRINT_7_REPORT.md`.

## 3. White-label Branding Teslimatları

**Karar:** branding **facility** seviyesinde (`facility.branding_json`);
çözünürlük facility → LogiSlot varsayılanı (tenant-level fallback mimarisi
hazır: çözümleme tek fonksiyonda — tenant alanı eklendiğinde araya girer;
raporlanır). Logo `logo_url` string (upload sonraya). Validasyonlar: hex
`#RRGGBB`, header_style `light|dark`, ad/footer uzunlukları, logo_url http(s)/
data-URI. **Bozuk branding sistemi bozmaz** — liste/bozuk JSON'da default'a
düşer (testli). GET'i tedarikçi de okuyabilir (portal teması); PATCH/DELETE
`user.manage`; before/after snapshot'lı audit (`branding.update/reset`).
Frontend: `ApplyBranding` yalnız marka değişkenlerini yazar; **`--status-*` ve
`--cargo` hiç dokunulmaz** (branding ekranındaki önizlemede bu açıkça gösterilir
ve yazılır); portal değişiminde (unmount) değişkenler temizlenir → platform
paneli daima LogiSlot. Facility switcher değişince branding query'si yeniden
çekilir (facility-bazlı query key). Kaydet → invalidation → tema anında uygulanır.

## 4. UI Polish / Consistency

Kod-seviyesi tur (değişen davranışlar):
- Supplier randevu kartları: uzun ürün/tedarikçi adları `break-words` + `min-w-0`
  ile kırılmadan sarıyor; StatusBadge `shrink-0`.
- Wizard stepper etiketleri dar ekranda `truncate` (taşma yok).
- Settings index: "yakında" kartları kalktı; 8 gerçek bölüm izinle filtreli.
- Tutarlılık denetimi (mevcut ve doğrulandı): tüm listelerde
  Loading/Error/Empty state üçlüsü, drawer'larda aynı başlık/kapat düzeni,
  mutasyonlarda flash feedback, tablolarda `overflow-x-auto` sarmalayıcı,
  Türkçe operasyonel buton dilleri, chip/rozet anlamları (status/cargo/plan).
- Platform copy: usage sayfasında "yalnızca agregat metrikler, PII gösterilmez"
  ifadesi mevcut.

## 5. Responsive QA

**Dürüst kapsam beyanı:** Playwright/başsız tarayıcı KULLANILMADI; ekran
görüntüsü tabanlı doğrulama yapılmadı. Yapılanlar: (1) tüm sayfaların canlı
HTTP 200 + HTML render smoke'u, (2) kod-seviyesi responsive denetimi
(grid kırılımları, overflow sarmalayıcıları, sabit genişlikler) ve yukarıdaki
düzeltmeler, (3) tasarımın viewport varsayımları:

Supplier (360/390/430 genişlik hedefi): layout `max-w-md` tek kolon; alt tab
bar sabit; slot grid 3 kolon (dar ekranda ~100px hücre — okunur); advisory
paneli tam genişlik; kartlar `break-words`'lü. Riskli nokta kalmadıysa da
gerçek cihaz doğrulaması yapılmadı — pilot öncesi manuel checklist:
login→randevular→wizard 3 adım→kargo paneli→profil.

Admin (1280/1440/1920): sidebar 240px + akışkan içerik; takvim `min-width`
hesaplı yatay scroll; tablolar sarmalayıcılı; drawer `max-w-xl`. Mobilde alt
nav'a düşer (kırılmaz, birincil hedef değil).

Platform (1440): `max-w-6xl` ortalanmış; tablolar geniş ekranda rahat; koyu
üst şerit admin'den ayrışıyor.

## 6. Security Hardening

Rate limit: in-memory sliding window; login `IP+email` 10/60 sn (canlıda 11.
deneme → 429 doğrulandı), supplier create kullanıcı-başına 20/60 sn,
parola reset tedarikçi-başına 5/300 sn. `LOGISLOT_RATE_LIMIT_ENABLED=false`
ile kapatılır; testlerde varsayılan kapalı, rate-limit testi kendi içinde açar
(deterministik). Redis'e geçiş aynı arayüzle.

Refresh/session (**Option A uygulandı**): `auth_sessions` tablosu (jti,
expires, revoked, user_agent, ip_hash). Login oturum açar; refresh **rotate**
eder (eski jti tek kullanımlık — tekrar kullanımı 401, testli); logout
**tüm** oturumları kapatır (karar: logout-everywhere, sayı response'ta);
refresh öncesi kullanıcı/firma aktiflik kontrolü (pasif tedarikçi 401);
parola reset ve tedarikçi/hesap pasifleştirme oturumları düşürür. Access
token'lar stateless ve kısa ömürlü kalır (bilinçli).

Headers/CORS/docs: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
`Referrer-Policy: same-origin` tüm cevaplarda (canlıda doğrulandı); CORS env
allowlist (mevcut); `LOGISLOT_ENABLE_DOCS=false` ile docs/openapi kapatılır.
README'de env notları.

## 7. Notification Retention / Cleanup

`python -m app.maintenance.cleanup_notifications --days 90 [--dry-run]`:
yalnızca **okunmuş** ve eşikten eski bildirimler silinir; **okunmamışlar asla
silinmez**; yeni okunmuşlar korunur (üçü de testli); silinen sayı raporlanır;
dry-run destekli. Compose içinde `docker compose exec api ...` ile çalışır
(canlıda doğrulandı). README'ye eklendi.

## 8. Demo Smoke Script

`scripts/demo_smoke.py` — stdlib-only, `LOGISLOT_BASE_URL`/hesap env
override'ları, okunabilir adım çıktısı, ilk hatada açıklamayla non-zero exit.
18 adım: health → platform login/usage → admin login/me → dashboard →
calendar → reports → branding → supplier login/catalog → availability →
create → admin listede görünürlük → approve → supplier unread → email logs →
temizlik (iptal). **Canlı koşu: 18/18 başarılı.** Sadece happy-path değil:
her adım status+envelope doğrular; boş slot/kategori gibi durumlarda anlamlı
hatayla düşer.

## 9. Test Sonuçları

Komutlar:
```bash
cd apps/api && .venv/bin/python -m pytest   # 110 passed
.venv/bin/ruff check app tests              # All checks passed
npm run build -w @logislot/web              # 28/28 route
npm run lint -w @logislot/web               # No warnings or errors
python3 scripts/demo_smoke.py               # 18/18 OK
```
Yeni testler (10): branding default fallback / update+reset+audit / hex+enum
422 + izleyici 403 + yabancı tenant 403 / bozuk JSON fallback; login rate
limit 429 + farklı anahtar etkilenmez; refresh rotation (eski 401, yeni
çalışır); logout revoke; pasif tedarikçi refresh 401; güvenlik header'ları;
cleanup üç kuralı (dry-run dahil). Regresyon: mevcut 100 test yeşil (seed
kaynaklı bir test seçicisi revisable-statü filtresiyle sağlamlaştırıldı).
Canlı: branding CRUD (tedarikçi markayı görüyor) + header'lar + 429 + cleanup.

## 10. Docker / Local Çalıştırma

`docker compose up --build` → web :3010 · api :8010 · db :5433; yeni migration
+ seed otomatik; üç servis ayakta; `/admin/settings/branding` 200.

## 11. Demo Akışları

Branding: admin → Yönetim → Marka/White-Label → ad "Cakes & Bakes", ana renk
#2563EB → canlı önizlemede buton/sidebar değişir, statü rozetleri sabit kalır
→ Kaydet → sidebar/butonlar anında markaya döner; tedarikçi portalına gir →
başlıkta "Cakes & Bakes"; platform paneli LogiSlot kalır → Varsayılana Sıfırla.

Mobile supplier: tarayıcıyı 360px'e daralt → login → randevular (kartlar
sarıyor) → wizard 3 adım (stepper taşmaz, slot grid okunur, kargo paneli tam
genişlik) → talep → başarı ekranı.

Admin QA: 1440px'te dashboard/takvim/raporlar/settings turu — tablolar ve
drawer'lar taşmasız; bölüm 5'teki checklist.

Security: yanlış parolayla 11 hızlı deneme → 429; login → refresh → eski
refresh'i tekrar dene → 401; çıkış yap → refresh 401.

Smoke script: `python3 scripts/demo_smoke.py` → 18/18 yeşil çıktı.

## 12. Bilinen Eksikler / Bilinçli Ertelemeler

1. Tenant-level branding alanı yok (facility MVP; çözümleme fonksiyonu hazır).
2. Logo dosya upload yok (URL/data-URI); storage sonraki kapsam.
3. `portal_header_style` yalnız supplier mini-önizleme/başlıkta kullanılıyor;
   tam koyu tema sonraki iterasyon.
4. Rate limiter in-memory: çoklu-instance dağıtımda Redis'e taşınmalı
   (arayüz hazır).
5. Access token blacklist yok (kısa ömür + refresh rotation ile kabul edilen risk).
6. Görsel/piksel QA yapılmadı (bölüm 5'te dürüst kapsam); Playwright pilot
   öncesi önerilir.
7. Frontend 401'de otomatik refresh-retry akışı yok (login'e yönlendirme);
   rotation altyapısı hazır.
8. Cleanup zamanlanmış job değil, manuel/cron komutu (bilinçli MVP).

## 13. Sonraki Önerilen Sprint

**Sprint 8 — Pilot Hazırlığı & Kalan Boşluklar:** rol/kullanıcı düzenleme
editörü (readonly'den tam CRUD'a), recurring randevu expansion'ı, frontend
otomatik token yenileme (refresh interceptor), Playwright ile kritik akış
görsel testleri, vendor onboarding (platform'dan tenant/facility oluşturma
UI'ı) ve pilot go-live runbook'u.
