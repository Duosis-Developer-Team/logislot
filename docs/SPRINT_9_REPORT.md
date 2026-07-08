# Sprint 9 Raporu — Pilot Feedback & Production Readiness

Tarih: 2026-07-08

## 1. Özet

Sprint 9, yeni modül açmadan canlı kullanım güvenilirliğini hedefledi ve tüm
kabul kriterleri karşılandı:

- **Gerçek SMTP provider'ı** eklendi (`LOGISLOT_EMAIL_PROVIDER=log_only|smtp`).
  `log_only` varsayılan kaldı ve bozulmadı. SMTP hatası **randevu yaşam
  döngüsünü asla bozmaz**: gönderim `failed` + hata mesajıyla `email_logs`'a
  yazılır, onay/revize yine tamamlanır (testli). Türkçe düz-metin **e-posta
  şablonları** (5 anahtar + seri iptali) tek modülde toplandı.
- **İlk tenant yöneticisi onboarding'i UI'ya alındı**: tesis oluşturma
  drawer'ında "İlk tesis yöneticisini oluştur" bölümü; geçici parola otomatik
  üretilir (veya elle girilir), yanıtta **yalnızca bir kez** gösterilir
  (kopyala butonu + "bir daha gösterilmeyecek" uyarısı). Runbook'taki komut
  fallback olarak kaldı.
- **Parola politikası + zorunlu ilk değişim**: min 10 karakter + harf + rakam
  + özel karakter; `must_change_password=True` kullanıcı login olabilir ama
  `/auth/change-password` (+`/auth/me`, `/auth/logout`) dışındaki TÜM API
  403 `PASSWORD_CHANGE_REQUIRED` döner; frontend `/change-password` sayfasına
  yönlendirir. Tüm reset'ler ve geçici parolalı hesap açılışları flag'i set
  eder. Production ortamında yaygın/demo parolalar reddedilir; demo/seed
  etkilenmez.
- **Seri toplu iptali** (future_only): tamamlanmış/geçmiş randevulara
  dokunmaz; tek özet bildirim (tedarikçi + admin) + tek özet e-posta; rampa
  yöneticisi scope'u all-or-nothing. Drawer'daki seri bandına ve yeni **admin
  "Seriler" sayfasına** iptal aksiyonu eklendi.
- **Admin recurring artık sessizce yok sayılmıyor**: açık 422
  `ADMIN_RECURRING_NOT_SUPPORTED` (Option B — bilinçli erteleme, §6).
- **GitHub Actions E2E workflow'u** (`.github/workflows/e2e.yml`) ve
  **`scripts/backup_smoke.sh`** eklendi; ikisi de gerçek adımlarla yazıldı,
  backup smoke canlı stack'e karşı koşuldu.
- Her şey yeşil: **pytest 144/144** (128 + 16 yeni), ruff, `tsc`/lint/build,
  **demo_smoke 18/18**, **Playwright 6/6** (yeni parola-değişimi testi dahil),
  backup smoke ✔ — tümü canlı compose stack'e karşı doğrulandı.

## 2. Değişen/Oluşturulan Dosyalar

**Backend (`apps/api/`)**

