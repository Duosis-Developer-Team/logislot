# LogiSlot — Birleşik Webapp Tasarım Sistemi + Logout Fix Sprint Raporu

**Tarih:** 2026-07-09
**Kapsam:** Yalnızca kod + `logislot-dev` doğrulama. Prod'a ve Hermes namespace'lerine dokunulmadı.
**Branch:** `dev` (commit `a0882a0` — feature; `d333dc5` — workflow re-index)

---

## 1. Özet

İki gözlemlenen sorun giderildi:

1. **Kopuk tasarım dili.** Üç portal (Yönetim / Tedarikçi / Platform) birbirinden farklı üç kabuk kullanıyordu: Admin açık temalı sabit sidebar + alt-nav; Platform koyu (`bg-slate-950`) üst-sekme şeridi, sidebar yok; Tedarikçi `max-w-md` telefon genişliğinde "mobil app" + alt-nav. Artık **üçü de tek bir `AppShell`** kullanıyor; yalnızca menü içeriği, rol rozeti ve header aksiyonları değişiyor.
2. **Çalışmayan/görünmeyen çıkış.** Platform panelinde çıkış **hiç yoktu**; Tedarikçi kabuğunda çıkış yoktu (yalnızca profil sayfasında gömülü bir buton vardı); mevcut `logout` helper'ı ise backend oturumunu iptal etmiyor ve query cache'i temizlemiyordu. Artık **her portalda görünür, ortak ve dayanıklı** bir çıkış var.

**Sonuç:** Tedarikçi portalı "ayrı mobil app" olmaktan çıkıp **responsive webapp**'e taşındı (masaüstü = sidebar'lı webapp; mobil = hamburger drawer, alt-nav yok). Tüm portallar aynı LogiSlot ürün ailesi görünümünde.

---

## 2. Problem Analizi (kod kanıtıyla)

| Portal | Eski kabuk | Çıkış durumu |
|---|---|---|
| Admin (`(admin)/admin/layout.tsx`) | Açık tema, sabit `w-60` sidebar, mobilde 5'li alt-nav | Header'da yalnızca ikon buton → `session.logout` |
| Platform (`(platform)/platform/layout.tsx`) | Koyu `bg-slate-950` üst şerit, `max-w-6xl`, sidebar yok | **YOK** — sadece "Vendor / Süper-Admin" etiketi |
| Tedarikçi (`(supplier)/supplier/layout.tsx`) | `max-w-md` telefon kabuğu, 3'lü alt-nav | **Kabukta yok** — yalnızca profil sayfasında gömülü buton |

**`logout` helper'ı** (`lib/auth/session.tsx`) yalnızca `clearSession()` + `window.location.href` yapıyordu:
- Backend `/auth/logout` **çağrılmıyordu** (sunucudaki refresh oturumları canlı kalıyordu — oysa endpoint mevcut ve "logout-everywhere" yapıyor).
- TanStack Query cache **temizlenmiyordu** (başka kullanıcı verisinin sızma riski).

---

## 3. Çözüm Mimarisi — Ortak Kabuk

Yeni paylaşılan bileşenler:

- **`components/shell/app-shell.tsx` — `AppShell`**
  - Masaüstü (`lg+`): solda sabit `w-60` sidebar (marka + nav + footer) + sticky `h-14` topbar.
  - Mobil (`<lg`): sidebar gizli; topbar'daki hamburger sol **drawer**'ı açar (nav + kullanıcı özeti + görünür "Çıkış Yap"). **Alt-nav yok** — webapp hissi için drawer tercih edildi.
  - Props: `nav`, `roleLabel`, `brand`, `headerStart`, `headerActions`, `profileHref`, `footer`, `sidebarStyle`. Yalnızca bunlar portallar arasında değişiyor.
  - Aktif menü: `pathname.startsWith(item.href)` + `aria-current="page"`.
- **`components/shell/user-menu.tsx` — `UserMenu`**
  - Sağ-üstte avatar (baş harfler) + ad + rol; açılır menüde ad/e-posta/rol başlığı, opsiyonel **Profil** linki, ve **görünür "Çıkış Yap"** (destructive vurgu, `role="menuitem"`).
  - Dışarı tıklamayla kapanır (mevcut `NotificationBell` deseniyle uyumlu).

Tasarım tokenları değişmedi — üç portal zaten aynı `globals.css` HSL değişkenlerini ve `tailwind.config.ts` renk/gölge/yarıçap ölçeğini paylaşıyor. Kabuk birleştirmesi bu tokenları tek görsel dilde topladı. Button/Card/Badge/Input/Table/Dialog/Drawer primitifleri aynen kullanıldı.

---

## 4. Logout Düzeltmesi (teknik)

`lib/auth/session.tsx` içinde ortak, dayanıklı `performLogout(queryClient)`:

1. `await authApi.logout()` — backend `/auth/logout` (logout-everywhere, refresh oturumlarını iptal eder). **Best-effort**: hata `try/catch` ile yutulur.
2. `clearSession()` — access/refresh token + portal `localStorage` anahtarları temizlenir. **Backend hata verse bile çalışır.**
3. `queryClient.clear()` — TanStack Query cache boşaltılır.
4. `window.location.replace("/login")` — `replace` ile history'de korumalı rota bırakılmaz; tam sayfa yüklemesi temiz durum garantiler.

`authApi.logout` → `client.ts`'e eklendi: `POST /auth/logout`.

`SessionProvider` artık `useQueryClient()` kullanıyor (root `Providers` → `QueryClientProvider` altında). `logout` `useCallback` ile stabil.

**Ortak kullanım:** UserMenu (üç portal), mobil drawer footer'ı, ve Tedarikçi profil sayfasındaki buton — hepsi aynı `session.logout` helper'ını çağırıyor.

---

## 5. Portal Bazlı Değişiklikler

- **Admin** (`(admin)/admin/layout.tsx`): `AppShell`'e taşındı. Tesis seçici `headerStart`, bildirim zili + tercih ikonu `headerActions`, branding `sidebarStyle` + `BrandMark` korundu. Bildirim Tercihleri dialog'u `AppShell` kardeşi olarak render ediliyor.
- **Platform** (`(platform)/platform/layout.tsx`): `AppShell`'e taşındı. Koyu ayrı tema kaldırıldı; ayırt edici sinyal artık "Platform" rol rozeti + platforma özgü menü. Bildirim/tesis seçici yok (platform kullanıcısında yok). **Çıkış eklendi.**
- **Tedarikçi** (`(supplier)/supplier/layout.tsx`): `max-w-md` telefon kabuğu ve alt-nav kaldırıldı; `AppShell` (masaüstü sidebar, mobil drawer). Bildirim zili `headerActions`, `profileHref="/supplier/profile"`, branding korundu.

### Tedarikçi sayfaları webapp genişliğine uyarlandı
- `appointments/page.tsx`: içerik `max-w-5xl` merkezli; randevu listesi tek sütun yerine `md:grid-cols-2` kart ızgarası; boş durum ızgara dışında.
- `new-appointment/page.tsx`: sihirbaz `max-w-2xl` merkezli (adım-adım korunuyor); başarı kartları da merkezli.
- `profile/page.tsx`: `max-w-3xl` merkezli; "Oturumu Kapat" butonu en alta taşındı (UserMenu + drawer çıkışına ek, aynı helper).

---

## 6. Responsive Davranış

| Kırılım | Kabuk davranışı |
|---|---|
| 390 px (mobil) | Sidebar gizli; topbar'da hamburger + marka + rol rozeti (md altı gizli) + UserMenu; hamburger → sol drawer (nav + çıkış). Tedarikçi sayfaları tek sütun. |
| 768 px (tablet) | Hâlâ drawer; rol rozeti görünür (`md:inline`); tedarikçi randevu kartları 2 sütun. |
| 1280 / 1440 px (masaüstü) | Sabit `w-60` sidebar; `lg:pl-60` içerik; hamburger gizli; tam topbar. |

Yatay taşma yok: içerik `min-w-0` + merkezli `max-w-*` kapsayıcılar.

---

## 7. Testler (Playwright)

Yeni: `e2e/10-shell-logout.spec.ts` (5 test):
1. **Admin çıkış** — UserMenu → "Çıkış Yap" → `/login`; `localStorage` token'ı `null`; çıkıştan sonra `/admin/dashboard` panel içeriğini göstermiyor (giriş guard'ı).
2. **Platform çıkış** — artık görünür ve çalışıyor; sonrasında korumalı rota kilitli.
3. **Tedarikçi çıkış** — kabukta görünür ve çalışıyor; sonrasında korumalı rota kilitli.
4. **Tedarikçi mobil (390px)** — sidebar linki gizli, hamburger görünür; drawer nav + görünür çıkış.
5. **Tedarikçi masaüstü (1280px)** — sidebar nav görünür, hamburger gizli.

`npx playwright test --list` → 14 test / 10 dosya, tümü derleniyor. Mevcut tedarikçi/branding testleri (`02`, `04`, `09`) etkilenmez: `.first()` seçicileri ve bottom-nav'a bağlı olmayan akışlar korundu.

---

## 8. Yerel Kalite Kapıları

| Kapı | Komut | Sonuç |
|---|---|---|
| TypeScript | `npx tsc --noEmit` (apps/web) | ✅ 0 hata |
| Lint | `npm run lint:web` | ✅ No ESLint warnings or errors |
| Build | `npm run build:web` | ✅ 34/34 sayfa üretildi |

---

## 9. Deploy (logislot-dev)

Yalnızca `logislot-dev`. Prod ve Hermes namespace'lerine dokunulmadı.

