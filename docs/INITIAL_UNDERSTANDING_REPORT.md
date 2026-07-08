# LogiSlot Initial Understanding Report

Tarih: 8 Temmuz 2026 — Hazırlayan: Senior Full-Stack Developer (Claude)

## 1. Dokümanları Okuma Durumu

- **Okunan dosyalar:** `logislot_cto_pack` içindeki 25 Markdown dosyasının tamamı okundu:
  - `README.md`, `00_kickoff/CLAUDE_MASTER_PROMPT.md`, `00_kickoff/PROJECT_RULES.md`
  - `01_product/PRODUCT_SPEC.md`, `ROLES_AND_PERMISSIONS.md`, `USER_FLOWS.md`
  - `02_architecture/TECHNICAL_ARCHITECTURE.md`, `SAAS_TENANCY_MODEL.md`, `SECURITY_AND_AUDIT.md`
  - `03_domain/DATA_MODEL.md`, `BUSINESS_RULES_ENGINE.md`, `APPOINTMENT_LIFECYCLE.md`
  - `04_frontend/FRONTEND_ARCHITECTURE.md`, `UI_UX_SPEC.md`, `SCREEN_INVENTORY.md`
  - `05_backend/API_SPEC.md`, `DATABASE_AND_MIGRATIONS.md`, `TEST_STRATEGY.md`
  - `06_delivery/IMPLEMENTATION_ROADMAP.md`, `ACCEPTANCE_CRITERIA.md`, `QA_CHECKLIST.md`
  - `07_reference/V2_DECISION_SUMMARY.md`, `V1_CONTEXT_NOTES.md`, `source_extract_v2.md`, `source_extract_v1.md`
- **Ana referans:** `Mal Kabul Randevu Sistemi v2.0` (source_extract_v2 + CTO pack'in tamamı bu karara göre normalize edilmiş).
- **v1.0'ın kullanım amacı:** Yalnızca bağlam — mevcut fonksiyonel akışların (wizard, lifecycle, kategori-süre blokajı, override, kota, otomatik onay) kökenini anlamak için. Çelişki durumunda her zaman v2.0 uygulanır.

## 2. Ürün Özeti

LogiSlot; fabrika/depo/üretim tesislerinin tedarikçi mal kabul ve rampa randevu süreçlerini dijitalleştiren, **çok kiracılı (multi-tenant) SaaS** platformudur. Üç portal vardır:

1. **Tedarikçi Portalı** (mobile-first): 3 adımlı sihirbazla randevu talebi (Ürün → Araç/Teslimat → Zaman), kendi randevularını takip/iptal. Tedarikçi **manuel rampa seçmez** — sistem akıllı rampa yönlendirmesi yapar.
2. **Yönetim Paneli** (desktop-first, responsive): Dashboard, takvim (durum rengi + kargo overlay), randevu listesi, onay/red/revize/tamamla/iptal akışları, raporlar ve tüm tesis konfigürasyonu.
3. **Platform Paneli** (vendor/süper-admin): Tenant/tesis dizini, agregat kullanım/sağlık metrikleri, plan/rate-card ataması. Varsayılan olarak operasyonel/PII veri erişimi **yoktur**.

Çekirdek hiyerarşi: **Platform → Tenant → Facility → Operasyonel Veri**. Tenant sadece kimlik/faturalama/plan sarmalayıcısıdır; tüm operasyonel konfigürasyon Facility seviyesinde yaşar.

## 3. Mimari Kararlar

1. **Tenancy stratejisi:** Shared database + shared schema + her operasyonel tabloda `tenant_id` + `facility_id` kolonları. İzolasyon ilk günden çekirdekte; API'de tenant/facility ID körlemesine alınmaz, authenticated context + membership doğrulamasıyla çözülür.
2. **İki ayrı izin uzayı:** `platform.*` izinleri ile tenant içi izinler (`appt.*`, `dock.manage`, …) yapısal olarak ayrı; asla birleşmez. `PlatformUser` ≠ `TenantUser` ≠ `SupplierUser` (JWT'de `user_type` claim'i).
3. **Rule engine backend domain servisidir:** Dört kural ailesi (kategori-süre, araç-rampa uyumu, rampa çakışma grupları, tavsiye/uyarı katmanı) tek `AvailabilityService` yüzeyinden değerlendirilir. **Sert kurallar engeller; tavsiye kuralları yalnızca sinyal üretir.**
4. **Kargo bir statü değildir:** `delivery_type=cargo` + kaba pencere (`morning/afternoon/all_day`) + takvimde overlay. Statü seti v1.0'daki 6 durum olarak korunur: `pending, approved, revision_pending, rejected, completed, cancelled`.
5. **Çakışma grupları konfigürasyondur:** `DockConflictGroup` (mutual_block / shared_capacity / conditional + trigger_condition_json). Kodda R1/R2 hardcode yok.
6. **Plan bir politika kabıdır**, faturalama motoru değildir (rate_card JSON, ölçülebilir boyutlar listesi).
7. **Tema/white-label token tabanlı:** Renkler CSS değişkenleri üzerinden; branding_json facility'de.
8. **DB kararları:** UUID PK, timestamptz, enum'lar taşınabilirlik için native olmayan (varchar) enum, JSONB yalnızca esnek politika alanlarında (variant ile: testlerde SQLite uyumlu generic JSON).

## 4. İlk Sprint Planı

Roadmap'teki Sprint 0 + Sprint 1 birleştirilerek (master prompt'un "ilk sprint" tanımı) şu temel atılır:

- Monorepo + Docker Compose + PostgreSQL 16
- FastAPI + async SQLAlchemy 2 + Alembic + ilk migration
- 19 domain modelinin tamamı + v2.0 uyumlu enum'lar
- Seed: BTA tenant, Cakes & Bakes facility, roller, kategoriler, araç kategorileri, 3 rampa, R1-R2 TIR koşullu çakışma grubu, tedarikçiler, örnek randevular (pending/approved/cargo/completed)
- Auth: tenant/supplier/platform login + `/auth/me` + refresh + permission guard + facility context middleware
- Rule engine ilk çalışan sürümü: candidate dock filtreleme, çalışma saati/override, çakışma, conflict group (mutual + conditional), kargo advisory, kota/süre limitleri
- Randevu oluşturma + lifecycle endpoint iskeletleri (audit log + notification üretimiyle)
- Next.js: tasarım sistemi (token'lar, UI primitifleri, status badge + cargo overlay), üç portalın route grupları ve layout'ları, seed/mock veriyle çalışan ekranlar
- pytest + lint, README, `.env.example`

Kapsam dışı (sonraki sprintler): takvim tam etkileşimi, admin CRUD ekranlarının tamamı, recurring expansion, e-posta provider entegrasyonu, raporların gerçek grafikleri, white-label editörü, impersonation UI.

## 5. Oluşturulacak Repo Yapısı

```
LogiSlot/
  apps/
    api/          # FastAPI backend
      app/
        core/       # config, db, security, response, errors
        models/     # SQLAlchemy 2 modelleri
        auth/       # login, tokens, guards
        tenancy/    # facility context
        rules/      # availability/rule engine (framework bağımsız)
        routers/    # HTTP endpointleri
        schemas/    # Pydantic v2 DTO'lar
        services/   # appointment lifecycle vb.
        seed.py
      alembic/
      tests/
    web/          # Next.js App Router frontend
      src/app/    # (auth) (supplier) (admin) (platform) route grupları
      src/components/  # ui/, layout/, appointments/
      src/lib/    # api client, mock data, utils
  packages/
    shared/       # paylaşılan TS domain sabitleri/tipleri
  docs/
  docker-compose.yml
  .env.example
  README.md
```

Master prompt'taki öneriye sadık, `worker/` şimdilik eklenmedi (Redis/worker yapıya uygun boşluk bırakıldı — YAGNI; e-posta abstraction'ı senkron interface arkasında).

## 6. Backend Planı

- **Katmanlar:** `models` (persistence) / `rules` + `services` (domain, framework bağımsız) / `routers` (HTTP) / `schemas` (DTO).
- **Response standardı:** `{"success": true, "data": …}` ve hata için `{"success": false, "error": {"code", "message", "details"}}`; rule engine hata kodları (`NO_COMPATIBLE_DOCK`, `SUPPLIER_QUOTA_EXCEEDED`, …) doğrudan bu forma akar.
- **Auth:** Argon2 (argon2-cffi) parola hash; PyJWT ile kısa ömürlü access + refresh; token'da `user_type` (platform/tenant/supplier) + `sub`.
- **Guards:** `require_permissions(...)` (facility membership rollerinden), `require_platform_permissions(...)`, supplier endpointlerinde kendi `supplier_id` dışına çıkamama.
- **Facility context:** Path'teki `facility_id` (veya `X-Facility-Id`) her istekte membership ile doğrulanır.
- **Audit:** lifecycle + login olayları AuditLog satırı üretir.
- **Migration:** Alembic async template; ilk migration modellerden üretilip elle gözden geçirilir; downgrade tam.

