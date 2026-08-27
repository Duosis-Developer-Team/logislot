# Portal Isolation & Routing

_Son güncelleme: 2026-07-11 (Public Portal Selector + Hidden Platform Login sprinti)_

## Neden portal izolasyonu?

Eski giriş akışı tek login ekranında 3 portalı (Tedarikçi / Yönetim / Platform)
switcher ile sunuyordu. Bu:

- demo görünümü veriyordu, kurumsal portal kimliği yoktu,
- **Platform Yönetimi'ni public olarak keşfedilebilir** kılıyordu (internal
  super-admin alanımız halka reklam ediliyordu),
- kullanıcıya ait olmayan portalları gösteriyordu.

Yeni mimaride her portal **kendi giriş kimliğine ve kendi adresine** sahiptir;
platform ise public yüzeyden tamamen çıkarılmış **hidden internal portal**dır.

## Public selector: yalnızca Tedarikçi + Yönetim

Ana giriş (entry) ekranında email/parola YOKTUR; yalnızca iki kullanıcı
portalı kartı vardır:

- **Tedarikçi Portalı** — tesise teslimat randevusu oluştur/takip et
- **Yönetim Paneli** — rampa takvimi, onaylar, operasyon yönetimi

Entry'de **kesinlikle görünmeyenler**: Platform Yönetimi, Supervendor,
Platform Admin, Internal Admin, Tenant Directory — hiçbir metin/link/kart ile
referans edilmez.

## Hidden platform mantığı

Platform Yönetimi var olmaya devam eder ama:

- public selector'da görünmez ve LİNKLENMEZ,
- mobile uygulamada YOKTUR (ne seçici ne login),
- yalnızca adresi bilen iç ekip (LogiSlot/Duosis) doğrudan URL ile girer,
- platform login ekranında entry'ye dönüş linki bilinçli olarak yoktur.

> **Hidden ≠ güvenlik.** Gizlilik yalnızca keşfedilebilirliği azaltır. Gerçek
> güvenlik backend RBAC + ayrık login endpointleridir: platform endpointleri
> `platform.*` izinleri ister; tenant/supplier token'ları platform API'lerinden
> **403** alır. Platform URL'ini bilen ama platform hesabı olmayan biri
> giremez.

## Güncel dev portları (domain gelene kadar)

| Port | Rol | Deployment | Not |
|---|---|---|---|
| 30080 | Public entry (portal seçici) | `logislot-web` (mode=entry) | Eski tek-web adresi entry'ye dönüştü |
| 30084 | Tedarikçi portalı | `logislot-web-supplier` | `/login` tedarikçi girişi |
| 30085 | Yönetim portalı | `logislot-web-admin` | `/login` yönetim girişi |
| 30086 | **Hidden** platform portalı | `logislot-web-platform` | Public'te hiçbir yerde geçmez |
| 30081 | Paylaşılan API | `logislot-api` | Tüm portallar aynı backend |

## Tek image, runtime portal modu (mimari karar)

`NEXT_PUBLIC_*` değişkenleri **build-time**'dır; portal başına ayrı image
gerektirirdi (4× build). Bunun yerine **tek web image** runtime env ile
şekillenir:

- `LOGISLOT_PORTAL_MODE` = `entry | supplier | admin | platform | all`
- Mod **server-side** okunur: `src/middleware.ts` route izolasyonu uygular,
  sayfaların server wrapper'ları (`force-dynamic`) modu ve URL'leri client'a
  prop olarak geçirir.
- `all` modu lokal geliştirme/compose içindir (tek instance; portal loginler
  `/login/<portal>` altındadır) — ancak entry selector'da platform yine
  görünmez.

Entry deployment env'leri: `LOGISLOT_SUPPLIER_URL`, `LOGISLOT_ADMIN_URL`
(kart hedefleri). Portal deployment'ları: `LOGISLOT_ENTRY_URL` (geri dön
linki; platform'a verilmez).

## Route davranışı (moda göre)