| Dosya | Değişiklik |
|---|---|
| `app/core/config.py` | SMTP + `public_web_url` + parola politikası ayarları |
| `app/core/passwords.py` | **Yeni** — politika doğrulayıcı + güçlü geçici parola üreteci |
| `app/models/{tenant_user,supplier,platform_user}.py` | `must_change_password`, `password_changed_at` (3 kullanıcı tipi) |
| `alembic/versions/92c898fa957b_*.py` | Migration (up/down/up doğrulandı) |
| `app/services/email.py` | **`SMTPEmailProvider`** (STARTTLS, timeout, thread'de send, Message-ID → metadata), failed loglama |
| `app/services/email_templates.py` | **Yeni** — 6 Türkçe şablon (`render_email`) + portal linki |
| `app/services/notifications.py` | Lifecycle e-postaları şablon modülünden; rampa adı + tarih zenginleştirme |
| `app/auth/deps.py` | `PASSWORD_CHANGE_REQUIRED` guard'ı (allowlist: change-password/logout/me) |
| `app/auth/router.py` | `POST /auth/change-password` (3 tip); login yanıtlarında `must_change_password` |
| `app/routers/users.py` | User create/reset → `must_change_password=True` |
| `app/routers/suppliers.py` | Hesap create/reset → `must_change_password=True` |
| `app/routers/platform.py` | `FacilityCreate.initial_admin` + `_create_initial_admin` (tek transaction) |
| `app/services/onboarding.py` | `ensure_sysadmin_role` (bootstrap kapalıyken rol garantisi) |
| `app/services/appointments.py` | **`cancel_appointment_series`** (future_only, scope, tek bildirim/e-posta, audit) |
| `app/routers/appointments.py` | `POST .../appointment-series/{id}/cancel`; admin recurring → 422 |
| `app/schemas/{auth,appointment}.py` | `ChangePasswordRequest`, `SeriesCancelRequest` |
| `tests/test_sprint9.py` | **Yeni** — 16 test |
| `tests/test_sprint8.py` | Admin recurring testi yeni 422 davranışına güncellendi |

**Frontend (`apps/web/`)**

| Dosya | Değişiklik |
|---|---|
| `src/lib/api/client.ts` | `changePassword`, login tipinde flag, 403 `PASSWORD_CHANGE_REQUIRED` → `/change-password` yönlendirmesi, `getStoredPortal` |
| `src/app/(auth)/change-password/page.tsx` | **Yeni** — 3 portal için ortak parola değiştirme |
| `src/app/(auth)/login/page.tsx` | `must_change_password` → `/change-password` yönlendirmesi |
| `src/app/(platform)/platform/facilities/page.tsx` | "İlk yönetici" bölümü + tek seferlik parola dialogu (kopyala) |
| `src/lib/api/platform.ts` | `initial_admin` DTO alanı |
| `src/lib/api/appointments.ts` | `useAppointmentSeries/useSeriesDetail/useSeriesCancel` |
| `src/components/appointments/appointment-drawer.tsx` | Seri bandında "Seriyi İptal Et" + onay dialogu |
| `src/app/(admin)/admin/series/page.tsx` | **Yeni** — seri listesi/detayı + iptal aksiyonu |
| `src/app/(admin)/admin/layout.tsx` | "Seriler" nav linki (appt.view) |

**CI/Scripts/Docs**

| Dosya | Değişiklik |
|---|---|
| `.github/workflows/e2e.yml` | **Yeni** — compose + health-wait + migrate/seed + smoke + Playwright + hata artefaktları |
| `scripts/backup_smoke.sh` | **Yeni** — pg_dump + boyut + `pg_restore --list` doğrulaması |
| `e2e/06-change-password.spec.ts` | **Yeni** — 6. kritik E2E |
| `.env.example` | SMTP + parola + public URL blokları |
| `docs/PILOT_GO_LIVE_RUNBOOK.md` | SMTP kurulumu, parola akışı, UI-onboarding, backup smoke, CI, checklist |
| `README.md` | Sprint 9 durumu + güvenlik/araç bölümleri |

## 3. SMTP Email Provider

- **Seçim**: `LOGISLOT_EMAIL_PROVIDER=log_only|smtp`; `log_only` varsayılan
  ve davranışı değişmedi (regresyon testli).
- **`SMTPEmailProvider`**: `smtplib` + STARTTLS (`SMTP_USE_TLS`) + login
  (kullanıcı adı verilirse) + `SMTP_TIMEOUT_SECONDS`; senkron gönderim
  `asyncio.to_thread` ile event loop'u bloklamadan yapılır. Kendi
  `Message-ID`'sini üretir → `email_logs.metadata_json.provider_message_id`.
- **Eksik konfigürasyon kararı**: API **boot etmeye devam eder**; `smtp`
  seçilip `SMTP_HOST`/`SMTP_FROM_EMAIL` boşsa her gönderim
  `failed` + "SMTP yapilandirmasi eksik: LOGISLOT_SMTP_HOST..." ile loglanır.
  Gerekçe: e-posta altyapısı randevu operasyonunu hiçbir koşulda
  durdurmamalı; sorun email-logs ekranında görünür kalır (testli).
- **Hata izolasyonu**: `send_email` provider istisnalarını yutar → EmailLog
  `failed` (error_message dolu, `sent_at` null); approve/revise HTTP 200
  döner (testli: bağlantı hatası senaryosu).
- **Şablonlar** (`email_templates.py`): `appointment_approved/rejected/
  revised/revised_team/cancelled` + `appointment_series_cancelled`. İçerik:
  tedarikçi adı, tarih/saat, ürün, rampa adı, durum etiketi, revizede
  eski→yeni saat + not, red/iptal sebebi ve `LOGISLOT_PUBLIC_WEB_URL` portal
  linki. Şablon motoru yok (bilinçli); `render_email(key, ctx)` sözleşmesi
  Jinja'ya geçişe açık.
- Testler mock `_send_sync` ile çalışır (gerçek SMTP gerekmez); revize →
  tedarikçi + ekip e-postalarının smtp üzerinden `sent` olduğu ayrıca testli.

## 4. First Admin Onboarding

- **Yerleşim kararı**: ayrı endpoint yerine tercih edildiği gibi
  **facility create gövdesinde `initial_admin`** — tesis + bootstrap + ilk
  yönetici **tek transaction**: e-posta çakışırsa (409 `DUPLICATE_EMAIL`)
  tesis de oluşmaz (testli).
- Kurallar: e-posta global unique; kullanıcı **"Sistem Yoneticisi" system
  rolüyle** üyelik alır — bootstrap kapalıysa rol `ensure_sysadmin_role` ile
  oluşturulur (kullanıcı asla kilitli doğmaz, testli); `must_change_password`
  default true; geçici parola verilmezse **14 karakterlik güçlü random**
  üretilir (politikayı garanti sağlar).
- **Tek seferlik gösterim**: geçici parola yalnızca create yanıtında döner;
  hiçbir GET yeniden döndürmez (testli). UI'da kapatınca kaybolan dialog +
  kopyala butonu + uyarı metni.
- Audit: `tenant_user.create` + `facility_admin.bootstrap`.
- Son yönetici koruması ilk yönetici için de geçerli (409 `LAST_ADMIN`, testli).
- Runbook'taki komut **fallback** olarak korundu ve `must_change_password=True`
  ekleyecek şekilde güncellendi; önerilen yol artık UI.

## 5. Password Policy / Must Change Password

- **Politika** (`app/core/passwords.py`): min `LOGISLOT_PASSWORD_MIN_LENGTH`
  (10) + en az 1 harf + 1 rakam + (`REQUIRE_SPECIAL=true` iken) 1 özel
  karakter. **Uygulama noktası kararı**: politika `/auth/change-password`'da
  uygulanır; create/reset geçici parolaları min 6'da kaldı ÇÜNKÜ bu parolalar
  `must_change_password=True` ile zaten değiştirilmek zorunda — böylece her
  KALICI parola politikadan geçmiş olur ve demo/seed/test evreni kırılmaz.
- **Production kararı**: `LOGISLOT_ENVIRONMENT=production` iken `Demo123!`,
  `logislot123` gibi yaygın parolalar kalıcı parola olarak reddedilir
  (testli); development/demo etkilenmez.
- **Model**: `must_change_password` + `password_changed_at` üç kullanıcı
  tipinde de (tenant/supplier/platform) — change-password endpoint'i üçü
  için de tek.
- **Login davranışı** (tercih edildiği gibi): login başarılı olur, yanıt
  `must_change_password` içerir; frontend `/change-password`'a yönlendirir.
  **API guard**: `get_identity` içinde — allowlist (`/auth/change-password`,
  `/auth/logout`, `/auth/me`) dışındaki her çağrı 403
  `PASSWORD_CHANGE_REQUIRED` (3 kullanıcı tipi için de). Interceptor bu kodu
  görünce kullanıcıyı `/change-password`'a taşır.
- **Change-password kuralları**: mevcut parola doğru (422
  `INVALID_CURRENT_PASSWORD`), yeni ≠ eski (422 `SAME_PASSWORD`), politika
  (422 `WEAK_PASSWORD`); başarıda `password_changed_at` set, flag false,
  **tüm refresh oturumları düşürülür ve yanıtta YENİ token çifti döner**
  (karar: kullanıcı yeniden login olmadan kesintisiz devam eder, olası
  çalıntı eski oturumlar anında ölür — eski refresh 401, testli).
- Tüm reset yolları (tenant user reset, supplier reset) flag'i set eder
  (testli); tenant user create ve supplier hesabı create de geçici parola
  mantığıyla set eder.

## 6. Recurring Series Operations

- **`POST /facilities/{fid}/appointment-series/{series_id}/cancel`**
  (`appt.cancel` izni): scope MVP'de yalnızca **`future_only`** — yalnızca
  `pending/approved/revision_pending` VE başlangıcı gelecekte olan
  occurrence'lar iptal edilir; `completed/rejected/cancelled` ve geçmiş
  randevulara dokunulmaz (testli: tamamlanmış occurrence aynen kaldı).
  `all` scope'u bilinçli eklenmedi (geçmişi iptal etmenin operasyonel anlamı
  yok; rapor kararı).
