# LogiSlot — Akıllı Mal Kabul & Rampa Randevu Platformu

Fabrikaların, depoların ve üretim tesislerinin tedarikçi mal kabul / rampa randevu
süreçlerini dijitalleştiren, kurallara dayalı, **çok kiracılı (multi-tenant) SaaS** platformu.

Hiyerarşi: **Platform → Tenant → Facility → Operasyonel Veri**
(Tenant yalnızca kimlik/faturalama/plan sarmalayıcısıdır; tüm operasyonel
konfigürasyon Facility seviyesinde yaşar.)

## Depo Yapısı

```
apps/
  api/          FastAPI + SQLAlchemy 2 (async) + Alembic + PostgreSQL 16
  web/          Next.js 15 App Router + TypeScript + Tailwind
packages/
  shared/       Paylaşılan TS domain sabitleri (statüler, etiketler)
docs/           Understanding report + sprint raporları
logislot_cto_pack/  Ürün/mimari kaynak dokümanları (v2.0 bağlayıcı)
docker-compose.yml
```

## Hızlı Başlangıç (Docker Compose)

```bash
docker compose up --build
```

- Web: http://localhost:**3010**
- API: http://localhost:**8010** (OpenAPI: `/docs`)
- PostgreSQL: localhost:**5433**

> Portlar bilinçli olarak 3000/8000/5432 yerine 3010/8010/5433'tür — yerel
> makinelerde bu portlar sık dolu olur; çakışırsa `docker-compose.yml`'den değiştirin.

API konteyneri açılışta migration'ları uygular ve seed'i (idempotent) çalıştırır.

## Yerel Geliştirme

### Backend

```bash
cd apps/api
python3.13 -m venv .venv && .venv/bin/pip install -e ".[dev]"
docker compose -f ../../docker-compose.yml up -d db   # yalnızca Postgres
cp ../../.env.example .env                             # gerekirse düzenleyin
.venv/bin/alembic upgrade head                         # migration
.venv/bin/python -m app.seed                           # demo verisi
.venv/bin/uvicorn app.main:app --reload --port 8000
```

Test ve lint:

```bash
.venv/bin/python -m pytest        # 38 test (rule engine + izolasyon + API)
.venv/bin/ruff check app tests
```

### Frontend

```bash
npm install            # repo kökünde (workspaces)
npm run dev:web        # http://localhost:3000
npm run lint:web
```

## Demo Hesaplar (seed)

| Portal | E-posta | Parola | Not |
|---|---|---|---|
| Platform | admin@logislot.com | Demo123! | Vendor/süper-admin |
| Yönetim | admin@cakesbakes.com | Demo123! | Sistem Yöneticisi (tüm izinler) |
| Yönetim | rampa@cakesbakes.com | Demo123! | Rampa Yöneticisi (randevu aksiyonları) |
| Yönetim | izleyici@cakesbakes.com | Demo123! | Salt okunur |
| Tedarikçi | tedarikci@anadoluun.com | Demo123! | Otomatik onaylı |
| Tedarikçi | tedarikci@marmarasoguk.com | Demo123! | Manuel onay |
| Tedarikçi | tedarikci@hizlikargo.com | Demo123! | Kargo senaryoları |

Seed evreni: BTA tenant'ı → Cakes & Bakes Üretim Tesisi → 4 ürün kategorisi,
5 araç kategorisi, 3 rampa, "Rampa 1-2 Bitişik Blok" TIR-koşullu çakışma grubu,
3 tedarikçi ve örnek randevular (pending/approved/cargo/completed).

## Sprint Durumu

- **Sprint 1** — temel: modeller, migration, auth, rule engine, üç portal iskeleti. ✔
- **Sprint 2** — Catalogs & Docks: 5 konfigürasyon entity'si için gerçek CRUD
  (soft delete + audit + cross-facility koruması) ve `/admin/settings/*` altında
  gerçek API'ye bağlı editörler (kategoriler, araç kategorileri, rampalar,
  çakışma grupları, takvim istisnaları). Admin login → me → facility switcher
  akışı gerçek. Ayrıntı: [docs/SPRINT_2_REPORT.md](docs/SPRINT_2_REPORT.md). ✔
