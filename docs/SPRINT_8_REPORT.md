# Sprint 8 Raporu — Pilot Hazırlığı: Kullanıcı/Rol CRUD, Tekrarlayan Randevular, Onboarding, E2E

Tarih: 2026-07-08

## 1. Özet

Sprint 8, LogiSlot'u pilot müşteri karşısına çıkarılabilir hale getirdi:

- **Kullanıcı & Rol yönetimi readonly'den tam CRUD'a çıktı**: kullanıcı
  oluştur/düzenle/pasifleştir/parola sıfırla (oturum düşürmeli), rol
  oluştur/düzenle/pasifleştir (izin whitelist'li), sekmeli tam editör UI.
  **Son yönetici koruması** (409 `LAST_ADMIN`) ve **sistem rol kilidi**
  (409 `SYSTEM_ROLE_LOCKED`) dahil.
- **Tekrarlayan randevular** tercih edilen **Option B (AppointmentSeries
  entity)** ile geldi: weekly/biweekly/monthly, her occurrence tam kural
  setinden (müsaitlik + kota + çakışma grubu) geçer, **all-or-nothing** —
  biri geçemezse hiçbiri oluşmaz ve hangi tarihin neden düştüğü döner.
  Tek özet bildirim (spam yok), sihirbazda tarih önizlemesi, listede/
  drawer'da seri rozetleri, admin seri list/detay endpoint'leri.
- **Frontend 401 refresh interceptor'ı**: tek-uçuş (single-flight) yenileme,
  orijinal isteğin bir kez tekrarı, döngü koruması, rotation uyumu,
  başarısızlıkta oturum temizliği + `/login` yönlendirmesi.
- **Vendor onboarding UI**: platform panelinde tenant ve tesis
  oluştur/düzenle drawer'ları; tesis oluşturmada opsiyonel plan override
  (yalnızca aktif plan) ve **"varsayılan konfigürasyonu kur" bootstrap'i**;
  arşivlenmiş tenant'a tesis ekleme backend guard'ı (409 `TENANT_ARCHIVED`).
- **Playwright kuruldu ve 5 kritik E2E akışı yeşil** (canlı compose stack'e
  karşı koşuldu, hata anında ekran görüntüsü/trace).
- **`docs/PILOT_GO_LIVE_RUNBOOK.md`**: gerçek komutlar ve gerçek demo
  hesaplarla pilot kurulum kılavuzu — içindeki komutların tamamı bu sprintte
  fiilen koşularak doğrulandı.
- Her şey yeşil: **pytest 128/128**, ruff temiz, `next build` + lint temiz,
  **demo_smoke 18/18**, **Playwright 5/5**.

## 2. Değişen/Oluşturulan Dosyalar

**Backend (`apps/api/`)**

| Dosya | Değişiklik |
|---|---|
| `app/models/tenant_user.py` | Role'e `display_name`, `description`, `is_active` |
| `app/models/appointment_series.py` | **Yeni** — AppointmentSeries (Option B) |
| `app/models/appointment.py` | `series_id` (FK, SET NULL) + `occurrence_index` |
| `alembic/versions/b18b3ff0e3d2_*.py` | Migration (up/down/up doğrulandı) |
| `app/routers/users.py` | Readonly → tam kullanıcı/rol CRUD + `permission-catalog` |
| `app/schemas/appointment.py` | `RecurringRequest` (+aylık ≤6 validator), `recurring` alanı, çıktıda seri alanları |
| `app/services/appointments.py` | `create_appointment` seri-içi kullanım parametreleri (`_commit/_notify/_skip_lock`), **`create_appointment_series`**, `_add_months_clamped`, `_occurrence_start` |
| `app/routers/appointments.py` | Seri list/detay endpoint'leri, drawer için `series` özeti |
| `app/routers/supplier_portal.py` | Create'te recurring dalı, detayda seri özeti |
| `app/routers/platform.py` | `create_facility`: arşiv guard'ı, `plan_override_id`, `bootstrap_defaults` |
| `app/services/onboarding.py` | **Yeni** — tesis bootstrap servisi |
| `tests/test_sprint8.py` | **Yeni** — 18 test (kullanıcı/rol, recurring, onboarding) |
| `tests/test_suppliers.py` | Rol çıktısı obje olduğu için 1 assertion güncellendi |

**Frontend (`apps/web/`)**

| Dosya | Değişiklik |
|---|---|
| `src/lib/api/client.ts` | **Tek-uçuş 401 refresh interceptor'ı**; refresh token saklama |
| `src/app/(auth)/login/page.tsx` | Login'de refresh token da saklanır |
| `src/lib/api/types.ts` | User/Role DTO'ları, `SeriesSummaryDto`, `SeriesCreateResultDto` |
| `src/lib/api/resources.ts` | `useUserMutations`, `useRoleMutations`, `usePermissionCatalog` |
| `src/app/(admin)/admin/settings/users/page.tsx` | **Tam yeniden yazıldı** — sekmeli editör |
| `src/app/(supplier)/supplier/new-appointment/page.tsx` | Recurring bölümü + tarih önizleme + seri başarı ekranı |
| `src/app/(supplier)/supplier/appointments/page.tsx` | "Tekrarlayan N. randevu" rozeti |
| `src/components/appointments/appointment-drawer.tsx` | Seri bilgi bandı (x/N + sıklık) |
| `src/lib/api/platform.ts` | `useTenantMutations`, `useFacilityMutations`, DTO genişletme |
| `src/app/(platform)/platform/tenants/page.tsx` | Oluştur/düzenle drawer'ı (slug otomatik) |
| `src/app/(platform)/platform/facilities/page.tsx` | Oluştur/düzenle drawer'ı (plan override + bootstrap) |

**Kök / dokümantasyon**

| Dosya | Değişiklik |
|---|---|
| `playwright.config.ts`, `e2e/*.spec.ts`, `e2e/helpers.ts` | **Yeni** — 5 kritik E2E |
| `package.json` | `@playwright/test` + `npm run e2e` |
| `docs/PILOT_GO_LIVE_RUNBOOK.md` | **Yeni** — pilot kurulum kılavuzu |
| `README.md` | Sprint 8 durumu + E2E/runbook bölümleri |

## 3. Kullanıcı & Rol CRUD

**Endpoint'ler** (`/facilities/{fid}/...`, tümü `user.manage` gerektirir):
`GET|POST /users`, `GET|PATCH|DELETE /users/{id}`,
`POST /users/{id}/reset-password`, `GET|POST /roles`,
`GET|PATCH|DELETE /roles/{id}`, `GET /permission-catalog`.

**Kararlar (raporlanması istenenler):**

- **E-posta global unique** (Sprint 3'teki tek-login-tablosu kararıyla
  tutarlı) → 409 `DUPLICATE_EMAIL`.
- **Son yönetici koruması**: tesiste `user.manage` yetkili başka aktif üye
  yoksa kullanıcı pasifleştirilemez **ve** rol değişikliğiyle `user.manage`
  düşürülemez → 409 `LAST_ADMIN`. İkinci yönetici eklenince serbest kalır.
- **Sistem rol kilidi**: `is_system` rollerde ad/izin seti/aktiflik
  değiştirilemez ve silinemez → 409 `SYSTEM_ROLE_LOCKED`; yalnızca
  `display_name` + `description` düzenlenebilir. UI bunu kilitli banner ve
  disabled checkbox'larla gösterir.
- **İzin whitelist'i**: rol izinleri `TenantPermission.ALL` ile doğrulanır;
  `platform.*` (veya herhangi bilinmeyen kod) → 422 `INVALID_PERMISSION`.
  İki izin uzayı hiçbir yerde birleşmez.
- **Pasifleştirme = soft delete**; pasif kullanıcının **tüm oturumları
  düşürülür** (AuthSession revoke) → login **ve** refresh 401. Parola
  reset'i de tüm oturumları düşürür.
- Pasif rol yeni atamalarda kullanılamaz (422 `INVALID_REFERENCE`); rol ve
  rampa referansları aynı tesise ait olmak zorunda.
- Geçici parola: verilmezse `Demo123!` (demo kararı; runbook'ta production
  notu). UI oluşturma sonrası geçici parolayı flash mesajında gösterir.
- Rol/kullanıcı kaydından sonra `auth/me` invalidate edilir; **aktif
  kullanıcının kendi izin değişikliği bir sonraki giriş/yenilemede
  etkinleşir** — UI bunu kayıt mesajında söyler.

**UI**: Kullanıcılar/Roller sekmeleri; kullanıcı drawer'ında rol multi-select
(chip) + rampa scope + aktiflik + geçici parola; rol drawer'ında **Türkçe
etiketli, gruplu izin checkbox'ları** (Randevular/Takvim/Konfigürasyon/
Yönetim) + kod görünümü; parola sıfırlama ayrı drawer.