- İptal edilecek gelecek randevu yoksa 409 `NO_FUTURE_OCCURRENCES`.
- `cancellation_reason` her occurrence'a yazılır; seri `status=cancelled`.
- **Spam yok**: tedarikçiye TEK özet bildirim + TEK
  `appointment_series_cancelled` e-postası; adminlere TEK özet bildirim
  (alıcı başına) — hepsi `affected_count` metadata'lı (testli).
- Audit: `appointment_series.cancel` + `affected_count`.
- **Rampa yöneticisi scope kararı — all-or-nothing**: etkilenecek
  occurrence'lardan biri bile atanmış rampaların dışındaysa 403 ("seri
  iptali için sistem yöneticisi gerekli"); kısmi seri iptali yapılmaz
  (tutarlılık > kolaylık; testli).
- **Supplier tarafı kararı**: seri toplu iptali MVP'de **admin-only**.
  Tedarikçi gelecekteki randevularını zaten tek tek iptal edebiliyor;
  yanlışlıkla tüm seriyi silme riskine karşı toplu güç şimdilik yönetimde.
  İhtiyaç çıkarsa `POST /supplier/appointment-series/{id}/cancel` aynı
  servisle eklenir.
- **UI**: drawer'daki seri bandında "Seriyi İptal Et" (onay dialogu:
  "gelecekteki tüm bekleyen/onaylı randevular... tamamlanmışlar etkilenmez");
  yeni **/admin/series** sayfası: tedarikçi/sıklık/statü sayaçları tablosu,
  satır genişletince occurrence çipleri (tıklayınca drawer), aktif serilerde
  iptal butonu (iptal edilecek sayıyı gösterir). Başarıda seri/randevu/
  takvim/dashboard sorguları invalidate edilir.
