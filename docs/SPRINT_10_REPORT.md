# Sprint 10 Raporu — Pilot İşletim

Tarih: 2026-07-08

## 1. Özet

Sprint 10, LogiSlot'u "çalışan"dan **işletilebilir**e taşıdı; tüm kabul
kriterleri karşılandı:

- **E-posta retry/resend**: failed loglar drawer'dan **"Tekrar Gönder"** ile
  yeniden gönderiliyor (max 3 deneme, `EMAIL_MAX_RETRIES_REACHED`);
  backoff'lu (**+5 dk / +30 dk / +2 sa**) otomatik işleme için
  `python -m app.maintenance.process_email_retries` komutu eklendi. Resend
  yalnızca e-postayı gönderir — **lifecycle asla tekrar çalışmaz**.
- **Admin adına randevu oluşturma drawer'ı**: tedarikçi seçimi → yalnızca
  onun izinli kategorileri, kategori → varsayılan araç, süre limit filtreleri,
  gerçek availability slotları, kargo advisory, **otomatik/manuel rampa**
  (manuel seçim de tam kural setinden geçer). Admin açtığı için randevu
  **onaylı doğar**; tedarikçiye bildirim + e-posta gider.
- **Admin recurring artık destekleniyor**: aynı Option B seri servisi,
  tüm occurrence'lar onaylı, all-or-nothing korunur; Sprint 9'daki 422
  kaldırıldı (kargo+recurring 422'si duruyor).
- **Seri toplu revizesi**: gelecekteki randevular aynı saate/süreye kayar;
  her occurrence tam kural setinden geçer, **all-or-nothing**
  (`SERIES_REVISE_OCCURRENCE_FAILED` + index/tarih/kod); sonuç
  **revision_pending** (tekil revise ile tutarlı); occurrence başına revizyon
  geçmişi; tedarikçiye tek özet bildirim + tek e-posta.
- **Bildirim/e-posta tercihleri**: global panel/e-posta anahtarları + event
  bazlı e-posta anahtarları; lifecycle üretimi tercihlere bağlandı (kapalı
  e-posta → EmailLog bile üretilmez; kapalı in-app → satır üretilmez;
  **kritik istisna:** revize panel bildirimi kapatılamaz).
- **Plan kullanım uyarıları**: `included_quota` eşikleri (≥%80 info, ≥%100
  warning, ≥%120 critical) `GET /platform/usage/warnings` + platform Kullanım
  sayfasında renkli bantlar. Fatura hesaplamaz, randevu oluşturmayı engellemez.
- **CI**: `ci.yml` (backend ruff+pytest, frontend tsc+lint+build) eklendi;
  `e2e.yml` ile bilinçli olarak ayrı tutuldu. **Staging**:
  `docker-compose.staging.yml` + `.env.staging.example` (secret'sız).
- Her şey yeşil: **pytest 159/159** (144 + 15 yeni), ruff, tsc/lint/build,
  **demo_smoke 18/18**, **Playwright 7/7** (yeni admin-create testi dahil),
  **backup_smoke ✔** — canlı compose stack'te doğrulandı.

## 2. Değişen/Oluşturulan Dosyalar

**Backend (`apps/api/`)**

| Dosya | Değişiklik |
|---|---|
| `app/models/email_log.py` | `retry_count`, `max_attempts`, `next_retry_at`, `last_attempt_at` |
| `app/models/{tenant_user,supplier}.py` | `notification_preferences_json` |
| `alembic/versions/eb8c040a882b_*.py` | Migration (up/down/up doğrulandı) |
| `app/services/email.py` | `retry_email`, `process_due_retries`, backoff planlayıcı; ilk başarısız gönderimde retry planı |
| `app/maintenance/process_email_retries.py` | **Yeni** — cron komutu (+`email.retry_process` audit) |
| `app/routers/notifications.py` | Loglarda retry alanları + `POST .../email-logs/{id}/resend` (+`email.resend` audit) |
| `app/services/appointments.py` | `create_appointment`: manuel `dock_id`, `allowed_dock_ids` scope filtresi, `approved_override`, `by_admin`, `_audit_action`; **`revise_appointment_series`** |
| `app/routers/appointments.py` | Admin create yeniden yazıldı (recurring destekli, not→audit); `POST .../appointment-series/{id}/revise` |
| `app/services/notifications.py` | `by_admin` oluşturma bildirimi; tercih uygulaması (`notify_supplier` async oldu) |
| `app/services/notification_preferences.py` | **Yeni** — varsayılanlar + `in_app_allowed`/`email_allowed` + kritik event seti |
| `app/auth/router.py` | `GET/PATCH /auth/notification-preferences` |
| `app/services/email_templates.py` | `appointment_series_revised` şablonu |
| `app/routers/platform.py` | `GET /platform/usage/warnings` (eşik değerlendirme) |
| `app/seed.py` + `app/services/onboarding.py` | Rampa yöneticisi rolüne `appt.create` |
| `app/schemas/appointment.py` | `AdminAppointmentCreate` (+dock/auto/note), `SeriesReviseRequest` |
| `tests/test_sprint10.py` | **Yeni** — 15 test |
| `tests/test_sprint8.py` | Admin recurring testi "artık destekleniyor" davranışına güncellendi |

**Frontend (`apps/web/`)**

| Dosya | Değişiklik |
|---|---|
| `src/components/appointments/admin-create-drawer.tsx` | **Yeni** — tedarikçi adına oluşturma (recurring'li) |
| `src/app/(admin)/admin/appointments/page.tsx` | "Yeni Randevu" butonu (appt.create izniyle) |
| `src/components/appointments/appointment-drawer.tsx` | E-posta loglarında retry sayacı, hata metni, **"Tekrar Gönder"** (max'ta disabled) |
| `src/app/(admin)/admin/series/page.tsx` | **"Seriyi Revize Et"** dialogu (saat/süre/rampa/not + all-or-nothing uyarısı) |
| `src/components/domain/notification-preferences.tsx` | **Yeni** — ortak tercih formu (TR etiketli) |
| `src/app/(admin)/admin/layout.tsx` | Header'da tercih dialogu |
| `src/app/(supplier)/supplier/profile/page.tsx` | "Bildirim Tercihleri" kartı |
| `src/app/(platform)/platform/usage/page.tsx` | Plan kullanım uyarı bantları |
| `src/lib/api/appointments.ts` | `useAdminCreateAppointment`, `useSeriesRevise`, `useEmailResend`, seri DTO'ları |
| `src/lib/api/{platform,reports}.ts` | Warnings hook'u; EmailLogDto retry alanları |

**CI/Scripts/Docs**

| Dosya | Değişiklik |
|---|---|
| `.github/workflows/ci.yml` | **Yeni** — backend + frontend job'ları |
| `docker-compose.staging.yml`, `.env.staging.example` | **Yeni** — staging profili (config doğrulandı) |
| `e2e/07-admin-create.spec.ts` | **Yeni** — 7. kritik E2E |
| `docs/PILOT_GO_LIVE_RUNBOOK.md` | Retry/resend, operasyon akışları, staging, checklist |
| `README.md` | Sprint 10 + bakım/CI/staging bölümleri |

## 3. Email Retry / Resend

- **Model**: `retry_count` (yapılan yeniden deneme sayısı), `max_attempts`
  (3), `next_retry_at`, `last_attempt_at`. İlk gönderim başarısız olduğunda
  `next_retry_at = +5 dk` planlanır; sonraki başarısızlıklar **+30 dk** ve
  **+2 sa** backoff'una geçer; hak bitince `next_retry_at = null`.
- **Kurallar** (testli): `sent` → 409 `EMAIL_ALREADY_SENT` (yanlışlıkla çift
  gönderim yok); `skipped` → 409 `EMAIL_NOT_RETRYABLE`;
  `retry_count >= max_attempts` → 409 `EMAIL_MAX_RETRIES_REACHED`. Başarılı
  retry → `sent` + `sent_at` + hata temizlenir; başarısız → sayaç artar,
  hata güncellenir. **Resend lifecycle'ı tekrar çalıştırmaz** — yalnızca
  kayıtlı subject/body yeniden gönderilir.
- **Endpoint kararı (raporda istendi)**: `POST /facilities/{fid}/email-logs/
  {id}/resend` izni **`appt.view`** — e-posta içeriği zaten aynı operasyon
  ekibine görünür; ayrı bir `notification.manage` izni açmak MVP'de rol
  matrisini şişirirdi. Supplier (facility context yok) ve platform (403)
  erişemez — testli. Audit: `email.resend`.
- **Processor**: `process_due_retries(limit)` — `failed/queued`, hakkı olan
  ve zamanı gelmiş kayıtları sırayla dener; maintenance komutu
  `python -m app.maintenance.process_email_retries --limit 50` (cron önerisi
  5 dk; `email.retry_process` audit'i). UI resend + processor aynı servis
  fonksiyonunu kullanır.
- **UI**: drawer e-posta loglarında durum, provider, `deneme: x/3`,
  son hata mesajı, son deneme zamanı; failed'da "Tekrar Gönder", hak
  bitince "Deneme hakkı doldu". Başarıda liste refetch edilir. Ayrı bir
  `/admin/settings/email-logs` sayfası **bilinçli ertelendi** (drawer +
  mevcut email-logs endpoint'i pilot ihtiyacını karşılıyor; §13).

## 4. Admin Appointment Create

- **Endpoint**: mevcut `POST /facilities/{fid}/appointments` genişletildi —
  `auto_assign_dock` (varsayılan true), `dock_id` (manuel), `note`.
  İzin: **`appt.create`** (zaten mevcuttu); **rampa yöneticisi sistem rolüne
  eklendi** (seed + onboarding bootstrap — mevcut kurulumlarda migration'sız
  rol güncellemesi gerekmez çünkü demo DB yeniden seed'lenmiyor; pilotta yeni
  bootstrap'ler doğru doğar, mevcut tesislerde rol editöründen eklenebilir —
  bilinen sınır, §13).
- **Kararlar**:
  - **Statü: onaylı doğar** (`approved_override`) — operasyon adminin
    açması onay anlamına gelir; tedarikçinin manuel onay ayarından bağımsız.
  - **Tedarikçi kuralları bypass edilmez**: izinli kategori (testli:
    `SUPPLIER_CATEGORY_NOT_ALLOWED`), kota, min/maks süre aynen uygulanır.
  - **Manuel rampa da tam kontrol edilir**: uyumluluk + çalışma saatleri +
    çakışma grupları (testli: uyumsuz rampa 422).
  - **Rampa yöneticisi scope'u**: aday rampalar atanmış rampalara daraltılır
    (otomatik atamada scope içinden seçilir; scope dışı manuel/uyumsuz →
    422; testli üç varyant).
  - **`note` randevuya yazılmaz** — `appointment.create_note` audit kaydına
    işlenir (yeni model alanı açmamak için MVP kararı).
  - Audit: `appointment.create_admin`.
- **Bildirim**: tedarikçiye "Randevunuz tesis tarafından oluşturuldu (onaylı)"
  paneli + `appointment_approved` e-postası; diğer adminlere olağan
  oluşturma bildirimi.
- **UI**: Randevular sayfasında "Yeni Randevu" (appt.create görünürlüğü);
  drawer tedarikçi→kategori→araç→slot akışıyla supplier sihirbazındaki
  kuralları aynen yansıtır; kargo advisory korunur; başarıda takvim/liste/
  dashboard invalidate.

## 5. Recurring Series Bulk Revise

- **Endpoint**: `POST /facilities/{fid}/appointment-series/{id}/revise`
  (`appt.revise`); gövde `{scope: "future_only", new_time: "HH:MM",
  duration_minutes?, dock_id?, auto_assign_dock, note?}`. `time_shift`
  yerine **"tüm gelecek randevular aynı saate"** modeli seçildi (istendiği
  gibi — pilotta anlaşılır olan bu).
- **Kurallar** (testli):
  - Yalnızca gelecek `pending/approved/revision_pending`; completed/rejected/
    cancelled dokunulmaz (testte tamamlanan occurrence aynen kaldı).
  - Her occurrence kendi tarihi için **tam kural setinden** geçer (kendi
    eski slotu hariç tutulur); **all-or-nothing**: biri uymazsa 422
    `SERIES_REVISE_OCCURRENCE_FAILED` + `{occurrence_index, occurrence_date,
    code}` ve **hiçbir randevu değişmez** (testte saatler birebir korunda).
  - **Statü kararı**: tekil revise ile tutarlı — hepsi `revision_pending`
    olur; toplu onay bu sprintte bilinçli yok (admin tek tek onaylar, §13).
  - Revizyon geçmişi occurrence başına `AppointmentRevision` satırı;
    `original_start_at` korunur.
  - **Spam yok**: tedarikçiye TEK özet bildirim (`affected_count`
    metadata'lı) + TEK `appointment_series_revised` e-postası; ekip e-postası
    bilinçli gönderilmez (revizeyi zaten ekip yapıyor — karar).
  - Rampa yöneticisi scope'u **all-or-nothing** (kaynak + hedef rampalar).
  - Audit: `appointment_series.revise` + `affected_count`.
- **UI**: Seriler sayfasında "Seriyi Revize Et" dialogu — yeni saat, süre
  (boş = değişmez), otomatik/manuel rampa, not, etkilenecek randevu sayısı ve
  all-or-nothing uyarısı; hata durumunda hangi occurrence/tarih/kod olduğu
  backend mesajıyla gösterilir.

## 6. Notification Preferences

- **Şekil kararı (raporda istendi)**: MVP'de `in_app_enabled` (global) +
  `email_enabled` (global) + **yalnızca e-posta için event bazlı** anahtarlar
  (7 şablon anahtarıyla birebir). Event bazlı in-app MVP dışı — panel tek
  "kaynak gerçek" olduğundan globali yeterli görüldü.
- **Kritik event kararı**: `appointment_revised` panel bildirimi
  **kapatılamaz** (tedarikçinin fiziksel lojistiğini değiştiren saat
  değişikliği görünmek zorunda — testli). E-postaların TAMAMI kapatılabilir.
- **In-app kapalı → satır üretilmez** (read-olarak üretmek yerine; tercih
  edildiği gibi). **E-posta kapalı → EmailLog da üretilmez** (skipped satırı
  log şişirirdi; MVP kararı — testte log listesi boş doğrulandı).
- **Uygulama noktası**: servis katmanı — `notify_supplier`/`notify_admins`/
  `_email_supplier`/ekip revize e-postaları tercihleri okur (tedarikçi
  tercihi portal hesabında yaşar; hesabı olmayan tedarikçide varsayılanlar).
  Seri özet bildirim/e-postaları da aynı yoldan geçer.
- **Endpointler**: `GET/PATCH /auth/notification-preferences` — kullanıcı
  yalnızca kendi tercihini yönetir (tenant admin başkasınınkine dokunamaz);
  platform kullanıcısına 403; bilinmeyen event anahtarı 422
  `INVALID_PREFERENCE_EVENT`; audit `notification_preferences.update`.
- **UI**: ortak `NotificationPreferencesForm` — admin header'ındaki ayar
  simgesinden dialog, tedarikçi Profil sayfasında kart; Türkçe event
  etiketleri ve kritik-istisna açıklaması.

## 7. Plan Usage Warnings

- **Endpoint**: `GET /platform/usage/warnings?date_from&date_to`
  (`platform.analytics.view`). Plan `rate_card_json.included_quota` değerleri
  eşik olarak yorumlanır — **fatura hesaplanmaz** (plan politika kabı kalır)
  ve **hiçbir şey engellenmez**.
- Eşikler: **≥%80 info, ≥%100 warning, ≥%120 critical** (severity sırasıyla
  sıralı döner). Boyut sözlüğü usage ile aynı: `appointments_created/
  completed`, `active_docks/suppliers/users/facilities`.
- Kapsam: tenant planı **override'sız tesislerin toplamı** üzerinden;
  facility override'ları kendi tesisinin rakamıyla ayrıca değerlendirilir.
- **PII yok** (testli: tedarikçi e-postası/plaka/sürücü yasak-kelime
  taraması); tenant admin erişemez (403, testli) — **MVP'de platform-only**
  (raporda istenen karar; tenant tarafına banner sonraki sprint).
- **UI**: Platform → Kullanım & Sağlık'ta severity renkli uyarı bantları
  (%, kullanılan/kota, plan adı).

## 8. CI / Staging Ops

- **`ci.yml`**: `backend` job (Python 3.13, `ruff check`, `pytest` —
  SQLite'ta koşar, PG/servis konteyneri gerekmez) + `frontend` job (Node 20,
  `npm ci`, `tsc --noEmit`, `next lint`, `next build`). Tetikleme
  `workflow_dispatch` + `pull_request`.
- **Karar**: `e2e.yml` ile **birleştirilmedi** — hızlı geri bildirim
  job'ları compose kurulumu beklemeden koşar; E2E ayrı yavaş şeritte kalır.
  Çakışma yok (farklı workflow adları, aynı tetikleyiciler).
- **Staging**: `docker-compose.staging.yml` (base compose üzerine overlay:
  `LOGISLOT_ENVIRONMENT=production`, docs kapalı, rate limit açık, restart
  policy'ler, api/web healthcheck'leri, zorunlu `POSTGRES_PASSWORD`/
  `SECRET_KEY` — eksikse compose açılmaz; `config` ile doğrulandı) +
  `.env.staging.example` (yalnızca placeholder; `.env.staging` gitignore'da).
- README'de lokal eşdeğer komutlar; runbook §2.1 staging kurulumu.

## 9. RBAC / Security / Scope

- Email resend: `appt.view` + facility context (karar §3); supplier/platform
  erişemez (testli). Resend içeriği değiştirmez — stored subject/body gider.
- Admin create: `appt.create`; tedarikçi kuralları ve rampa scope'u servis
  katmanında (UI'a güvenilmez). Onaylı doğma yalnızca tenant admin
  endpoint'inde (`approved_override` supplier portalından erişilemez).
- Seri revize: `appt.revise` + all-or-nothing dock scope; cross-facility
  seri 404.
- Tercihler: kullanıcı yalnızca kendini günceller; event whitelist'i 422;
  kritik event servis katmanında zorlanır (client atlatamaz).
- Plan uyarıları: platform-only, agregat-only, PII yasak-kelime testli.

## 10. Test Sonuçları

Komutlar:

```bash
cd apps/api && .venv/bin/python -m pytest -q      # 159 passed
.venv/bin/ruff check app tests                     # temiz
cd apps/web && npx tsc --noEmit && npm run lint    # temiz
npm run build:web                                  # başarılı
docker compose up -d --build api web && docker compose exec api alembic upgrade head  # eb8c040a882b (head)
python3 scripts/demo_smoke.py                      # 18/18
npx playwright test                                # 7 passed
./scripts/backup_smoke.sh                          # ✔ (29 TABLE DATA)
docker compose -f docker-compose.yml -f docker-compose.staging.yml config --quiet  # gecerli
```

Yeni `tests/test_sprint10.py` (15 test): resend başarı→`EMAIL_ALREADY_SENT`;
3 deneme→`EMAIL_MAX_RETRIES_REACHED`; resend scope (supplier/platform);
`process_due_retries` (geçmiş `next_retry_at` → sent); admin manuel rampa
(uyumlu 200+approved / uyumsuz 422); tedarikçi kuralı bypass edilemez; rampa
yöneticisi scope üç varyant; admin recurring all-or-nothing (0 kayıt); seri
bulk revise (completed dokunulmaz, revision_pending, saat/süre, tek bildirim
+ tek e-posta); bulk revise all-or-nothing (saatler birebir korunur);
tercih endpointleri (defaults/patch/bilinmeyen key 422/platform 403);
e-posta tercihi kapalı → EmailLog yok ama panel bildirimi var; in-app kapalı
→ bildirim yok AMA revize (kritik) yine üretilir; plan uyarısı eşikleri
(critical + eşik altı boş) ve PII/izin kontrolleri. Sprint 8 admin-recurring
testi yeni davranışa (destekli, onaylı) güncellendi.

## 11. Docker / Local / Staging Çalıştırma

Dev compose değişmedi (3010/8010/5433); api+web imajları Sprint 10 koduyla
yeniden build edildi, migration konteynerde koşuldu, canlı doğrulamalar bu
stack'te yapıldı. Staging: runbook §2.1'deki üç komutla kalkar
(`--env-file .env.staging`); zorunlu secret'lar doldurulmadan compose
bilinçli olarak açılmaz.

## 12. Demo Akışları

- **Email resend**: SMTP'yi bozuk konfigüre et → randevu onayla → drawer
  e-posta logunda `failed` + hata → SMTP'yi düzelt → "Tekrar Gönder" →
  `sent`, `deneme: 1/3`. Cron eşdeğeri: `process_email_retries --limit 50`.
- **Admin create**: Randevular → Yeni Randevu → "Anadolu Un A.S." → kategori
  → slot → Oluştur → listede **Onaylandı** satırı; tedarikçi zilinde
  "Randevunuz tesis tarafından oluşturuldu". Recurring anahtarıyla haftalık
  ×4 → 4 onaylı randevu.
- **Series revise**: Seriler → Seriyi Revize Et → 09:30 + 45 dk → onay →
  "2 randevu revize edildi (tedarikçi onayı bekleniyor)"; çakışma varsa
  hangi tarihin neden düştüğü gösterilir ve hiçbir şey değişmez.
- **Preferences**: Tedarikçi Profil → e-postaları kapat → admin onaylasın →
  e-posta yok, panel bildirimi var; panel bildirimini de kapat → revize
  yine düşer (kritik).
- **Plan warnings**: Platform → Planlar'da kotayı küçült → Kullanım &
  Sağlık'ta kırmızı "%X seviyesinde" bandı; randevu oluşturma etkilenmez.
- **CI/staging**: push sonrası Actions'ta `ci` + `e2e`; staging için
  runbook §2.1.

## 13. Bilinen Eksikler / Bilinçli Ertelemeler

- **Genel e-posta logları sayfası** (`/admin/settings/email-logs`) ertelendi
  — drawer içi loglar + resend pilot ihtiyacını karşılıyor; sayfa API'si
  hazır (`GET /email-logs` filtresiz de çalışıyor).
- **Seri toplu onay yok**: bulk revise sonrası occurrence'lar tek tek
  onaylanır (tekil lifecycle korunuyor).
- Mevcut kurulumlarındaki "Rampa / Depo Yoneticisi" rolüne `appt.create`
  otomatik eklenmez (system rol içeriği migration'la değiştirilmedi); yeni
  bootstrap'ler doğru doğar. Pilotta gerekiyorsa rol düzenleme ekranından
  custom rol verilebilir.
- E-posta retry processor'ü cron gerektirir (compose'a scheduler konteyneri
  eklenmedi — runbook'ta cron önerisi).
- Tercihlerde event bazlı **in-app** anahtarları yok (global + kritik
  istisna); tenant admin başkasının tercihini göremez/yönetemez (bilinçli).
- Plan uyarıları platform-only; tenant admin dashboard banner'ı sonraki
  sprint. `overage_rule` alanı yorumlanmıyor (yalnızca `included_quota`).
- Admin create `note` alanı yalnızca audit'te (randevu modelinde alan yok).
- Staging profili tek sunucu varsayıyor (yatay ölçek/rate-limit Redis'i
  hâlâ MVP dışı).

## 14. Sonraki Önerilen Sprint

**Pilot canlı destek sprinti**: genel e-posta logları sayfası + filtreler,
seri toplu onay (revision_pending → approved), tenant admin plan uyarı
banner'ı, bildirim tercihlerine sessiz saat/özet modu, takvimde sürükle-bırak
revize, compose'a hafif scheduler (cron konteyneri: retention + email retry),
staging'e otomatik yedek cron'u ve pilot geri bildirim döngüsünün
raporlanması (kullanım metrikleriyle).
