# Sprint 1 Raporu — LogiSlot Temel Kurulum

Tarih: 8 Temmuz 2026

## Yapılanlar

### Monorepo & Altyapı
- `apps/api` (FastAPI) + `apps/web` (Next.js 15) + `packages/shared` npm workspace yapısı
- Docker Compose: PostgreSQL 16 (host 5433), API (host 8010), Web (host 3010) — yerelde sık dolu olan 5432/8000/3000 portlarıyla çakışmaz
- API konteyneri açılışta `alembic upgrade head` + idempotent seed çalıştırır
- `.env.example`, `.gitignore`, README (kurulum + demo hesaplar)

### Backend (apps/api)
- **19 domain entity / 25 tablo**: Tenant, Facility, Plan, PlatformUser/Role, TenantUser, FacilityMembership, Role, ProductCategory, VehicleCategory, Dock, DockOverride (CalendarOverride), DockConflictGroup(+Member), Supplier, SupplierUser, Appointment, AppointmentRevision, Notification, AuditLog + 5 ilişki tablosu
- **İlk Alembic migration** gerçek Postgres'e karşı üretildi; `upgrade → seed → downgrade → upgrade` döngüsü doğrulandı
- **Auth**: 3 ayrı login (tenant/supplier/platform), refresh, `/auth/me`, Argon2 hash, JWT `user_type` claim; login/logout audit log üretir
- **İki ayrı izin uzayı**: `TenantPermission` / `PlatformPermission` sabitleri; `require_facility_permissions` ve `require_platform_permissions` guard'ları; rampa yöneticisi için `assigned_dock_ids` scope kontrolü
- **Facility context**: path'teki `facility_id` her istekte membership ile doğrulanır; platform kullanıcısı operasyonel endpoint'lere varsayılan 403 alır
- **Rule engine** (`app/rules/`, framework bağımsız):
  - `RuleEvaluationContext`, `HardRuleResult`, `WarningRuleResult`, `SlotEvaluation`
  - Sert kurallar: kategori izni, kota, kategori min süre, tedarikçi min/maks, ürün+araç rampa uyumu (boş araç listesi = hepsi), çalışma saati, closed override, zaman çakışması, çakışma grupları (mutual/shared/conditional-trigger)
  - Tavsiye katmanı: `CARGO_DAY_WARNING`, `CARGO_WINDOW_OVERLAP` — kargo asla slot engellemez
  - 30 dk slot ızgarası (`available/partial/full`), en-az-dolu deterministik rampa ataması, kargo pencere hesabı
- **Randevu servisi**: 11 adımlı oluşturma algoritması (otomatik onay dahil), approve/reject/revise/complete/cancel geçiş matrisi, revizyon geçmişi, bildirim + audit üretimi; tüm datetime'lar UTC'ye normalize
- **Endpointler**: health/ready, auth, me/facilities, platform (tenant/facility/plan CRUD + agregat usage), catalogs/docks/conflict-groups/suppliers (okuma), appointments (liste/detay/CRUD+lifecycle+availability), supplier portal (profil, kendi randevuları, oluşturma, iptal, availability), notifications
- **Standart zarf**: `{"success", "data", "error": {code, message, details}}`; rule engine kodları HTTP 422 ile döner
- **Seed**: BTA → Cakes & Bakes; 3 rol, 5 araç kategorisi, 4 ürün kategorisi, 3 rampa (R3 yalnız küçük araç), R1-R2 TIR-koşullu çakışma grubu, 3 tedarikçi (otomatik/manuel onay + kargo), 7 kullanıcı, 4 örnek randevu (pending/approved/cargo/completed)

### Frontend (apps/web)
- Tasarım sistemi: CSS değişkeni tabanlı tema tokenları (white-label'a hazır), 6 statü rengi + kargodan bağımsız `--cargo` sinyali, `cargo-overlay` çizgili doku deseni
- UI primitifleri: Button, Card, Input/Select/Label, Badge, Table, Dialog; domain bileşenleri: `StatusBadge`, `CargoBadge`, `Logo`
- **18 route**: portal seçimli login; supplier (mobile-first alt tab bar): randevularım (sekmeli, sayaçlı kartlar), 3 adımlı v2.0 sihirbazı (Ürün → Araç/Teslimat → Zaman; kargo seçilince kaba pencere UI'ına döner; 30 dk slot ızgarası müsait/kısmen/dolu), profil; admin (sidebar + facility switcher + bildirim zili): dashboard, günlük takvim (rampa sütunları × saat cetveli, statü rengi + kargo overlay birlikte, tıklayınca işlem paneli), randevu listesi (arama + durum filtreleri + bekleyen rozeti), raporlar, yönetim modülü kartları; platform (koyu, ayrı kimlik): tenants, facilities, usage (yalnız agregat), plans
- TanStack Query provider + typed API client (`X-Facility-Id` header altyapısı); ekranlar Sprint 1'de seed aynası mock veriyle çalışır
- `next build` (18/18 route) ve `next lint` temiz; standalone output + çok aşamalı Dockerfile

## Nasıl Test Edilir

```bash
docker compose up --build          # web: :3010, api: :8010, db: :5433
cd apps/api && .venv/bin/python -m pytest   # 38 test
.venv/bin/ruff check app tests
npm run lint:web
```

Canlı doğrulanan smoke akışı: health → 3 portal login → me/facility context →
dashboard-summary → randevu listesi → tedarikçi izolasyonu → availability (19 slot) →
platform usage agregat.

## Test Sonuçları

- **pytest: 38/38 geçti** (rule engine birim matrisi: araç-rampa uyumu, boş liste=hepsi,
  koşullu çakışma grubu tetikleme/tetiklenmeme, kargo engellemez+uyarır, override,
  kota, süre limitleri; izolasyon: tenant→yabancı facility 403, supplier kendi verisi,
  platform→operasyonel 403, izleyici approve 403; API: otomatik/manuel onay,
  yasak kategori 422, kargo pencere, revise→approve→complete, reject sebep zorunlu,
  çakışma grubu uçtan uca)
- ruff + ESLint temiz; Alembic downgrade/upgrade döngüsü doğrulandı

## Bilinen Eksikler / Bilinçli Ertelenenler

1. Frontend ekranları mock veriyle çalışıyor; API entegrasyonu (TanStack Query
   hook'ları) Sprint 2-3'te bağlanacak — client altyapısı hazır.
2. Admin config CRUD ekranları (kategori/rampa/tedarikçi editörleri) Sprint 2.
3. `shared_capacity` ilk sürümde `mutual_block` gibi davranır (model ayrık).
4. Recurring randevu yalnızca alan olarak saklanır; expansion ayrı sprint.
5. E-posta gönderimi yok (bildirim satırı üretiliyor); provider abstraction Sprint 6.
6. Impersonation endpoint'leri eklenmedi (ilke ve audit alanları modelde hazır).
7. Randevu create'te transaction içi kilit/yeniden kontrol yok — eşzamanlı yazma
   yarışı teorik olarak mümkün; Sprint 4'te (availability sprint'i) ele alınacak.
8. Refresh token rotation/blacklist yok (stateless skeleton).
9. Takvim haftalık görünümü ve bildirim panelinin gerçek listesi Sprint 6.

## Sonraki Önerilen Adım (Sprint 2 — Catalogs & Docks)

Roadmap'e uygun olarak: kategori/araç kategorisi/rampa/çakışma grubu **CRUD
endpoint'leri + admin config editör ekranları** (ortak liste+drawer pattern'i),
frontend'in gerçek API'ye bağlanması (login → me → facility context → listeler)
ve override yönetim ekranı.