- **Admin on-behalf recurring — Option B (bilinçli erteleme)**: admin create
  UI'sı tekil randevu drawer'ı bile değilken bu sprintte seri eklemek kapsamı
  patlatırdı; supplier portal recurring pilot ihtiyacını karşılıyor. Ama
  sessiz yok sayma kaldırıldı: `recurring` içeren admin create artık **422
  `ADMIN_RECURRING_NOT_SUPPORTED`** döner (testli; Sprint 8 testi güncellendi).

## 7. Playwright CI

- **`.github/workflows/e2e.yml`** — tetikleme kararı: `workflow_dispatch` +
  `pull_request` (repo henüz GitHub'a push edilmediği için workflow şimdilik
  inert; push edildiği anda ek ayarsız çalışır — rapor kararı).
- Adımlar: checkout → `docker compose up -d --build` → **API health-wait
  döngüsü** (120 sn) → `alembic upgrade head` + seed → web health-wait →
  Node 20 + `npm ci` + `playwright install --with-deps chromium` →
  `demo_smoke.py` → `npx playwright test` → hata durumunda compose logları +
  screenshot/trace artefakt upload → `docker compose down -v` (always).
- Port çakışması riski GitHub runner'da yok (3010/8010/5433 boş); lokalde
  aynı komutlar `npm run e2e` ile koşuyor.