## 4. Tekrarlayan Randevular (Option B — AppointmentSeries)

**Model**: `appointment_series` tablosu (supplier FK, frequency, count,
status, created_by) + `appointments.series_id/occurrence_index`. Occurrence'lar
**normal Appointment satırlarıdır** — mevcut 6 statülü yaşam döngüsünü aynen
kullanır, tek tek revize/iptal edilebilir. Yeni statü eklenmedi.

**Akış** (`create_appointment_series`):

1. Kargo + recurring reddi (422 `RECURRING_CARGO_NOT_SUPPORTED`) — kargo
   penceresi kesin slot taahhüdü olmadığı için seriyle birleşmesi anlamsız.
2. **Tesis kilidi bir kez alınır** (`pg_advisory_xact_lock`), tüm seri tek
   transaction'da üretilir.
3. Tarihler üretilir: weekly +7g, biweekly +14g, monthly **ay-sonu kirpma**
   ile (`_add_months_clamped`: 31 Oca → 28/29 Şub → 31 Mar; karar: gün
   taşarsa ayın son gününe kirpilir, hata verilmez).
4. Her occurrence `create_appointment(..., _commit=False, _notify=False,
   _skip_lock=True)` ile **tam kural setinden** geçer — flush edilen önceki
   occurrence'lar sonraki kota/çakışma kontrollerinde görünür (ör. aylık
   kota 3. tekrarı yakalar).
