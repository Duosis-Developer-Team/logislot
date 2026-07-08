# Sprint 6 Raporu — Reports & Platform Usage

Tarih: 8 Temmuz 2026

## 1. Özet

Ürünün "iş değeri" ekranları gerçek veriye bağlandı. Admin raporlar sayfası
mock'tan çıktı: tarih aralığı filtreli operasyon raporu (statü/kategori/rampa/
tedarikçi dağılımları, günlük trend, tamamlanma-red-iptal-kargo oranları,
audit-tabanlı onay SLA'sı ve otomatik/manuel onay ayrımı). Platform paneli
vendor paneline dönüştü: tenant/facility bazlı gerçek kullanım & sağlık
metrikleri (PII'siz), plan CRUD'u ve tenant plan ataması + facility override
MVP'si — plan **politika kabı olarak kaldı**, fatura hesaplanmıyor. E-posta
soyutlaması kuruldu: `EmailProvider` arayüzü + `LogOnlyEmailProvider` (gerçek
SMTP yok), lifecycle tetikleri (revize → **hem tedarikçi hem ilgili ekip** —
v1.0 saha davranışı) ve drawer'da görünen EmailLog kayıtları. Backend 100/100
test, frontend 27/27 route build + lint temiz, canlı smoke başarılı.

## 2. Değişen/Oluşturulan Dosyalar

Backend:
- `app/models/email_log.py` (yeni) + `alembic/versions/b8968a9b0efc_email_logs.py` (up/down doğrulandı)
- `app/services/email.py` (yeni) — EmailMessage/EmailProvider/LogOnlyEmailProvider + `send_email` (provider hatası akışı bozmaz → failed kaydı)
- `app/core/config.py` — `LOGISLOT_EMAIL_PROVIDER` ayarı (varsayılan log_only)
- `app/services/notifications.py` — e-posta tetikleri eklendi (approve/reject/cancel→tedarikçi; revise→tedarikçi+ekip)
- `app/routers/reports.py` (yeni) — `GET /facilities/{fid}/reports/summary`
- `app/routers/notifications.py` — `GET /facilities/{fid}/email-logs`
- `app/routers/platform.py` — usage derinleştirme (aralık+rollup+plan+SLA+last_activity), plan GET/{id}+PATCH audit'li+DELETE(retire), `POST /tenants/{id}/plan-assignment` + `POST /facilities/{id}/plan-assignment`
- `app/seed.py` — Starter/Professional planları (BTA→Professional), geçmiş 2 haftaya yayılmış 11 tarihsel randevu (completed/rejected/cancelled + tamamlanmış kargo), rampa yöneticisi rolüne `report.view`
- `tests/test_reports_platform.py` (yeni, 11 test)

Frontend:
- `src/lib/api/reports.ts` (yeni) — rapor + email-log hook'ları; `src/lib/api/platform.ts` (yeni) — usage/tenants/facilities/plans + atama mutasyonları
- `src/app/(admin)/admin/reports/page.tsx` — tamamen gerçek: preset (7g/30g/bu ay) + özel aralık, 6 stat kartı, günlük trend (CSS bar, kargo günleri turuncu), durum/kategori/rampa bar dağılımları, tedarikçi tablosu, scope notu
- `src/app/(platform)/platform/usage/page.tsx` — gerçek: 7 global kart + tenant/facility tabloları (plan, override rozeti, son aktivite, SLA) + **Plan Ata / Override Ata** diyalogları
- `src/app/(platform)/platform/plans/page.tsx` — gerçek CRUD: drawer'da ad/kapsam/birim/durum + boyut chip'leri + doğrulamalı rate-card JSON editörü + "fatura hesaplamaz" açıklaması + Emekliye Ayır
- `src/app/(platform)/platform/{tenants,facilities}/page.tsx` — gerçek listeler
- `src/components/appointments/appointment-drawer.tsx` — "E-posta Logları" bölümü

Docs: `docs/SPRINT_6_REPORT.md`, README.

## 3. Admin Reports Teslimatları

Kararlar (net): varsayılan aralık **son 30 gün**; `date_to` **dahil**; maksimum
aralık **180 gün** (aşımı 422 `RANGE_TOO_LARGE`); aralık `scheduled_start_at`'e
göre facility timezone'unda. İçerik: totals (statü sayıları + kargo +
auto/manual), rates (tamamlanma/red/iptal/kargo), **approval SLA** (audit
izlerinden create→ilk karar dakikaları: ortalama+medyan; 2s/24s'ten eski
bekleyenler), by_status/by_category/by_dock/by_supplier/daily_trend.
Utilization: iptal/red hariç, `revision_pending` dahil (zamanı işgal eder);
kapasite override'lı çalışma pencerelerinden. Rampa yöneticisi scope'u:
yalnız atanmış rampaların randevuları + `scope.restricted=true` (UI'da
"Yalnızca yetkili rampalarınız gösteriliyor"). Bilinen sınır (raporlanır):
auto/manual ve SLA audit-tabanlıdır; doğrudan seed edilen tarihsel kayıtların
audit'i olmadığından manuel sayılırlar — canlı akış doğru ölçülür.

