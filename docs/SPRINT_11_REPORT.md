# Sprint 11 Raporu — V2.0 Remaining Gaps Closure

Tarih: 2026-07-08

## 1. Özet

Sprint 11, v2.0'da istenen ama henüz ürünleşmemiş kalan boşlukları kapattı;
tüm kabul kriterleri karşılandı:

- **Genel E-posta Logları sayfası** (`/admin/settings/email-logs`): durum
  özeti kartları, durum/provider/alıcı filtreleri, sayfalama, tekil ve
  **toplu yeniden gönderim** (partial result, max 50). Backend liste
  endpoint'i zarf yapısına geçti (`{items, total, limit, offset, summary}`).
- **Denetim İzleri UI'sı** (`/admin/settings/audit-logs`): yeni **`audit.view`
  izni** + mevcut kurulumların sistem rollerini güncelleyen **data
  migration**; aksiyon/varlık/arama filtreleri, Türkçe özetler, aktör adı
  çözümü, before/after detay drawer'ı. `password/token/secret/hash/jti`
  alanları **maskelenir**, dev snapshot'lar kırpılır.
- **Scheduler konteyneri**: compose'a `scheduler` servisi — 5 dk'da bir
  e-posta retry, 24 saatte bir bildirim temizliği; iş hata alırsa **döngü
  ölmez** (testli). Dev compose'ta açık (karar), staging'de restart
  policy'li.
- **Gerçek restore smoke** (`scripts/backup_restore_smoke.sh`): dump →
  geçici `logislot_restore_smoke` DB'sine restore → tablo/tenant/tesis/
  alembic doğrulaması → trap'li temizlik. **Ana DB'ye asla dokunmaz**;
  canlıda koşuldu (29 tablo, alembic head doğrulandı).
- **Tenant plan uyarı banner'ı**: `GET /facilities/{fid}/plan/warnings`
  (`report.view`) + admin dashboard'da severity renkli banner. Eşik mantığı
  platform ile ortak servise alındı; uyarı **hiçbir şeyi engellemez**.
- **Seri toplu onay**: gelecekteki revision_pending randevular tek istekle
  onaylanır; **onay anında çakışma yeniden kontrol edilir** ve biri uygun
  değilse hiçbiri onaylanmaz (canlıda rampanın pasifleşmesi senaryosuyla
  testli). Tek özet bildirim + e-posta (tercihlere tabi).
- **CSV exportlar**: rapor özeti (bölümlü), randevu detayı (PII'siz —
  plaka/sürücü bilinçli hariç) ve platform usage (PII'siz); rampa yöneticisi
  scope'u CSV'ye aynen yansır. UI'da indirme butonları (token'lı blob).
- **Pilot destek paneli** (`/platform/support`): failed e-posta, retry
  kuyruğu, kritik bildirim, bekleyen/revize randevu, plan uyarısı, tenant/
  tesis sayaçları — tamamı agregat, PII'siz, 60 sn'de bir yenilenir.
