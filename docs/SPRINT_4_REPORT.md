# Sprint 4 Raporu — Yönetim Takvimi & Appointment Operations

Tarih: 8 Temmuz 2026

## 1. Özet

Yönetim tarafındaki operasyon ekranları mock'tan tamamen çıktı: dashboard gerçek
özet metriklerine, günlük takvim gerçek rampa×saat verisine bağlı. Takvim, randevu
listesi ve dashboard artık **ortak randevu detay/aksiyon drawer'ını** kullanıyor;
onay/red/revize/tamamla/iptal UI'dan çalışıyor ve backend'in status+izin+rampa-scope
birleşimi olan `allowed_actions` haritasına göre görünüyor. Revize akışı tam:
yeni tarih/saat/süre + rampa seçimi veya otomatik atama + not; hedef aralık
sunucuda kilit altında yeniden doğrulanıyor ve revizyon geçmişi supplier portalda
görünüyor. En kritik teslimat: **create/revise artık transaction-safe** —
PostgreSQL advisory lock + son-an availability yeniden değerlendirmesi; canlı
Postgres'e karşı 10 paralel özdeş istekten tam 1'i başarılı oldu (çifte
rezervasyon yok). Backend 79/79 test, frontend 27 route build + lint temiz.

## 2. Değişen/Oluşturulan Dosyalar

