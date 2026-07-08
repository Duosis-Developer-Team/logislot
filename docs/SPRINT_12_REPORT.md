# Sprint 12 Raporu — Pilot Final Hardening

Tarih: 2026-07-08

## 1. Özet

Sprint 12, pilot öncesi son sertleştirme turunu tamamladı ve Sprint 11'in
bilinçli eksiklerini kapattı; tüm kabul kriterleri karşılandı:

- **Platform denetim izleri**: yeni **`platform.audit.view`** izni (+mevcut
  kurulumların Platform Yöneticisi rolünü güncelleyen data migration),
  `GET /platform/audit-logs` ve `/platform/audit-logs` UI sayfası. **Kapsam
  kararı**: yalnızca platform/system aktörlü kayıtlar — tenant operasyonel
  audit'i (ve PII'si) platforma SIZMAZ (testli). Maskeleme facility audit
  ile **aynı servis fonksiyonu** (`app/services/audit_view.py`'a çıkarıldı).
- **E-posta logları filtre polish**: tarih aralığı, şablon seçimi, "yalnızca
  hatalılar" ve "Filtreleri temizle" UI'a eklendi; kartların tesis-geneli /
  tablonun filtreli olduğu açıklaması kondu (API zaten destekliyordu —
  backend değişmedi).
- **Scheduler health + çoklu-instance kilidi**: `maintenance_runs` tablosu
  (job/başlangıç/bitiş/durum/işlenen/hata) + **`pg_try_advisory_xact_lock`**
  — kilidi alamayan instance işi **`skipped_locked`** kaydeder (hata değil,
  testli); worker hatası `failed` kaydedilir ve döngü ölmez. Support paneli
  iş başına son koşumu gösterir; **kayıt yoksa "henüz koşmadı"** (uydurma
  durum yok — testli).
- **Tedarikçi seri UX'i**: `GET /supplier/appointment-series[/{id}]`
  (sayaçlar, sıradaki randevu, iptal hakkı) + Randevularım'da "Tekrarlayan
  Randevular" bölümü (kartlar + occurrence detayı). **Supplier series cancel
  EKLENDİ** (tercih edilen): yalnızca kendi serisi, yalnızca gelecekteki
  pending/approved/revision_pending, **sebep zorunlu**, güçlü onay metni
  ("gelecekteki X randevuyu iptal eder… tamamlananlar etkilenmez"),
  adminlere TEK özet bildirim — tedarikçiye bildirim/e-posta üretilmez
  (işlemi kendisi yaptı; testli).
- **Takvim micro UX — Option B seçildi**: drag-and-drop **bilinçli
  ertelendi** (yanlış revize riski); yerine **boş slota tıklayınca
  tarih/saat/rampa ön-dolu "Yeni Randevu" drawer'ı** açılıyor (slotlar
  yüklenince tercih edilen saat otomatik seçilir).
- **Otomatik yedek kararı**: scheduler'a yedek işi **eklenmedi** (güvenli
  saklama hedefi ortama bağlı; konteyner içi dump yanlış güven verir).
  Runbook'a **gerçek host cron örneği** (gece 02:00 pg_dump + 14 gün
  saklama + haftalık restore smoke) yazıldı.
- **`scripts/pilot_readiness.py`**: canlı API'ye karşı PASS/WARN/FAIL/MANUAL
  raporu — health, web, platform girişi, failed/retry e-posta, scheduler son
  koşumları, plan uyarıları, config (docs/rate limit/SMTP/production demo
  parolası) kontrolleri; FAIL varsa non-zero. Elle koşulması gerekenler
  (migration/demo smoke/restore smoke) **MANUAL** olarak dürüstçe listelenir.
  Canlı koşum: **0 FAIL, 0 WARN**.
- **Playwright 9 teste çıktı**: platform audit sayfası + **390px mobil
  viewport'ta** tedarikçi seri bölümü (responsive smoke).