## 4. Platform Usage Teslimatları

`GET /platform/usage?date_from&date_to` (varsayılan son 30 gün; aralık
`created_at`'e göre): global totals (tenants/facilities/active_facilities/
appointments_created/completed/active_docks/suppliers/users — **Plan
measurable_dimensions ile aynı sözlük**), tenant_usage (plan adı, facility
sayısı, randevu, SLA ortalaması, son aktivite) ve facility_usage (etkin plan =
override || tenant planı, `plan_is_override` bayrağı, aktif kullanıcı). PII
koruması testli: response'ta plaka/sürücü/iletişim/ürün adı alanları YOK;
platform user operasyonel endpoint'lerde hâlâ 403. Erişim `platform.analytics.view`;
görüntüleme audit'lenir.

## 5. Platform Plans / Assignment Teslimatları

Plan CRUD tam: create (draft varsayılan), detail, patch, DELETE = **retire**
(soft; mevcut atamalar bozulmaz). Atama kararı (net): **yalnızca `active` plan
atanabilir** — draft ve retired 409 `PLAN_NOT_ASSIGNABLE`. Tenant ataması
`tenant.assigned_plan_id`, facility override `facility.plan_override_id`
üzerinde tutulur (ayrı atama-geçmişi tablosu YOK — MVP kararı, audit
before/after ile geçmiş izlenebilir). Tüm plan olayları audit'li
(create/update/retire/assign_tenant/assign_facility_override). UI: plans
sayfasında politika-kabı açıklaması + rate-card JSON editörü (parse
doğrulamalı); usage tablolarından "Plan Ata"/"Override Ata" diyalogları
(yalnız aktif planlar listelenir); atama sonrası tablolar refetch.

## 6. Email Abstraction / Email Logs

