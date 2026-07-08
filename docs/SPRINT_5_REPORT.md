# Sprint 5 Raporu — Notifications & Cargo Advisory

Tarih: 8 Temmuz 2026

## 1. Özet

Bildirim sistemi mock'tan gerçek ürün akışına dönüştü: bildirimler artık **alıcı
başına satır** olarak üretiliyor (kişisel okundu durumu + rampa scope hedefleme),
tüm randevu lifecycle olayları doğru alıcılara doğru severity ile bildirim
üretiyor, admin üst barındaki zil gerçek okunmamış sayıyı gösteriyor ve bildirime
tıklamak deep-link ile ilgili randevunun drawer'ını açıyor. Supplier portala da
mini bildirim zili eklendi. Haftalık takvim özeti geldi (gün kartları: statü
sayıları, kargo, doluluk çubuğu, kapalı/ek-mesai bayrakları; karta tıklayınca
günlük görünüme geçiş). Kargo advisory standardize edildi (`severity`,
`blocking:false`, `window`, `appointment_id`) ve v2.0'a uygun **engellemeyen
onay akışı** kuruldu: wizard'da kargo-uyarılı slot seçilince açıklayıcı panel +
"yine de oluşturulsun mu?" diyaloğu; admin revize formunda hedef saatte advisory
önizlemesi. Kargo hâlâ statü değil, hâlâ hard block değil. Backend 89/89 test,
frontend 27 route build + lint temiz, canlı smoke başarılı.

## 2. Değişen/Oluşturulan Dosyalar

Backend:
- `app/models/notification.py` — `severity`, `metadata_json`, okuma indeksleri; alıcı-başına model
- `alembic/versions/0b0a90483fe8_notification_severity_metadata.py` (up/down doğrulandı)
- `app/services/notifications.py` (yeni) — alıcı çözümleme + olay üretim kuralları
- `app/services/appointments.py` — eski `_notify` kaldırıldı; create/approve/reject/revise/complete/cancel yeni servise bağlandı
- `app/routers/notifications.py` — tamamen yeniden: admin facility-scoped 5 endpoint + supplier 4 endpoint
- `app/routers/appointments.py` — `GET /calendar/week`, day-endpoint advisory standardizasyonu, availability advisory alanları
- `app/rules/context.py` + `app/rules/availability.py` — WarningRuleResult genişletildi (severity/blocking/appointment_id/window); **`choose_dock` en-az-dolu hesabı hedef günle sınırlandı** (3 günlük pencere sayılıyordu — gerçek düzeltme)
- `app/schemas/appointment.py` — create/revise'a `acknowledged_warning_codes`
- `app/schemas/catalog.py` — NotificationOut (severity, metadata_json)
- `app/seed.py` — okunmamış admin bildirimleri + supplier bildirimi + haftaya yayılmış 2 ek randevu
- `tests/test_notifications.py` (yeni, 10 test)

Frontend:
- `src/components/notifications/notification-bell.tsx` (yeni) — zil + panel (admin/supplier varyantları)
- `src/lib/api/notifications.ts` (yeni) — hook fabrikası (45 sn unread polling)
- `src/lib/api/appointments.ts` — `useCalendarWeek`, `useAdminAvailability`, revise'a acknowledged codes
- `src/components/appointments/week-view.tsx` (yeni) — gün kartları
- `src/app/(admin)/admin/calendar/page.tsx` — Günlük/Haftalık toggle + hafta gezinme
- `src/app/(admin)/admin/appointments/page.tsx` — `?appointmentId=` deep-link (Suspense'li)
- `src/app/(admin)/admin/layout.tsx` + `(supplier)/supplier/layout.tsx` — gerçek zil
- `src/app/(supplier)/supplier/new-appointment/page.tsx` — advisory paneli + engellemeyen onay diyaloğu
- `src/components/appointments/appointment-drawer.tsx` — revize hedefi advisory önizlemesi
- `src/lib/api/types.ts` — NotificationDto, CalendarWeekDto…

Docs: `docs/SPRINT_5_REPORT.md`, README.

## 3. Notification Backend Teslimatları

- **Karar:** hem admin hem supplier bildirimleri tam gerçek (endpoint + UI).
- **Endpoint'ler:** `GET/POST /facilities/{fid}/notifications[/unread-count|/{id}/read|/read-all|/{id} DELETE]` (izin `appt.view`; satırlar kişisel — kullanıcı yalnız kendi bildirimlerini görür/değiştirir) ve `GET/POST /supplier/notifications[...]`.
- **Üretim matrisi:** manuel create → adminlere `appointment_created` (warning); auto-approve → adminlere info + supplier'a `appointment_approved` (success); approve→success, reject→error (+reason), revise→warning (+old/new metadata, "Tesis yönetimi yeni saat önerdi"), complete→info; cancel yönlüdür (supplier iptali→adminlere, admin iptali→supplier'a); kargo create → adminlere tek `cargo_advisory` (spam yok — yalnız oluşturma anında).
- **Hedefleme (karar):** tenant alıcıları = tesiste `appt.approve` yetkisi olan üyeler (sistem yön. + rampa yön.); rampa yöneticisi yalnız **atanmış dock'a düşen** olayları alır; izleyici bildirim almaz (MVP); supplier kendi olaylarını alır. Alıcı-başına satır → kişisel okundu durumu.
- **Metadata:** `appointment_id`, `status`, `dock_id`, `supplier_id`, `route_hint` (+reason/old/new/window) — frontend yönlendirmesi için yeterli.