- Her şey yeşil: **pytest 179/179** (173 + 6 yeni), ruff, tsc/lint/build,
  **demo_smoke 18/18**, **Playwright 9/9**, **iki backup smoke ✔**,
  readiness ✔ — canlı stack'te.

## 2. Değişen/Oluşturulan Dosyalar

**Backend (`apps/api/`)**

| Dosya | Değişiklik |
|---|---|
| `app/core/permissions.py` | `PlatformPermission.AUDIT_VIEW` |
| `app/models/maintenance_run.py` | **Yeni** — scheduler koşum kaydı |
| `alembic/versions/ca5e432dfa5e_*.py` | maintenance_runs + Platform Yöneticisi rol data-sync (up/down/up doğrulandı) |
| `app/services/audit_view.py` | **Yeni** — ortak maskeleme/kırpma/TR özetler (facility+platform) |
| `app/routers/audit.py` | Ortak servise geçirildi (davranış aynı; testler yeşil) |
| `app/routers/platform.py` | `GET /platform/audit-logs` (platform/system aktör kapsamı, tenant/tesis adı çözümü); support health'e `scheduler` + `config` bölümleri |
| `app/maintenance/scheduler.py` | `execute_job` (advisory lock + MaintenanceRun kaydı), hata dirençli döngü korundu |
| `app/services/appointments.py` | `cancel_appointment_series`: `supplier_id` sahiplik + `by_supplier` bildirim yönü |
| `app/routers/supplier_portal.py` | Seri list/detail + **sebep-zorunlu cancel** endpoint'leri |
| `tests/test_sprint12.py` | **Yeni** — 6 test |
| `tests/test_sprint11.py` | Scheduler testi yeni imzaya güncellendi |

**Frontend (`apps/web/`)**

| Dosya | Değişiklik |
|---|---|
| `src/app/(platform)/platform/audit-logs/page.tsx` | **Yeni** — filtreli tablo + detay drawer (+nav) |
| `src/app/(admin)/admin/settings/email-logs/page.tsx` | Tarih/şablon/hata filtreleri + temizle + kapsam notu |
| `src/app/(platform)/platform/support/page.tsx` | Scheduler durum kartları + config satırı |
| `src/lib/api/supplier.ts` | Seri list/detail/cancel hook'ları |
| `src/components/domain/supplier-series-section.tsx` | **Yeni** — seri kartları + detay + güçlü onaylı iptal |
| `src/app/(supplier)/supplier/appointments/page.tsx` | Seri bölümü eklendi |
| `src/components/appointments/admin-create-drawer.tsx` | `initial` prop (tarih/saat/rampa ön-dolum; slot otomatik seçimi) |
| `src/app/(admin)/admin/calendar/page.tsx` | Boş saat hücresi tıklaması → ön-dolu create drawer (appt.create görünürlüğü) |
| `src/lib/api/reports.ts` | EmailLogFilters tarih alanları |

**Scripts/Docs**

| Dosya | Değişiklik |
|---|---|
| `scripts/pilot_readiness.py` | **Yeni** — PASS/WARN/FAIL/MANUAL raporu (canlıda koştu) |
| `e2e/08-platform-audit.spec.ts`, `e2e/09-supplier-series.spec.ts` | **Yeni** — 2 E2E (ikincisi 390px viewport) |
| `docs/PILOT_GO_LIVE_RUNBOOK.md` | Yeni akışlar + host yedek cron örneği + final checklist |
| `README.md` | Sprint 12 + araç listesi |

## 3. Platform Audit

- **İzin**: `platform.audit.view` (tercih edilen) — data migration mevcut
  kurulumlardaki "Platform Yoneticisi" rolüne ekler (downgrade geri çıkarır).
- **Kapsam kararı (rapor)**: sorgu `actor_type IN (platform_user, system)`
  ile sınırlı — tenant kullanıcılarının operasyonel kayıtları (randevu
  onayı, tedarikçi işlemleri…) platform görünümünde YOKTUR; test hem bunu
  hem `tedarikci@` PII taramasını doğrular. Tenant/tesis adları agregat
  bağlam için gösterilir (PII değil).