## 7. Frontend Planı

- Next.js 15 App Router + TypeScript strict + Tailwind (token tabanlı CSS değişkenleri) + shadcn tarzı el yazımı primitifler (Button, Card, Input, Badge, Dialog, Table) + TanStack Query + RHF/Zod.
- **Route grupları:** `(auth)/login`, `(supplier)/supplier/*` (alt tab bar, mobile-first), `(admin)/admin/*` (sidebar+topbar+facility switcher), `(platform)/platform/*` (ayrı görsel vurgu).
- **Görsel anlam taşıyan bileşenler soyutlanır:** `StatusBadge` (6 statü) ve `CargoOverlay` (statüden bağımsız ikinci sinyal) component seviyesinde.
- İlk sprintte ekranlar mock/seed veriyle çalışır; `lib/api/client.ts` typed fetch wrapper + `X-Facility-Id` altyapısı gerçek entegrasyona hazır.

## 8. Business Rules Planı

- `RuleEvaluationContext` (tenant/facility/supplier/kategori/araç/teslimat/tarih/süre/pencere) girişi, `HardRuleResult`/`WarningRuleResult` çıkışları.
- Sert kurallar: tedarikçi kategori izni, kota, kategori min süre, tedarikçi min/max süre, dock ürün+araç uyumu (boş accepted_vehicle_categories = hepsi kabul), çalışma saatleri, closed override, mevcut randevu çakışması, conflict group (mutual_block; shared_capacity ilk sürümde mutual gibi davranır ama model ayrık; conditional trigger eşleşince).
- Tavsiye: `CARGO_DAY_WARNING`, `CARGO_WINDOW_OVERLAP` — slotu asla engellemez.
- Availability çıktısı: 30 dk slotlar, `available/partial/full`, `candidateDockIds`, `blockingReasons`, `advisoryWarnings`.
- Dock assignment: deterministik "en az dolu uygun rampa" stratejisi.

## 9. Riskler ve Dikkat Noktaları

1. **İzolasyon sızıntısı** en büyük risk — her query facility scope'lu; testlerde cross-tenant erişim negatif senaryoları var.
2. **Çakışma kontrolü DB constraint ile tam çözülemez** — rule engine + (ileride) transaction içi yeniden kontrol/kilit gerekir; ilk sürümde create anında yeniden değerlendirme yapılır.
3. **Kargo davranışının yanlış modellenmesi** (yeni statü/hard block) açıkça yasak — advisory katman olarak uygulanır.
4. **Platform/tenant izin uzaylarının karışması** — ayrı guard'lar, ayrı token type, ayrı modeller.
5. **Timezone:** Facility timezone alanı ilk günden modelde; tüm zamanlar timestamptz.
6. **Enterprise şişkinlik:** worker/Redis/Celery şimdilik yok; interface boşlukları bırakıldı.
7. **shared_capacity** ilk sürümde mutual_block gibi davranır — model ayrık tutuldu, bilinçli basitleştirme.

## 10. Kodlamaya Başlamadan Önce Varsayımlar

1. Master prompt'taki `WorkingHoursProfile` kavramı, DATA_MODEL sözleşmesine uygun olarak `Facility.default_working_profile_json` + `Dock.working_hours_json` olarak; `CalendarOverride` ise `DockOverride` entity'si olarak uygulanır (aynı kavram, pack'teki isim).
2. Tek login sayfası + portal seçimi UI'ı; backend'de üç ayrı login endpoint'i (API_SPEC'e uygun).
3. Python 3.14 + Next.js 15 kullanılır (doküman "3.12+/14+" der; güncel kararlı sürümler).
4. `SupplierUser` ayrı model olarak eklenir (DATA_MODEL "user linked to supplier" seçeneği) — tedarikçi girişi için gereklidir.
5. Parola hash Argon2; seed parolaları demo amaçlı basittir ve README'de belgelenir.
6. Recurring randevu: `recurring_rule` alanı modelde saklanır; expansion ayrı sprint (QA checklist bunu açıkça belirtmeye izin veriyor).
7. E-posta: provider abstraction interface'i konur, gerçek gönderim yok (log-only provider).