5. **All-or-nothing**: herhangi bir occurrence düşerse 422
   `RECURRING_OCCURRENCE_FAILED` + `details: {occurrence_index,
   occurrence_date, code}`; transaction geri alınır, **hiçbir randevu ve
   bildirim oluşmaz**.
6. Başarıda **tek özet bildirim** adminlere ("X, N randevuluk haftalık seri
   oluşturdu — onay bekliyor / otomatik onaylandı") ve **tek özet** tedarikçiye;
   randevu-başına bildirim bilinçli olarak üretilmez (spam yok). Audit:
   `appointment_series.create`.

**Limitler**: `occurrence_count` 2–12; **monthly ≤ 6** (≈6 aylık ufuk) —
Pydantic validator'da. Auto-approve tedarikçide tüm seri onaylı doğar; manuel
akışta tümü pending doğar ve admin tek tek yönetir (karar: seri-bazlı toplu
onay MVP dışı).

**Endpoint'ler**: supplier create `recurring: {frequency, occurrence_count}`
alırsa yanıt `{series_id, frequency, occurrence_count, appointments[]}` olur;
`GET /facilities/{fid}/appointment-series` (statü sayaçları + tedarikçi adı),
`GET .../appointment-series/{id}` (occurrence listesi). Randevu detayları
(admin + supplier) `series: {id, frequency, occurrence_count,
occurrence_index}` özeti taşır. **Admin on-behalf create `recurring` alanını
yok sayar** (karar: MVP'de seri yalnızca tedarikçi sihirbazından; testle
sabitlendi).

**Wizard UI**: standart teslimatta "Tekrarlayan randevu oluştur" anahtarı →
sıklık + tekrar sayısı → **istemci tarafı tarih önizleme listesi** (backend
ile aynı kirpma kuralı) + "N randevu oluşturulacak" özeti + all-or-nothing
uyarısı. Hata durumunda backend'in "2. tekrar (15.07.2026 10:00)
oluşturulamadı: ..." mesajı aynen gösterilir. Başarı ekranı N tarihi listeler.
Tedarikçi listesinde "Tekrarlayan N. randevu" rozeti, drawer'da x/N bandı.

## 5. Refresh Interceptor (Frontend)

`src/lib/api/client.ts`:

- Login artık **refresh token'ı da saklar** (`logislot.refresh_token`).
- Herhangi bir istek 401 dönerse (auth yolları hariç): modül-seviyesi
  **tek-uçuş** `refreshPromise` üzerinden `/auth/refresh` çağrılır — eş
  zamanlı 401'ler aynı Promise'i bekler, **ikinci refresh asla açılmaz**
  (rotation'da eski jti anında geçersizleştiği için kritik).
- Rotation uyumu: dönen **yeni access + yeni refresh** çifti saklanır.
- Orijinal istek **yalnızca bir kez** tekrarlanır; tekrar da 401 ise veya
  refresh başarısızsa `clearSession()` + `/login` yönlendirmesi (login
  sayfasındaysa yönlendirme yapılmaz → döngü yok).
- `/auth/login|supplier-login|platform-login|refresh` yolları interceptor
  kapsamı dışındadır (sonsuz döngü koruması).

## 6. Vendor Onboarding (Platform)

**Backend**:

- `POST /platform/tenants/{id}/facilities` artık: **arşivlenmiş tenant → 409
  `TENANT_ARCHIVED`** (guard, testli); opsiyonel `plan_override_id`
  (`_get_assignable_plan` ile — draft/retired → 409 `PLAN_NOT_ASSIGNABLE`);
  opsiyonel `bootstrap_defaults`.
- **Bootstrap MVP kararı** (`app/services/onboarding.py`): 3 araç kategorisi
  (TIR/Kamyon/Kamyonet), `Genel` ürün kategorisi (30 dk, varsayılan araç
  Kamyonet), varsayılan çalışma saatli (hafta içi 08–18, Cmt 08–13) **Rampa 1**
  (tüm araçları kabul) ve 3 standart **sistem rolü** (seed ile birebir aynı
  izin setleri). Amaç: tesis ilk randevuyu alabilir duruma gelsin; gerisi
  tenant yöneticisinin panelinden. Bootstrap özeti audit'e ve yanıta yazılır.

**UI**: Tenant Dizini'nde oluştur/düzenle drawer'ı (görünen addan **otomatik
slug** — Türkçe karakter dönüşümlü, oluşturma sonrası kilitli; durum seçimi
arşiv uyarısıyla; iletişim alanları). Tesis Dizini'nde oluştur/düzenle
drawer'ı (tenant seçimi — arşivli tenant'lar disabled + uyarı, saat dilimi,
**yalnızca aktif planlar** listelenen plan override, bootstrap checkbox'ı
açıklamasıyla). Başarı mesajı bootstrap özetini içerir ("1 rampa, 3 rol").

## 7. Playwright E2E

Kurulum: `@playwright/test` + Chromium; `playwright.config.ts` — `testDir:
e2e/`, `E2E_BASE_URL` (varsayılan `http://localhost:3010`), `workers: 1`
(paylaşılan seed evreni), **hata anında screenshot + trace**, `tr-TR` locale.

| # | Spec | Kapsam |
|---|---|---|
| 1 | `01-admin-dashboard` | Admin login → dashboard KPI'ları → takvimde rampa kolonları |
| 2 | `02-supplier-wizard` | Tedarikçi sihirbazı: benzersiz ürün adıyla 3 adım → slot seçimi (kargo-tavsiyesiz slot tercihi; tavsiye diyaloğu çıkarsa engellemeyen onay) → başarı ekranı → **UI'dan iptalle temizlik** |
| 3 | `03-admin-approve` | API ile pending randevu fixture'ı → admin listede "Bekliyor" filtresi → satırdan Onayla → onay diyaloğu → başarı flash'i → **API iptaliyle temizlik** (finally) |
| 4 | `04-branding` | Admin marka adı + ana renk değiştirir → **ayrı context'te** tedarikçi girişi → `--primary` CSS değişkeni beklenen HSL üçlüsüne eşit → Varsayılana Sıfırla → değişken temizlenir |
| 5 | `05-platform` | Platform girişi → tenant dizini → Kullanım & Sağlık agregat kartları → Planlar listesi (Starter/Professional) |

Koşum (canlı compose stack'e karşı): **5 passed (5.5s)**. Testler
tekrarlanabilir: kendi oluşturduklarını iptal ederek temizler.

## 8. Pilot Go-Live Runbook

`docs/PILOT_GO_LIVE_RUNBOOK.md` — jenerik değil; her komut bu sprintte
fiilen koşuldu:

- Ortam değişkenleri tablosu (pilotta değişmesi zorunlu olanlar işaretli).
- Kurulum: `docker compose up -d --build` → `alembic upgrade head` →
  `python -m app.seed` → sağlık kontrolleri.
- Gerçek demo hesap tablosu; doğrulama: `demo_smoke.py` (18/18) +
  `npx playwright test` (5/5).
- **Pilot tenant açma akışı**: platform UI (tenant + bootstrap'li tesis) +
  ilk tenant yöneticisini açan **çalıştırılıp doğrulanmış** tek komutluk
  script (canlıda denendi: kullanıcı oluştu, login OK, sonra temizlendi).
- 15 dakikalık demo senaryosu, go-live kontrol listesi,
  `pg_dump/pg_restore` yedek-geri yükleme, **rollback** (alembic downgrade'in
  veri kaybettirebileceği uyarısıyla), MVP sınırları ve sorun giderme tablosu.

## 9. RBAC / İzolasyon Durumu

- `platform.*` izinleri tenant rollerine hiçbir yoldan giremez (whitelist +
  test: `test_role_crud_platform_permission_rejected`).
- Kullanıcı/rol endpoint'leri `user.manage` ister; izleyici 403 (testli).
- Seri endpoint'leri facility-scoped; başka tesisin serisi 404.
- Onboarding yalnızca `platform.tenant.manage`; bootstrap edilen kayıtlar
  doğru tenant/facility id'leriyle doğar.
- Pasif kullanıcı login + refresh edemez; oturumları anında düşer (testli).

## 10. Test Sonuçları

| Koşum | Sonuç |
|---|---|
| `pytest` (apps/api) | **128 passed** (önceki 110 + 18 Sprint 8 testi) |
| `ruff check app tests` | temiz |
| `npx tsc --noEmit` + `next lint` | temiz |
| `next build` | başarılı (tüm sayfalar) |
| `python3 scripts/demo_smoke.py` (canlı stack) | **18/18** |
| `npx playwright test` (canlı stack) | **5/5** |
| Canlı PG doğrulaması | weekly×3 seri: 3 onaylı occurrence, seri listesi sayaçları, **tek** özet bildirim; iptal temizliği |

Yeni test dosyası `tests/test_sprint8.py` (18 test): duplicate e-posta,
min-1-rol, cross-facility rol reddi, son yönetici (3 varyant + ikinci
yöneticiyle serbest kalma), oturum düşürme (pasifleştirme + parola reset),
platform izni enjeksiyonu, sistem rol kilidi (3 alan + silme), pasif rol
atanamaz, izin kataloğu, **weekly×4 seri** (tarihler, indexler, rozet
verisi, tek bildirim, seri list/detay), **çakışmada all-or-nothing**
(2. occurrence dolu → `occurrence_index:2`, `DOCK_TIME_CONFLICT`, sıfır
kayıt), **kotada all-or-nothing** (aylık kota 2 → 3. occurrence
`SUPPLIER_QUOTA_EXCEEDED`), limitler (13 tekrar / aylık 7 / kargo+recurring),
ay-sonu kirpme birim testi, admin create'in recurring'i yok sayması,
onboarding (bootstrap sayıları, arşiv guard'ı, plan override atanabilirlik).

## 11. Docker / Local Çalıştırma

Değişiklik yok: `docker compose up -d --build` (web 3010, api 8010, db 5433).
Bu sprintte migration konteyner içinde koşuldu (`docker compose exec api
alembic upgrade head` → `b18b3ff0e3d2 (head)`), seed idempotent davranışını
korudu ("Seed atlandi"). API+web imajları yeniden build edilip canlı
doğrulamalar bu stack üzerinde yapıldı.

## 12. Demo Akışları

1. **Kullanıcı/Rol**: Yönetim → Ayarlar → Kullanıcılar & Roller →
   "Yeni Rol" ile TR etiketli izinlerden özel rol → "Yeni Kullanıcı" ile bu
   rolü ata → çıkış yapıp yeni kullanıcıyla gir. Tek yöneticiyi
   pasifleştirmeyi dene → "son sistem yöneticisi" hatası.
2. **Tekrarlayan**: Tedarikçi → Yeni Randevu → 3. adımda "Tekrarlayan
   randevu oluştur" → haftalık × 4 → tarih önizlemesi → talep → başarı
   ekranında 4 tarih; Randevularım'da "Tekrarlayan N. randevu" rozetleri;
   admin zilinde **tek** bildirim; drawer'da x/4 bandı.
3. **All-or-nothing**: aynı seriyi dolu bir haftaya denk getir → "2. tekrar
   (tarih) oluşturulamadı: ..." mesajı, hiçbir randevu oluşmaz.
4. **Onboarding**: Platform → Tesis Dizini → Yeni Tesis (bootstrap işaretli)
   → başarı mesajında kurulum özeti; tenant'ı arşivleyip tekrar dene → 409.
5. **Interceptor**: girişten 30+ dk sonra herhangi bir sayfada gezinmeye
   devam — oturum kesintisiz yenilenir; refresh token'ı localStorage'dan
   silersen ilk 401'de login'e düşersin.

## 13. Bilinen Eksikler / Bilinçli Ertelemeler

- **Seri-bazlı toplu işlem yok**: seri iptali/revizesi occurrence-bazlıdır
  (v2.0 ruhuna uygun — occurrence'lar bağımsız randevulardır). Seri "cancel
  all" istenirse küçük bir ek endpoint.
- **Admin on-behalf create'te recurring yok** (yalnızca tedarikçi sihirbazı).
- Monthly seride sabit gün hafta sonuna/kapalı güne denk gelirse occurrence
  düşer ve all-or-nothing tetiklenir — bu bilinçli davranıştır (kullanıcıya
  hangi tarih uymadı söylenir); "en yakın iş gününe kaydır" MVP dışı.
- Tenant yöneticisi kullanıcısını platform UI'sından açma yok (runbook'taki
  script ile; sonraki sprintte "ilk yönetici" alanı tesise eklenebilir).
- Rol düzenlemesi aktif oturumların iznini anlık düşürmez (access token
  ömrü ≤30 dk; kritik durumda parola reset oturumları düşürür).
- Geçici parola e-postayla gitmez (`log_only`); UI'da gösterilir.
- Playwright'ta bildirim zili/deep-link ve responsive viewport'lar kapsam
  dışı (5 kritik akış hedefi neydi ise o).

## 14. Sonraki Önerilen Sprint

**Pilot geri bildirim sprinti**: gerçek SMTP sağlayıcısı (mevcut
`EmailProvider` soyutlamasına takılır), tenant ilk-yönetici onboarding'inin
UI'ya alınması, seri toplu iptal + admin tarafında seri oluşturma, takvimde
sürükle-bırak revize, parola politikası/ilk girişte zorunlu değişim ve
Playwright'ın CI'da koşulması (GitHub Actions + compose).