- Kapsanan aksiyonlar: tenant/facility create-update, plan create/update/
  retire/assign, ilk yönetici bootstrap, platform usage erişim audit'i,
  system e-posta retry koşumları — hepsi TR özet sözlüğünde.
- **Maskeleme**: facility ile aynı `audit_view.safe_snapshot` (testli:
  `smtp_password` → `***`, ham değer yanıtta yok); tenant admin ve supplier
  403 (testli).
- **UI**: `/platform/audit-logs` — aksiyon/varlık/arama filtreleri, varlık
  kolonu tenant/tesis bağlamıyla, detay drawer'ında maskeli Önce/Sonra;
  "platform seviyesindeki tenant, tesis ve plan işlemleri" açıklaması.

## 4. Email Logs Polish

- UI'a eklendi: başlangıç/bitiş tarihi (gün → UTC aralığına çevrilir),
  şablon select'i (statik 7 şablon — ayrı endpoint'e gerek görülmedi, API
  zaten `template_key` filtreliyor), "yalnızca hatalılar" onay kutusu,
  "Filtreleri temizle". Filtre değişiminde sayfalama sıfırlanır.
- Kart/tablo kapsam farkı UI'da açıklandı ("kartlar tesis geneli; tablo
  filtreli").
- Backend değişmedi (Sprint 11 filtreleri kullanılıyor); mevcut testler
  kapsamayı zaten doğruluyor.

## 5. Scheduler Health / Locking

- **`maintenance_runs`**: her koşum kaydedilir (başlangıç/bitiş/durum/
  işlenen sayı/hata/metadata). Support health iş başına SON koşumu döner;
  hiç koşum yoksa `null` → UI "henüz koşmadı" rozeti (uydurma durum yok;
  testte notification_cleanup için doğrulandı).
- **Çoklu-instance kilidi**: iş başına `pg_try_advisory_xact_lock
  ('logislot:scheduler:<job>')` — kilit alınamazsa `skipped_locked` kaydı
  (test: kilit fonksiyonu False'a monkeypatch'lenerek); tek instance dev/
  staging davranışı değişmedi (SQLite'ta no-op). Worker hatası → `failed`
  kaydı + hata mesajı, exception yayılmaz (testli); döngü direnci ayrıca
  testli.
- **Support UI**: iş başına başarılı/kilitli-atlandı/hata rozetleri, son
  koşum zamanı, işlenen sayı, hata metni; altta ortam/e-posta/docs/rate
  limit config satırı (readiness de bunu okur).
- Canlı doğrulama: rebuild sonrası iki iş de gerçek `success` kayıtları
  üretti (readiness çıktısında son koşum zamanlarıyla görünür).

## 6. Supplier Series UX

- **Endpoint'ler**: `GET /supplier/appointment-series` (frequency, sayaçlar,
  sıradaki randevu, ürün adı, `can_cancel_series`,
  `future_cancellable_count`) ve `GET .../{id}` (rampa adlı occurrence
  listesi) — yalnızca kendi serileri; yabancı seri 404 (testli).
- **Cancel kararı (rapor)**: **EKLENDİ** (tercih edilen seçenek). Kurallar:
  sahiplik zorunlu (404), yalnızca gelecekteki pending/approved/
  revision_pending (tamamlanan testte aynen kaldı), **sebep zorunlu**
  (min 3 karakter; 422), `by_supplier` yönlü bildirim: adminlere TEK özet
  ("Seri tedarikçi tarafından iptal edildi" + sebep), tedarikçiye
  bildirim/e-posta üretilmez, seri iptal e-postası da atlanır (testli).
  Yanlışlıkla-toplu-silme riski UI'da güçlü onayla karşılandı: kaç randevu,
  "geri alınamaz", "tamamlananlar etkilenmez" + buton üzerinde sayı.
- **UI**: Randevularım'da seri kartları (sıklık×adet, sıradaki randevu,
  durum sayaçları), detay dialogu (occurrence + revize işareti), iptal
  akışı. Mobil 390px'te E2E ile doğrulandı.