- Bildirim tercihleri metinleri netleştirildi ("e-postaları kapatırsanız
  panel devam eder", varsayılanlar, kritik revize açıklaması).
- Her şey yeşil: **pytest 173/173** (159 + 14 yeni), ruff, tsc/lint/build,
  **demo_smoke 18/18** (yeni zarf yapısına güncellendi), **Playwright 7/7**,
  **iki backup smoke ✔**, scheduler canlıda iki job'ıyla ayakta.

## 2. Değişen/Oluşturulan Dosyalar

**Backend (`apps/api/`)**

| Dosya | Değişiklik |
|---|---|
| `app/core/permissions.py` | `AUDIT_VIEW = "audit.view"` |
| `alembic/versions/aebbb08f3bd8_*.py` | **Data migration**: sistem rollerine güncel izinler (up/down/up doğrulandı) |
| `app/routers/notifications.py` | Email logs listesi zarf + 8 filtre + summary; **`bulk-resend`** (partial result, `user.manage`, audit) |
| `app/routers/audit.py` | **Yeni** — audit listesi (filtreler, aktör çözümü, maskeleme, kırpma, TR özetler) |
| `app/services/plan_warnings.py` | **Yeni** — eşik değerlendirmesi (platform + facility ortak) |
| `app/routers/reports.py` | `GET /plan/warnings`; **`summary.csv`** (bölümlü) + **`appointments.csv`** (PII'siz, scope'lu) |
| `app/routers/platform.py` | Warnings refactor (ortak servis); **`/usage.csv`**; **`/support/health`** |
| `app/services/appointments.py` | **`approve_appointment_series`** (yeniden çakışma kontrolü, all-or-nothing, tek özet, tercih uyumlu e-posta) |
| `app/routers/appointments.py` | `POST .../appointment-series/{id}/approve` |
| `app/schemas/appointment.py` | `SeriesApproveRequest` |
| `app/core/config.py` | Scheduler ayarları (enabled/interval/retention) |
| `app/maintenance/scheduler.py` | **Yeni** — hata dirençli asyncio döngüsü (2 job) |
| `tests/test_sprint11.py` | **Yeni** — 14 test |
| `tests/{test_reports_platform,test_sprint9,test_sprint10}.py` | Email-logs zarf güncellemeleri |

**Frontend (`apps/web/`)**

| Dosya | Değişiklik |
|---|---|
| `src/app/(admin)/admin/settings/email-logs/page.tsx` | **Yeni** — operasyon sayfası (kartlar, filtreler, tekil+toplu resend, drawer linki) |
| `src/app/(admin)/admin/settings/audit-logs/page.tsx` | **Yeni** — filtreli tablo + before/after detay drawer'ı |
| `src/app/(admin)/admin/settings/page.tsx` | İki yeni ayar kartı (izin bazlı görünür) |
| `src/app/(admin)/admin/dashboard/page.tsx` | Plan uyarı banner'ı (report.view) |
| `src/app/(admin)/admin/series/page.tsx` | "Seriyi Onayla" aksiyonu + onay dialogu |
| `src/app/(admin)/admin/reports/page.tsx` | "Özet CSV" + "Randevu Detay CSV" butonları |
| `src/app/(platform)/platform/usage/page.tsx` | "Usage CSV indir" |
| `src/app/(platform)/platform/support/page.tsx` | **Yeni** — destek paneli (+nav linki) |
| `src/lib/api/{client,reports,appointments}.ts` | `downloadCsv`, sayfalı email-logs hook'ları, `useSeriesApprove`, plan warnings hook'u |
| `src/components/domain/notification-preferences.tsx` | Açıklama metinleri (polish) |

**Scripts/Docs**

| Dosya | Değişiklik |
|---|---|
| `scripts/backup_restore_smoke.sh` | **Yeni** — gerçek restore smoke (canlıda ✔) |
| `scripts/demo_smoke.py` | Email-logs zarf uyumu (18/18 korundu) |
| `docker-compose.yml` + `docker-compose.staging.yml` | `scheduler` servisi (entrypoint override; staging restart'lı) — `config` doğrulandı |
| `docs/PILOT_GO_LIVE_RUNBOOK.md`, `README.md` | Yeni ops araçları + checklist |

## 3. Email Logs Operations

- **Liste**: `GET /facilities/{fid}/email-logs` artık zarf döner —
  `status/provider/appointment_id/recipient_email (ilike)/template_key/
  date_from/date_to/has_error/limit/offset` filtreleri; `summary` stat
  kartları için **filtresiz tesis genelini** sayar (karar: kartlar genel
  resmi, tablo filtreli inceleme). Eski tüketiciler (drawer hook'u,
  demo_smoke, testler) güncellendi.
- **Bulk resend kararları (raporda istendi)**:
  - **Partial result** (tercih edildiği gibi): sent kayıtlar 409 yerine
    `skipped/ALREADY_SENT`, bulunamayanlar `skipped/NOT_FOUND`, hak
    aşımı `max_retries`, denenenler `sent`/`failed` — istek asla topluca
    patlamaz (testli).
  - Max 50 kayıt (422 `BULK_TOO_LARGE`).
  - **İzin kararı**: tekil resend `appt.view`'da kaldı; **toplu resend
    `user.manage`** — daha geniş etki, daha dar yetki (testli: rampa
    yöneticisi bulk'ta 403, tekilde 200). Supplier/platform hiçbirine
    erişemez.
  - Lifecycle TEKRAR ÇALIŞMAZ; audit `email.bulk_resend` + sayaçlar.
- **UI**: stat kartları (sent/failed/queued/skipped), filtreler, seçim
  kutuları yalnızca hakkı kalan failed kayıtlarda, "Toplu Tekrar Gönder
  (N)" yalnızca `user.manage` olana görünür, randevu linki drawer açar,
  sayfalama, boş/hata durumları.

## 4. Audit Logs UI

- **İzin kararı (raporda istendi)**: yeni **`audit.view`** tenant izni —
  sistem yöneticisinde var, izleyici/rampa yöneticisinde YOK (denetim izi
  güvenlik hassas). Supplier facility audit'ine hiç erişemez; platform da
  facility context'i olmadığı için erişemez. **Platform audit endpoint'i
  bilinçli ertelendi** (kabul kriterlerinde yok; platform aksiyonları zaten
  facility kayıtlarında görünmüyor — §15).
- **Data migration** (`aebbb08f3bd8`): mevcut kurulumların "Sistem
  Yoneticisi" rolü güncel `TenantPermission.ALL`'a eşitlenir, "Rampa / Depo
  Yoneticisi"ne `appt.create` eklenir — Sprint 10'daki "mevcut kurulumlarda
  rol eksik" bilinen sınırı da böylece kapandı. Downgrade eklenen izinleri
  geri çıkarır.
- **Maskeleme**: anahtar adında `password/token/secret/hash/authorization/
  jti` geçen değerler rekursif `***` olur (testli: `password_hash`,
  `refresh_token`, iç içe `api_secret` maskelendi, yanıtta ham değer yok);
  4000 karakteri aşan snapshot `{_truncated: true}` olarak kırpılır (testli).
- **PII kararı (raporda istendi)**: e-posta/telefon gibi operasyonel
  iletişim alanları tenant admin'e GÖSTERİLİR — kendi tesisinin verisidir ve
  destek işlemleri için gerekir; platforma hiçbir yoldan sızmaz.
- Yanıt: aktör adı (toplu sorguyla, N+1'siz), 30+ aksiyon için Türkçe özet
  eşlemesi, filtreler + sayfalama.
- **UI**: filtre çubuğu, tıklanabilir satırlar, detay drawer'ında
  Önce/Sonra/Ek Bilgi JSON blokları (katlanabilir), "bu ekran tesis içindeki
  yönetim işlemlerinin denetim izlerini gösterir" açıklaması.

## 5. Scheduler / Maintenance Automation

- **Tasarım kararı**: APScheduler/worker yerine **tek asyncio döngüsü**
  (`app/maintenance/scheduler.py`) — email retry (`LOGISLOT_EMAIL_RETRY_
  INTERVAL_SECONDS`=300) ve bildirim temizliği (`...CLEANUP_INTERVAL...`
  =86400, `RETENTION_DAYS`=90, okunmamışlara dokunmaz). Her iş try/except
  içinde: **hata döngüyü öldürmez** (unit test: hata fırlatan iş ≥2 kez
  denendi).
- **Compose**: `scheduler` servisi — API imajını kullanır ama
  **entrypoint override** ile kendi komutunu koşar (imaj entrypoint'i
  uvicorn başlattığı için; canlıda yakalanıp düzeltildi ve loglarla
  doğrulandı: iki job başladı). **Dev compose'ta AÇIK** (karar: pilotta
  otomasyon görünür olsun; `docker compose stop scheduler` ile kapatılır),
  staging'de `restart: unless-stopped` + production env.
- `LOGISLOT_SCHEDULER_ENABLED=false` ile devre dışı bırakılabilir.
  İzleme runbook'ta: `docker compose logs -f scheduler`.

## 6. Backup Restore Smoke

- `scripts/backup_restore_smoke.sh`: pg_dump → `CREATE DATABASE
  logislot_restore_smoke` → `pg_restore --no-owner --exit-on-error` →
  doğrulamalar (tablo>0, tenants>0, facilities>0, `alembic_version` dolu) →
  test DB drop. **Trap ile her çıkışta temizlik** (başarısızlıkta da);
  `RESTORE_DB` ana DB adına eşitse script reddeder — **ana veritabanına
  asla restore/drop yapılmaz**. `KEEP_DUMP=1` ile dump saklanır.
- Canlı koşum: 29 tablo, 1 tenant, 1 tesis, alembic `aebbb08f3bd8` ✔.
  Eski `backup_smoke.sh` (okunabilirlik) korunuyor; CI'ya alınmadı (compose
  PG'si gerektirir; local/staging checklist'ine eklendi).

## 7. Plan Warning Banner

- `GET /facilities/{fid}/plan/warnings` — **`report.view`** (karar: rampa
  yöneticisi de görür; izleyici de report.view'lı olduğundan görür — salt
  bilgilendirme olduğu için kabul edilebilir). Effective plan = facility
  override || tenant planı; plan yoksa boş yanıt. Eşikler platformla ortak
  (`plan_warnings.py`). Mesajda açıkça: "bilgilendirme amaçlıdır; randevu
  oluşturmayı engellemez" — testle de doğrulandı (kota %100+ iken randevu
  oluşturma 200).
- **UI**: dashboard'un en üstünde en yüksek severity'li uyarı + "+N uyarı
  daha"; uyarı yoksa banner render edilmez. Supplier/platform erişemez.

## 8. Series Bulk Approve

- `POST /facilities/{fid}/appointment-series/{id}/approve`
  (`appt.approve`); scope MVP'de **`revision_pending_future_only`** —
  **pending occurrence'lar bilinçli dahil edilmedi** (normal tekil onay
  akışının konusu; bulk onay revize akışının devamı olarak tasarlandı).