- **Stabilizasyon**: workers 1 korundu; tüm testler kendi oluşturduklarını
  iptal/pasifleştirme ile temizliyor; yeni 6. test (change-password) API
  fixture + UI akışı + `finally` temizliği kalıbında.

## 8. Backup Smoke

- **`scripts/backup_smoke.sh`**: compose içindeki PG'den `pg_dump -Fc` alır →
  dosyanın varlığını/boyutunu doğrular → **`pg_restore --list`** ile dump'ın
  okunabilirliğini ve `TABLE DATA` girdilerini (≥5) kontrol eder →
  varsayılan davranışta dump'ı temizler (`KEEP_DUMP=1` ile bırakır).
- **Dürüst sınır (runbook'ta da yazılı)**: bu script **gerçek restore
  denemez** — çalışan demo/pilot DB'sinin üzerine yazmamak bilinçli karar.
  "Restore test edildi" İDDİA EDİLMİYOR; yalnızca dump alınabilirliği ve
  okunabilirliği doğrulanıyor. Restore provası runbook §8'deki komutla ayrı
  bir test veritabanında yapılmalı.
- Canlı koşum: 106 KB dump, 29 `TABLE DATA` girdisi, ✔.

## 9. Runbook Güncellemeleri

- §1 env tablosu: SMTP/parola/public URL satırları.
- Yeni **§3.1 SMTP Kurulumu** (env bloğu + davranış garantileri + doğrulama
  adımı) ve **§3.2 Parola Politikası ve İlk Giriş Akışı**.
- §4 doğrulama: Playwright 6/6, backup smoke komutu, CI notu.
- §5 pilot tenant açma: **önerilen yol artık UI** (ilk yönetici bölümü +
  tek seferlik parola uyarısı); komut fallback'e indirildi ve
  `must_change_password=True` içerir.
- §7 go-live checklist: `LOGISLOT_ENVIRONMENT=production`, SMTP kararı +
  test e-postası, ilk yöneticilerin ilk girişini yapması, backup smoke,
  CI E2E maddeleri eklendi.
- §10 MVP sınırları: SMTP retry/HTML yok, seri toplu revize yok, admin
  recurring açık 422 olarak güncellendi.

## 10. RBAC / Security / Scope

- `PASSWORD_CHANGE_REQUIRED` guard'ı üç kimlik tipinde de merkezi
  (`get_identity`) — hiçbir router unutulamaz; allowlist üç yoldan ibaret.
- Change-password her zaman mevcut parolayı ister (token çalınsa bile parola
  değiştirilemez) ve başarıda tüm eski oturumları düşürür.
- İlk yönetici yalnızca `platform.tenant.manage` ile açılabilir; tenant
  rolü olarak yalnızca tenant izin uzayındaki system rol atanır (platform.*
  sızması yok).
- Seri iptali `appt.cancel` + rampa scope all-or-nothing; cross-facility
  seri 404 (facility filtresi sorguda).
- SMTP parolası yalnızca env'de; loglara/e-posta kayıtlarına yazılmaz.
- Geçici parolalar hash'lenmeden hiçbir yerde kalıcılaşmaz; yalnızca tek
  create yanıtında düz metin döner.

## 11. Test Sonuçları

Komutlar:

```bash
cd apps/api && .venv/bin/python -m pytest -q      # 144 passed
.venv/bin/ruff check app tests                     # temiz
cd apps/web && npx tsc --noEmit && npm run lint    # temiz
npm run build:web                                  # başarılı
docker compose up -d --build api web
docker compose exec api alembic upgrade head       # 92c898fa957b (head)
python3 scripts/demo_smoke.py                      # 18/18
npx playwright test                                # 6 passed
./scripts/backup_smoke.sh                          # ✔ (29 TABLE DATA)
```

Yeni `tests/test_sprint9.py` (16 test): log_only regresyonu; SMTP success
(`provider=smtp, sent`); SMTP bağlantı hatasında approve 200 + `failed` log;
eksik SMTP config → `failed` + env adlı hata; revize → tedarikçi + ekip smtp
`sent`; login flag'i; tam must-change akışı (403 → yanlış/aynı/zayıf parola
422'leri → başarı + yeni token + eski refresh 401); tenant + supplier reset
flag'i; production yaygın-parola reddi; ilk yönetici tam akışı (random parola,
one-time, 403, değişim sonrası sysadmin, LAST_ADMIN); duplicate e-postada
tesisin de oluşmaması; bootstrap'sız rol garantisi; seri iptal (future_only,
completed dokunulmaz, tek bildirim ×2 + tek e-posta, ikinci iptal 409); izin
ve rampa-scope 403'leri. Ayrıca canlı PG doğrulaması: seri iptal
`affected_count=3` + tek e-posta; ilk yönetici canlı akışı (14 karakter
parola → 403 → değişim → Sistem Yoneticisi listesi) — test tenant'ları
sonrasında temizlendi.

