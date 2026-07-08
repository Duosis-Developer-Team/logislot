# Sprint 2 Raporu — Catalogs & Docks

Tarih: 8 Temmuz 2026

## 1. Özet

Facility seviyesindeki beş operasyonel konfigürasyon (ürün kategorileri, araç
kategorileri, rampalar, çakışma grupları, takvim istisnaları) gerçek CRUD
endpoint'leri ve gerçek admin UI editörleriyle yönetilebilir hale geldi. Admin
paneli artık mock değil: login → `/auth/me` → facility switcher → settings
listeleri uçtan uca gerçek API ile çalışıyor. CRUD'lar rule engine'i besliyor:
UI'dan eklenen çakışma grubu, kapalı gün ve ek mesai availability sonucunu
anında değiştiriyor (testli). Backend 55/55 test, frontend 23 route build +
lint temiz, Docker Compose üç servisle ayakta.

## 2. Değişen/Oluşturulan Dosyalar

Backend:
- `app/models/dock.py` — DockOverride'a `is_active` (soft delete)
- `alembic/versions/a38707a5ac63_dock_override_is_active.py` — yeni migration (downgrade doğrulandı)
- `app/rules/availability.py` — pasif override'lar yok sayılır; `dock_day_window` tek `_override_for` kullanır
- `app/services/appointments.py` — override yükleyici `is_active` filtreler
- `app/schemas/config.py` (yeni) — 5 entity için Create/Patch DTO + validasyonlar
- `app/services/config.py` (yeni) — `ensure_unique_name`, `get_scoped_or_404`, `load_scoped_refs` (cross-facility reddi), audit `snapshot`
- `app/routers/catalogs.py` — kategori + araç kategorisi tam CRUD (yeniden yazıldı)
- `app/routers/docks.py` (yeni) — rampa + çakışma grubu + override tam CRUD
- `app/main.py` — docks router kaydı
- `app/seed.py` — closed + extra_hours override örnekleri
- `tests/test_config_crud.py` (yeni, 15 test) + `tests/test_rules.py` (3 yeni regresyon)

Frontend:
- `src/lib/api/types.ts` (yeni) — backend DTO tipleri
- `src/lib/api/resources.ts` (yeni) — facility-scoped CRUD hook fabrikası (list/save/deactivate + invalidation)
- `src/lib/auth/session.tsx` (yeni) — SessionProvider: me + aktif facility (localStorage) + logout
- `src/components/ui/drawer.tsx`, `switch.tsx` (yeni primitifler)
- `src/components/config/` (yeni) — `page-shell.tsx` (ConfigPageShell + useFlash + filterRows), `confirm-dialog.tsx`, `multi-select.tsx` (chip), `states.tsx` (Loading/Error/Empty/ActiveBadge), `working-hours-editor.tsx`
- `src/app/(admin)/admin/layout.tsx` — gerçek oturum guard'ı + gerçek facility switcher + çıkış
- `src/app/(admin)/admin/settings/{categories,vehicle-categories,docks,conflict-groups,overrides}/page.tsx` (5 yeni CRUD sayfası)
- `src/app/(admin)/admin/settings/page.tsx` — canlı sayaçlı yönlendirme kartları
- `src/app/(auth)/login/page.tsx` — hata durumunda artık yönlendirme YOK; net hata mesajı

Docs: `docs/SPRINT_2_REPORT.md`, README güncellemesi.

## 3. Backend Teslimatları

- **Endpoint aileleri** (mevcut adlandırma korundu: `/categories` = product categories):
  `GET/POST /facilities/{fid}/categories`, `GET/PATCH/DELETE .../categories/{id}` — aynı şablon `vehicle-categories`, `docks`, `dock-conflict-groups`, `dock-overrides` için.