- **Onay anında yeniden çakışma kontrolü** (tercih edildiği gibi): revize
  ile onay arasında slot geçersizleşmiş olabilir — her occurrence kendi
  günü için kural setinden geçer (kendisi hariç); biri uygun değilse 422
  `SERIES_APPROVE_OCCURRENCE_FAILED` + `{occurrence_index, occurrence_date,
  code}` ve **hiçbiri onaylanmaz** (testli: rampa pasifleştirilince tümü
  revision_pending kaldı).
- completed/rejected/cancelled dokunulmaz; occurrence başına
  `appointment.approve` audit'i (`series_bulk: true`) + seri düzeyinde
  `appointment_series.approve` + `affected_count`.
- Tedarikçiye TEK özet bildirim + TEK e-posta (bildirim tercihleri seri
  e-postalarına da uygulanır); rampa scope'u all-or-nothing.
- **UI**: Seriler sayfasında revision_pending sayacı olan aktif serilerde
  "Seriyi Onayla" + onay dialogu (kaç randevu, çakışma yeniden kontrol
  uyarısı); başarıda seri/liste/takvim/dashboard invalidation.

## 9. Reports Export

- **`/reports/summary.csv`**: bölümlü CSV (TOPLAMLAR, GÜNLÜK TREND,
  KATEGORİYE/RAMPAYA/TEDARİKÇİYE GÖRE) — summary endpoint'inin **aynı
  fonksiyonunu** çağırır: hesap ve rampa scope'u birebir aynı (drift yok).