Backend:
- `app/models/appointment.py` — `cancellation_reason`, `completion_note` + `(facility_id, status, scheduled_start_at)` bileşik indeksi
- `alembic/versions/bb13e084becc_appointment_ops_fields_and_index.py` (up/down doğrulandı)
- `app/services/appointments.py` — `acquire_facility_lock` (pg advisory xact lock; SQLite'ta no-op), create kilit altında; revise yeniden yazıldı (taze rule context, kendisi hariç çakışma, rampa uyumu, `auto_assign_dock`, hedef rampa scope, `SLOT_NO_LONGER_AVAILABLE`); complete `note`, cancel `reason`
- `app/routers/appointments.py` — `GET /calendar/day`, `dashboard-summary` genişletmesi (10 metrik + upcoming/pending ilk 5), detayda `allowed_actions` + `supplier_contact`, revise/complete/cancel gövdeleri
- `app/schemas/appointment.py` — ReviseRequest(`auto_assign_dock`), CompleteRequest, CancelRequest; Out'a yeni alanlar
- `app/seed.py` — revizyon geçmişli `revision_pending` randevu örneği
- `tests/test_calendar_ops.py` (yeni, 11 test)

Frontend:
- `src/components/appointments/appointment-drawer.tsx` (yeni) — ortak detay/aksiyon drawer'ı (revize formu dahil)
- `src/lib/api/appointments.ts` — calendar/dashboard/detail hook'ları + revise; mutasyonda randevu+takvim+dashboard+detay invalidation
- `src/lib/api/types.ts` — CalendarDayDto, DashboardSummaryDto, AllowedActions…
- `src/lib/utils.ts` — timezone yardımcıları (`timeInTz`, `minutesOfDayInTz`, `isoFromWallClock`)
- `src/app/(admin)/admin/dashboard/page.tsx` — gerçek API (7 stat kartı + iki liste + drawer)
- `src/app/(admin)/admin/calendar/page.tsx` — gerçek API (grid, pencere-dışı gölgeleme, closed-override blokları, kargo advisory şeridi, lejant, drawer)
- `src/app/(admin)/admin/appointments/page.tsx` — satır tıklama → drawer; hızlı Onayla/Reddet korundu
- `src/app/(supplier)/supplier/appointments/page.tsx` — revize metni netleştirildi ("Tesis yönetimi yeni saat önerdi") + iptal sebebi gösterimi

Docs: `docs/SPRINT_4_REPORT.md`, README.

## 3. Backend Teslimatları

- **`GET /facilities/{fid}/calendar/day?date=`** (appt.view): facility+tz,
  `working_window` (açık rampaların min-max penceresi, 30 dk slot), rampalar
  (o günkü pencere; closed override'da `null`), isim zenginleştirmeli randevular
  (+`has_cargo_warning`+`allowed_actions`), `cargo_advisories`, `blocked_slots`
  (closed override + normal pencere + not). N+1 yok: rampalar/override'lar/
  randevular/isim haritaları toplam 7 sabit sorgu.
- **Dashboard-summary**: bugün/bekleyen/bugün-onaylı/bugün-tamamlanan/hafta/
  aktif tedarikçi/aktif rampa/kargo-uyarılı + isimli `upcoming` ve `pending_list`
  (5'er). Tesis timezone'una göre gün sınırları. İzin: `appt.view` (rampa
  yöneticisi de kullanır; rapor metrikleri ayrı `report.view` ekranında kalacak).
- **Detay**: `allowed_actions` (status × izin × rampa scope) + `supplier_contact`.
- **Lifecycle gövdeleri**: reject `reason` zorunlu (mevcut); complete `note`
  opsiyonel → `completion_note`; cancel `reason` opsiyonel → `cancellation_reason`;
  revise `note` **opsiyonel** (v1.0 "not ekleyebilir" davranışı korundu).
- **İndeks**: `(facility_id, status, scheduled_start_at)` eklendi (dashboard/liste
  status filtreleri için); Sprint 1'den kalan `(facility_id, start)` ve
  `(dock_id, start)` indeksleri takvim sorgularını karşılıyor.

## 4. Yönetim Dashboard Teslimatları

7 stat kartı (kargo uyarılı ayrı vurgulu), Onay Bekleyen ve Yaklaşan listeleri
(saat facility tz'siyle), satıra tıklayınca ortak drawer, loading/error/empty
state'ler, facility switcher değişince otomatik refetch (query key'ler facility
bazlı), mutasyon sonrası dashboard invalidation.

## 5. Yönetim Takvimi Teslimatları

Tarih seçici + önceki/bugün/sonraki; rampa sütunları sticky başlıkta o günün
penceresi ve kargo/kapalı ikonları; saat cetveli `working_window`'dan üretilir
(extra_hours pazar penceresi 09-13 doğru yansır — testli); randevu blokları
facility timezone'una göre konumlanır; **statü rengi ana sinyal, kargo çizgili
overlay + 📦 rozet ikinci sinyal** (statüyü değiştirmez); pencere dışı saatler
gölgeli, closed override kesikli "Kapalı" bloğu (sebep tooltip'te); kargo
advisory şeridi gün başında; blok tıklayınca drawer; lejant statüler + kargo +
kapalı; boş gün empty state; gün değişimi ve her mutasyonda refetch; yatay
scroll ile mobil kullanılabilir.

## 6. Appointment Drawer / Lifecycle Aksiyonları

Takvim + liste + dashboard aynı `AppointmentDrawer`'ı kullanır: başlık
(tedarikçi+ürün), StatusBadge + CargoBadge, bilgi ızgarası (tarih/saat/rampa/
kategori/miktar/araç/plaka/sürücü/tedarikçi telefonu), kargo bilgilendirme
şeridi ("varışta mevcut Revize Et akışı — yeni statü yok"), red/iptal/tamamlama
notları, revizyon geçmişi (eski→yeni + not). Aksiyonlar `allowed_actions`'a göre:
Onayla (onay diyaloğu), Reddet (sebep zorunlu), Tamamla (opsiyonel not), İptal
(opsiyonel sebep), Revize. Hepsinde loading state, Türkçe API hatası, başarıda
drawer kapanır + tüm ilgili query'ler invalidate olur.

## 7. Revize Akışı ve Revision History

Form: yeni tarih + başlangıç + süre + rampa ("Otomatik ata" varsayılan seçenek)
+ not; orijinal talep referans olarak gösterilir. Gönderim öncesi uygunluk
**backend'de** kilit altında doğrulanır: seçili rampa uyumsuzsa
`NO_COMPATIBLE_DOCK`, aralık doluysa `DOCK_TIME_CONFLICT`/
`DOCK_CONFLICT_GROUP_BLOCKED`, otomatik atamada hiç aday kalmadıysa
`SLOT_NO_LONGER_AVAILABLE` — hata formda gösterilir, kaydolmaz. **Lifecycle
kararı (net):** revize her zaman `revision_pending` üretir (v2.0: tedarikçinin
görüşü beklenir); operasyonel düzeltmelerde admin ardından tek tıkla onaylar
(approve `revision_pending`den de çalışır — MVP'de tek akış). Revizyon geçmişi
DB'de (`appointment_revisions`); supplier portal kartında "Tesis yönetimi yeni
saat önerdi: eski → yeni + not" olarak görünür (supplier kabul/ret akışı yok —
bilgi amaçlı, metin buna göre).

## 8. Concurrency / Transaction Safety

Yaklaşım: `pg_advisory_xact_lock(hashtext('logislot:appt:{facility_id}'))` —
facility bazlı, transaction-scoped (commit/rollback'te otomatik bırakılır,
timeout yönetimi gerekmez); create ve revise akışlarının başında alınır, ardından
availability **kilit altında** taze verilerle yeniden değerlendirilir. Kapsam
bilinçli olarak facility (dock değil): çakışma grupları kardeş rampaları
etkilediği için dock-level kilit yetersizdi; farklı facility'ler birbirini
bloklamaz. Exclusion constraint tek başına yeterli olmazdı (conditional conflict
group mantığı SQL'e sığmıyor) — raporlandı. SQLite (test) ortamında no-op;
sıralı çifte-rezervasyon testi pytest'te, **gerçek paralellik canlı Postgres'e
karşı doğrulandı: 10 eşzamanlı özdeş create → tam 1 başarılı, 9 ×
`DOCK_TIME_CONFLICT`.**

## 9. RBAC ve Rampa Scope

UX kararı (raporlanır): **takvimde rampa yöneticisi yalnızca atanmış rampalarını
görür**; sistem yöneticisi ve izleyici tümünü görür. Aksiyon katmanı: kaynak
rampa `_check_dock_scope` ile, **revize hedef rampası** `allowed_dock_ids` ile
denetlenir (yetkisiz hedefe taşıma 403; auto_assign yalnız scope içindeki
rampalardan seçer). `allowed_actions` da scope'u içerdiğinden butonlar hiç
görünmez. Testli: R1'e atanmış yönetici takvimde yalnız R1 görür, R2
randevusunu onaylayamaz, R2'ye revize edemez.

## 10. Test Sonuçları

Komutlar:
```bash
cd apps/api && .venv/bin/python -m pytest   # 79 passed
.venv/bin/ruff check app tests              # All checks passed
npm run build -w @logislot/web              # 27/27 route
npm run lint -w @logislot/web               # No warnings or errors
```
Yeni testler (11): dashboard metrik seti + izin (izleyici 200 / tedarikçi 403);
calendar day (rampa+randevu+advisory+allowed_actions), closed override
blocked_slot + pencere null, extra_hours pazar penceresi, facility izolasyonu
403; detay allowed_actions (pending admin=4 aksiyon, completed=0, izleyici=0) +
supplier_contact; complete note + cancel reason; revize: dolu aralık 422,
uyumsuz rampa `NO_COMPATIBLE_DOCK`, auto_assign R2'ye taşır + geçmiş yazılır +
supplier görür + sonrasında approve; tüm adaylar dolu → `SLOT_NO_LONGER_AVAILABLE`;
rampa scope üçlüsü; sıralı çifte rezervasyon 422. Canlı: paralel concurrency
smoke (bölüm 8) + dashboard/calendar smoke çıktıları.

## 11. Docker / Local Çalıştırma

`docker compose up --build` → web :3010 · api :8010 · db :5433. Migration + seed
otomatik. Üç servis ayakta; /admin/dashboard, /admin/calendar, /admin/appointments 200.

## 12. Demo Akışları

Dashboard: admin girişi → Genel Bakış — 7 gerçek metrik; "Onay Bekleyen"den bir
talebe tıkla → drawer'dan Onayla → kartlar ve listeler anında güncellenir.

Takvim: Takvim sekmesi → bugün/yarın gezin → yarında kargo advisory şeridi +
R3'te çizgili kargo bloğu + R2'de mor "Revize Bekliyor" bloğu; +3 günde R3
"Planlı bakım" kapalı bloğu; pazar gününde yalnız R1 09-13 açık (extra hours).

Randevu aksiyonları: takvimde pending bloğa tıkla → Onayla/Reddet (sebep
zorunlu)/Tamamla (not)/İptal (sebep) → başarı mesajı + takvim/dashboard/liste
otomatik tazelenir.

Revize: "Sut Kremasi" (revision_pending) bloğu → geçmişte 15:00→16:00 kaydı
görünür → Revize Et → saat değiştir + "Otomatik ata" → kaydet → yeni geçmiş
satırı; tedarikçi portalında (tedarikci@marmarasoguk.com) kartta "Tesis yönetimi
yeni saat önerdi" kutusu.

Concurrency doğrulama: rapor bölüm 8'deki python smoke'u — `10 paralel istek →
başarılı: 1, reddedilen: 9 (DOCK_TIME_CONFLICT)`.

## 13. Bilinen Eksikler / Bilinçli Ertelemeler

1. Haftalık takvim görünümü yok (günlük tam); Sprint 6 kapsamında.
2. Revize formunda canlı availability önizlemesi yok — doğrulama sunucuda anlık
   yapılıyor ve hata net gösteriliyor; slot-önizleme UI'ı sonraki iterasyon.
3. Bildirim zili paneli hâlâ statik (endpoint hazır); Sprint 6.
4. Raporlar sayfası mock (Sprint 7 kapsamı).
5. Kilit facility-genelinde: çok yüksek eşzamanlılıkta aynı tesiste yazmalar
   serialize olur — MVP için doğru ödünleşim; ileride dock+gün granülerliği
   değerlendirilebilir.
6. `revision_pending` randevular takvimde zamanı işgal etmeye devam eder
   (blocking status) — bilinçli: önerilen yeni aralık rezerve tutulur.
7. Playwright yok; UI akışları canlı smoke + API testleri + demo adımlarıyla
   doğrulandı.

## 14. Sonraki Önerilen Sprint

**Sprint 5 — Conflict Groups & Cargo Advisory derinleştirme + Bildirimler:**
roadmap'e göre kalan parçalar — bildirim panelinin gerçek `/notifications`
akışına bağlanması (randevuya gitme dahil), supplier wizard'da availability
uyarılarının zenginleştirilmesi, haftalık takvim özeti ve kargo-uyarılı slota
standart randevu koyarken engellemeyen onay diyaloğu (v2.0 "değerlendirilebilir"
notu). Alternatif: Sprint 7'nin raporlar bölümünü öne almak.
