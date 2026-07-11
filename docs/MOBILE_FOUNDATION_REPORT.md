# LogiSlot Mobile App Foundation Report

**Tarih:** 2026-07-11 · **Branch:** `dev` (`cc76e9b`)
**Kapsam:** Yeni `logislot-mobile/` uygulaması + web/mobile parity süreci. Web'e ve backend'e **hiç dokunulmadı**; prod etkilenmedi.

---

## 1. Özet

Aynı repo içinde `logislot-mobile/` oluşturuldu: **Expo + React Native + TypeScript + Expo Router** ile iOS + Android uygulaması. Mobile app ayrı backend/iş mantığı içermez — web ile **aynı FastAPI backend'ini ve birebir aynı API contract'larını** kullanan saf bir client'tır. Üç portalın (Tedarikçi / Yönetim / Platform) ana akışları mobile-native UX ile taşındı; cross-platform veri tutarlılığı iki yönde doğrulandı; uygulama **iPhone 16 Pro simulator'da canlı çalıştırıldı** (login → role-based routing → tab'lar → dark tema → çıkış ekranı).

## 2. Eklenen Mobile Proje

- Klasör: `logislot-mobile/` (58 dosya commit'lendi; kendi `node_modules` + lockfile)
- Stack: Expo SDK 57, RN 0.86, React 19.2, TypeScript strict, Expo Router (typed routes), TanStack Query 5, Expo SecureStore, Reanimated + Gesture Handler, Ionicons
- Scriptler: `start` / `ios` / `android` / `typecheck` / `lint`
- **Bilinçli mimari karar:** `logislot-mobile` kök npm workspace'inin **dışında**. Web'in Dockerfile'ı kök lockfile ile `npm ci` çalıştırıyor ve build context'ine yalnızca `apps/web` + `packages/shared` package.json'ları kopyalanıyor — mobile workspace'e eklenseydi web imaj build'i kırılırdı. (Prompt'taki "workspace'e ekleme izni" bu risk yüzünden kullanılmadı; gerekçe README'de.)

## 3. Mobile Mimari

- **Routing:** Expo Router dosya-tabanlı; `app/index.tsx` role-based yönlendirme (supplier→Randevular, tenant→Dashboard, platform→Genel Bakış). Her portal Stack + Tabs; detaylar stack ekranı. `RoleGuard` yanlış rolü login'e atar.
- **API client:** `src/api/client.ts` — web `client.ts` ile aynı zarf/algoritma: `{success,data,error}`, `X-Facility-Id`, 401'de **tek-uçuş refresh** (rotation uyumlu), refresh düşerse SecureStore + query cache temizliği + login'e navigation reset (`setUnauthorizedHandler`).
- **Auth/token:** access+refresh+portal **Expo SecureStore**'da; bellek cache ile senkron istek yolu; soğuk başlangıçta session restore → `/auth/me`; `must_change_password` → change-password ekranı; logout = backend `/auth/logout` (best-effort) + temizlik + reset.
- **Tema:** light/dark/system (SecureStore kalıcı), tokenlar web `globals.css` paletinin hex karşılıkları (derin navy + logistics mavi + aynı 6 statü rengi + kargo).
- **UI kiti:** `src/components/ui.tsx` (Screen/Card/Button/Field/Badge/Chip/MetricCard/Loading-Error-Empty) + randevu kartları + ayarlar bölümü — web kopyası değil, native pattern'ler (tab bar, pull-to-refresh, bottom-sheet benzeri akışlar, chip'li dokunmatik seçimler).

## 4. Backend Ortaklığı

- Base URL: `EXPO_PUBLIC_API_URL` (varsayılan dev cluster `http://84.247.180.172:30081`; iOS sim `localhost:8010`, Android emu `10.0.2.2:8010`, fiziksel cihaz LAN IP — README'de tablo).
- Kullanılan endpoint'ler webdekiyle birebir: auth (login ×3, refresh, me, logout, change-password), supplier (profile/catalog/appointments/detail/create/cancel/availability/series), admin (dashboard-summary, calendar/day, appointments+detail, approve/reject/revise/complete/cancel), platform (usage/tenants/facilities).
- RBAC backend'de; mobile `can()` + `allowed_actions` haritasıyla yalnızca görünürlük yönetir; 403'ler hata state'iyle gösterilir.
- DTO'lar `src/api/types.ts` — web `types.ts` ile senkron kopya (başlık yorumunda senkron kuralı; shared paket çıkarımı backlog).

## 5. Implemented Mobile Screens

**Tedarikçi:** Randevularım (sayaç kartları, yaklaşan/geçmiş, seri özeti, pull-to-refresh) · Yeni Randevu sihirbazı (3 adım; kategori/birim/araç/teslimat chip'leri; 14 günlük gün şeridi; gerçek müsaitlikten dokunmatik slot grid'i; kargo penceresi; özet; otomatik onay rozeti) · Randevu detay (+iptal, revize/red notları, seri bilgisi) · Profil (firma/limitler/kota + tema + çıkış).
**Yönetim:** Dashboard (6 KPI + bekleyen/yaklaşan listeleri) · Takvim (gün okları + rampa gruplu agenda + kargo uyarı şeridi) · Randevular (statü filtre chip'leri) · Detay (Onayla/Reddet/Revize/Tamamla/İptal — inline formlar, revize'de gün/saat/süre + auto-dock) · Menü (tesis seçici + tema + çıkış).
**Platform:** Genel Bakış (30 gün agregat: tenant/tesis/randevu/rampa/tedarikçi + tenant kullanımı) · Tenantlar · Tesisler (read-only kartlar) · Menü.

## 6. Web/Mobile Feature Parity Dokümanları

- `docs/WEB_MOBILE_PARITY.md` — feature Definition of Done (Backend/Web/Mobile/QA checklist'leri + erteleme kuralı: **hiçbir feature yalnız web'de kalmaz**, ertelenen matrise işlenir).
- `docs/FEATURE_PARITY_MATRIX.md` — tüm mevcut feature'lar Backend/Web/Mobile durumlarıyla işlendi (OK/Partial listesi aşağıdaki backlog'la aynı).

## 7. Cross-Platform Consistency Test

Dev cluster DB'si arızalı olduğundan (bkz. §12) test **yerel compose stack** (aynı imajlar, seed'li) üzerinde, mobile client'ın gönderdiği **birebir istek gövdeleriyle** yapıldı:

1. **Mobile → Web:** supplier-login → catalog → availability/evaluate → `POST /supplier/appointments` (mobile sihirbaz gövdesi) → randevu oluştu → **web admin panel UI'sinde (Playwright) listede görüldü** ✅
2. **Web → Mobile:** web modalının çağırdığı `POST /facilities/{id}/appointments/{id}/complete` → mobile'ın detay çağrısı `GET /supplier/appointments/{id}` **status=completed + tamamlama notunu** gördü ✅

Ek olarak iOS simulator'daki canlı uygulama yerel backend'e login olup gerçek veriyi gösterdi (Tedarikçi randevuları + Platform paneli gözlemlendi).

## 8. Light/Dark Theme + Logo

Login'de tam logo (temaya göre light/dark asset), app icon + Android adaptive icon + splash (navy zemin + beyaz ikon; `assets/` üretildi), `assets/brand/` web ile aynı 4 asset. Tema anahtarı login'de (tek dokunuş) ve profil/menü ekranlarında (Açık/Koyu/Sistem). iOS bundle id `com.duosis.logislot`, Android package `com.duosis.logislot`, görünen ad **LogiSlot**.

## 9. iOS / Android Run

- **iOS:** iPhone 16 Pro simulator'da **canlı çalıştırıldı** (Expo Go, port 8082 — 8081 başka projede). Login/routing/tab/tema akışları gerçek backend verisiyle görüldü; ekran görüntüleri alındı.
- **Android:** Bu Mac'te Android SDK/emulator **yok** → emulator smoke koşulamadı. Ancak `expo export --platform android` Android bundle'ı **derliyor** (1781 modül) — kod seviyesi doğrulama yapıldı; emulator smoke'u SDK olan makinede yapılmalı.
- `expo start` çalışıyor (dev server + QR).

## 10. Testler

- `npm run typecheck` ✅ (tsc strict, 0 hata) · `npm run lint` ✅ (eslint-config-expo, 0 problem)
- `npx expo export --platform ios --platform android` ✅ (iOS 1576 + Android 1781 modül)
- Cross-platform tutarlılık: §7 ✅ · Web tarafı: hiçbir web dosyası değişmedi (git status temiz)

## 11. Web Etkisi

**Sıfır.** `apps/web`, `apps/api`, `packages/shared`, k8s manifestleri değişmedi; kök package.json/lockfile değişmedi. Web'in Docker build'i etkilenmez.

## 12. Prod Etkisi + Dev Ortam Olayı (ops dikkat)

Prod'a dokunulmadı; Hermes namespace'lerine dokunulmadı; seed çalıştırılmadı.

⚠️ **Bu sprintten bağımsız dev cluster arızası tespit edildi:** `logislot-dev`'de `/health` OK ama **tüm login'ler HTTP 500** (DB'ye yazan her endpoint). Tanı: deploy workflow'unun `kubectl rollout status statefulset/logislot-postgres` beklemesi **timeout** — **Postgres pod'u ready değil**. Son günlerdeki scheduler rollout timeout'ları da aynı belirtinin parçası (node kaynak/disk baskısı olasılığı yüksek). Cluster erişimi olan biri şunlara bakmalı: `kubectl -n logislot-dev describe pod logislot-postgres-0`, `kubectl -n logislot-dev logs logislot-postgres-0`, node disk/PVC doluluk (`kubectl describe nodes | grep -A5 Pressure`). Bu yüzden dev'e karşı E2E bu sprintte koşulamadı; consistency testi yerel stack'te yapıldı.

## 13. Eksikler / Backlog (matriste işli)

Tedarikçi: seri oluşturma (sihirbazda) + seri detay/iptal, bildirim tercihleri · Yönetim: admin adına randevu oluşturma, seri yönetimi, config CRUD'ları (kategori/araç/rampa/çakışma/istisna/tedarikçi/kullanıcı), raporlar, e-posta/denetim logları, bildirim zili · Platform: planlar, destek sağlığı, denetim izleri · Ortak: shared types paketi (`packages/shared`'ın mobile'dan tüketimi), push notification, EAS Build/store hazırlığı, mobile E2E (Maestro).

## 14. Sonraki Sprint Önerisi

1. **Dev cluster'ı onar** (Postgres) — dev'e karşı web+mobile smoke yeniden aktif olsun.
2. Mobile bildirimler (zil + tercihler + push) — web'de var, parity açığı en görünür alan.
3. Admin config CRUD'larının mobile card/list/detail karşılıkları (öncelik: tedarikçiler + rampalar).
4. Shared contract paketi (`packages/api-contract`): DTO + endpoint sabitleri tek kaynaktan; Metro monorepo config ile.
5. Android Studio kurulu ortamda Android emulator smoke + Maestro ile 3 portal login/logout E2E'si.