- **`/reports/appointments.csv`**: satır bazlı detay (tarih, saat,
  tedarikçi, ürün, kategori, rampa, durum, teslimat tipi, süre,
  oluşturulma, onaylanma — onaylanma audit izinden). **PII kararı**:
  plaka/sürücü/iletişim alanları **export edilmez** (dosya tesisten dışarı
  çıkabilir; MVP'de güvenli taraf seçildi, testle sabitlendi). Rampa
  yöneticisi scope'u uygulanır; `report.view` gerekir; supplier/platform
  403.
- **`/platform/usage.csv`**: tenant + tesis kullanım bölümleri; PII yasak-
  kelime testli; tenant admin 403.
- CSV'ler Excel uyumu için UTF-8 BOM'lu, `Content-Disposition: attachment`.
- **UI**: Raporlar sayfasında iki indirme butonu (seçili tarih aralığıyla),
  platform Kullanım'da "Usage CSV indir" — `downloadCsv` helper'ı token'lı
  fetch + blob indirme yapar (Authorization header'ı tarayıcı linkiyle
  gönderilemeyeceği için).

## 10. Pilot Support Dashboard

- `GET /platform/support/health` (`platform.analytics.view`): failed
  e-posta, zamanı gelmiş retry, okunmamış kritik (severity=error) bildirim,
  pending/revision_pending randevu, tenant/aktif tesis sayısı ve plan uyarı
  sayısı — hepsi **sayaç/agregat, PII yok** (testli yasak-kelime taraması;
  tenant admin 403).
- "Son smoke koşusu" ve "scheduler status" gösterilmiyor — kayıt altına
  alınmıyorlar; uydurma değer göstermek yerine kapsam dışı bırakıldı (§15).
- **UI**: `/platform/support` — pozitifken kırmızıya dönen sayaç kartları,
  ipucu metinleri, kullanım/tenant ekranlarına linkler; 60 sn'de bir
  otomatik yenileme; nav'da "Destek".

## 11. RBAC / Security / Scope

- `audit.view`: yeni izin yalnızca sistem yöneticisinde (data migration
  mevcut kurulumları da düzeltir); izleyici 403 testli.
- Bulk resend `user.manage`; tekil resend `appt.view` (karar §3); her ikisi
  facility-scoped, supplier/platform erişemez.
- Audit maskeleme servis katmanında — hiçbir snapshot ham `password_hash`/
  token değeri döndüremez; yanıt metninde ham değer olmadığı test edildi.
- CSV'ler: rampa scope'u summary ile aynı kod yolundan; PII bilinçli dışarıda.
- Seri onayı `appt.approve` + rampa scope all-or-nothing; onay anı yeniden
  doğrulama ile "eski onay bilgisiyle çakışan slot" riski kapatıldı.
- Support/health ve usage.csv yalnızca platform analytics izniyle; agregat.

## 12. Test Sonuçları

Komutlar:

```bash
cd apps/api && .venv/bin/python -m pytest -q      # 173 passed
.venv/bin/ruff check app tests                     # temiz
cd apps/web && npx tsc --noEmit && npm run lint    # temiz
npm run build:web                                  # başarılı
docker compose up -d --build && docker compose exec api alembic upgrade head  # aebbb08f3bd8 (head)
python3 scripts/demo_smoke.py                      # 18/18
npx playwright test                                # 7 passed
./scripts/backup_smoke.sh                          # ✔
./scripts/backup_restore_smoke.sh                  # ✔ (29 tablo, alembic head)
docker compose config --quiet                      # scheduler dahil gecerli
```

Yeni `tests/test_sprint11.py` (14 test): email logs filtreleri + summary +
sayfalama; bulk resend partial result (sent→skipped, fake→NOT_FOUND, 51
kayıt→422); bulk izin ayrımı (dock manager bulk 403 / tekil 200); audit
filtreleri + aktör adı + before snapshot; maskeleme (3 hassas alan + iç içe)
ve kırpma; audit izin (izleyici 403, supplier engelli); facility plan
uyarısı (effective plan, critical, "engellemez" + randevu 200, supplier
403); seri toplu onay (3 onay + tek bildirim + 409 tekrar); onay çakışması
all-or-nothing (rampa pasifleşti → tümü revision_pending); onay izni; rapor
CSV'leri (içerik + PII'siz başlık + izleyici 200 + supplier 403); platform
CSV PII taraması + tenant 403; support health (anahtarlar + sayaç + PII +
403); scheduler döngü direnci. Ayrıca canlı spot-check: audit 94 kayıt,
email-logs zarfı, plan/warnings, support/health.