- **Sprint 3** — Suppliers & Basic Appointments: tedarikçi CRUD + portal hesabı
  yönetimi (oluştur/parola sıfırla/pasifleştir), supplier portalın tamamı gerçek
  API'de (profil, randevular+iptal, v2.0 sihirbazı gerçek availability
  slotlarıyla), admin randevu listesi gerçek + onay/red, permission-aware
  navigasyon ve Users/Roles readonly ekranı.
  Ayrıntı: [docs/SPRINT_3_REPORT.md](docs/SPRINT_3_REPORT.md). ✔
- **Sprint 4** — Yönetim Takvimi & Appointment Operations: dashboard ve günlük
  rampa×saat takvimi gerçek API'de (statü rengi + kargo overlay + kapalı/ek-mesai
  görünümü), ortak randevu detay/aksiyon drawer'ı (onay/red/revize/tamamla/iptal,
  `allowed_actions` ile), revize akışı + geçmişi, rampa yöneticisi scope'u ve
  **advisory-lock'lu transaction-safe create/revise** (canlı 10-paralel istek
  doğrulaması). Ayrıntı: [docs/SPRINT_4_REPORT.md](docs/SPRINT_4_REPORT.md). ✔
- **Sprint 5** — Notifications & Cargo Advisory: alıcı-başına gerçek bildirim
  sistemi (lifecycle olayları + rampa-scope hedefleme + kişisel okundu durumu),
  admin/supplier bildirim zilleri, bildirimden randevu drawer'ına deep-link,
  haftalık takvim özeti (doluluk/kargo/kapalı-ek mesai kartları) ve standardize
  kargo advisory (`blocking:false`) + wizard/revize'de **engellemeyen** onay
  akışı. Ayrıntı: [docs/SPRINT_5_REPORT.md](docs/SPRINT_5_REPORT.md). ✔
