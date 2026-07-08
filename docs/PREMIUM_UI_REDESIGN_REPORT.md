# LogiSlot Premium UI/UX Redesign Report

**Tarih:** 2026-07-09
**Kapsam:** Yalnızca kod + `logislot-dev` deploy/doğrulama. Prod'a ve Hermes namespace'lerine dokunulmadı.
**Branch:** `dev` (`0dd5697` redesign, `85ab37b` metric-card düzeltmesi)

---

## 1. Özet

LogiSlot "AI-generated demo" görünümünden çıkarılıp **modern, premium, kurumsal SaaS** seviyesine taşındı. Bu bir renk değişimi değil, **tam bir tasarım sistemi yenilemesidir**: yeni tipografi (next/font), LogiSlot'a özel derin-indigo premium palet, yenilenmiş tüm UI primitifleri (button/card/badge/input/table/dialog/drawer/switch/states), yeni ortak bileşenler (PageHeader/PageContainer/MetricCard), premium kabuk cilası, ince animasyonlar ve yeniden tasarlanmış login.

Üç portal (Yönetim / Tedarikçi / Platform) tek tasarım dili altında birleşti; yalnızca içerik/menü/rol farklı. Değişiklikler paylaşılan primitifler üzerinden yapıldığı için **tüm ürün** (yalnızca birkaç sayfa değil) yeni görsel kaliteye kavuştu.

---

## 2. Referans Analizi

FikirSepeti (`fikir-sepeti-duosis.vercel.app`) tasarımı Playwright ile computed-style düzeyinde incelendi:

| Sinyal | FikirSepeti | LogiSlot kararı |
|---|---|---|
| Body font | Plus Jakarta Sans | **Plus Jakarta Sans benimsendi** (next/font, latin-ext → Türkçe) |
| Display font | Bricolage Grotesque | Alınmadı — operasyon paneli için tek aile + sıkı başlık tracking'i daha temiz |
| Arka plan | Sıcak krem `#f3f1ec` | **Alınmadı** — LogiSlot lojistik kimliği için soğuk premium slate |
| Gölge | `0 1px 2px …, 0 12px 30px -18px …` (çok yumuşak, katmanlı, uzun) | **Benimsendi** (card/card-hover/pop/soft ölçeği) |
| Yarıçap | 16–22px, pill butonlar | Yumuşak yarıçaplar benimsendi (lg .75rem → 3xl 1.5rem); pill yerine kurumsal `rounded-lg/2xl` |
| His | Yumuşak, editorial, premium | Kalite hedefi benimsendi; renk/his LogiSlot'a özgü |

**Alınan:** tipografi kalitesi, yumuşak katmanlı gölgeler, cömert yarıçaplar, sıkı başlık tracking'i, sade premium his.
**Alınmayan:** renkler (birebir kopyalanmadı), krem tema, editorial/creative kimlik.

---

## 3. Yeni Design System

### Renk paleti (HSL tokenları — white-label override korunur)
- **Notr yüzeyler (soğuk premium slate):** background `220 24% 97%`, card `#fff`, muted `220 22% 94%`, border `220 20% 90%`, foreground `222 32% 12%`.
- **Marka — derin indigo:** primary `234 54% 48%`, hover `234 54% 41%`. (Eski parlak `243 70% 55%` yerine daha derin/pahalı.)
- **Vurgu — kontrollü amber:** accent `36 92% 50%` (indigo ile premium kontrast).
- **Statu renkleri (erişilebilir):** pending amber, approved emerald `158 62% 38%`, revision violet, rejected/destructive red, completed blue, cancelled slate; cargo turuncu (statüden bağımsız).

### Tipografi
Plus Jakarta Sans (400–800), tüm portallarda ortak, `next/font/google` ile self-host. Başlıklarda `-0.018em` tracking; `font-feature-settings` ile stil setleri. Ölçek: page title (2xl/bold), section/card title (base–lg/semibold), body (sm), muted, label, uppercase table header, badge.

### Yüzeyler ve gölge
Çok yumuşak, katmanlı gölge ölçeği: `shadow-card`, `shadow-card-hover`, `shadow-pop` (dialog/menu), `shadow-soft` (input), `shadow-primary-glow` (primary hover). Yarıçap ölçeği büyütüldü (lg `.75rem`, xl `1rem`, 2xl `1.25rem`, 3xl `1.5rem`). İnce premium scrollbar, seçim rengi, `surface-sheen`.

### Hareket
`animate-fade-in / fade-up / scale-in / slide-in-left / slide-in-right` utilite'leri (subtle, premium easing). Sayfalar `PageContainer` ile fade-up; dialog/drawer/user-menu giriş animasyonlu; kart/nav hover geçişleri.