## 13. Docker / Local / Staging Çalıştırma

Compose'a `scheduler` servisi eklendi (API imajı + entrypoint override —
imajın kendi entrypoint'i uvicorn başlattığından canlıda yakalanıp
düzeltildi). Dev'de açık; staging overlay'inde restart policy + production
env. Stack yeniden build edildi, migration konteynerde koşuldu
(`aebbb08f3bd8`), scheduler logları iki job'ın başladığını gösteriyor.
Staging compose `config` doğrulaması geçti.

## 14. Demo Akışları

- **Email logs**: Yönetim → E-posta Logları → "Başarısız" filtresi →
  kayıtları seç → "Toplu Tekrar Gönder" → özet flash (X gönderildi/atlandı);
  tek kayıtta "Tekrar Gönder"; randevu ikonu drawer açar.
- **Audit logs**: Yönetim → Denetim İzleri → aksiyon filtresi
  `appointment.approve` → satıra tıkla → detayda Önce/Sonra JSON'u
  (parola alanları `***`).
- **Scheduler**: `docker compose logs -f scheduler` → 5 dk'da bir retry
  taraması; SMTP bozukken failed biriken e-postalar düzelince otomatik gider.
- **Restore smoke**: `./scripts/backup_restore_smoke.sh` → geçici DB'ye
  gerçek restore + doğrulama + temizlik.