## 4. Notification UI Teslimatları

Admin zili: gerçek unread rozeti (45 sn polling), panelde severity ikon/renkleri
(kargo için 📦), okunmamış vurgusu + nokta, tek/tümünü okundu işaretleme, "x dk
önce" zaman etiketi, tıklayınca `route_hint` → `/admin/appointments?appointmentId=`
deep-link'i drawer'ı açar (kapanınca query temizlenir; ileride e-posta linkleri
için de temel). Facility switcher değişince query key'ler değişir. Supplier
zili: aynı bileşenin supplier varyantı — kendi bildirimleri, okundu yönetimi,
tıklayınca randevular sayfası.

## 5. Weekly Calendar Teslimatları

`GET /calendar/week?week_start=` — **pazartesi olmayan girdi normalize edilir**
(422 yerine; rapor kararı). Gün başına: statü sayıları (total = pending+approved+
revize+completed; iptal ayrı alan — rapor kararı), kargo (blocking statülerde),
dock_count/active_dock_count (scope'lu), **yaklaşık doluluk** = bloklanan dakika
(kargo tentative dahil, iptal/red hariç) / açık rampaların çalışma dakikası
(override'lar hesaba katılır), kapalı/ek-mesai bayrakları, top_docks (ilk 3).
UI: takvimde Günlük/Haftalık toggle, hafta gezinme (±7 gün), gün kartlarında
sayılar + renkli doluluk çubuğu + kapalı/ek-mesai/kargo ikonları + en yoğun
rampa; karta tıklayınca o günün günlük görünümü. Rampa yöneticisi yalnız kendi
rampalarının metriklerini görür (testli).

## 6. Cargo Advisory Güncellemeleri

Advisory yapısı standardize edildi: `{code, severity:"warning", blocking:false,
message, dock_id, appointment_id, window}` — hem availability slotlarında hem
takvim `cargo_advisories`'inde. **Karar (MVP):** backend advisory'de create/revise'ı
her zaman kabul eder; confirmation tamamen UX katmanıdır. `acknowledged_warning_codes`
alanı geleceğe hazırlık olarak create/revise isteklerinde kabul edilir (409'lu
iki-aşamalı akışa geçiş kapısı açık). Wizard: kargo-uyarılı slot seçilince
açıklayıcı sarı panel ("Randevunuz engellenmez…") + submit'te engellemeyen
"Yine de talep oluşturulsun mu?" diyaloğu ("Farklı Saat Seçeyim" alternatifiyle).
Admin revize: hedef tarih/saat/süre için canlı advisory önizlemesi (availability
sorgusuyla) — uyarı gösterir, kaydetmeyi engellemez. Kargo overlay/statü ayrımı
korunuyor; yeni statü yok. Bonus düzeltme: `choose_dock` en-az-dolu hesabı artık
yalnız hedef günü sayıyor (önceden ±1 günlük yükleme penceresinin tamamını
sayıyordu ve komşu gün yoğunluğu atamayı saptırabiliyordu).

## 7. RBAC / Scope

Bildirimler: tenant kullanıcısı yalnız kendi facility+kendi satırları; supplier
yalnız kendi firması; platform user 403; başka tenant admini 403; rampa
yöneticisi atanmadığı dock'un olayını hiç almaz (üretim anında hedeflenmez) ve
sistem yöneticisinin satırlarını göremez (alıcı-başına). Weekly: `appt.view` +
dock scope. Hepsi testli.

## 8. Test Sonuçları

Komutlar:
```bash
cd apps/api && .venv/bin/python -m pytest   # 89 passed
.venv/bin/ruff check app tests              # All checks passed
npm run build -w @logislot/web              # 27/27 route
npm run lint -w @logislot/web               # No warnings or errors
```
Yeni testler (10): manuel create → sysadmin bildirimi + yalnız-R1 yöneticisine
R2 olayı gitmez; auto-approve çift bildirim (supplier success + admin info);
lifecycle seti (revise old/new metadata, reject reason+error, complete info);
iptal yön testi (supplier→admin, admin→supplier); kargo create tek advisory;
unread/read/read-all/delete; izolasyon dörtlüsü; weekly (normalize, sayılar,
doluluk>0, kapalı bayrağı, scope'ta dock_count=1, izolasyon); advisory şeması
(blocking=false) + advisory'li slota `acknowledged_warning_codes` ile başarılı
standart create. Canlı smoke: unread 2 → liste (route_hint'li) → read-all 0 →
supplier bildirimi → haftalık özet (Cmt kapalı, Paz ek-mesai, Per kargo) →
approve → Marmara'ya `appointment_approved` düştü.

## 9. Docker / Local Çalıştırma

`docker compose up --build` → web :3010 · api :8010 · db :5433; migration + seed
otomatik (seed idempotent). Üç servis ayakta.

## 10. Demo Akışları

Notification: admin girişi → zilde **2** rozeti → panelde "Yeni randevu talebi"
(sarı) + "Kargo uyarısı" (📦) → kargo bildirimine tıkla → randevular sayfası
açılır ve Etiket Rulolari drawer'ı gelir → "Tümünü okundu işaretle" → rozet
sıfırlanır. Tedarikçi portalında (anadoluun) zilde onay bildirimi.

Weekly calendar: Takvim → **Haftalık** → gün kartlarında bugünün 2 randevusu,
Perşembe kargo rozeti, Cumartesi kapalı ikonu (bakım), Pazar ek-mesai ikonu +
%25 doluluk → Pazar kartına tıkla → günlük görünümde yalnız R1 09-13 açık.

Cargo advisory: tedarikçi (anadoluun) → Yeni Randevu → Genel kategorisi → yarına
gün seç → R3'ün kargo-uyarılı saatlerinde 📦 işaretli slot seç → sarı bilgi
paneli → "Randevu Talep Et" → engellemeyen onay diyaloğu → "Evet" → talep
oluşur (engel yok). Admin revize formunda aynı hedef saatte sarı uyarı satırı.

## 11. Bilinen Eksikler / Bilinçli Ertelemeler

1. Bildirimde WebSocket yok — 45 sn polling (MVP kararı; endpoint yapısı push'a hazır).
2. `acknowledged_warning_codes` şimdilik yalnızca kabul ediliyor (davranış değiştirmez);
   iki aşamalı 409 akışı gelecek opsiyon olarak raporlandı.
3. İzleyici bildirim almıyor (MVP hedefleme kararı); istenirse alıcı kümesi genişletilebilir.
4. Supplier bildirimi firma-başına (kullanıcı-başına değil) — tek portal hesabı MVP'siyle uyumlu.
5. Bildirim saklama/temizleme politikası yok (sonsuz büyüme — Sprint 8 bakım kalemi).
6. Haftalık görünümde gün kartından doğrudan drawer açılmıyor (gün→günlük→blok akışı).
7. Playwright yok; akışlar canlı smoke + API testleri + demo adımlarıyla doğrulandı.

## 12. Sonraki Önerilen Sprint

**Sprint 6 (roadmap uyarlaması) — Reports & Platform Usage + E-posta Abstraction:**
raporlar sayfasının gerçek verilerle doldurulması (kategori dağılımı, rampa
yoğunluğu, tedarikçi aktivitesi — mevcut endpoint iskeletleri üstüne), platform
usage ekranının gerçek `/platform/usage`'a bağlanması, plan atama UI'ı ve
bildirimlerin ikinci kanalı olarak log-only e-posta provider abstraction'ı
(revize e-postası davranışı v1.0 uyumu).