## 7. Calendar Micro UX

- **Karar (rapor)**: drag-and-drop **bu sprintte yapılmadı** — yanlış
  sürükleme tek hareketle yanlış revize üretir, dokunmatik desteği ayrıca
  büyük iş; pilot geri bildirimi sonrasına bırakıldı. Yerine güvenli
  kısayol: **takvimde boş saat hücresine tıklayınca** "Yeni Randevu"
  drawer'ı **tarih + saat + rampa ön-dolu** açılır (`appt.create` izni
  olanlara; hücrelerde hover ipucu). Drawer, tedarikçi/kategori seçilince
  slotlar yüklenir yüklenmez tercih edilen saati otomatik seçer; ön-dolu
  rampa manuel modda gelir ve yine tam kural setinden geçer.
- Randevu bloğu tıklaması zaten drawer açıyor (revize dahil aksiyonlarla);
  ek ağır değişiklik yapılmadı.

## 8. Pilot Readiness

- `scripts/pilot_readiness.py` — HTTP tabanlı, ortam değişkenleriyle hedef
  seçilebilir. Kontroller: API health (FAIL), web login (FAIL), platform
  girişi (FAIL), support health üzerinden failed/retry e-posta (WARN),
  scheduler son koşumları (hiç yoksa veya hatalıysa WARN; `skipped_locked`
  sağlıklı sayılır), plan uyarıları (WARN), envanter (bilgi), config:
  production'da docs açık / log_only SMTP / rate limit kapalı / scheduler
  kapalı / demo parolayla giriş (WARN'lar).
- **Dürüstlük ilkesi**: takip edilmeyen şeyler PASS gösterilmez —
  migration head, demo smoke ve restore smoke **MANUAL** satır olarak
  komutlarıyla listelenir.
- Canlı koşum: **0 FAIL, 0 WARN** + 3 MANUAL. FAIL varsa non-zero çıkış.

## 9. Playwright / QA Expansion

- `08-platform-audit.spec.ts`: platform girişi → Denetim İzleri → başlık +
  kayıt sayacı.
- `09-supplier-series.spec.ts`: **390px mobil viewport** (responsive smoke)
  — API fixture'la haftalık×2 seri → seri bölümü + kart + detay dialogu →
  temizlik yeni supplier cancel endpoint'iyle.
- Toplam **9/9**; workers 1 ve kendi-temizliği kalıpları korundu.

## 10. RBAC / Security / Scope

- Platform audit yalnızca `platform.audit.view`; tenant admin/supplier 403
  (testli); kapsam filtresi PII sızıntısını yapısal olarak engeller
  (yalnızca platform/system aktör satırları) ve maskeleme ikinci kat.
- Supplier series uçları supplier context'iyle sahiplik doğrular;
  facility admin uçlarına dokunulmadı.
- Scheduler kilidi yalnızca aynı işin çift koşumunu engeller; kilit hatası
  operasyon verisine dokunmaz (ayrı `maintenance_runs` kaydı).
- Takvim ön-dolumu yalnızca UI kolaylığı — create yine `appt.create` +
  rampa scope + tam kural setinden geçer (backend değişmedi).
- Readiness script'i yalnızca agregat/config okur; secret basmaz.

## 11. Test Sonuçları

Komutlar:

```bash
cd apps/api && .venv/bin/python -m pytest -q      # 179 passed
.venv/bin/ruff check app tests                     # temiz
cd apps/web && npx tsc --noEmit && npm run lint    # temiz
npm run build:web                                  # başarılı
docker compose up -d --build && docker compose exec api alembic upgrade head  # ca5e432dfa5e (head)
python3 scripts/demo_smoke.py                      # 18/18
npx playwright test                                # 9 passed
./scripts/backup_smoke.sh                          # ✔
./scripts/backup_restore_smoke.sh                  # ✔
python3 scripts/pilot_readiness.py                 # 0 FAIL, 0 WARN
```

Yeni `tests/test_sprint12.py` (6 test): platform audit endpoint + kapsam
(tenant_user aktör kayıtları yok, PII taraması, tenant/supplier 403) +
tenant adı/özet/aktör; platform maskeleme; `execute_job` üç durum
(success/skipped_locked/failed) ve kayıtların yazılması; support health
scheduler bölümü + "henüz koşmadı" null'u + config; supplier seri
list/detail (+yabancı seri izolasyonu); supplier cancel tam akışı (sebep
zorunlu 422, completed dokunulmaz, admin tek özet + tedarikçiye üretim yok
+ e-posta yok, ikinci iptal 409, yabancı seri 404). Sprint 11 scheduler
testi yeni imzaya taşındı.

## 12. Docker / Local / Staging

Compose değişmedi (scheduler servisi Sprint 11'den); stack yeniden build
edildi, migration konteynerde koşuldu (`ca5e432dfa5e`), scheduler yeniden
başlatılınca gerçek koşum kayıtları üretti (readiness çıktısında görünür).
Staging overlay'i scheduler'ı zaten kapsıyor; ek değişiklik gerekmedi.

## 13. Demo Akışları

- **Platform audit**: Platform → Denetim İzleri → `tenant.create` filtresi →
  satır detayında maskeli snapshot; tenant operasyon kayıtlarının burada
  OLMADIĞINI not edin.
- **Email logs**: E-posta Logları → tarih aralığı + "Seri iptal" şablonu +
  "yalnızca hatalılar" → Filtreleri temizle.
- **Scheduler**: Platform → Destek → Scheduler kartlarında son koşum;
  `docker compose stop scheduler` sonrası yeni koşum gelmediğini, readiness
  script'inin WARN verdiğini görün.
- **Supplier series**: tedarikçi Randevularım → Tekrarlayan Randevular →
  Detay; Seriyi İptal Et → sebep girmeden deneyin (engellenir) → sebep girin
  → admin zilinde "tedarikçi tarafından iptal edildi".
- **Calendar shortcut**: Takvim → boş bir saate tıkla → drawer tarih/saat/
  rampa dolu açılır → tedarikçi+kategori seç → tercih edilen saat otomatik
  seçili gelir.
- **Readiness**: `python3 scripts/pilot_readiness.py` → PASS/WARN/FAIL +
  MANUAL adımlar.

## 14. Bilinen Eksikler / Bilinçli Ertelemeler

- **Drag-and-drop revize ertelendi** (karar §7) — pilot geri bildirimi
  sonrası; güvenli slot-tıklama kısayolu mevcut.
- **Otomatik yedek scheduler'da yok** (karar §1/runbook) — host cron örneği
  verildi; "otomatik yedek alınıyor" İDDİA EDİLMİYOR.
- Readiness script'i migration/demo smoke/restore smoke'u kendisi koşmaz —
  MANUAL listeler (uydurma PASS yerine).
- Email logs URL query sync yok (filtreler state'te; paylaşinabilir link
  sonraki ihtiyaçta).
- Platform audit `search` yalnızca aksiyon/varlık tipinde; tenant adında
  arama yok (tenant_id filtresi API'de var, UI'da select yok).
- Supplier seri detayında occurrence bazlı tekil iptal butonu yok (mevcut
  randevu kartlarından yapılabiliyor).
- Scheduler healthcheck compose'ta hâlâ yok; durum artık support panelinde
  ve readiness'ta görünür olduğu için ertelendi.

## 15. Sonraki Önerilen Sprint

**Pilot canlı çalıştırma**: gerçek pilot tenant'ın açılması ve ilk hafta
yakın takibi (readiness + destek paneli günlük rutini), pilot geri bildirim
kaydı ve önceliklendirme; teknik aday konular — drag-and-drop revize
(feedback teyit ederse), email logs URL senkronu, platform audit tenant
filtresi UI'sı, supplier seri detayından tekil occurrence aksiyonları,
scheduler healthcheck + alarm entegrasyonu (failed koşumda e-posta/webhook)
ve çok-tesisli tenant senaryosunun uçtan uca provası.
