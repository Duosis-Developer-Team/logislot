# LogiSlot GitHub Secrets + CI/CD Activation + Dev Deploy Report

Tarih: 2026-07-08

## 1. Özet

Tüm GitHub Secrets/Variables ve production environment koruması ayarlandı;
GHCR'a amd64 image'lar build/push edildi; **`logislot-dev` ortamı Hermes
cluster'ında CANLI ve sağlıklı** (pilot_readiness 0 FAIL). GitHub Actions'ın
otomatik koşmaması bir **org-seviyesi politika** blokajı (org admin aksiyonu
gerekir) olduğundan, dev ilk kurulumu manuel olarak (kubeconfig + GHCR)
yapıldı — dokümante edilen `k8s/README §5b` elle-deploy yolu. Yalnızca
`logislot-dev` namespace'ine dokunuldu; Hermes/ingress/monitoring
namespace'leri değişmedi (doğrulandı). **Prod deploy YAPILMADI** (required
reviewer onayı bekliyor).

## 2. GitHub Actions Ayarları

- Repo-level Actions: enabled / allowed_actions=all (kullanıcı ayarladı).
- **Blokaj**: custom workflow'lar (ci/build-images/deploy/e2e) `dev`
  default branch'inde mevcut ama `actions/workflows` API'de yalnızca
  GitHub'ın dahili "Dependency Graph"ı kayıtlı — özel workflow'lar hiç
  indekslenmiyor. Aynı org'daki **Hermes'te 2 workflow kayıtlı** olması,
  bunun **org Actions politikası "selected repositories"** olduğunu ve yeni
  `logislot` repo'sunun izin listesinde olmadığını gösteriyor (org policy
  okuma denemesi 403 — `admin:org` gerekir). **Çözüm (org admin)**:
  Organization Settings → Actions → General → allow list'e `logislot` ekle
  veya "All repositories".

## 3. Variables

| Variable | Değer |
|---|---|
| `DEV_NEXT_PUBLIC_API_URL` | http://84.247.180.172:30081 ✔ |
| `PROD_NEXT_PUBLIC_API_URL` | http://84.247.180.172:30083 ✔ |

## 4. Secrets (değerler asla loglanmadı; `gh secret list` yalnızca ad gösterir)

| Secret | Durum |
|---|---|
| `KUBE_CONFIG` | ✔ (patched: server `127.0.0.1:6443` → `84.247.180.172:6443`; harici IP'den TLS/SAN doğrulandı, runner'lar erişebilir) |
| `DEV_LOGISLOT_SECRET_KEY` / `DEV_POSTGRES_PASSWORD` / `DEV_DATABASE_URL` | ✔ (k8s secret ile AYNI değer — drift yok) |
| `PROD_LOGISLOT_SECRET_KEY` / `PROD_POSTGRES_PASSWORD` / `PROD_DATABASE_URL` | ✔ |
| SMTP_* | set edilmedi (log_only; opsiyonel) |

**KUBE_CONFIG kararı**: kullanıcının verdiği kubeconfig `127.0.0.1:6443`'e
işaret ediyordu — GitHub-hosted runner buna erişemezdi. Server harici IP'ye
patch'lendi; bu makineden `kubectl get nodes` ile gerçek cluster'a bağlanılıp
**cert SAN'ının harici IP'yi içerdiği doğrulandı** → runner'lar da bağlanır.

## 5. Production Environment

- `production` environment oluşturuldu; **required reviewer: coskungencay**;
  deployment branch policy: yalnızca `prod`. Prod deploy artık manuel onay
  bekler (deploy.yml zaten `environment: production` kullanıyor).

## 6. NodePort / Dry-run (gerçek cluster'a karşı)

- NodePort 30080–30083 **BOŞ** (çakışma yok; mevcut 31412/30772/30880/30443
  ile çakışmıyor).