- **Plan warning**: Platform → Planlar'da kotayı düşür → tenant admin
  dashboard'ında renkli banner; randevu oluşturma çalışmaya devam eder.
- **Series approve**: Seriler → revize bekleyen seri → "Seriyi Onayla" →
  "2 randevu onaylandı"; rampa bu arada kapatıldıysa hangi occurrence'ın
  neden düştüğü gösterilir ve hiçbiri onaylanmaz.
- **Exports**: Raporlar → "Özet CSV"/"Randevu Detay CSV"; Platform →
  Kullanım → "Usage CSV indir".
- **Support**: Platform → Destek → sayaçlar + linkler; failed e-posta
  varsa kırmızı.

## 15. Bilinen Eksikler / Bilinçli Ertelemeler

- **Platform audit endpoint'i yok** (facility audit tam; platform
  aksiyonlarının ayrı görünümü sonraki ihtiyaçta — `GET /platform/audit-logs`
  + `tenant.manage/analytics` ayrımıyla eklenir).
- Audit `search` yalnızca aksiyon/varlık tipinde arar (snapshot içi arama
  yok — maliyetli).
- Email logs sayfasında tarih aralığı filtresi UI'da yok (API destekliyor).
- Scheduler tek instance varsayar (yatay ölçekte çift koşum kilidi yok);
  healthcheck eklenmedi (loglarla izlenir).
- Support panelinde "son smoke koşusu" ve "scheduler durumu" gösterilmiyor
  (kayıt altına alınmıyor; uydurma göstermek yerine kapsam dışı).
- Randevu detay CSV'sinde plaka/sürücü bilinçli yok (PII kararı §9);
  ihtiyaç olursa ayrı izinle açılır.
- Restore smoke CI'da koşmuyor (compose PG gerektirir; local/staging
  checklist'inde).
- Tenant plan banner'ı izleyiciye de görünür (report.view) — salt
  bilgilendirme olduğu için kabul edildi.

## 16. Sonraki Önerilen Sprint

**Pilot canlı + geri bildirim sprinti**: pilot müşteriyle gerçek veri
üzerinde kullanım; platform audit görünümü; email logs'a tarih filtresi UI +
şablon filtresi; scheduler healthcheck + çoklu-instance kilidi; takvimde
sürükle-bırak revize; supplier tarafına seri iptal/görünüm iyileştirmeleri;
otomatik günlük yedek cron'u + restore smoke'un staging'de zamanlanması;
pilot metrik raporu (kullanım verisiyle v2.0 hedeflerinin doğrulanması).