- **DELETE = soft delete**: tüm entity'lerde `is_active=false` yazılır; fiziksel silme yok, geçmiş randevu referansları korunur.
- **İzinler**: kategori `category.manage`, araç `vehicle_category.manage`, rampa `dock.manage`, çakışma grubu `dock_conflict_group.manage` (enum'da ayrı izin olduğu için dock.manage yerine bu tercih edildi), override `calendar.override`. Okumalar Sprint 1 davranışını korur (kategori listeleri tedarikçiye izinli+aktif filtreli; rampa/grup/override listeleri `appt.view`).
- **Validasyonlar**: facility içi unique name → 409 `DUPLICATE_NAME`; `min_block_minutes > 0`; cross-facility FK → 422 `INVALID_REFERENCE` (default araç, rampa kabul listeleri, grup üyeleri, trigger araçları, override dock'u); grup üye sayısı ≥ 2; conditional grupta trigger zorunlu; extra_hours'ta start/end zorunlu + `end > start`; working hours JSON şema/HH:MM/başlangıç<bitiş kontrolü.
- **Audit**: 5 entity × create/update/deactivate → before/after snapshot'lı AuditLog (testle doğrulandı).
- **Boş liste kararı dokümante edildi**: `accepted_vehicle_categories` boş = tüm araçlar (v2.0 geriye uyumluluk kuralı); `accepted_product_categories` boş = tüm ürünler (engine'de aynı simetri, UI'da açıkça yazıyor).

## 4. Frontend Teslimatları

- **Gerçek auth akışı**: login (hata durumunda navigasyon yok) → token → `/auth/me` → SessionProvider → admin guard (401/403'te anlaşılır ekran + girişe dön) → facility switcher `/auth/me.facilities`'e bağlı, seçim localStorage'da.
- **Ortak pattern**: ConfigPageShell (başlık + açıklama + create + arama + aktif/pasif filtre + flash feedback), Drawer form, ConfirmDialog, chip MultiSelect, Empty/Loading/Error state'leri — beş ekran da aynı deseni kullanır; domain formları ayrı kaldı.
- **RHF + Zod** çift taraflı validasyon; API hataları (`DUPLICATE_NAME`, `INVALID_REFERENCE`…) form içinde Türkçe mesajla gösterilir; mutation sonrası invalidate/refetch.
- **Rampa editörü**: ürün/araç kabul chip'leri ("Boş bırakılırsa tüm araç tipleri kabul edilir" uyarısıyla), tesis-varsayılanı/özel çalışma saatleri anahtarı + 7 günlük saat editörü, listede uyumluluk chip'leri + saat özeti + çakışma grubu üyeliği.
- **Çakışma grubu editörü**: tip seçimi yardım metinleriyle, üye rampa chip'leri, koşullu tipte tetikleyici araç seçimi + insan dilinde özet ("TIR geldiğinde bu grup devreye girer"), collapsible teknik JSON görünümü. R1-R2 TIR senaryosu UI'dan kurulup düzenlenebilir.
- **Override editörü**: rampa/tarih/tip/saat/sebep; kapalı-gün ve ek-mesai davranış açıklamaları.

## 5. Rule Engine Güncellemeleri

- Pasif override'lar değerlendirme dışı (hem yükleyici hem engine filtreler).
- `extra_hours` semantiği netleştirildi ve teste bağlandı: pencere o günün
  çalışma penceresinin **yerine** geçer; normalde kapalı günü (Pazar) açabilir.
- Regresyonlar korunuyor: boş araç listesi=hepsi, koşullu grup tetikleme/tetiklenmeme,
  kargo advisory'nin hard block üretmemesi, closed override sert engeli.
- `shared_capacity` ilk sürümde `mutual_block` gibi davranmaya devam ediyor
  (bilinçli; model ve UI'da ayrık, yardım metninde açıkça yazıyor).

## 6. Test Sonuçları

Komutlar:
```bash
cd apps/api && .venv/bin/python -m pytest   # 55 passed
.venv/bin/ruff check app tests              # All checks passed
npm run build -w @logislot/web              # 23/23 route
npm run lint -w @logislot/web               # No warnings or errors
```
Yeni testler: 5 entity CRUD döngüleri + duplicate 409 + audit kayıtları;
cross-facility FK 422; pasif kategori wizard'da görünmez + create 404; pasif
rampa availability'den düşer; **UI/API'den kurulan mutual grup kardeş rampayı
bloke eder (availability üzerinden)**; closed override günü kapatır ve pasifleşince
açılır; extra_hours Pazar'ı 09:00'dan itibaren açar; izleyici/tedarikçi/platform/
yabancı-tenant mutasyon 403.

## 7. Docker / Local Çalıştırma

```bash
docker compose up --build    # web :3010 · api :8010 · db :5433
```
API konteyneri açılışta `alembic upgrade head` (yeni migration dahil) + idempotent
seed çalıştırır. Canlı doğrulandı: üç servis ayakta; login → override listesi →
kategori create/duplicate/403 → Pazar extra_hours availability (7 slot, 09:00).

## 8. Demo Akışları

Admin login: `http://localhost:3010/login` → "Yönetim Paneli" kartı →
`admin@cakesbakes.com / Demo123!` → sol menü **Yönetim**.

Settings CRUD: Yönetim → Kategoriler → "Yeni Kategori" (min süre + varsayılan
araç) → kaydet → listede anında görünür → aynı adla ikinci deneme 409 mesajı →
Pasifleştir → tedarikçi sihirbazında kategori kaybolur. Rampalar ekranında
Rampa 3'ün "yalnız Kamyonet+Kargo" chip'leri; Çakışma Grupları'nda R1-R2 TIR
koşullu grubu; Takvim İstisnaları'nda seed'in "Planlı bakım" (kapalı) ve
"Bayram öncesi ek mesai" kayıtları.

Availability doğrulama: İstisnalar ekranından bir rampaya bugün için "Kapalı"
ekleyin → tedarikçi portalında (veya `/availability/evaluate` ile) o rampa
adaylıktan düşer; ek mesai eklenen Pazar günü slot açılır.

## 9. Bilinen Eksikler / Bilinçli Ertelemeler

1. Supplier portalı hâlâ mock veriyle (Sprint 3'te bağlanacak; admin tarafı gerçek).
2. Dashboard/takvim/randevular admin ekranları da henüz mock — Sprint 2 kapsamı yalnız settings'ti.
3. `shared_capacity` gerçek kapasite modeli değil (mutual gibi davranır; model ayrık).
4. Playwright e2e eklenmedi; UI akışları manuel test edildi (bölüm 8 adımları) + API seviyesi entegrasyon testleri mevcut.
5. Override'da tekrar kuralı/çoklu-override çakışma kontrolü yok (aynı gün+rampa için ilk aktif kayıt kazanır).
6. Rol bazlı UI menü gizleme (permission-aware nav) Sprint 3'te kullanıcı/rol ekranlarıyla birlikte.
7. Working hours editörü rampa başına tek pencere/gün destekler (öğle arası gibi çoklu pencere yok).

## 10. Sonraki Önerilen Sprint

**Sprint 3 — Suppliers & Basic Appointments:** tedarikçi CRUD'u (izinli
kategoriler, kota, min/maks süre, otomatik onay) + tedarikçi hesabı otomatik
oluşturma, supplier portalının gerçek API'ye bağlanması (login → profil →
randevularım → sihirbaz adım 1-2), kullanıcı/rol yönetimi ekranının ilk hali ve
permission-aware navigasyon.