`EmailProvider` protokolü + `LogOnlyEmailProvider`: **gerçek e-posta
gönderilmez**; mesaj uygulama loguna düşer ve `email_logs` tablosuna
`sent/log_only` yazılır (provider hatasında `failed` + error_message — akış
bozulmaz). Provider `LOGISLOT_EMAIL_PROVIDER` ile değiştirilebilir; çağıran
kod değişmez. Tetikler: approve/reject/cancel(admin) → tedarikçi e-postası;
**revise → tedarikçi + ilgili ekip** (scope'lu admin alıcıları — v1.0 "saat
değişikliğinde ilgili ekibe otomatik e-posta" davranışı). `GET
/facilities/{fid}/email-logs?appointment_id=` (appt.view). Drawer'da "E-posta
Logları" bölümü: konu, alıcı, template, durum, `provider: log_only`, zaman.
Canlı doğrulama: revize → 3 kayıt (tedarikçi + sysadmin + rampa yöneticisi).

## 7. RBAC / Scope

Raporlar: `report.view` (rampa yöneticisi rolüne eklendi) + dock scope;
supplier/platform/yabancı-tenant 403 (testli). Platform usage/plans: yalnız
platform izinleri; tenant admin 403. Email logs: facility scope + appt.view;
supplier ve platform 403. Plan atama yalnız `platform.plan.assign`.

## 8. Test Sonuçları

Komutlar:
```bash
cd apps/api && .venv/bin/python -m pytest   # 100 passed
.venv/bin/ruff check app tests              # All checks passed
npm run build -w @logislot/web              # 27/27 route
npm run lint -w @logislot/web               # No warnings or errors
```
Yeni testler (11): rapor şekli+sayımlar (tarihsel seed'le), 180 gün limiti 422 +
ters aralık 422 + tek-gün aralığı, canlı SLA/auto-approved akışı, dock-manager
scope (yalnız R2) + supplier/platform 403; platform usage totals/rollup/plan
adı + PII-yok assertion'ı + izin testleri; plan CRUD + draft/retired atama
reddi + tenant/facility atama + override'ın usage'a yansıması + 5 audit olayı;
revize e-postaları (tedarikçi+ekip, log_only, sent_at) + approve/reject/cancel
e-postaları + email-log izolasyonu. Canlı smoke: rapor özetleri, platform
usage, plan override ataması, revize→3 e-posta kaydı.

## 9. Docker / Local Çalıştırma

`docker compose up --build` → web :3010 · api :8010 · db :5433. Yeni migration
+ seed otomatik; üç servis ayakta; /admin/reports, /platform/usage,
/platform/plans 200.

## 10. Demo Akışları

Reports: admin → Raporlar → "Son 30 gün" — 13 randevu, %54 tamamlanma, kargo
oranı, günlük trend çubukları (kargo günü turuncu), rampa yoğunluğu barları,
tedarikçi tablosu → "Son 7 gün" preset'iyle anında daralma. Rampa yöneticisi
girişinde "Yalnızca yetkili rampalarınız gösteriliyor" notu.

Platform usage: `admin@logislot.com` → Kullanım & Sağlık — global kartlar +
BTA satırı (Professional, son aktivite); tarih aralığını değiştir → refetch.

Plan assignment: Planlar → "Yeni Plan" (Enterprise, draft) → düzenle → active →
Kullanım sayfasında tenant satırında "Plan Ata" → Enterprise; tesis satırında
"Override Ata" → Starter → tabloda "Starter override" rozeti. Draft/retired
plan listede atanamaz.

Email logs: takvimden "Donuk Pasta Bazi" → Revize Et (09:00, otomatik rampa)
→ drawer'da E-posta Logları: `appointment_revised` → tedarikçi,
`appointment_revised_team` → admin@ + rampa@ (hepsi `sent · log_only`).

## 11. Bilinen Eksikler / Bilinçli Ertelemeler

1. SLA/auto-approved metrikleri audit-tabanlı: doğrudan seed edilen geçmiş
   kayıtlar manuel sayılır (canlı akış doğru).
2. Plan atama-geçmişi tablosu yok (audit before/after yeterli — MVP kararı).
3. Rate-card yapılandırılmış editör yerine doğrulamalı JSON textarea (UI'da
   politika-kabı açıklamasıyla).
4. Genel "Email Logs" sayfası yok — drawer içi görünüm (endpoint tüm listeyi
   destekliyor; sayfa gerekirse trivial).
5. Supplier'a giden e-postalarda gerçek şablon motoru yok (düz metin gövde).
6. Rapor grafikleri CSS/SVG bar (bilinçli — chart kütüphanesi eklenmedi).
7. Platform tenant/facility create-edit UI'ı yok (endpoint'ler Sprint 1'den
   hazır; vendor onboarding UI'ı Sprint 8+).
8. Playwright yok; akışlar canlı smoke + API testleri + demo adımlarıyla doğrulandı.

## 12. Sonraki Önerilen Sprint

**Sprint 7 — White-label & Polish & QA (roadmap Sprint 8 öne çekilmiş):**
branding ayarları ekranı (logo/renk tokenları — tema altyapısı hazır),
konfigürasyon UI tutarlılık turu, responsive QA (360px supplier / 1440px
admin), güvenlik sertleştirme (rate limit, refresh rotation), bildirim saklama
politikası ve uçtan uca demo senaryosunun (TEST_STRATEGY §E2E) tek koşuluk
smoke script'i.