- `kubectl apply --dry-run=client -k` dev + prod → **temiz** (12'şer kaynak,
  doğru namespace'ler).

## 7. Dev Deploy (logislot-dev CANLI)

Manuel akış (Actions blokajı nedeniyle; README §5b):
1. amd64 image'lar (arm64 Mac'te cross-build/QEMU) GHCR'a push:
   `logislot-api:dev|dev-d22e8dd`, `logislot-web:dev|dev-d22e8dd`
   (web `NEXT_PUBLIC_API_URL=http://84.247.180.172:30081` ile).
2. namespace + `logislot-secrets` (GitHub DEV_* ile aynı) + `ghcr-pull`
   pull secret (paketler private) → default SA'ya bağlandı.
3. `kubectl apply -k k8s/overlays/dev` → 12 kaynak.
4. Migration job → **12 sürüm temiz uygulandı** (`ca5e432dfa5e` head).
5. Seed job (dev demo verisi) → tamam.

Sonuç:

| Kaynak | Durum |
|---|---|
| logislot-api / web / scheduler | 1/1 Running (node2) |
| logislot-postgres | 1/1 Running, PVC 5Gi Bound (local-path) |
| API `/health` (http://84.247.180.172:30081/health) | `{"status":"ok"}` ✔ |
| Web `/login` (http://84.247.180.172:30080/login) | HTTP 200 ✔ |
| **pilot_readiness** (dev'e karşı) | **0 FAIL, 1 WARN** ✔ |

WARN: "bildirim temizliği henüz koşmadı" — beklenen (24 saatlik aralık;
e-posta retry job'ı koştu ve maintenance_runs'a kaydedildi, support health'te
görünüyor).

## 8. GHCR

- Paketler: `ghcr.io/duosis-developer-team/logislot-api`,
  `.../logislot-web` (amd64, `dev` + `dev-d22e8dd`).
- Şu an **private**; cluster `ghcr-pull` imagePullSecret ile çekiyor
  (default SA'ya bağlı). İstenirse paketler public yapılabilir (o zaman pull
  secret gereksiz). CI ileride koşarsa aynı `:dev`/sha tag'lerini üretir.

## 9. Güvenlik Notları / Bekleyenler

- **KUBE_CONFIG (admin client cert/key) ve root parolası sohbete
  yazıldı** → sohbet geçmişinde kalır. **Öneri: cluster admin sertifikasını
  ve node root parolasını döndürün** (ikisi de gerçek credential).
- Manuel deploy'da geçici kubeconfig scratchpad'de tutuldu ve **iş bitince
  silindi** (`shred`); repo'ya hiçbir secret yazılmadı; docker logout yapıldı.
- **SSH kullanılmadı** — kubectl (kubeconfig) + yerel Docker + GHCR yeterliydi
  ve root-SSH'tan daha güvenli.
- Hermes namespace'leri (hermes/hermes-dev/hermes-test) yaş/durum değişmedi —
  dokunulmadı; yalnızca `logislot-dev` oluşturuldu.

**Kullanıcıdan beklenenler:**
1. **Org admin**: Actions politikasına `logislot`'u ekle → CI/CD otomatik akar.
   (Şu an dev manuel çalışıyor; CI aynı `:dev` tag'ini üretecek şekilde
   secret'lar tutarlı — drift yok.)
2. **Prod deploy**: hazır ama bilinçli onay gerekir. `dev`→`prod` PR
   (Actions açılınca) veya master'dan elle `kubectl apply -k
   k8s/overlays/prod` (30082/30083). **Prod'da seed YOK** — müşteri
   onboarding UI'dan.
3. Credential rotasyonu (§9).
4. GHCR paketlerini public yapmak isterseniz pull secret'ı kaldırabilirsiniz.

## 10. Erişim

- **Dev Web**: http://84.247.180.172:30080  (login: admin@logislot.com / Demo123!)
- **Dev API**: http://84.247.180.172:30081/health
- Demo hesaplar: admin@cakesbakes.com (tenant admin), tedarikci@anadoluun.com
  vb. — hepsi `Demo123!`.
