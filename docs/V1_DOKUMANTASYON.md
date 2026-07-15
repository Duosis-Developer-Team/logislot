<div align="center">

# LogiSlot — V1 Ürün Dokümantasyonu

**Akıllı Mal Kabul & Rampa Randevu Platformu**

_Sürüm 1 · 13 Temmuz 2026 · Bu kitapçıktaki tüm ekran görüntüleri canlı `logislot-dev` ortamından ve iOS simülatöründen alınmıştır._

</div>

---

## İçindekiler

1. [LogiSlot Nedir?](#1-logislot-nedir)
2. [Ürün Yüzeyleri — Genel Bakış](#2-ürün-yüzeyleri--genel-bakış)
3. [Teknoloji Yığını](#3-teknoloji-yığını)
4. [Mimari](#4-mimari)
5. [Port & URL Haritası ve Demo Hesaplar](#5-port--url-haritası-ve-demo-hesaplar)
6. [Deployment](#6-deployment)
7. [Landing Page (Public Giriş)](#7-landing-page-public-giriş)
8. [Giriş ve Portal İzolasyonu](#8-giriş-ve-portal-izolasyonu)
9. [Tedarikçi Portalı — Kullanım Kılavuzu](#9-tedarikçi-portalı--kullanım-kılavuzu)
10. [Yönetim Paneli — Kullanım Kılavuzu](#10-yönetim-paneli--kullanım-kılavuzu)
11. [Platform Yönetimi (Hidden) — Kullanım Kılavuzu](#11-platform-yönetimi-hidden--kullanım-kılavuzu)
12. [Mobil Uygulama](#12-mobil-uygulama)
13. [Güvenlik ve KVKK](#13-güvenlik-ve-kvkk)
14. [Test ve Kalite Güvencesi](#14-test-ve-kalite-güvencesi)
15. [V1 Sürüm Günlüğü](#15-v1-sürüm-günlüğü)
16. [Bilinen Sınırlar ve Yol Haritası](#16-bilinen-sınırlar-ve-yol-haritası)
17. [Ek: Ortam Değişkenleri](#17-ek-ortam-değişkenleri)

---

## 1. LogiSlot Nedir?

LogiSlot; fabrikaların ve depoların **tedarikçi mal kabul süreçlerini** dijitalleştiren, **rampa (dock) randevularını**, tedarikçi taleplerini, araç uygunluğunu, kargo belirsizliğini ve tesis bazlı operasyon kurallarını **tek merkezden** yöneten çok kiracılı (multi-tenant) bir B2B SaaS platformudur.

### Çözdüğü problem

Geleneksel mal kabul operasyonunda tedarikçi talepleri e-posta ve telefonla dağınık yönetilir; rampa doluluğu gerçek zamanlı görünmez; araç tipi–rampa uyumsuzluğu araç kapıya geldiğinde fark edilir; kargo geliş saatleri günün planını bozar; planlama, depo ve tedarikçi aynı bilgiye bakamaz.

### Nasıl çözer?

- **Kurallı gerçek müsaitlik:** Tedarikçi ürünü, aracı ve teslimat bilgisini girer; sistem tesis kurallarını (rampa uygunluğu, çalışma saatleri, kategori süreleri, çakışma grupları, kota/limitler) değerlendirip yalnızca **gerçekten uygun** saatleri gösterir.
- **Akıllı rampa yönlendirme:** Rampa atamasını motor yapar; manuel seçimde de tüm kural seti uygulanır.
- **Tek akışta onay yaşam döngüsü:** Bekliyor → Onaylandı / Reddedildi → Revize Bekliyor → Tamamlandı / İptal; her aksiyon denetim kaydına işlenir, taraflara bildirim gider.
- **Kargo uyarı katmanı:** Belirsiz varışlı kargolar takvimde ayrı bir farkındalık katmanı olarak görünür; standart randevuları **engellemez**.
- **Tesis bazlı izolasyon:** Her müşteri ayrı tenant; kategoriler, rampalar, kullanıcılar ve randevular **tesis** seviyesinde izole edilir.

---

## 2. Ürün Yüzeyleri — Genel Bakış

| Yüzey | Kitle | İçerik |
|---|---|---|
| **Landing Page** (public) | Potansiyel müşteri | Ürün anlatımı, temsili senaryo + sektör benchmark'ı, SSS/Destek, demo talebi, portal seçimi, KVKK/çerez sayfaları |
| **Tedarikçi Portalı** (web) | Tedarikçi firmalar | Randevu talebi (3 adımlı sihirbaz), takip, tekrarlayan seriler, kargo talebi, profil ve bildirimler |
| **Yönetim Paneli** (web) | Tesis operasyon ekibi | Dashboard, rampa takvimi, onay/revize/tamamla akışları, tüm tesis konfigürasyonu, kullanıcı/rol, raporlar, loglar |
| **Platform Yönetimi** (web, **hidden**) | LogiSlot/Duosis iç ekibi | Tenant/tesis yönetimi, planlar, kullanım metrikleri, destek sağlığı, platform denetim izleri |
| **Mobil Uygulama** (iOS/Android) | Tedarikçi + yönetim | Web ile **tam özellik paritesi** (platform hariç — bilinçli olarak mobilde yok) |

> **Hidden platform kuralı:** Platform Yönetimi public hiçbir yüzeyde (landing, seçiciler, mobil) **görünmez ve linklenmez**; yalnızca adresi bilen iç ekip doğrudan URL ile erişir. Gizlilik keşfedilebilirliği azaltır; **gerçek güvenlik backend RBAC'tedir** (bkz. Bölüm 13).

---

## 3. Teknoloji Yığını

| Katman | Teknolojiler |
|---|---|
| **Backend API** | Python 3.13 · FastAPI ≥0.115 · SQLAlchemy 2 (async) · Alembic migrasyonları · Pydantic v2 · PostgreSQL 16 · JWT (access+refresh **rotation**, oturum tablosu) · IP+e-posta bazlı login rate-limit · zamanlanmış işler (e-posta retry, bildirim temizliği) |
| **Web** | Next.js 15 (App Router, `output: standalone`) · React 19 · TypeScript strict · Tailwind CSS · TanStack Query 5 · next-themes (açık/koyu/sistem) · lucide-react ikonları · Plus Jakarta Sans |
| **Mobil** | Expo SDK 57 · React Native 0.86 · Expo Router (dosya tabanlı) · TanStack Query 5 · Expo SecureStore (token) · Reanimated 4 · Ionicons |
| **Test** | pytest (+asyncio) · Playwright E2E (14 spec, 24 senaryo) · ESLint · `tsc --noEmit` |
| **CI/CD** | GitHub Actions (`ci` → `Build Images` → `Deploy`) · GHCR imajları · kustomize base/overlay |
| **Altyapı** | Kubernetes v1.34 (kubespray, IPVS, flannel) · NodePort servisler · Docker Compose (lokal geliştirme) |

---

## 4. Mimari

### 4.1 Monorepo yapısı

```
LogiSlot/
├── apps/
│   ├── api/                 # FastAPI backend (auth, randevu motoru, config CRUD, raporlar, audit)
│   └── web/                 # Next.js web (landing + 3 portal tek uygulama, runtime portal modu)
├── logislot-mobile/         # Expo React Native uygulaması (bilinçli olarak workspace DIŞI*)
├── packages/shared/         # Paylaşılan domain sabitleri (statüler, etiketler)
├── e2e/                     # Playwright kritik akış testleri
├── k8s/                     # kustomize base + dev/prod overlay'leri
└── docs/                    # Dokümantasyon (bu kitapçık dahil)
```
\* Mobil, kök npm workspace'inin dışındadır: web'in Docker imajı kök lockfile ile `npm ci` çalıştırır; RN bağımlılıkları web imajını bozmasın diye mobil kendi lockfile'ını taşır. DTO/sabitler senkron kopyadır (paylaşılan paket çıkarımı yol haritasında).

### 4.2 Portal izolasyonu — tek imaj, runtime mod

`NEXT_PUBLIC_*` değişkenleri build-time olduğundan portal başına ayrı imaj **üretilmez**. Tek web imajı, her deployment'ta farklı `LOGISLOT_PORTAL_MODE` (runtime env) ile açılır:

| Mod | Davranış |
|---|---|
| `entry` | Yalnızca landing + public sayfalar (`/`, `/demo`, `/kvkk`, `/cerez-politikasi`); uygulama route'ları servis edilmez |
| `supplier` / `admin` / `platform` | `/login` o portalın girişidir; yabancı portal route'ları middleware ile `/login`'e yönlenir |
| `all` | Lokal geliştirme (compose): portal girişleri `/login/<portal>` altında |

Modu `src/middleware.ts` (route izolasyonu) ve `force-dynamic` server sayfaları okur; istemciye prop olarak iner.

### 4.3 Kimlik doğrulama ve RBAC

- **Tablo-ayrık üç login ucu:** `/auth/login` (TenantUser) · `/auth/supplier-login` (SupplierUser) · `/auth/platform-login` (PlatformUser). Cross-portal giriş **yapısal olarak imkânsızdır**.
- **Opsiyonel `portal` parametresi** (geriye uyumlu): portal-özel istemciler gönderir; uyuşmazsa 401.
- **Doğrulanmış kimliğe net hata:** Parola doğru ama hesap başka portala aitse "Bu hesap X için yetkili değil…" döner; yanlış parolada genel mesaj korunur (hesap keşfi sızdırılmaz).
- **Refresh rotation:** Her yenilemede eski oturum kapanır; "logout-everywhere" tüm oturumları düşürür. Parola değişiminde tüm oturumlar iptal edilip yeni çift döner.
- **İzin modeli:** Tesis üyeliği başına rol(ler) → izin kümesi. İzin grupları: Randevular (`appt.view/create/approve/reject/revise/complete/cancel`) · Takvim (`calendar.view/override`) · Konfigürasyon (`category/vehicle_category/dock/dock_conflict_group/supplier .manage`) · Yönetim (`user.manage`, `role.manage`, `report.view`). Platform kullanıcıları ayrı `platform.*` izin uzayındadır; tenant/supplier token'ları platform uçlarından **403** alır.

### 4.4 Çok kiracılı veri modeli (özet)

```
Tenant (müşteri)
└── Facility (tesis)  ← operasyonel izolasyon sınırı
    ├── Dock (rampa: çalışma saatleri, kabul edilen ürün/araç kategorileri)
    ├── DockConflictGroup (karşılıklı bloke / paylaşımlı kapasite / koşullu)
    ├── ProductCategory · VehicleCategory
    ├── DockOverride (kapalı gün / ek mesai)
    ├── Supplier (+ portal hesabı, kota ve süre limitleri, izinli kategoriler)
    ├── TenantUser + FacilityMembership + Role
    └── Appointment (+ Series, revizyon geçmişi, audit, e-posta logları, bildirimler)
```

---

## 5. Port & URL Haritası ve Demo Hesaplar

### Dev ortamı (domain gelene kadar port bazlı; sunucu `84.247.180.172`)

| Port | Yüzey | K8s Deployment / Service |
|---|---|---|
| **30080** | Public landing + portal seçici (entry) | `logislot-web` / `logislot-web-nodeport` |
| **30084** | Tedarikçi Portalı (`/login`) | `logislot-web-supplier(-service)` |
| **30085** | Yönetim Paneli (`/login`) | `logislot-web-admin(-service)` |
| **30086** | **Hidden** Platform Yönetimi (`/login`) | `logislot-web-platform(-service)` |
| **30081** | Paylaşılan REST API (`/health`, `/docs`) | `logislot-api(-nodeport)` |

Domain geçişinde aynı yapı subdomain'lere taşınır: `logislot.com` (entry) · `supplier.` · `app.` · `platform.` (yine hidden) · `api.` — yalnızca env URL'leri, Ingress ve CORS değişir (bkz. `docs/PORTAL_ISOLATION_AND_ROUTING.md`).

### Demo hesaplar (dev)

| Rol | E-posta | Parola | Girdiği yüzey |
|---|---|---|---|
| Tedarikçi (manuel onay — talepler yönetime düşer) | `tedarikci@anadoluun.com` | `Demo123!` | 30084 + mobil |
| Tedarikçi (otomatik onay özelliği örnekli) | `tedarikci@marmarasoguk.com` | `Demo123!` | 30084 + mobil |
| Sistem Yöneticisi (tenant) | `admin@cakesbakes.com` | `Demo123!` | 30085 + mobil |
| Rampa Yöneticisi | `rampa@cakesbakes.com` | `Demo123!` | 30085 + mobil |
| İzleyici | `izleyici@cakesbakes.com` | `Demo123!` | 30085 + mobil |
| Platform Yöneticisi | `admin@logislot.com` | `Demo123!` | **yalnız 30086** (mobilde giriş yok) |

---

## 6. Deployment

### 6.1 Kubernetes (dev — `logislot-dev` namespace)

- **Küme:** kubespray v1.34, IPVS mode, flannel; `node1 = 84.247.180.172` (control-plane + tüm LogiSlot NodePort'ları), `node2 = 84.247.180.173` (worker; PostgreSQL local-path PVC bu düğümdedir).
- **İş yükleri:** `logislot-api`, `logislot-scheduler`, `logislot-postgres` (StatefulSet), 4× web deployment (entry/supplier/admin/platform — **aynı imaj**, farklı `LOGISLOT_PORTAL_MODE`), her sürümde SHA-etiketli migration Job'ı.
- **Manifest düzeni:** `k8s/base` + `k8s/overlays/dev` (`web-portals.yaml` üç portal deployment'ı + NodePort'lar; `web-entry-patch.yaml` mevcut web'i entry moduna alır; `configmap-patch.yaml` CORS ve ortam ayarları).
- **CORS (dev):** 30080/30084/30085/30086 (her iki node IP'si) + `localhost:3010`.

### 6.2 CI/CD akışı

1. `dev` dalına push → **ci** (backend ruff+pytest, frontend tsc+lint+build) ve **Build Images** (GHCR'a `logislot-api` + `logislot-web`; web'e build-arg `NEXT_PUBLIC_API_URL`).
2. **Deploy** workflow'u → `kustomize edit set image` ile SHA tag'i sabitler → `kubectl apply -k overlays/dev` → migration Job → rollout + `/health` doğrulaması. (Prod overlay ayrıdır ve V1 kapsamında **hiç uygulanmamıştır**.)
3. İmaj etiketleri SHA'lıdır (`dev-<sha7>`), böylece Deployment spec değişir ve pod'lar gerçekten yeni imajı çeker.

> **Operasyon notu:** Kümede cluster-seviyesi bir Datadog admission webhook'u her yeni pod'a init-container'lar enjekte ederek başlatmayı 2–5 dk uzatabilir; Deploy workflow'u bu yüzden zaman aşımıyla "failed" görünse bile rollout genellikle başarılıdır — gerçek durum `kubectl -n logislot-dev get pods` ile doğrulanır.

### 6.3 Lokal geliştirme

```bash
docker compose up -d          # api :8010 · web :3010 (all modu) · postgres · scheduler
docker compose exec api python -m app.seed   # demo verisi
npx playwright test           # E2E (compose'a karşı)
cd logislot-mobile && npx expo start --port 8082   # mobil (8081 çoğu zaman dolu)
```

---

## 7. Landing Page (Public Giriş)

`http://84.247.180.172:30080/` — hem ürünü anlatan pazarlama sayfası hem de kullanıcılar için portal kapısı. Platform Yönetimi'ne dair **hiçbir ifade içermez**.

### 7.1 Hero + portal seçimi + çerez bilgilendirmesi

İlk ziyarette KVKK gereği çerez bilgilendirme banner'ı görünür (yalnızca zorunlu depolama kullanıldığı için onay değil, şeffaf bilgilendirmedir; "Anladım" kalıcıdır):

![Landing hero + çerez banner](screenshots/v1/01-landing-hero-banner.png)

Hero: değer rozetleri, gradyanlı başlık, **Demo Talep Et** birincil CTA'sı ve hemen altında iki portal kartı. Sağda büyük marka ikonu etrafında canlı operasyon kartları ("Rampa 2 · 09:30 · Onaylandı", kargo uyarısı, araç pili, slot ızgarası) hafifçe yüzer. Üst barda **bölüm navigasyonu** (Özellikler · Nasıl Çalışır · Yönetim · Tedarikçi · Destek) — tıklanınca sayfa ilgili bölüme yumuşak kayar:

![Landing hero](screenshots/v1/02-landing-hero.png)

Koyu temada aynı sayfa (tema anahtarı sağ üstte; logo/ikon asset'leri otomatik değişir):

![Landing hero koyu](screenshots/v1/13-landing-hero-dark.png)

### 7.2 Problem ve çözüm anlatımı

![Problem bölümü](screenshots/v1/03-landing-problem.png)

### 7.3 Özellik vitrini

Akıllı rampa yönlendirme, tesis bazlı kurallar, çakışma grupları, tedarikçi portalı, kargo uyarı katmanı, çok tesisli SaaS mimarisi:

![Özellikler](screenshots/v1/04-landing-ozellikler.png)

### 7.4 Nasıl çalışır — 3 adımlı akış

Gerçek sihirbaz sırasına sadık: önce ürün, sonra araç, sonra gerçek müsaitlikten saat:

![Nasıl çalışır](screenshots/v1/05-landing-nasil-calisir.png)

### 7.5 Temsili senaryo + sektör benchmark'ı

Dürüst anlatım ilkesi: senaryo **açıkça "temsili" etiketlidir**; sayısal vurgu yalnızca kaynak gösterilen **sektör** benchmark'ıdır (%30–50 bekleme/detention azalması). İlk gerçek müşteri ölçümü yayınlandığında bu bölüm güncellenecektir:

![Senaryo ve benchmark](screenshots/v1/06-landing-senaryo-benchmark.png)

### 7.6 Ürün vitrinleri

Yönetim paneli (canlı dashboard mock'u + CTA) ve tedarikçi deneyimi (sihirbaz mock'u + CTA):

![Yönetim vitrini](screenshots/v1/07-landing-yonetim-vitrin.png)

![Tedarikçi vitrini](screenshots/v1/08-landing-tedarikci-vitrin.png)

### 7.7 Güvenilir altyapı + entegrasyon işaretleri

Güven maddelerinin dibinde **ince** Duosis satırı: "Altyapı, Duosis güvencesiyle kurulur ve 7/24 izlenir." (Link, Duosis tarafıyla teyit sonrası `LOGISLOT_DUOSIS_URL` env'i ile aktifleşir.)

![Güvenilir altyapı](screenshots/v1/09-landing-guvenilir-altyapi.png)

Kurumsal alıcının ilk sorusuna kısa yanıt — API-öncelikli mimari; ERP/WMS-TMS/e-posta-takvim bağlantıları kurulum kapsamında planlanır:

![Entegrasyon](screenshots/v1/10-landing-entegrasyon.png)

### 7.8 Destek (SSS)

JS'siz, erişilebilir akordeon + iletişim kartı (1 iş günü dönüş taahhüdü):

![Destek SSS](screenshots/v1/11-landing-destek-sss.png)

### 7.9 Footer

Keşfet (bölüm linkleri) · Portallar · **Yasal** (KVKK, Çerez) · "Altyapı ortağı: Duosis" ince satırı:

![Footer](screenshots/v1/12-landing-footer.png)

### 7.10 Yan sayfalar

**/demo** — dönüşüm hunisinin ana sayfası: beklenti kartları (30 dk canlı demo · satış baskısı yok · 1 iş günü dönüş) + talep formu (CRM ucu gelene kadar gönderim, kullanıcının e-posta istemcisinde önceden doldurulmuş mesaj açar):

![Demo sayfası](screenshots/v1/14-demo-sayfasi.png)

**/kvkk** — aydınlatma metinleri (tesis kullanıcısı + tedarikçi/sürücü), ayrı açık-rıza kalemleri ve "hangi veri hangi hukuki dayanakla" matrisi; avukat onayına kadar "Taslak" bandı taşır:

![KVKK sayfası](screenshots/v1/15-kvkk-sayfasi.png)

**/cerez-politikasi** — ürünün gerçek durumuna dayalı: yalnızca zorunlu/işlevsel yerel depolama; analitik/pazarlama çerezi yok:

![Çerez politikası](screenshots/v1/16-cerez-politikasi.png)

---

## 8. Giriş ve Portal İzolasyonu

Her portalın **kendi** giriş sayfası vardır; eski 3'lü portal switcher kaldırılmıştır. Giriş ekranında yalnızca o portalın kimliği bulunur; "Ana portal seçimine geri dön" linki vardır (hidden platform'da bilinçli olarak yoktur).

| Tedarikçi (30084) | Yönetim (30085) | Platform — hidden (30086) |
|---|---|---|
| ![Tedarikçi login](screenshots/v1/17-login-tedarikci.png) | ![Yönetim login](screenshots/v1/18-login-yonetim.png) | ![Platform login](screenshots/v1/19-login-platform-hidden.png) |

**Rol çözümü:** Giriş sonrası istemci `/auth/me` ile `user_type`'ı doğrular; uyuşmazsa oturum temizlenir. Yanlış portalda **doğru parola** ile denenirse backend yönlendiren net hata verir (ör. yönetim hesabıyla tedarikçi portalında: _"Bu hesap Tedarikçi Portalı için yetkili değil. Lütfen doğru portal üzerinden giriş yapın."_). Yanlış modda yabancı route'lar (`/admin/*` tedarikçi portunda vb.) `/login`'e yönlenir.

---

## 9. Tedarikçi Portalı — Kullanım Kılavuzu

### 9.1 Randevularım

Girişte tedarikçi doğrudan randevu listesine düşer: sayaç kartları (Yaklaşan/Bekleyen/Tamamlanan), **Tekrarlayan Randevular** bölümü (detay + güçlü onaylı gelecek-iptal), Yaklaşan/Geçmiş sekmeleri, kart üzerinde statü/kargo rozetleri, revize önerisi ve red/iptal sebepleri, uygun durumda **İptal Et**:

![Tedarikçi randevularım](screenshots/v1/20-tedarikci-randevularim.png)

### 9.2 Yeni randevu — 3 adımlı sihirbaz

**Adım 1 — Ürün Bilgisi:** ürün adı, kategori (yalnızca tedarikçiye izinli olanlar listelenir), miktar+birim:

![Sihirbaz adım 1](screenshots/v1/21-tedarikci-sihirbaz-adim1.png)

**Adım 2 — Araç & Teslimat:** araç kategorisi (kategorinin varsayılanı otomatik gelir), plaka, sürücü; teslimat tipi **Standart** veya **Kargo** (kargo seçilirse saat yerine sabah/öğleden sonra/tüm gün penceresi seçilir):

![Sihirbaz adım 2](screenshots/v1/22-tedarikci-sihirbaz-adim2.png)

**Adım 3 — Tarih & Özet:** gün ve tahmini süre seçilince sistem **gerçek müsaitliği** hesaplar (Müsait / Kısmen dolu / Dolu / Kargo uyarısı lejantı). Kargo-uyarılı slot seçilirse engellemeyen bir farkındalık onayı sorulur. Bu adımda **Tekrarlayan randevu oluştur** açılabilir (haftalık / 2 haftalık / aylık × tekrar sayısı; tüm tarihler kural setinden geçer — biri uygunsuzsa **hiçbiri** oluşturulmaz):

![Sihirbaz adım 3 — gerçek müsaitlik](screenshots/v1/23-tedarikci-sihirbaz-adim3-musaitlik.png)

Talep gönderilince: tedarikçide otomatik onay yetkisi varsa randevu **anında onaylı** doğar; yoksa tesis onayına düşer.

### 9.3 Profil ve bildirim tercihleri

Firma bilgileri, süre/kota limitleri ve **bildirim tercihleri** (panel + e-posta; e-posta olay bazında açılıp kapanır — randevu revizeleri operasyonel kritik olduğundan panelde her zaman görünür):

![Tedarikçi profil](screenshots/v1/24-tedarikci-profil-bildirim-tercihleri.png)

### 9.4 Bildirimler

Sağ üstteki zil; okunmamış rozeti, tümünü okundu işaretleme ve bildirime tıklayınca ilgili randevuya gitme:

![Tedarikçi bildirimler](screenshots/v1/25-tedarikci-bildirimler.png)

---

## 10. Yönetim Paneli — Kullanım Kılavuzu

### 10.1 Genel Bakış (Dashboard)

Günün KPI'ları (bugünkü/bekleyen/tamamlanan/haftalık/aktif tedarikçi/kargo uyarılı), **Onay Bekleyen Talepler** ve **Yaklaşan Randevular** listeleri; çok tesisli kullanıcıda üst barda tesis seçici:

![Yönetim dashboard](screenshots/v1/26-yonetim-dashboard.png)

### 10.2 Takvim

Yatay zaman çizelgesi (timeline): her **rampa bir satır**, saat ekseni yataydır — rampa sayısı arttıkça görünüm satır ekleyerek kompakt kalır. Randevular statü renkli bloklar, kargolar taralı katman, kapalı/ek-mesai istisnaları kesikli bantlarla görünür; bugünde **“şu an” çizgisi** akar. Boş alana tıklayınca **o rampa+saat (30 dk hassasiyet) önceden dolu** adına-randevu oluşturma açılır; haftalık görünüm doluluk yüzdeleriyle özet verir:

![Takvim](screenshots/v1/27-yonetim-takvim.png)

### 10.3 Randevular ve yaşam döngüsü

Statü filtreli, aranabilir liste:

![Randevu listesi](screenshots/v1/28-yonetim-randevular.png)

Satıra tıklayınca detay çekmecesi: tüm bilgiler, revizyon geçmişi, tedarikçi iletişim bilgisi ve **duruma göre izinli aksiyonlar** (backend `allowed_actions` haritası): **Onayla · Reddet (sebep zorunlu) · Revize Et (yeni saat/süre/rampa + not; tedarikçi onayına düşer) · Tamamla (not opsiyonel) · İptal Et**:

![Randevu detayı](screenshots/v1/29-yonetim-randevu-detay.png)

### 10.4 Tedarikçi adına randevu oluşturma

"Yeni Randevu" ile açılır; tedarikçi seçilince yalnızca **onun izinli kategorileri** listelenir, süre seçenekleri limitlerine göre filtrelenir, gerçek müsaitlik grid'i gösterilir; rampa otomatik/manuel atanabilir (manuelde de tüm kurallar uygulanır), tekrarlayan seri desteklenir. Yönetici açtığı için randevu **onaylı doğar**; not denetim kaydına işlenir:

![Adına oluşturma](screenshots/v1/30-yonetim-adina-olusturma.png)

### 10.5 Tekrarlayan seriler

Serilerin listesi (tedarikçi, sıklık×adet, statü dağılımı) ve satır açılınca occurrence'lar. Toplu aksiyonlar hepsi **future_only**: **Seriyi Onayla** (revize bekleyenler; onay anında çakışmalar yeniden doğrulanır — biri uymazsa hiçbiri), **Seriyi Revize Et** (tüm gelecek randevular aynı saate kayar, tedarikçi onayına düşer), **Seriyi İptal Et** (tamamlanmışlara dokunulmaz, tedarikçiye tek özet bildirim):

![Seriler](screenshots/v1/31-yonetim-seriler.png)

### 10.6 Raporlar + CSV

Tarih aralığı/hazır seçimler; KPI kartları, günlük trend, statü/kategori dağılımları, **rampa kullanım yoğunluğu**, tedarikçi aktivitesi; **Özet CSV** ve **Randevu Detay CSV** indirme:

![Raporlar](screenshots/v1/32-yonetim-raporlar.png)

### 10.7 Tesis Ayarları

Ayarlar merkezi tüm konfigürasyon alanlarına açılır (girişler kullanıcı izinlerine göre görünür):

![Ayarlar hub](screenshots/v1/33-yonetim-ayarlar-hub.png)

**Ürün Kategorileri** — min. blokaj süresi ve varsayılan araç kategorisi randevu uygunluğunu doğrudan etkiler; pasifleştirme geçmişi bozmaz:

![Kategoriler](screenshots/v1/34-yonetim-kategoriler.png)

**Araç Kategorileri** — rampa uyumluluğunun ve koşullu çakışma tetiklerinin birinci sınıf varlığı:

![Araç kategorileri](screenshots/v1/35-yonetim-arac-kategorileri.png)

**Rampalar** — kabul edilen ürün/araç kategorileri (boş = tümü), gün-gün **çalışma saatleri editörü**, üye olduğu çakışma grupları:

![Rampalar](screenshots/v1/36-yonetim-rampalar.png)

**Çakışma Grupları** — fiziksel saha kısıtları konfigürasyonla modellenir: *Karşılıklı Bloke*, *Paylaşımlı Kapasite*, *Koşullu* (yalnızca seçili araç kategorileri geldiğinde devreye girer):

![Çakışma grupları](screenshots/v1/37-yonetim-cakisma-gruplari.png)

**Takvim İstisnaları** — rampa bazında *Kapalı* gün (sert engel) veya *Ek Mesai* (normal pencerenin yerine geçer):

![Takvim istisnaları](screenshots/v1/38-yonetim-takvim-istisnalari.png)

**Tedarikçiler** — firma kartı, izinli kategoriler, otomatik onay, süre/kota limitleri ve **portal hesabı yönetimi** (oluştur / parola sıfırla / aktif-pasif):

![Tedarikçiler](screenshots/v1/39-yonetim-tedarikciler.png)

**Kullanıcılar & Roller** — kullanıcı CRUD (geçici parola ile davet, rol ve yetkili-rampa ataması, parola sıfırlama = tüm oturumları düşürür) ve rol editörü (izin grupları işaretlenir; **sistem rollerinin** adı/izinleri kilitlidir):

![Kullanıcılar ve roller](screenshots/v1/40-yonetim-kullanicilar-roller.png)

**E-posta Logları** — durum/şablon/alıcı filtreleri, özet sayaçlar, başarısız gönderimde **tekil/toplu yeniden gönderim** (yaşam döngüsünü tekrar çalıştırmaz; kayıtlı içerik gönderilir):

![E-posta logları](screenshots/v1/41-yonetim-eposta-loglari.png)

**Denetim İzleri** — kim, ne zaman, neyi değiştirdi; kayıt açılınca **önce/sonra** JSON detayı:

![Denetim izleri](screenshots/v1/42-yonetim-denetim-izleri.png)

### 10.8 Bildirimler

Üst bardaki zil: yeni talep/iptal/kargo uyarıları; tıklayınca ilgili randevunun detayına gider:

![Bildirim paneli](screenshots/v1/43-yonetim-bildirim-paneli.png)

---

## 11. Platform Yönetimi (Hidden) — Kullanım Kılavuzu

Yalnızca `http://84.247.180.172:30086/login` (doğrudan URL). İç ekip; tenant'ları, tesisleri ve planları buradan yönetir. Yalnızca **agregat** metrikler gösterilir (PII yok).

**Kullanım & Sağlık** — 30 günlük toplamlar, tenant/tesis kullanım tabloları, SLA ortalaması, **Plan Ata / Override Ata** aksiyonları ve Usage CSV:

![Platform kullanım](screenshots/v1/44-platform-kullanim.png)

**Tenant Dizini** — müşteri hesapları; oluştur/düzenle (slug otomatik türetilir; kimlik alanları sonradan kilitli):

![Tenantlar](screenshots/v1/45-platform-tenantlar.png)

**Tesisler** — tenant'lar arası tüm tesisler; yeni tesis **bootstrap** varsayılanlarıyla ve **ilk yönetici** hesabıyla açılabilir (geçici parola yalnızca bir kez gösterilir):

![Tesisler](screenshots/v1/46-platform-tesisler.png)

**Planlar** — plan bir *politika kabıdır* (fatura hesaplamaz): kapsam (tenant/tesis), faturalama birimi, ölçülebilir boyutlar ve rate-card JSON'u; emekliye ayrılan plana yeni atama yapılamaz:

![Planlar](screenshots/v1/47-platform-planlar.png)

**Destek Sağlığı** — başarısız/retry e-posta, kritik bildirim, bekleyen randevu sayaçları ve zamanlanmış işlerin son koşum durumu:

![Destek sağlığı](screenshots/v1/48-platform-destek-sagligi.png)

**Platform Denetim İzleri** — tenant/tesis/plan operasyonlarının kayıtları:

![Platform denetim izleri](screenshots/v1/49-platform-denetim-izleri.png)

---

## 12. Mobil Uygulama

Expo tabanlı iOS/Android uygulaması web ile **aynı API'yi ve kuralları** kullanır; tedarikçi ve yönetim tarafında **tam özellik paritesi** vardır (ayrıntılı tablo: `docs/FEATURE_PARITY_MATRIX.md`). Platform Yönetimi mobilde **bilinçli olarak yoktur**.

### 12.1 Portal seçimi ve giriş

Web landing ile aynı tasarım dili: büyük temalı marka ikonu (float animasyonlu), değer rozetleri ve **kompakt ikonlu** iki portal kartı; tema anahtarı sağ üstte:

| Portal seçimi (açık) | Portal seçimi (koyu) |
|---|---|
| ![Mobil portal seçimi](screenshots/v1/50-mobil-portal-secimi.png) | ![Mobil portal seçimi koyu](screenshots/v1/53-mobil-portal-secimi-koyu.png) |

Portal-özel giriş ekranları (switcher yok; "Portal seçimine geri dön" var; giriş sonrası rol doğrulanır, uyumsuzsa oturum temizlenip net hata gösterilir):

| Tedarikçi girişi | Yönetim girişi |
|---|---|
| ![Mobil tedarikçi login](screenshots/v1/51-mobil-tedarikci-login.png) | ![Mobil yönetim login](screenshots/v1/52-mobil-yonetim-login.png) |

### 12.2 Yönetim akışı (mobil)

Dashboard (KPI + bekleyenler + bildirim zili) · takvim ajandası (gün okları + rampa grupları) · statü filtreli randevular · menüden **tüm konfigürasyon ekranlarına** erişim (RBAC'a göre görünür) · raporlar (CSV paylaşım-sayfasıyla) · rampa editörü (çalışma saatleri dahil):

| Genel Bakış | Takvim | Randevular |
|---|---|---|
| ![Mobil dashboard](screenshots/v1/54-mobil-yonetim-dashboard.png) | ![Mobil takvim](screenshots/v1/55-mobil-yonetim-takvim.png) | ![Mobil randevular](screenshots/v1/56-mobil-yonetim-randevular.png) |

| Menü (operasyon + konfigürasyon) | Raporlar | Rampalar |
|---|---|---|
| ![Mobil menü](screenshots/v1/57-mobil-yonetim-menu.png) | ![Mobil raporlar](screenshots/v1/58-mobil-yonetim-raporlar.png) | ![Mobil rampalar](screenshots/v1/59-mobil-yonetim-rampalar.png) |

### 12.3 Tedarikçi akışı (mobil)

Randevular (sayaçlar + seri bölümü + zil) · 3 adımlı sihirbaz (chip/slot dokunmatik UX, tekrarlayan seri dahil) · profil + bildirim tercihleri:

| Randevularım | Yeni randevu sihirbazı | Profil |
|---|---|---|
| ![Mobil tedarikçi randevular](screenshots/v1/60-mobil-tedarikci-randevular.png) | ![Mobil sihirbaz](screenshots/v1/61-mobil-tedarikci-sihirbaz.png) | ![Mobil profil](screenshots/v1/62-mobil-tedarikci-profil.png) |

**Teknik notlar:** token'lar Expo SecureStore'da; 401'de tek-uçuş refresh (rotation uyumlu); oturum düşerse giriş ekranına navigasyon reset. Doğrulama komutları: `npm run typecheck`, `npm run lint`, `npx expo export --platform ios --platform android`.

---

## 13. Güvenlik ve KVKK

| Katman | Uygulama |
|---|---|
| Kimlik doğrulama | Ayrık login uçları + JWT access/refresh **rotation** + oturum tablosu; logout-everywhere; parola politikası + zorunlu ilk-değişim |
| Yetkilendirme | Tesis-üyelik bazlı rol→izin; her endpoint sunucuda izin doğrular; platform uçları `platform.*` ister (tenant/supplier → 403) |
| Portal izolasyonu | Public yüzeyde platform yok; middleware route izolasyonu; client rol doğrulaması — **gizlilik ≠ güvenlik, asıl koruma RBAC** |
| Veri izolasyonu | Tenant→tesis kapsamı tüm sorgularda zorunlu; tedarikçi yalnız kendi verisini görür |
| Kötüye kullanım | Login IP+e-posta rate-limit (10/60sn); doğrulanmamış kimliğe hesap-varlığı sızdırılmaz |
| İzlenebilirlik | Tüm kritik aksiyonlar audit'e (önce/sonra) yazılır; e-posta teslimatı loglanır ve yeniden gönderilebilir |
| KVKK | `/kvkk` aydınlatma + ayrı açık-rıza kalemleri + veri/dayanak matrisi (avukat onayına kadar taslak bantlı); `/cerez-politikasi`; sitede yalnızca zorunlu depolama, analitik/pazarlama çerezi yok — banner bilgilendirme amaçlı |

---

## 14. Test ve Kalite Güvencesi

| Alan | Kapsam | Durum |
|---|---|---|
| Backend (pytest) | Auth (portal-aware dahil), randevu motoru/kurallar, config CRUD, seriler, raporlar, bildirim/e-posta | **184 geçer**; 5 tarih-hassas eski test bilinen şekilde başarısız (regresyon değil) |
| E2E (Playwright) | 14 spec / **24 senaryo**: login akışları, sihirbaz, onay döngüsü, seriler, logout, portal izolasyonu, landing/KVKK/çerez-banner | 24/24 |
| Statik | `tsc --noEmit` (web+mobil), ESLint, ruff | Temiz |
| Görsel/duyarlılık | 390/768/1280/1440 × açık/koyu taramaları; yatay taşma 0px; `prefers-reduced-motion` desteği | Doğrulandı |
| Mobil | typecheck+lint+`expo export` (iOS 1889 modül + Android); simülatör smoke | Doğrulandı |

---

## 15. V1 Sürüm Günlüğü

| Commit | İçerik |
|---|---|
| `cc76e9b` | Mobile foundation: Expo RN uygulaması + web/mobil parite süreci |
| `497654f` · `9f368a8` | Dev cluster arıza kök-neden (IPVS externalIP) + Hermes 443 iptables çözümü |
| `b60a282` | Mobil login yarışı düzeltmesi (reload gereksinimi kalktı) |
| `a3b4934` | **Tam özellik paritesi:** tüm yönetim/tedarikçi/platform ekranları mobilde |
| `d6d97f3` · `495230c` | **Portal izolasyonu:** public seçici (yalnız Tedarikçi+Yönetim), hidden platform :30086, portal-aware login, 4×web deployment, E2E |
| `bdc4d34` | **Premium landing page** + mobil ilk sayfa yeniden tasarımı |
| `5dfe296` · `9810546` | Landing dönüşüm+güven katmanı (demo hunisi, senaryo+benchmark, Duosis, entegrasyon) + **KVKK/çerez** sayfaları ve banner |
| `1c020b6` | Bölüm navigasyonu (tıkla-kaydır) + Destek/SSS bölümü + KVKK metin temizliği |

---

## 16. Bilinen Sınırlar ve Yol Haritası

- **Şirketleşme bilgileri:** KVKK sayfasındaki ticari unvan/MERSİS alanları, tüzel kişilik netleşince doldurulacak; metinler avukat onayı sonrası "Taslak" bandından çıkacak.
- **Demo formu:** Şimdilik mailto ile teslim; CRM/backend ucu bağlandığında yalnız submit davranışı değişecek. Gerçek iletişim adresi `LOGISLOT_CONTACT_EMAIL` ile verilecek; Duosis linki `LOGISLOT_DUOSIS_URL` teyidiyle aktifleşecek.
- **Yan pazarlama sayfaları:** Fiyatlandırma (paket yapısı kararı bekliyor), Entegrasyonlar detay sayfası, sektör çözüm sayfaları, Gizlilik/Kullanım Şartları tam metinleri.
- **Teknik borç:** Paylaşılan DTO/sabitlerin gerçek pakete çıkarılması (şu an senkron kopya); native push bildirimleri (in-app merkez mevcut); tarih-hassas 5 eski backend testinin sabitlenmesi.
- **Domain geçişi:** logislot.com subdomain mimarisi hazır (Bölüm 5); Ingress+TLS+env değişimiyle uygulanacak.

---

## 17. Ek: Ortam Değişkenleri

| Değişken | Kapsam | Açıklama |
|---|---|---|
| `LOGISLOT_PORTAL_MODE` | web (runtime) | `entry / supplier / admin / platform / all` — deployment'ın portal kimliği |
| `LOGISLOT_ENTRY_URL` / `LOGISLOT_SUPPLIER_URL` / `LOGISLOT_ADMIN_URL` | web (runtime) | Portal kartı hedefleri ve "geri dön" linki |
| `LOGISLOT_DUOSIS_URL` | web (runtime) | Duosis güven cümlesinin linki (boşsa linksiz metin) |
| `LOGISLOT_CONTACT_EMAIL` | web (runtime) | Demo/destek/KVKK başvuru e-postası |
| `NEXT_PUBLIC_API_URL` | web (**build-time**) | API adresi — değişirse web imajı yeniden build edilir |
| `LOGISLOT_CORS_ORIGINS` | api | İzinli origin listesi (dev: 4 portal + localhost) |
| `LOGISLOT_PUBLIC_WEB_URL` | api | E-postalardaki public link tabanı |
| `EXPO_PUBLIC_API_URL` | mobil (build-time) | Mobil API adresi (dev: `http://84.247.180.172:30081`) |

---

_İlgili dokümanlar: `PORTAL_ISOLATION_AND_ROUTING.md` · `FEATURE_PARITY_MATRIX.md` · `WEB_MOBILE_PARITY.md` · `GITHUB_CICD.md` · `MOBILE_FOUNDATION_REPORT.md` · `logislot-mobile/README.md`_
