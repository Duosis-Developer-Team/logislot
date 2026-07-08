# Sprint 3 Raporu — Suppliers & Basic Appointments

Tarih: 8 Temmuz 2026

## 1. Özet

Tedarikçi yönetimi gerçek CRUD + portal hesabı yönetimiyle tamamlandı; supplier
portal mock'tan tamamen çıktı. v2.0 sihirbazının ilk gerçek uçtan uca akışı canlı
çalışıyor: admin tedarikçi oluşturur (hesap otomatik açılır) → tedarikçi kendi
portalına girer → katalogdan izinli kategorilerini görür → availability'den gerçek
slot seçer → talebi oluşturur (rampa atamasını engine yapar; otomatik/manuel onay
farkı doğru) → randevu admin listesinde anında görünür ve onaylanabilir.
Permission-aware navigation ilk sürümüyle geldi; Users/Roles readonly ekranı
gerçek API'den besleniyor. Backend 68/68 test, frontend 25 route build + lint
temiz, compose'da canlı doğrulandı.

## 2. Değişen/Oluşturulan Dosyalar

Backend:
- `app/models/supplier.py` — `notes` alanı; `alembic/versions/09b4227fde57_supplier_notes.py` (up/down doğrulandı)
- `app/routers/suppliers.py` (yeni) — supplier CRUD + `/users`, `/reset-password`, `/user-status` hesap endpoint'leri
- `app/schemas/config.py` — SupplierCreate/Patch + hesap DTO'ları (min/max tutarlılık validasyonu)
- `app/schemas/catalog.py` — SupplierOut: `is_active`, `notes`, `account_email`, `account_active`
- `app/services/config.py` — `ensure_unique_value` genelleştirmesi (DUPLICATE_CODE/EMAIL kodları)
- `app/auth/deps.py` + `app/auth/router.py` — pasif tedarikçi firması login'de VE her istekte engellenir
- `app/services/appointments.py` — `SUPPLIER_INACTIVE` savunması (admin on-behalf dahil); tedarikçi iptali geçmiş randevuda `APPOINTMENT_IN_PAST` (409)
- `app/routers/supplier_portal.py` — `/supplier/catalog` (yeni), `/supplier/me` alias, listelerde isim zenginleştirme
- `app/routers/appointments.py` — `facility_name_maps` + `appointment_out_named` (liste/detay supplier/dock/kategori adlarıyla döner)
- `app/routers/users.py` (yeni) — `GET /facilities/{fid}/users` + `/roles` (readonly, `user.manage`)
- `app/auth/router.py` + `app/schemas/auth.py` — `/auth/me`'ye `facility_permissions` haritası
- `app/routers/catalogs.py` — supplier list buradan suppliers.py'ye taşındı
- `app/seed.py` — notes alanları + Hızlı Kargo `weekly_quota=2` (kota sınırına yakın demo)
- `tests/test_suppliers.py` (yeni, 13 test)

Frontend:
- `src/lib/api/types.ts` — Supplier/Catalog/Appointment/Slot/User/Role DTO'ları + `facility_permissions`
- `src/lib/api/resources.ts` — suppliers resource + hesap aksiyonları + users/roles hook'ları
- `src/lib/api/supplier.ts` (yeni) — portal hook'ları (profile/catalog/appointments/availability/create/cancel)
- `src/lib/api/appointments.ts` (yeni) — admin liste + approve/reject/complete/cancel mutasyonları
- `src/lib/auth/session.tsx` — aktif tesise göre `permissions` + `can()`
- `src/app/(admin)/admin/layout.tsx` — permission-aware sidebar/mobil nav
- `src/app/(supplier)/supplier/layout.tsx` + `(platform)/platform/layout.tsx` — portal tipi guard'ları
- `src/app/(admin)/admin/settings/suppliers/page.tsx` (yeni) — bölümlü drawer'lı tam CRUD
- `src/app/(admin)/admin/settings/users/page.tsx` (yeni) — readonly kullanıcı/rol görünümü
- `src/app/(admin)/admin/settings/page.tsx` — kartlar izinle filtrelenir; Tedarikçiler + Kullanıcılar gerçek linkler
- `src/app/(supplier)/supplier/{profile,appointments,new-appointment}/page.tsx` — tamamı gerçek API
- `src/app/(admin)/admin/appointments/page.tsx` — gerçek liste + onay/red akışları

Docs: `docs/SPRINT_3_REPORT.md`, README (sprint durumu).

## 3. Backend Teslimatları