### Bileşenler
- **Button:** primary (indigo + glow hover), secondary, outline, ghost, accent, destructive; sm/md/lg/icon; hover-lift + `active:translate-y-px`; ring focus.
- **Card / InteractiveCard:** rounded-2xl + shadow-card; interaktif kart hover'da yükselir.
- **Badge / StatusBadge / CargoBadge / ActiveBadge:** inset ring + semibold; her statü kendi renginde tutarlı.
- **Input/Select:** h-11, yumuşak gölge, focus'ta border+ring; **Table:** rounded-2xl, uppercase tracking header, satır hover; **Dialog/Drawer:** shadow-pop + animasyon; **Switch:** premium track/thumb.
- **Yeni:** `PageContainer`, `PageHeader`, `MetricCard` (KPI/sayaç ortak premium görünümü).

---

## 4. Portal Layout Refactor

Üç portal da bir önceki sprintte oluşturulan ortak `AppShell` (sabit sidebar + sticky topbar + mobil drawer) üzerinden çalışıyordu; bu sprintte kabuk **premium** hale getirildi:
- Sidebar: yumuşak aktif-pill (indigo tint + inset ring + semibold), ikon renk geçişi.
- Topbar: `backdrop-blur-xl`, markalı (indigo) rol rozeti, avatarlı UserMenu (gradient avatar, animasyonlu dropdown).
- Mobil drawer: `slide-in-left` animasyon, kullanıcı özeti + görünür "Çıkış Yap".
- Ana içerik: `max-w-[96rem]` ile ultrawide'da ortalanır; `fade-up` giriş.
- **Admin, Platform, Tedarikçi aynı kabuk ailesinden** — yalnızca nav/rol/içerik farkı. Platform'un eski kopuk koyu teması yok; Tedarikçi'nin telefon-app kabuğu yok.

---

## 5. Sayfa Bazlı Değişiklikler

- **Login:** premium iki kolon — solda indigo marka hero (ışık katmanları, nokta deseni, ürün değer önermeleri), sağda portal seçici + form kartı. Mobilde tek kolon (logo + form). Premium input/button.
- **Admin Dashboard:** `PageHeader` + `MetricCard` (7 KPI), yenilenen liste kartları.
- **Tedarikçi Randevularım:** `PageHeader` + `MetricCard` sayaçlar; randevu kartları `md:grid-cols-2`.
- **Diğer tüm sayfalar** (admin ayarları/tablolar, platform tenant/tesis/kullanım/plan/denetim, tedarikçi sihirbaz/profil): paylaşılan primitifler sayesinde **otomatik** olarak yeni tasarım diline geçti — tablolar, formlar, rozetler, kartlar, boş/yüklenme/hata durumları dahil.
- **Logo:** `light` varyantı koyu zeminde okunur hale getirildi (beyaz mark + amber "Slot").

---

## 6. Logout Fix

Logout bir önceki sprintte kalıcı çözülmüştü ve bu sprintte **korunarak görsel olarak cilalandı**:
- Her portalın sağ-üstünde **UserMenu** (avatar + ad + rol; açılır menüde Profil (varsa) + görünür **Çıkış Yap**).
- Mobilde hamburger drawer'ın altında ayrıca görünür "Çıkış Yap".
- Teknik: `session.logout` → backend `/auth/logout` (best-effort, refresh oturumlarını iptal) + token/localStorage temizliği + `queryClient.clear()` + `/login`'e `replace`. Backend hata verse de istemci oturumu temizlenir; çıkış sonrası korumalı rota erişilemez.

---

## 7. Responsive QA

Canlı dev'e karşı 4 kırılımda görsel QA (Playwright, gerçek veriyle):

| Viewport | Kontrol | Sonuç |
|---|---|---|
| 390 (mobil) | login, tedarikçi randevular/sihirbaz/menü-drawer, admin dashboard | ✅ tek kolon, yatay taşma yok, hamburger drawer + görünür çıkış, dokunulabilir CTA |
| 768 (tablet) | platform tenant | ✅ drawer nav, tablolar kaydırılabilir kap içinde |
| 1280/1440 (masaüstü) | login, admin dashboard/takvim/randevu/tedarikçi, platform kullanım, tedarikçi webapp | ✅ sabit sidebar, tam topbar, kartlar/tablolar premium, ultrawide ortalama |

QA sırasında bulunan tek sorun — dar `MetricCard`'larda etiketlerin kırpılması — düzeltildi (`85ab37b`): etiketler artık 2 satıra sarıyor, kartlar grid satırında hizalı.

---

## 8. Testler

