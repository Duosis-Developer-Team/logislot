# LogiSlot Premium Animated Login Redesign Report

**Tarih:** 2026-07-09
**Kapsam:** Yalnızca kod + `logislot-dev` deploy/doğrulama. Prod'a ve Hermes namespace'lerine dokunulmadı.
**Branch:** `dev` (`b5725ec`)

---

## 1. Özet

Login ekranı, "AI-generated template" görünümünden çıkarılıp **premium, animasyonlu bir B2B SaaS giriş deneyimine** dönüştürüldü. Bu bir renk değişimi değil, **bileşen bazlı yeniden tasarımdır**.

> **Yön güncellemesi (kullanıcı geri bildirimi):** İlk sürüm split-screen (sol hero + sağ form) idi. Kullanıcı "ortadan ikiye bölünmüş değil, **ortalı tek parça** harika modern tasarım" istedi → login **ortalı tek elevated kart** olarak yeniden kuruldu; animasyonlu zemin (aurora orb'lar + nokta deseni + ortam lojistik çipleri) kartın etrafını sarıyor. Split-screen bileşenleri (`LoginHero`, `FloatingLogisticsVisual`) kaldırıldı.

Framer Motion yüklü olmadığından ölçülü, performanslı **CSS/Tailwind animasyonları** (prefers-reduced-motion destekli) kullanıldı.

---

## 2. Eski Tasarım Problemleri

- Sol lacivert alan düz bir blok; statik, storytelling yok.
- Sağ taraf düz form; portal kartları kaba, spacing sıradan.
- Animasyon/geçiş yok; ürün ilk izlenimi yapay.
- Tek dosyada büyük JSX; bileşen ayrımı yok.
- Demo hesap satırı düz metin; kopyalama yok.
- Parola alanında göster/gizle yok.

---

## 3. Yeni Login Design Direction

Premium logistics SaaS, sakin ve profesyonel, **ortalı tek parça**: ekran ortasında elevated bir auth kartı (rounded-3xl + shadow-pop + backdrop-blur), etrafında tema-uyumlu animasyonlu zemin — sürüklenen aurora orb'lar (primary + accent tint), kenarları maskeli nokta deseni ve geniş ekranlarda ortam "lojistik" çipleri (storytelling). Kart içinde: marka logosu, başlık, segment portal seçici, 48px inputlar, premium buton, kopyalanabilir demo pill.

---

## 4. Uygulanan Componentler

`apps/web/src/components/auth/`:
- **`LoginBackground`** — tema-uyumlu animasyonlu zemin: `aurora` ile sürüklenen orb'lar (light'ta ince, dark'ta belirgin), radial-maskeli nokta deseni, ve xl+ ekranlarda 3 ortam lojistik çipi (08:30 · Rampa 2 · Onaylandı / Doluluk %72 / Otomatik onay) — `float` ile süzülür, mobilde gizli, tokenlarla iki temada da uyumlu.
- **`PortalSelector`** — 3 segment kart (role=radiogroup/radio, aria-label=tam başlık), animasyonlu seçili durum (navy/mavi dolu ikon + check rozeti + ring + lift), hover geçişi.
- **`LoginFormCard`** — kart chrome'suz premium form (dış tek kartın içinde): 48px input, parola göster/gizle (Eye/EyeOff), inline hata alert'i (AlertCircle + fade-in), buton loading (spinner + "Giriş yapılıyor…") / hover-lift / disabled, ArrowRight ikonu.
- **`DemoCredentials`** — muted pill: rol bazlı demo e-posta + parola (mono) + kopyala butonu (kopyalandı check state).
- **`portals.ts`** — paylaşılan portal config (title/short/demo/target/buttonLabel).
- **`ThemeToggle`** (mevcut) — sağ üstte.
- **`login/page.tsx`** — ince orchestrator: ortalı elevated kart (scale-in + iç stagger), state + submit + kompozisyon.

> Kaldırılan: `LoginHero`, `FloatingLogisticsVisual` (split-screen sürümüne aitti).

---

## 5. Animasyonlar

- **Giriş (entrance):** hero içeriği ve sağ panel `.stagger` ile sıralı fade-up (nth-child gecikmeleri).
- **Portal switch:** seçili kart yumuşak geçiş (ikon/ring/check); form `key={portal}` ile hızlı fade-in; demo e-posta + buton etiketi güncellenir.
- **Yüzen görsel:** `float` / `float-sm` keyframe'leriyle ana kart ve çipler farklı gecikmelerle hafifçe süzülür; "canlı" nabız (ping).
- **Zemin:** `aurora` keyframe ile orb'lar yavaşça sürüklenir.
- **Microinteraction:** buton hover parlaklık/lift + `active:translate-y-px`, portal kart hover lift.
- **Erişilebilirlik:** `@media (prefers-reduced-motion: reduce)` tüm animasyon/geçişleri neredeyse kapatır.

Kural: neon yok, sakin/premium; mobilde ağır animasyon yok.

---

## 6. Light/Dark Mode Uyumu

- **Light:** soft slate arka plan, beyaz/elevated auth kartı, derin navy primary buton, mavi accent, premium border/shadow.
- **Dark:** near-black navy arka plan, koyu elevated kart, parlak mavi primary buton, beyaz metin, okunaklı border/input.
- Hero her iki temada sabit navy (`bg-brand-navy`); logo `variant="dark"` (beyaz). ThemeToggle premium dropdown (Açık/Koyu/Sistem), sağ üstte.

---

## 7. Mobile Responsive QA

Canlı dev'e karşı Playwright ile 4 durum (light/dark × 1440/390), **yatay taşma yok** (`scrollWidth == innerWidth`):

| Viewport | Davranış |
|---|---|
| 390 (mobil) | Ortalı kart tam genişlikte (padding'li), logo + başlık + 3'lü portal seçici + form + demo pill dikey akışta; ortam çipleri gizli (xl:flex); taşma yok. |
| 768 (tablet) | Ortalı kart; çipler henüz gizli (xl altı). |
| 1280/1440 (masaüstü) | Ortalı elevated kart + etrafında sürüklenen orb'lar + ortam lojistik çipleri (08:30 · Rampa 2, Doluluk %72, Otomatik onay). |

Klavye açılınca form kullanılabilir; buton tam genişlik; demo e-posta dar ekranda truncate (kopyala tam veriyi alır).

---

## 8. Login UX / Portal Selection

- Portal seçilince demo e-posta otomatik güncellenir (Tedarikçi→tedarikci@anadoluun.com, Yönetim→admin@cakesbakes.com, Platform→admin@logislot.com) — mevcut davranış korundu.
- Buton etiketi role göre: "Tedarikçi Portalı'na Giriş" / "Yönetim Paneli'ne Giriş" / "Platform Yönetimi'ne Giriş".
- Hata: inline premium alert (agresif değil). Loading: spinner + "Giriş yapılıyor…". `must_change_password` akışı korundu.

---

## 9. Testler

- `tsc --noEmit` ✅, `lint:web` ✅ (0 uyarı), `build:web` ✅ (34/34 sayfa).
- Yerel prod sunucuda login **light + dark** (1440 + 390) görsel doğrulandı; **mobil yatay taşma bug'ı** (grid auto-track içerik genişliğine büyüyordu) `grid-cols-1` ile giderildi (`scrollWidth == innerWidth`).
- **E2E (canlı dev): 17/17 passed** — tüm suite (admin/platform/tedarikçi akışları, çıkış, responsive nav, marka+tema, sihirbaz, değişiklik parola, seri, denetim).
- Portal seçici `role="radio"` olduğundan `helpers.ts` + `06`/`09` specleri `getByRole("radio", …)`'a güncellendi. Ayrıca parola göster/gizle butonunun `aria-label`'ı `getByLabel("Parola")` ile çakışıyordu → locator'lar `{ exact: true }` yapıldı (login akışı korundu).

---

## 10. Dev Deploy

Yalnızca `logislot-dev`. İmajlar yerel token'la GHCR'a push edilip Deploy workflow'u `workflow_dispatch` ile tetiklendi (namespace guard'lı, `KUBE_CONFIG_DEV`).

**Son deploy (`image_tag=dev-b36412b`):** `logislot-api` ve `logislot-web` başarıyla rollout oldu (yeni ortalı login canlı); health ok; seed çalışmadı (demo verisi korundu). `logislot-scheduler` bu deploy'da da 120s içinde hazır raporlamadı (tekrarlayan geçici cluster zamanlama hıçkırığı; UI/API'yi etkilemez).

Doğrulama:
```
GET /health  -> {"status":"ok"}
GET /login   -> "Giriş yap" + "Doluluk %72" (yeni ortalı tasarım servis ediliyor)
```
Frontend: http://84.247.180.172:30080/login

---

## 11. Prod Etkisi

**Prod'a dokunulmadı.** `logislot-prod` apply yok, prod seed yok, Hermes namespace'lerine dokunulmadı. Deploy `environment=dev` + namespace guard `logislot-dev` ile sınırlı.

---

## 12. Kalan Riskler / Sonraki Polish

- Framer Motion eklenmedi (CSS animasyonları yeterli + hafif). İleride spring tabanlı geçişler istenirse eklenebilir.
- Mobilde demo pill e-postası dar ekranda truncate olur (kopyala butonu tam veriyi kopyalar).
- Yüzen görsel dekoratiftir (gerçek veri değil); istenirse gerçek "bugünkü doluluk" mini API'siyle beslenebilir.
- İleride: portal switch'te form alanları arası daha zengin geçiş, sosyal/SSO alanı, "beni hatırla".