## 12. Docker / Local Çalıştırma

Compose değişmedi (web 3010, api 8010, db 5433). API+web imajları Sprint 9
koduyla yeniden build edildi; migration konteynerde koşuldu
(`92c898fa957b (head)`); seed idempotent davranışını korudu. SMTP env'leri
compose'a eklenmedi (varsayılan `log_only`) — pilotta §3.1'deki env'lerle
açılır.

## 13. Demo Akışları

- **SMTP**: `.env`'de provider'ı `smtp` yap + SMTP alanlarını doldur → API
  restart → randevu onayla → drawer'daki e-posta loglarında `provider: smtp`.
  Sunucu erişilemezse aynı ekranda `failed` + hata mesajı görünür, onay yine
  gerçekleşir.
- **First admin**: Platform → Tesis Dizini → Yeni Tesis → "İlk tesis
  yöneticisini oluştur" → kaydet → çıkan dialogdan geçici parolayı kopyala
  (tekrar gösterilmez).
- **Password change**: o parolayla Yönetim girişi → otomatik
  `/change-password` → zayıf parola dene (Türkçe politika hatası) → güçlü
  parola → kesintisiz dashboard'a düşersin.
- **Series cancel**: Tedarikçi sihirbazından haftalık×4 seri → Yönetim →
  Seriler → satırı genişlet (occurrence çipleri) → "Seriyi İptal Et" →
  onayda kaç randevunun iptal olacağını gör → tedarikçi zilinde TEK özet
  bildirim; tamamlanmış occurrence varsa statüsünü korur.
- **CI/E2E**: lokal `npx playwright test` (6/6); GitHub'a push sonrası
  Actions → e2e → Run workflow.
- **Backup**: `./scripts/backup_smoke.sh` → dump + okunabilirlik ✔;
  `KEEP_DUMP=1` ile dosya bırakılır.

## 14. Bilinen Eksikler / Bilinçli Ertelemeler

- **Admin on-behalf recurring create yok** (açık 422 ile) — admin randevu
  create UI'sı gelirse aynı seri servisi bağlanır.
- **Supplier'dan seri toplu iptali yok** (admin-only karar, §6); tedarikçi
  occurrence'ları tek tek iptal edebiliyor.
- **SMTP retry/kuyruk yok**: failed e-posta otomatik yeniden gönderilmez
  (email-logs'tan görünür; ileride tekrar-gönder butonu/kuyruk).
- HTML e-posta şablonu yok (düz metin; Jinja'ya geçişe açık sözleşme).
- Backup smoke **gerçek restore provası değildir** (bilinçli; runbook'ta
  ayrı prosedür).
- CI workflow'u repo GitHub'a push edilene kadar inert (dosya hazır).
- `must_change_password` guard'ı bildirim zilini de kapatır (allowlist'te
  yalnız me/logout/change-password) — kabul edilen davranış: kullanıcı zaten
  tek sayfaya yönlendiriliyor.
- Parola politikası UI'da yalnızca metinle anlatılır; canlı güç göstergesi
  (strength meter) yok.

## 15. Sonraki Önerilen Sprint

**Pilot işletim sprinti**: e-posta yeniden-gönderme + basit kuyruk/retry,
seri toplu revize (saat kaydırma), admin on-behalf create drawer'ı (tekil +
seri), bildirim tercihlerine e-posta opt-out, kullanım bazlı plan limit
uyarıları (plan hâlâ politika kabı), CI'ya pytest+lint job'ları ve staging
ortam compose profili.