| Mod | `/` | `/login` | Yabancı route |
|---|---|---|---|
| entry | Selector | → `/` | → `/` (hiçbir app route servis edilmez) |
| supplier | → `/login` | Tedarikçi girişi | `/admin/*`, `/platform/*`, `/login/*` → `/login` |
| admin | → `/login` | Yönetim girişi | `/supplier/*`, `/platform/*`, `/login/*` → `/login` |
| platform | → `/login` | Platform girişi | `/supplier/*`, `/admin/*`, `/login/*` → `/login` |
| all | Selector | → `/` | serbest (lokal) |

## Login akışı ve rol çözümü

1. Kullanıcı portal-specific login'de email/parola girer (portal switcher YOK).
2. Client, portalın endpoint'ine POST eder ve **opsiyonel `portal`
   parametresini** gönderir:
   - supplier → `POST /auth/supplier-login` (`portal: "supplier"`)
   - admin → `POST /auth/login` (`portal: "admin"`)
   - platform → `POST /auth/platform-login` (`portal: "platform"`)
3. Backend zaten **tablo-ayrık** çalışır (TenantUser/SupplierUser/PlatformUser)
   — cross-portal login yapısal olarak imkânsızdır. `portal` parametresi
   uyuşmazsa istek ayrıca reddedilir. **Eski payload (portal'sız) aynen
   çalışır** (backward-compatible).
4. Başarılı login sonrası client `/auth/me` çeker ve `user_type`'ı portal ile
   doğrular; uyuşmazsa oturum temizlenir + net hata (savunma derinliği).
5. Doğru rol → portal dashboard'una yönlenir.

### Yanlış portal hataları

Parola DOĞRULANDIYSA ama hesap başka portala aitse backend genel
"e-posta veya parola hatalı" yerine yönlendiren mesaj döner (parola
doğrulanmadan asla — hesap keşfi sızdırılmaz):

- Tedarikçi portalında admin/platform hesabı → *"Bu hesap Tedarikçi Portalı
  için yetkili değil. Lütfen doğru portal üzerinden giriş yapın."*
- Yönetim portalında supplier/platform hesabı → *"Bu hesap Yönetim Paneli için
  yetkili değil. Lütfen doğru portal üzerinden giriş yapın."*
- Platform portalında tenant/supplier hesabı → *"Bu hesap Platform Yönetimi
  için yetkili değil."*

### Portal → rol eşlemesi

| Portal | Kabul edilen | Reddedilen |
|---|---|---|
| supplier | supplier/carrier hesapları | tenant, platform |
| admin | tenant-scoped yönetim (Sistem Yöneticisi, Rampa/Depo Yöneticisi, İzleyici…) | supplier, platform |
| platform | platform kullanıcıları (`platform.*` izinleri) | tenant, supplier |

## CORS

Dev CORS origins (configmap `LOGISLOT_CORS_ORIGINS`):

```
http://84.247.180.172:30080  (entry)
http://84.247.180.172:30084  (supplier)
http://84.247.180.172:30085  (admin)
http://84.247.180.172:30086  (platform)
+ 84.247.180.173 muadilleri + http://localhost:3010 (compose)
```

Platformun CORS'ta olması normaldir: gizlilik UI katmanındadır, güvenlik
RBAC'tedir.

## K8s servis haritası (logislot-dev)

```
logislot-web            (mode=entry)     → logislot-web-nodeport            30080
logislot-web-supplier   (mode=supplier)  → logislot-web-supplier-service    30084
logislot-web-admin      (mode=admin)     → logislot-web-admin-service       30085
logislot-web-platform   (mode=platform)  → logislot-web-platform-service    30086
logislot-api                             → logislot-api-nodeport            30081
```

Manifestler: `k8s/overlays/dev/web-portals.yaml` (3 portal deployment +
service) ve `k8s/overlays/dev/web-entry-patch.yaml` (mevcut web → entry).
API/scheduler/postgres değişmedi. Prod overlay'e DOKUNULMADI (prod apply yok).

## Mobile eşleniği

- İlk açılış: **portal seçimi** (yalnızca Tedarikçi + Yönetim; platform YOK).
- Seçim → `SupplierLoginScreen` / `AdminLoginScreen` (ortak
  `PortalLoginScreen`, switcher yok, "portal seçimine geri dön" var).
- Login payload'ı `portal` parametresini gönderir; login sonrası
  `user_type` doğrulanır, uyumsuzsa oturum temizlenir + hata.
- Platform hesabı mobile public akışlarından giremez: mobile'da platform
  login'i yoktur; admin/supplier endpointleri platform hesabını reddeder
  ("… için yetkili değil"). Eski platform ekran kodu route olarak erişilemez
  durumdadır (index yönlendirmez, login yolu yok, RoleGuard platform
  user_type ister).

## Prod portları ve alan adları (2026-08-27)

Prod, dev'le **aynı** `LOGISLOT_PORTAL_MODE` mimarisini kullanır; yalnızca
portlar ve host'lar farklıdır. Dev'e hiç dokunulmadı.

| Port (prod) | Portal | `PORTAL_MODE` | Deployment |
|---|---|---|---|
| 30082 | Public entry (web sitesi) | `entry` | `logislot-web` |
| 30087 | Tedarikçi portalı | `supplier` | `logislot-web-supplier` |
| 30088 | Yönetim portalı | `admin` | `logislot-web-admin` |
| 30089 | **Gizli** admin paneli | `platform` | `logislot-web-platform` |
| 30083 | API | — | `logislot-api` |

> **Adlandırma tuzağı:** kodda `admin` modu **müşterinin yönetim panelidir**
> (`yonetim.logislot.com`), `platform` modu ise **bizim gizli admin
> panelimizdir** (`admin.logislot.com`). İkisini karıştırmak, gizli paneli bir
> müşteri subdomain'ine açmak demek olur.

### Host → portal eşlemesi

Müşteri URL'lerinde **port yoktur**; 80/443'teki ingress Host başlığına göre
dağıtır (`k8s/overlays/prod/ingress-patch.yaml`). `logislot.com` ve
`logislot.io` **birebir aynı** kural setine sahiptir.

> **Ingress class `nginx-test`'tir, `nginx` değil.** Kümede üç class var ama
> internete açık olan tek controller `ingress-nginx-test` (ADDRESS
> `84.247.180.172`, node1'de iptables 80→30880 / 443→30443). `nginx` ve
> `drake-nginx` yalnızca küme içi ClusterIP'tedir. Yanlış class'a yazmak
> **sessiz** bir hatadır: `kubectl get ingress` dolu görünür, alan adı
> dışarıdan hiç açılmaz.
>
> Hermes etkilenmez: `hermes-test-ingress` host `*` catch-all'dır ve nginx
> exact host'u catch-all'dan önce eşleştirir.

**TLS:** cert-manager kurulu, `letsencrypt-prod` ClusterIssuer'ı Ready
(preflight ile doğrulandı). Sertifika HTTP-01 ile otomatik üretilir, yani
**DNS yayına girdikten sonra**. `.com` ve `.io` ayrı sertifikalardır; biri
doğrulanamazsa diğeri etkilenmez.

| Host | Gider |
|---|---|
| `logislot.com`, `www.logislot.com` | entry |
| `yonetim.logislot.com` | yönetim portalı |
| `tedarikci.logislot.com` | tedarikçi portalı |
| `admin.logislot.com` | gizli admin paneli |
| `api.logislot.com` | API |
| `cknb.logislot.com` | yönetim portalı (Cakes & Bakes alias) |
| `cknbtedarik.logislot.com` | tedarikçi portalı (Cakes & Bakes alias) |

**Tenant alias'ları ayrı bir uygulama değildir.** `cknb.*` ile
`yonetim.*` **aynı** deployment'a gider; tenant, giriş yapan kullanıcının
kimliğinden çözülür — host'tan değil. Yeni müşteri alias'ı eklemek =
ingress'e iki kural + iki DNS kaydı. Kod değişmez.

### Geçişin iki adımı (sıra önemlidir)

1. **DNS + sertifika yayına girer.** Ingress kuralları zaten hazır.
2. **Ancak ondan sonra** `vars.PROD_NEXT_PUBLIC_API_URL` →
   `https://api.logislot.com` yapılır ve prod web imajı **yeniden build**
   edilir. Bu değer build-time'dır (Next.js bundle'ına gömülür).

Adım 2 adım 1'den önce yapılırsa prod web, çözülmeyen bir adrese istek atar
ve tamamen kullanılamaz hale gelir. Bu yüzden CORS listesinde geçiş boyunca
**hem** alan adları **hem** eski IP:port kökenleri bulunur; geçiş bitince IP
satırları silinir.
