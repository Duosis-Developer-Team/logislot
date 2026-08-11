# LogiSlot Brand Assets + Light/Dark Theme Integration Report

**Tarih:** 2026-07-09
**Kapsam:** Yalnızca kod + `logislot-dev` deploy/doğrulama. Prod'a ve Hermes namespace'lerine dokunulmadı.
**Branch:** `dev` (`354565c`)

---

## 1. Özet

4 marka logosu düzgün bir asset sistemiyle projeye entegre edildi, ilgili tüm yerlere (login, admin/platform/supplier kabukları, favicon/app icon) kaliteli şekilde yerleştirildi ve LogiSlot renk sistemi **logoya uygun** (derin navy + logistics mavi) şekilde yeniden kuruldu. Ayrıca **tam bir light/dark tema sistemi** (next-themes; light/dark/system, kalıcı, flash'sız) eklendi ve tüm kabuklara + login'e görünür bir **tema toggle**'ı kondu.

LogiSlot artık tek bir premium brand system gibi görünüyor; hem açık hem koyu modda logoyla uyumlu, okunaklı ve kurumsal.

---

## 2. Eklenen Logo Assetleri

Kaynak 4 PNG **opak** geldi (arka planlar dolu; ikonlarda baked checkerboard). PIL ile işlendi:
- **Global renk-mesafesi keying** ile arka plan VE harf iç-boşlukları (counter) şeffaf yapıldı → her yüzeyde temiz (flood-fill'in bırakacağı opak counter sorunu yok).
- Yumuşak alpha rampası ile premium anti-aliased kenar; içerik trim + yeniden ölçek + optimize.

Üretilen web assetleri (`apps/web/public/brand/`):
| Dosya | Boyut | Kullanım |
|---|---|---|
| `logislot-logo-light.png` | 713×220, ~86KB, şeffaf | Açık zemin full logo (navy wordmark) |
| `logislot-logo-dark.png` | 711×220, ~78KB, şeffaf | Koyu zemin full logo (beyaz wordmark) |
| `logislot-icon-light.png` | 512×512, şeffaf | Açık zemin ikon-only |
| `logislot-icon-dark.png` | 512×512, şeffaf | Koyu zemin ikon-only |
| `icon-192.png` / `icon-512.png` | PWA manifest ikonları (navy zemin + beyaz ikon) |

Örneklenen marka renkleri: **navy #00183C**, **accent mavi #4884CC** → palet bunlara göre kuruldu.

---

## 3. Logo Component Sistemi

`apps/web/src/components/brand/logo.tsx`:
- `<LogiSlotLogo variant="auto|light|dark" size="sm|md|lg|xl" priority? />` — full logo.
- `<LogiSlotIcon variant="auto|light|dark" size="sm|md|lg|xl" />` — ikon-only.

`variant="auto"` (varsayılan): aktif temaya göre doğru asset **CSS ile** seçilir (light asset `dark:hidden`, dark asset `hidden dark:block`) → JS/hydration bağımlılığı ve flash yok. Ratio korunur (width/height attr'leri), layout shift olmaz, `alt="LogiSlot"`. Tek tek `<img>` dağılmıyor; her yerde bu bileşenler.

---

## 4. Favicon / App Icon Entegrasyonu

Next.js App Router konvansiyonu:
- `apps/web/src/app/icon.png` (512, navy yuvarlak zemin + beyaz ikon) → favicon.
- `apps/web/src/app/apple-icon.png` (180) → iOS.
- `apps/web/src/app/favicon.ico` (16/32/48 multi-size).
- `apps/web/public/site.webmanifest` (name/short_name/theme_color/background_color + 192/512 ikonlar), `layout.tsx` metadata'sına bağlandı; `viewport.themeColor` light/dark için ayrı.

Favicon bilinçli olarak **navy zemin + beyaz ikon** (nötr): hem açık hem koyu tarayıcı sekmesinde görünür (şeffaf ikon tek modda kaybolurdu).

---

## 5. Light Theme

Logo-uyumlu premium palet (`globals.css` `:root`, HSL):
- background `214 40% 97%` (soft cool), card `#fff`, muted `214 30% 93%`, border `214 28% 88%`, foreground `217 40% 12%`.
- **primary derin navy `214 78% 19%`** (logo), hover `214 82% 14%`, foreground beyaz.
- **accent logistics mavi `212 74% 50%`** (logo yol rengi) = ring.
- status renkleri (pending/approved/revision/rejected/completed/cancelled) + cargo; `--brand-navy 214 80% 12%` login hero için.

White-label override (`ApplyBranding`) hâlâ yalnızca `--primary/--primary-hover/--accent`'i değiştirir.

---

## 6. Dark Theme

`.dark` token seti (near-black navy, logo dark zeminiyle uyumlu):
- background `218 44% 6%`, card `218 38% 9%`, muted `217 30% 15%`, border `216 26% 18%`, foreground `214 32% 96%`.
- **primary dark'ta parlak mavi `212 84% 56%`** (navy buton koyu zeminde görünmezdi) → butonlar/aktif durum mavi ve okunur.
- accent/ring parlak mavi; status renkleri koyu zemin için parlatıldı.
- `color-scheme: dark` (form kontrolleri/scrollbar), shadow'lar koyuda border ile taşınır.

---

## 7. Theme Toggle / Persistence

- `next-themes` `ThemeProvider` (`attribute="class"`, `defaultTheme="system"`, `enableSystem`, `disableTransitionOnChange`, `storageKey="logislot.theme"`).
- `<ThemeToggle>` (Açık/Koyu/Sistem, ikonlu, erişilebilir `menuitemradio`) — AppShell topbar'ında (Platform/Admin/Supplier) + login sağ-üstünde.
- Kalıcılık: localStorage (`logislot.theme`); refresh sonrası korunur. `<html suppressHydrationWarning>` + next-themes blocking script ile **hydration mismatch ve flash yok**. System preference'a saygı.

---

## 8. Portal Bazlı Logo Kullanımı

- **Login:** navy hero'da `variant="dark"` (beyaz logo), mobilde `variant="auto"`. Hero her iki temada sabit navy (`bg-brand-navy`).
- **Admin / Platform / Supplier:** AppShell sidebar + mobil drawer + mobil topbar markası `variant="auto"` (BrandMark white-label fallback'i olarak). Tema değişince doğru logo otomatik.
- **Guard / change-password:** `LogiSlotLogo size="lg"`.
- Beyaz-label tenant markası varsa `BrandMark` tenant logosunu gösterir; yoksa LogiSlot auto logo.

---

## 9. Responsive QA

Canlı dev'e karşı Playwright ile light + dark ekran görüntüleri (gerçek seed verisi):

| Viewport | Kontrol | Sonuç |
|---|---|---|
| 390 (mobil) | login (light/dark), tedarikçi drawer (dark: beyaz logo + mavi aktif pill + kırmızı çıkış) | ✅ auto logo temaya göre doğru, taşma yok |
| 768 (tablet) | platform | ✅ drawer nav, tablolar kaydırılabilir |
| 1280/1440 (masaüstü) | login, admin dashboard/takvim/tedarikçiler, platform kullanım, tedarikçi randevular/sihirbaz | ✅ her iki temada okunaklı |

**Dark mode UI:** sidebar/topbar (beyaz logo), metrik kartları, tablolar (uppercase header + satır), status/kargo rozetleri, form/inputlar (color-scheme:dark date picker'lar), user menu, drawer, çıkış — hepsi kontrast ve okunabilirlik açısından doğrulandı. **Light mode:** navy primary + mavi accent, premium soft arka plan, logo-uyumlu.

---

## 10. Testler

- `tsc --noEmit` ✅, `lint:web` ✅ (0 uyarı), `build:web` ✅ (34/34 sayfa).
- Yerel prod sunucuda login **light + dark** (1440 + 390) görsel doğrulandı: auto logo temaya göre doğru, navy hero, dark form + parlak mavi buton, toggle çalışıyor.
- **E2E (canlı dev): 10/10 passed** — yeni `11-brand-theme.spec.ts` (login logo + toggle, admin logo + koyu tema **refresh sonrası korunur** + localStorage `logislot.theme=dark`, platform/tedarikçi logo+toggle) ile `10-shell-logout` (3 portal çıkış + responsive nav) ve `01`/`02` (nav/sihirbaz). Marka+tema hiçbir akışı kırmadı.

---

## 11. Dev Deploy

Yalnızca `logislot-dev`. İmajlar yerel token'la GHCR'a push edilip Deploy workflow'u `workflow_dispatch` ile tetiklendi (namespace guard'lı, `KUBE_CONFIG_DEV`).

**Yakalanan bug (deploy doğrulaması sırasında):** `public/` klasörü daha önce yoktu; Next.js standalone çıktısı `public/`'i otomatik kopyalamaz → marka assetleri **404** veriyordu. Dockerfile'a `COPY --from=builder /repo/apps/web/public ./apps/web/public` eklenip yeniden build/deploy edildi.

**Son deploy (run 28981940447 — success, `image_tag=dev-091558e`):** api/web/scheduler rolled out, migration Completed (şema değişikliği yok), health ok, seed çalışmadı (demo verisi korundu).

Doğrulama:
```
GET /health                                  -> {"status":"ok"}
GET /brand/logislot-logo-light.png           -> 200 image/png
GET /brand/logislot-logo-dark.png            -> 200
GET /icon.png (app icon)                      -> 200
GET /site.webmanifest                         -> 200
GET /login                                    -> next-themes + logo servis ediliyor
```
Not: bir önceki iki deploy denemesinde `logislot-scheduler` 120s içinde hazır raporlamadı (geçici cluster zamanlama hıçkırığı; web+api her seferinde rollout oldu). Son deploy'da scheduler de başarıyla ayağa kalktı.

---

## 12. Prod Etkisi

**Prod'a dokunulmadı.** `logislot-prod` apply yok, prod seed yok, Hermes namespace'lerine dokunulmadı. Deploy `environment=dev` + namespace guard `logislot-dev` ile sınırlı.

---

## 13. Kalan Riskler / Notlar

- Kaynak logolar AI-üretimi ve opak geldiği için keying kullanıldı; sonuç temiz. İleride vektör (SVG) master verilirse daha keskin olur.
- Dark modda gölgeler düşük görünür (koyu zeminde beklenen); ayrım border tokenlarıyla sağlanır.
- White-label tenant `--primary` override'ı dark modda da uygulanır; tenant rengi koyuda düşük kontrast verirse ileride dark-özel override eklenebilir.
- Tailwind 3.4'te kalındı (repo v3; v4 geçişi ayrı görev).
- Collapsed sidebar şu an bir özellik değil; ikon-only asset favicon/app-icon + gerekirse gelecekteki collapse için hazır.