- **Supplier CRUD**: list/create/detail/patch/delete (soft: `status=inactive`). Kurallar: `code` facility içinde unique → 409 `DUPLICATE_CODE`; **hesap e-postası global unique** → 409 `DUPLICATE_EMAIL` (karar: login e-postası `supplier_users.email` üzerinde global unique'tir — auth modeli tek login tablosu kullandığı için; contact_email serbest bırakıldı, rapor notu); `min>0`, `max>=min` (PATCH'te sonuç-durum üzerinden); kota `>=0`; izinli kategoriler aynı facility'nin aktif kategorileri (422 `INVALID_REFERENCE`); cross-facility her yerde reddedilir.
- **Hesap yönetimi**: create'te `create_account` (varsayılan açık; e-posta = `account_email || contact_email`, parola = verilen ya da `Demo123!` — **production notu: sabit varsayılan yerine rastgele geçici parola + e-posta akışı gerekir**); `POST /users` (hesapsıza hesap), `POST /reset-password`, `PATCH /user-status`. Hepsi audit'li (`supplier_user.create/reset_password/status`).
- **Pasiflik kararı (net)**: pasif tedarikçi (1) login olamaz, (2) eldeki token'la tüm supplier endpoint'lerinden 403 alır, (3) admin on-behalf randevu oluşturamaz (`SUPPLIER_INACTIVE`). Hesap-pasif ayrıca login'i keser.
- **Portal API**: `/supplier/catalog` (izinli aktif kategoriler + varsayılan araç bilgisi, tesisin aktif araç kategorileri, min/max/kota/auto-approve limitleri, teslimat tipleri, kargo pencereleri, miktar birimleri Palet/Adet/Kutu/Koli); `/supplier/me` = `/supplier/profile` alias'ı. Mevcut adlar korundu: availability `POST /supplier/availability/evaluate`.
- **İzinler**: supplier CRUD + hesap → `supplier.manage`; users/roles → `user.manage`; viewer/supplier/platform mutasyonları 403 (testli).

## 4. Supplier Portal Teslimatları

- **Profil**: gerçek `/supplier/profile` — firma, kod, iletişim, süre limitleri, kota, otomatik onay rozeti, izinli kategoriler (katalogdan adlarıyla).
- **Randevularım**: gerçek liste; yaklaşan/geçmiş sekmeleri, sayaçlar, durum + kargo rozetleri, rampa/araç adları, red sebebi ve revize eski→yeni aralık gösterimi; **iptal** yalnız gelecek pending/approved'da görünür, onay diyaloğu + API hatası kullanıcıya Türkçe gösterilir.
- **Sihirbaz (v2.0 sırası korunur)**: Adım 1 katalogdan izinli aktif kategoriler; Adım 2 araç varsayılanı kategoriden otomatik + override, plaka/sürücü, standart/kargo; Adım 3 **gerçek availability slotları** (müsait/kısmen/dolu; dolu seçilemez; kargo-uyarılı slotta 📦 işareti + tooltip), süre seçenekleri kategori min + tedarikçi min/max'a göre filtreli; araç/gün/süre değişince slotlar yeniden hesaplanır. Kargo seçilince kaba pencere UI'ı ("tahmini planlama penceresi" açıklamasıyla). Submit gerçek POST; başarı ekranı otomatik onayda "Randevunuz onaylandı", manuelde "Talebiniz yönetici onayına gönderildi".

## 5. Admin UI Teslimatları