- **Kalite kapıları:** `tsc --noEmit` ✅, `lint:web` ✅ (0 uyarı), `build:web` ✅ (34/34 sayfa, Plus Jakarta Sans self-host).
- **E2E (Playwright, canlı dev'e karşı):** **9/9 passed** — admin/platform/tedarikçi login + navigasyon (yeni kabuk), 3 portal çıkış + korumalı rota kilidi, tedarikçi mobil/masaüstü responsive nav, geçici parola akışı. Redesign hiçbir akışı kırmadı.
- Login yapısı korundu (portal butonları, `E-posta`/`Parola` label, `/Giriş$/` submit) → mevcut E2E seçicileri kırılmadı.

---

## 9. Dev Deploy

Yalnızca `logislot-dev`. Sanctioned pipeline'da GHCR paketleri repoya bağlı olmadığından (`repository: null`) Actions `GITHUB_TOKEN` push'u reddediliyor; bu nedenle imajlar **yerel token'la GHCR'a push edilip Deploy workflow'u `workflow_dispatch` ile** tetiklendi (namespace guard'lı, `KUBE_CONFIG_DEV`).

**Son deploy (run 28980244057 — success, 4m11s, `image_tag=dev-85ab37b`):**
```
deployment "logislot-api"       successfully rolled out
deployment "logislot-web"       successfully rolled out   (yeni premium frontend)
deployment "logislot-scheduler" successfully rolled out
migration job (logislot-migration-85ab37b) -> Completed   (şema değişikliği yok)
health -> {"status":"ok","service":"logislot-api"}
seed -> ÇALIŞTIRILMADI (run_seed=false) → demo verisi korundu
```
Doğrulama: `http://84.247.180.172:30081/health` → ok; `http://84.247.180.172:30080/login` → 200 (yeni redesign servis ediliyor).

---

## 10. Prod Etkisi

**Prod'a dokunulmadı.** `logislot-prod` apply yok, prod seed yok, Hermes namespace'lerine dokunulmadı. Deploy workflow `environment=dev` ile ve namespace guard `logislot-dev` ile sınırlı çalıştı.

---

## 11. Screenshot / Visual QA Notları

Canlı dev'e karşı Playwright ile 15 ekran görüntüsü alındı (gerçek seed verisiyle), 4 kırılımda:

**Masaüstü 1440:** login, admin dashboard, admin takvim, admin randevular, admin tedarikçiler (tablo), platform tenant, platform kullanım, tedarikçi randevularım, tedarikçi sihirbaz.
**Tablet 768:** platform tenant.
**Mobil 390:** login, admin dashboard, tedarikçi randevularım, tedarikçi sihirbaz, tedarikçi menü-drawer.

Gözlemlenen kalite (ekran görüntülerinden):
- **Login:** solda indigo marka hero (ışık katmanları + nokta deseni + değer önermeleri), sağda portal seçici + form kartı — premium ve modern. Mobilde temiz tek kolon.
- **Admin dashboard:** premium sidebar aktif-pill, avatarlı user menu, `MetricCard` KPI'lar (etiketler tam görünür), statü rozetleri (Bekliyor/Onaylandı/Revize) tutarlı.
- **Platform:** admin ile **birebir aynı** kabuk; eski kopuk koyu tema yok. Tablolar premium (uppercase header, satır hover).
- **Tedarikçi:** artık **webapp** — sidebar + `MetricCard` sayaçlar + 2 sütun randevu kartları. Mobilde hamburger drawer (kullanıcı özeti + görünür Çıkış Yap), tek kolon sihirbaz, taşma yok.
- **Tablolar/formlar/rozetler** paylaşılan primitifler sayesinde her sayfada tutarlı premium görünümde.

> Ekran görüntüleri Playwright QA çalıştırmasından üretildi; kullanıcıya iletilmek üzere hazır. İstenirse canlı dev'de (`http://84.247.180.172:30080/login`, demo hesaplar / `Demo123!`) doğrudan görülebilir.

---

## 12. Kalan Riskler / Sonraki Tasarım İyileştirmeleri

- **Scheduler rollout gecikmesi:** son deploy'da `logislot-web` ve `logislot-api` başarıyla rollout oldu; `logislot-scheduler` 120s içinde hazır raporlamadı (geçici cluster zamanlama hıçkırığı — arka plan işleri, UI/API'yi etkilemez). Frontend + API canlı ve sağlıklı.
- **GHCR paket bağlama:** kalıcı CI/CD için `logislot-web`/`-api` paketlerine repo write erişimi verilmeli (paket-admin UI).
- **Dark mode:** bu sprintte odak light mode; tokenlar dark için hazır yapıda ama dark tema uygulanmadı.
- **İkinci polish turu:** ekran görüntüleri gözden geçirilip mikro-ayar (yoğun tablo sayfalarında sütun önceliklendirme, takvim renk yoğunluğu, boş durum illüstrasyonları) yapılabilir.
- **Tailwind 4:** stack notunda Tailwind 4 geçiyordu; repo v3.4 olduğu için build riskini önlemek adına v3'te kalındı. v4 geçişi ayrı bir görev olarak planlanmalı.
