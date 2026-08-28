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

### Public giriş yolu — Cloudflare önde

```
kullanıcı ──443──> Cloudflare (edge sertifikası)
                      │
                      └──8443──> 84.247.180.172
                                   │ iptables REDIRECT
                                   └──30772──> ingress-nginx (class nginx)
                                                 └──> logislot Ingress → portal Service
```

**80/443'e hiç dokunulmuyor** — onlar Hermes'in (`iptables 80→30880, 443→30443`).
Bir node'un 80/443'ü aynı anda iki yere gidemez; Cloudflare önde olduğu için
gerek de yok: kullanıcı her zaman `https://logislot.io` görür.

**Neden 8443?** Cloudflare origin'e yalnızca belirli portlardan bağlanır
(HTTPS: 443, 8443, 2053, 2083, 2087, 2096). ingress-nginx'in kendi
NodePort'ları (31412/30772) bu listede **yok**, o yüzden aradaki proxy şart.

**Neden `socat`, neden iptables değil:** `REDIRECT 8443→30772` denendi ve
çalışmadı — `ingress-nginx-controller` node2'de hostNetwork ile çalışıyor,
dolayısıyla zincir `netfilter NAT → IPVS → node2:443 masquerade` oluyor ve
çift NAT paketi cevapsız bırakıyor. Hermes'te aynı desenin çalışmasının
sebebi endpoint'inin **aynı node'daki** bir pod olması. Ayrıntı ve kurulum:
`k8s/origin-proxy/README.md`.

**Class seçiminin gerçek kriteri controller'ın izlediği namespace'tir:**

| controller | class | `--watch-namespace` | Service |
|---|---|---|---|
| `ingress-nginx` | `nginx` | yok = **hepsi** | NodePort `80:31412`, `443:30772` |
| `ingress-nginx-test` | `nginx-test` | **`hermes-test`** | `80:30880`, `443:30443` |

`nginx-test` node1'de 80/443'ü karşılıyor olsa da yalnızca `hermes-test`
namespace'ini izler; `logislot-prod`daki Ingress'i hiçbir zaman görmez.
27 Ağu 2026'da "public port onda" diye ona geçildi, deploy edildi, host'lar
yine Hermes'in catch-all'ına düştü. **Class `nginx`.**

**Sertifika Cloudflare'de.** cert-manager/Let's Encrypt kullanılmıyor: HTTP-01
doğrulaması 80 portundan erişim ister, o port Hermes'in. Cloudflare SSL modu
**Full (strict değil)** — origin'in self-signed sertifikası yeterli, trafik
yine şifreli. Full (strict) istenirse Cloudflare Origin CA sertifikası
`logislot-tls-logislot-io` secret'ı olarak yaratılıp ingress'teki `tls:`
bloğu açılır.

Doğrulama (DNS'siz, Host başlığıyla):

```
curl -H "Host: logislot.io" http://84.247.180.172:31412/   # LogiSlot gelir
curl -H "Host: logislot.io" http://84.247.180.172/         # Hermes gelir (catch-all)
```

### Geçiş: iki ayrı deploy, sıra önemlidir

`NEXT_PUBLIC_API_URL` **build-time**'dır (Next.js bundle'ına gömülür), yani
"API artık alan adında" bilgisi ancak **yeni bir imaj** ile gelir. Bu yüzden
geçiş tek deploy değildir:

| Aşama | İçerik | Ne zaman onaylanır | Prod'un durumu |
|---|---|---|---|
| 1 | Ingress + 4 portal + migration'lar. Web imajı **hâlâ** IP:port API'sine bakar. | DNS'ten **önce** olabilir | Çalışmaya devam eder |
| 2 | `https://api.logislot.io` ile derlenmiş web imajı | **Yalnızca DNS çözülmeye başladıktan sonra** | Alan adları tam çalışır |

**İkisini tek deploy'da birleştirmeyin.** Birleştirilirse, DNS yayılana kadar
prod web çözülmeyen bir adrese istek atar ve IP:port üzerinden bile
açılmaz — yani prod tamamen düşer.