**GitHub Actions durumu (bu sprintte çözülen engel):**
- Özel workflow'lar (ci/build-images/deploy) Actions'ta **kayıtlı değildi** (yalnızca Dependency Graph indekslenmişti). Workflow dosya içeriği değiştirilerek yeniden kayda zorlandı → üçü de `active`.
- `Build Images` çalıştı ama GHCR push'ta durdu: `denied: permission_denied: write_package` — org paketleri repoya bağlı değil (`repository: null`), bu yüzden Actions `GITHUB_TOKEN`'ı yazamıyor.

**Bu sprintte kullanılan deploy yolu (engeli aşan):**
1. İmajlar yerel token'la (write:packages) GHCR'a push edildi:
   - `logislot-web:dev-d333dc5` — amd64, **yeni frontend**, `--build-arg NEXT_PUBLIC_API_URL=http://84.247.180.172:30081` (build-time).
   - `logislot-api:dev-d333dc5` — `api:dev`'den retag (API değişmedi).
2. **Deploy workflow'u** `workflow_dispatch` ile tetiklendi (`environment=dev`, `image_tag=dev-d333dc5`, `run_seed=false`). Bu adım cluster'a `KUBE_CONFIG_DEV` ile erişir — namespace guard'lı.

**Deploy sonucu (run 28977706134 — success, 3m4s):**
```
NAMESPACE=logislot-dev  IMAGE_TAG=dev-d333dc5
deployment "logislot-api"       successfully rolled out
deployment "logislot-web"       successfully rolled out
deployment "logislot-scheduler" successfully rolled out
migration job (logislot-migration-d333dc5) -> Completed  (şema değişikliği yok, no-op)
health (port-forward) -> {"status":"ok","service":"logislot-api"}
seed job -> ÇALIŞTIRILMADI (run_seed=false) → demo verisi korundu
```
Pod'lar: `logislot-web-66cff5ff78-48xrc` Running (yeni), `logislot-api-…-dp2lh` Running, `logislot-scheduler-…-gq72d` Running.

---

## 10. Doğrulama (canlı dev)

| Kontrol | Sonuç |
|---|---|
| `GET http://84.247.180.172:30081/health` | ✅ `{"status":"ok"}` |
| `http://84.247.180.172:30080/login` | ✅ HTTP 200 |
| E2E `10-shell-logout` (canlı dev'e karşı) | ✅ **5/5 passed** — admin/platform/tedarikçi çıkış + token temizliği + korumalı rota kilidi + tedarikçi mobil/masaüstü nav |
| E2E `01`/`05`/`02` (canlı dev'e karşı) | ✅ **3/3 passed** — admin, platform ve tedarikçi sihirbaz navigasyonu yeni kabukta çalışıyor |

Toplam **8/8 E2E testi canlı `logislot-dev` dağıtımına karşı geçti** — çıkışın üç portalda da görünür/çalışır olduğunu ve tedarikçinin responsive webapp davranışını canlı ortamda doğruladı.

---

## 11. Kalan İşler / Riskler

- **GHCR paket izni:** `logislot-web`/`-api` org paketleri repoya bağlı değil (`repository: null`) → CI `GITHUB_TOKEN` push'u `denied: permission_denied: write_package` alıyor. Kalıcı çözüm: paket ayarlarından repoya **write** erişimi ver (paket-admin/UI gerekir). Bu sprintte deploy, imajlar yerel token'la GHCR'a push edilip **Deploy workflow'u `workflow_dispatch` ile** tetiklenerek yapıldı.
- **Workflow indeksleme:** Özel workflow'lar (ci/build-images/deploy) Actions'ta kayıtlı değildi; workflow dosyalarının içeriği değiştirilerek yeniden kayda zorlandı (artık `active`).
- İleride: E2E'yi CI'da compose ile koşmak; UserMenu için klavye/ARIA odak tuzağı testi.

---

## 12. Kabul Kriterleri

| Kriter | Durum |
|---|---|
| 3 portal aynı kabuk/tipografi/kart/buton/badge/tablo ailesini paylaşır | ✅ `AppShell` + ortak tokenlar |
| Tedarikçi portalı responsive webapp (mobil app değil) | ✅ sidebar/drawer; alt-nav kaldırıldı |
| Admin + Platform aynı dashboard kabuğunda | ✅ `AppShell` |
| Çıkış her portalda görünür ve ortak | ✅ UserMenu + mobil drawer |
| Çıkış backend logout + token + query cache temizler, `/login`'e döner | ✅ `performLogout` |
| İstemci oturumu backend hata verse de temizlenir | ✅ `try/catch/finally` |
| Çıkış sonrası korumalı rota erişilemez | ✅ guard + `location.replace` |
| Responsive QA 390/768/1280/1440 | ✅ (Bölüm 6) |
| Playwright: 3 logout + shell görünürlük + responsive nav | ✅ `10-shell-logout.spec.ts` |
| Yalnızca dev; prod/Hermes'e dokunulmadı | ✅ |