- **Tedarikçiler ekranı**: liste (firma/kod, iletişim, izinli kategori chip'leri, süre/kota özeti, otomatik/manuel onay rozeti, hesap durumu, aktif/pasif) + bölümlü drawer (Firma / İzinler-Kategoriler / Blokaj & Kota / Portal Hesabı / Notlar). Hesap bölümünde giriş e-postası, aktif/pasif anahtarı ve parola sıfırlama. Duplicate kod/e-posta hataları net Türkçe mesajla.
- **Kullanıcılar & Roller (readonly)**: tesis kullanıcıları (roller, atanmış rampa chip'leri, durum) + rol kartları (izin listeleri). Tam editör Sprint 4/5.
- **Randevular**: mock'tan çıktı — gerçek liste (isim zenginleştirmeli), durum filtreleri + bekleyen rozeti, arama; pending satırlarda izin-korumalı **Onayla/Reddet** (red sebebi zorunlu diyaloğu).

## 6. Appointment / Availability Entegrasyonu

Create DTO v2.0 sırasına uygun (mevcut alan adları korundu: `license_plate`,
`cargo_window`, `start_at`+`target_date`). Kargo modeli (rapor gereği açık):
kargo yeni statü DEĞİL; `delivery_type=cargo` + `cargo_window` saklanır, engine
pencereden **tentative blok** üretir (`cargo_min_block_minutes`, tesis varsayılanı
90 dk), bu blok sert blokaj üretmez — takvimde yalnız advisory sinyaldir; kota ve
raporlara normal randevu gibi dahil. Create kuralları: izinli+aktif kategori,
aktif+aynı-facility araç, kategori min & tedarikçi min/max süre, haftalık/aylık
kota, uygun rampa yoksa `NO_COMPATIBLE_DOCK`, çakışma grupları, otomatik atama
(en az dolu), auto-approve→approved / değilse→pending, bildirim + audit.
Liste/detay endpoint'leri artık supplier/dock/kategori/araç adlarıyla döner.

## 7. Permission-Aware Navigation / RBAC

`/auth/me` artık `facility_permissions` haritası döner; SessionProvider aktif
tesise göre `permissions` + `can()` sağlar. Sidebar: Takvim/Randevular `appt.view`,
Raporlar `report.view`, Yönetim herhangi bir yönetim izni; settings kartları tek
tek izinle filtrelenir (izleyici yalnız Genel Bakış+Takvim+Randevular+Raporlar
görür; rampa yöneticisi Yönetim menüsünü hiç görmez). Portal guard'ları: supplier
portalı yalnız supplier, platform paneli yalnız platform, admin paneli yalnız
tenant kullanıcısına açık; yanlış tipte anlaşılır yönlendirme ekranı. Buton
seviyesi: Onayla/Reddet yalnız ilgili izinle görünür. (Derinlik notu: sayfa
içeriği ayrıca API 403'üyle korunur — çift katman.)

## 8. Test Sonuçları

Komutlar:
```bash
cd apps/api && .venv/bin/python -m pytest   # 68 passed
.venv/bin/ruff check app tests              # All checks passed
npm run build -w @logislot/web              # 25/25 route
npm run lint -w @logislot/web               # No warnings or errors
```
Yeni testler (13): CRUD döngüsü + DUPLICATE_CODE/EMAIL 409 + audit; cross-facility
kategori 422; viewer/supplier/platform mutasyon 403; parola reset (eski 401→yeni
200) + hesap pasif→login 401; **pasif tedarikçi: yeni login 401, eldeki token 403,
admin on-behalf 403**; catalog yalnız izinli+aktif kategoriler + pasifleşen
kategori düşer; `/supplier/me` alias; gelecek pending iptal OK / geçmiş 409
`APPOINTMENT_IN_PAST` / iptal-tekrarı 409; pasif araç kategorisi 404; kota-sınırı
tedarikçi `SUPPLIER_QUOTA_EXCEEDED`; users/roles endpoint'leri + izleyici 403;
me `facility_permissions` doğru içerik. (Kargo yeni statü üretmez + advisory
non-blocking regresyonları Sprint 1-2 testlerinde korunuyor.)

## 9. Docker / Local Çalıştırma

`docker compose up --build` → web :3010 · api :8010 · db :5433. API açılışta yeni
migration'ı uygular + idempotent seed. Üç servis ayakta; yeni sayfalar (suppliers,
users, wizard) 200 dönüyor.

## 10. Demo Akışları

Admin supplier CRUD: `:3010/login` → Yönetim Paneli → `admin@cakesbakes.com /
Demo123!` → Yönetim → Tedarikçiler → "Yeni Tedarikçi" (Firma+kategori+kota+hesap
bölümleri) → kaydet → listede hesap e-postası "Aktif hesap" görünür → Düzenle →
parola sıfırla / hesap pasifleştir.

Supplier login/profile: çıkış → Tedarikçi Portalı → `tedarikci@anadoluun.com /
Demo123!` → Profil (gerçek limitler + izinli kategoriler) → Randevularım (gerçek
liste; gelecek pending/approved'da İptal).

Supplier wizard: Yeni Randevu → kategori seç (araç varsayılanı otomatik) → plaka →
standart → gün+süre → **gerçek slot ızgarası** → talep et → otomatik onaylıda
"Randevunuz onaylandı". Kargo denemesi için `tedarikci@hizlikargo.com` → kargo +
sabah penceresi (kota 2 olduğundan sınır davranışı da gözlenebilir).

Admin appointment visibility: admin → Randevular → Bekliyor filtresi → yeni talep
tedarikçi adıyla listede → Onayla/Reddet (sebep zorunlu). Canlı smoke ile birebir
doğrulandı (bölüm 8 komutları + compose smoke çıktısı).

## 11. Bilinen Eksikler / Bilinçli Ertelemeler

1. Admin dashboard ve takvim hâlâ mock (Sprint 4'te takvim gerçek bağlanacak;
   randevular listesi gerçek).
2. Revise aksiyonu admin UI'da yok (endpoint hazır ve testli) — takvim/detay
   drawer'ıyla Sprint 4'te.
3. Kullanıcı/rol düzenleme editörü yok (readonly); tam RBAC editörü Sprint 4/5.
4. Hesap varsayılan parolası demo için `Demo123!` — production'da rastgele geçici
   parola + e-posta doğrulaması şart (kodda not düşüldü).
5. Playwright e2e yok; akışlar canlı smoke (curl) + API entegrasyon testleri +
   manuel adımlarla doğrulandı.
6. Supplier başına tek portal hesabı (MVP); çoklu kullanıcı sonraya.
7. Refresh token akışı frontend'de otomatik değil (401'de login'e yönlendirme).
8. `/supplier/availability` GET yerine mevcut `POST /supplier/availability/evaluate`
   korundu (Sprint 1 sözleşmesi); `/supplier/catalog` ve `/supplier/me` eklendi.

## 12. Sonraki Önerilen Sprint

**Sprint 4 — Availability & Rule Engine derinleştirme + Yönetim Takvimi:**
admin takviminin gerçek API'ye bağlanması (günlük rampa×saat görünümü + kargo
overlay gerçek veriden), randevu detay/aksiyon drawer'ı (revise dahil),
create'te transaction içi yeniden kontrol/kilit (eşzamanlılık), dashboard'un
gerçek `dashboard-summary`ye bağlanması ve slot hesaplama performans gözden
geçirmesi.