Aşama 1 ile 2 arasında alan adları HTTP'de açılır ama API çağrıları
**mixed-content** nedeniyle tarayıcı tarafından engellenir (HTTPS sayfa →
HTTP API). Bu ara durum beklenendir; IP:port erişimi bu sırada sorunsuz
çalışmaya devam eder.

CORS listesi geçiş boyunca **hem** alan adlarını **hem** eski IP:port
kökenlerini taşır. Aşama 2'den sonra bile IP:port üzerinden açılan sayfa
alan adındaki API'yi çağırdığı için IP kökenleri gereklidir; ancak IP:port
erişimi tamamen bırakılınca silinebilirler.

**Sertifikalar:** `.com` ve `.io` **ayrı** sertifikalardır. Tek sertifikada
toplansalardı bir host doğrulanamadığında tümü başarısız olurdu; ayrı
oldukları için `.io`nun DNS'i geç gelse bile `.com` etkilenmez.

## Tenant'a özel (markalı) alan adları

Bir müşteri kendi alt alanını isterse (`cknb.logislot.io`, `cknbtedarik.logislot.io`),
kullanıcıları **genel** alan adından giriş yaptığında oraya otomatik devredilir.

**Kaydı platform yöneticisi girer:** `tenants.admin_host` / `tenants.supplier_host`
(Platform > Müşteri hesabı formu). Boş bırakılırsa hiçbir yönlendirme yapılmaz —
mevcut tenant'lar etkilenmez.

**Kayıt tek başına yetmez.** Wildcard DNS **yok**; her alan adı için ayrıca:
1. Cloudflare'de A/CNAME kaydı (proxied),
2. `k8s/overlays/<env>/ingress-patch.yaml` içinde host girdisi,
3. `LOGISLOT_CORS_ORIGINS` içinde origin.

Üçü açılmadan alan adına girilen değer kullanıcıyı **ulaşılamayan bir adrese**
gönderir. Bu yüzden alan formatı sunucuda doğrulanır (şema/port/yol temizlenir,
hostname biçimi zorunlu) ama varlığı doğrulanamaz — sıralama platform
yöneticisinin sorumluluğundadır.

### Oturum neden "devrediliyor"?

Oturum `localStorage`'da tutulur ve localStorage **origin'e bağlıdır**:
`yonetim.logislot.io` üzerinde açılan oturumu `cknb.logislot.io` okuyamaz. Düz bir
yönlendirme kullanıcıyı login ekranına geri düşürürdü.

Token'ı URL'e koymak yerine (adres çubuğundaki token geçmişe, eklentilere, ekran
paylaşımına sızar ve uzun ömürlüdür) kısa ömürlü bir kod devredilir:

```
yonetim.logislot.io   POST /auth/login          -> tokens + branded_host
                      POST /auth/handoff/issue  -> {code, host, expires_in: 30}
                      redirect https://cknb.logislot.io/handoff?code=…&next=/admin/dashboard

cknb.logislot.io      POST /auth/handoff/consume -> YENİ token çifti
                      router.replace(next)       (kod geçmişte kalmaz)
```

Kodu koruyan dört şey ve dördü de gerekli:

| | |
|---|---|
| Yalnızca sha256 özeti saklanır | Veritabanını okuyan geçerli kod üretemez |
| 30 saniye ömür | URL'e düşen kodun kullanılabilir kalma süresi |
| Atomik tek kullanım | Tek `UPDATE … RETURNING`; aynı kod iki oturuma dönüşemez |
| Hedef origin'e bağlı | `Origin` başlığı zorunlu; çalınan kod başka yerden kullanılamaz |

Kod üretildikten sonra hesap pasifleştirilmişse devir tamamlanmaz
(`_ensure_user_active`). Devir başarısız olursa kullanıcı **bulunduğu** alan
adında çalışmaya devam eder — markalı URL kozmetiktir, uğruna giriş bozulmaz.

Testler: `apps/api/tests/test_branded_host_handoff.py`.