- **Sprint 6** — Reports & Platform Usage: tarih aralıklı gerçek operasyon
  raporları (dağılımlar, günlük trend, audit-tabanlı onay SLA'sı, rampa scope),
  platform vendor paneli gerçek kullanım/sağlık metrikleri (PII'siz) + plan
  CRUD ve tenant/facility plan atama MVP'si (plan = politika kabı, fatura yok)
  ve **log-only e-posta soyutlaması** (revize → tedarikçi + ilgili ekip;
  drawer'da e-posta logları).
  Ayrıntı: [docs/SPRINT_6_REPORT.md](docs/SPRINT_6_REPORT.md). ✔

- **Sprint 7** — White-label & Polish & QA: tesis bazlı marka ayarları
  (renk/logo/başlık — statü/kargo anlam renkleri korunur, admin+supplier
  portala anında uygulanır), login rate limit + **refresh token rotation**
  (AuthSession) + güvenlik header'ları + docs kapatma bayrağı, bildirim
  saklama komutu ve **18 adımlık tek komutluk demo smoke script'i**.
  Ayrıntı: [docs/SPRINT_7_REPORT.md](docs/SPRINT_7_REPORT.md). ✔
- **Sprint 8** — Pilot Hazırlığı: tam **kullanıcı & rol CRUD**'u (son yönetici
  koruması, oturum düşürme, sistem rol kilidi, `platform.*` asla tenant rolüne
  giremez), **tekrarlayan randevu serileri** (AppointmentSeries — weekly/
  biweekly/monthly, her occurrence tam kural setinden geçer, **all-or-nothing**,
  tek özet bildirim, sihirbazda tarih önizlemesi), frontend **tek-uçuş 401
  refresh interceptor'ı**, platform **vendor onboarding UI**'sı (tenant/tesis
  drawer'ları + varsayılan konfigürasyon bootstrap'i + arşiv guard'ı),
  **Playwright ile 5 kritik E2E** ve
  [pilot go-live runbook'u](docs/PILOT_GO_LIVE_RUNBOOK.md).
  Ayrıntı: [docs/SPRINT_8_REPORT.md](docs/SPRINT_8_REPORT.md). ✔
- **Sprint 9** — Pilot Feedback & Production Readiness: **gerçek SMTP
  provider'ı** (env ile `log_only`/`smtp`; hata randevu akışını asla bozmaz,
  `failed` loglanır) + Türkçe düz-metin e-posta şablonları, platform UI'dan
  **ilk tenant yöneticisi onboarding'i** (tek seferlik geçici parola),
  **parola politikası + ilk girişte zorunlu parola değişimi**
  (`must_change_password` → 403 `PASSWORD_CHANGE_REQUIRED` + `/change-password`),
  **seri toplu iptali** (future_only; tamamlanmışlara dokunmaz, tek özet
  bildirim/e-posta) + admin Seriler sayfası, admin recurring için açık 422,
  **GitHub Actions E2E workflow'u** ve `scripts/backup_smoke.sh`.
  Ayrıntı: [docs/SPRINT_9_REPORT.md](docs/SPRINT_9_REPORT.md). ✔
- **Sprint 10** — Pilot İşletim: **e-posta retry/kuyruk** (failed loglar
  drawer'dan "Tekrar Gönder", backoff'lu `process_email_retries` komutu, max
  3 deneme), **admin adına randevu oluşturma drawer'ı** (tedarikçi kuralları
  aynen; onaylı doğar; manuel rampa da tam kural setinden geçer) + **admin
  recurring desteği**, **seri toplu revizesi** (future_only, all-or-nothing,
  revision_pending), **bildirim/e-posta tercihleri** (global + event bazlı
  e-posta; kritik revize bildirimi kapatılamaz), **plan kullanım uyarıları**
  (%80/100/120 eşikleri — fatura değil, engel değil), **ci.yml**
  (backend+frontend job'ları) ve **staging compose profili**.
  Ayrıntı: [docs/SPRINT_10_REPORT.md](docs/SPRINT_10_REPORT.md). ✔
- **Sprint 11** — V2.0 Remaining Gaps Closure: **genel E-posta Logları
  sayfası** (filtre + özet + toplu resend, partial result), **Denetim İzleri
  UI'sı** (`audit.view` izni + data migration; parola/token maskeleme,
  snapshot kırpma), **scheduler konteyneri** (5 dk e-posta retry + 24 sa
  bildirim temizliği; hata alınca ölmeyen döngü), **gerçek restore smoke**
  (geçici test DB'ye restore + doğrulama), **tenant plan uyarı banner'ı**,
  **seri toplu onay** (onay anında yeniden çakışma kontrolü, all-or-nothing),
  **CSV exportlar** (özet + randevu detay + platform usage; PII'siz) ve
  **/platform/support** sağlık paneli.
  Ayrıntı: [docs/SPRINT_11_REPORT.md](docs/SPRINT_11_REPORT.md). ✔
- **Sprint 12** — Pilot Final Hardening: **platform denetim izleri**
  (`platform.audit.view` + rol data-migration; yalnızca platform/system
  aktörleri — tenant PII'si sızmaz), e-posta loglarında **tarih/şablon/hata
  filtreleri**, **scheduler koşum kayıtları + çoklu-instance advisory kilidi**
  (`skipped_locked`) + support panelde durum ("henüz koşmadı" dürüstlüğüyle),
  **tedarikçi seri görünümü ve sebep-zorunlu gelecek-iptali**, **takvimde boş
  slot → ön-dolu Yeni Randevu** (drag-and-drop bilinçli ertelendi),
  **`scripts/pilot_readiness.py`** (PASS/WARN/FAIL) ve host yedek cron
  kararı/örneği. Playwright 9 teste çıktı (platform audit + 390px mobil seri).
  Ayrıntı: [docs/SPRINT_12_REPORT.md](docs/SPRINT_12_REPORT.md). ✔

## Bakım ve Araçlar

```bash
# Uctan uca demo saglik kontrolu (18 adim; hata durumunda non-zero exit)
python3 scripts/demo_smoke.py                 # LOGISLOT_BASE_URL ile hedef degistirilebilir

# 9 kritik tarayici E2E akisi (compose stack ayakta olmali)
npx playwright test                           # E2E_BASE_URL / E2E_API_URL ile hedef degisir

# Yedek smoke: dump al + pg_restore --list ile okunabilirligi dogrula
./scripts/backup_smoke.sh

# GERCEK restore smoke: gecici test DB'ye restore + dogrulama (ana DB'ye dokunmaz)
./scripts/backup_restore_smoke.sh

# Pilot hazirlik raporu (PASS/WARN/FAIL; FAIL varsa non-zero cikar)
python3 scripts/pilot_readiness.py

# Okunmus 90 gunden eski bildirimleri temizle (okunmamislara dokunmaz)
docker compose exec api python -m app.maintenance.cleanup_notifications --days 90
#   --dry-run ile silmeden sayar

# Zamani gelmis failed e-postalari backoff'la yeniden dene (scheduler otomatik yapar)
docker compose exec api python -m app.maintenance.process_email_retries --limit 50

# Scheduler loglari (email retry 5 dk + bildirim temizligi 24 sa)
docker compose logs -f scheduler
```

CI: `.github/workflows/ci.yml` (ruff+pytest / tsc+lint+build) ve `e2e.yml`
(compose + smoke + Playwright). Staging: `docker-compose.staging.yml` +
`.env.staging.example` (runbook §2.1).

Pilot kurulumu için adım adım kılavuz:
[docs/PILOT_GO_LIVE_RUNBOOK.md](docs/PILOT_GO_LIVE_RUNBOOK.md).

Kubernetes'e deploy (mevcut Hermes cluster'ı, `logislot-dev` / `logislot-prod`):
[k8s/README.md](k8s/README.md) — manifestler `k8s/base` + `k8s/overlays/{dev,prod}`
(Kustomize; Helm yok). CI/CD ve branch stratejisi:
[docs/GITHUB_CICD.md](docs/GITHUB_CICD.md) (`dev` → logislot-dev,
`prod` → logislot-prod; GHCR + GitHub Actions). Raporlar:
[docs/K8S_DEPLOYMENT_REPORT.md](docs/K8S_DEPLOYMENT_REPORT.md),
[docs/GITHUB_CICD_REPORT.md](docs/GITHUB_CICD_REPORT.md).

## Güvenlik Env Notları

- `LOGISLOT_RATE_LIMIT_ENABLED` (varsayılan `true`) — login/create/parola-reset
  hız limitleri; `LOGISLOT_LOGIN_RATE_LIMIT_ATTEMPTS` ile eşik ayarlanır.
- `LOGISLOT_ENABLE_DOCS` (varsayılan `true`) — production'da `false` yaparak
  `/docs`, `/redoc`, `/openapi.json` kapatılır.
- `LOGISLOT_CORS_ORIGINS` — izinli origin allowlist'i (JSON liste).
- Refresh token'lar **rotation'lıdır**: her refresh eski token'ı geçersiz kılar;
  logout tüm oturumları kapatır; pasif tedarikçi refresh edemez.
- **Parola politikası** (`/auth/change-password`'da): min `LOGISLOT_PASSWORD_MIN_LENGTH`
  (10) + harf + rakam + özel karakter (`LOGISLOT_PASSWORD_REQUIRE_SPECIAL`);
  `LOGISLOT_ENVIRONMENT=production` iken yaygın/demo parolalar reddedilir.
  Geçici parolalı hesaplar (create/reset) ilk girişte değişime zorlanır.
- **E-posta**: `LOGISLOT_EMAIL_PROVIDER=log_only|smtp`; smtp için `SMTP_*`
  env'leri (bkz. `.env.example`). SMTP hatası operasyonu durdurmaz.

## Mimari Kısa Notlar

- **İki ayrı izin uzayı:** `platform.*` ↔ tenant içi izinler asla birleşmez.
- **Rule engine** (`apps/api/app/rules/`) framework bağımsız domain servisidir;
  sert kurallar engeller, tavsiye kuralları (kargo) yalnızca sinyal üretir.
- **Kargo statü değildir:** `delivery_type=cargo` + kaba pencere + takvim overlay.
- **Çakışma grupları konfigürasyondur** — kodda R1/R2 hardcode yoktur.
- **API zarfı:** `{"success", "data", "error": {code, message, details}}`.
- Tüm datetime'lar DB'de UTC; gösterim facility timezone'una göredir.

Ayrıntı: [docs/INITIAL_UNDERSTANDING_REPORT.md](docs/INITIAL_UNDERSTANDING_REPORT.md)
ve [docs/SPRINT_1_REPORT.md](docs/SPRINT_1_REPORT.md).
