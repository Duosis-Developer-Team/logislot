# LogiSlot — GitHub Repo, Branch Stratejisi ve CI/CD

> Repo **PUBLIC** olacak: kubeconfig, token, parola, gerçek `.env`, gerçek
> Kubernetes Secret manifest'i, GHCR token **ASLA commit edilmez**. Repo'ya
> yalnızca `*.example` dosyaları, workflow'lar, kustomize manifestleri ve
> dokümantasyon girer. Tüm gizli değerler **GitHub Secrets**'ta yaşar.

## 1. Repo Oluşturma (kullanıcı onayıyla)

```bash
# gh CLI auth'luysa (once: gh auth status):
gh repo create Duosis-Developer-Team/logislot --public --source=. --remote=origin --push

# veya elle:
git remote add origin git@github.com:Duosis-Developer-Team/logislot.git
# HTTPS alternatifi: https://github.com/Duosis-Developer-Team/logislot.git
git push -u origin dev prod
```

## 2. Branch Stratejisi

| Branch | Amaç | Push sonucu |
|---|---|---|
| `dev` | Ana geliştirme | CI → image build (`:dev`, `:dev-<sha7>`) → **logislot-dev** deploy |
| `prod` | Canlı/müşteri | CI → image build (`:prod`, `:prod-<sha7>`) → **logislot-prod** deploy |

Akış: geliştirme `dev`'de yapılır → release için `dev` → `prod` PR/merge.
`prod`'a doğrudan push yerine PR önerilir; GitHub'da **production
environment**'ına *required reviewers* eklenirse prod deploy'u ayrıca
**manuel onay** bekler (Settings → Environments → production — önerilir).

## 3. Workflow'lar

| Dosya | Tetikleyici | Ne yapar |
|---|---|---|
| `ci.yml` | push/PR (dev, prod) | ruff+pytest, tsc+lint+build, **kustomize overlay doğrulaması** |
| `e2e.yml` | dispatch, PR | compose + demo smoke + Playwright (9 test) |
| `build-images.yml` ("Build Images") | push (dev, prod) | GHCR'a api+web image build/push; **web build-arg NEXT_PUBLIC_API_URL ortama göre** |
| `deploy.yml` ("Deploy") | Build Images başarıyla bitince (workflow_run) veya elle (dispatch) | namespace guard → secret upsert → `kustomize edit set image` (sha tag) → apply → **SHA'lı migration job** → rollout + `/health` → (yalnızca dispatch+`run_seed=true` ise) seed |

## 4. Gerekli GitHub Secrets / Variables

**Secrets** (Settings → Secrets and variables → Actions → Secrets):

| Secret | Zorunlu | Açıklama |
|---|---|---|
| `KUBE_CONFIG` | ✔ (veya alttaki ikisi) | Cluster kubeconfig'i, **base64** (`base64 -w0 ~/.kube/config`). Aynı cluster iki ortam — tek kubeconfig yeterli |
| `KUBE_CONFIG_DEV` / `KUBE_CONFIG_PROD` | ○ | Ortam başına ayrı kubeconfig istenirse (varsa `KUBE_CONFIG`'e tercih edilir) |
| `DEV_LOGISLOT_SECRET_KEY` | ✔ | `openssl rand -hex 32` |
| `DEV_POSTGRES_PASSWORD` | ✔ | Güçlü parola (URL'i bozmaması için `openssl rand -hex 24` önerilir) |
| `DEV_DATABASE_URL` | ✔ | `postgresql+asyncpg://logislot:<DEV_PW>@logislot-postgres:5432/logislot` |
| `DEV_SMTP_HOST/PORT/USERNAME/PASSWORD/FROM_EMAIL/FROM_NAME` | ○ | log_only iken boş kalabilir |
| `PROD_LOGISLOT_SECRET_KEY` | ✔ | DEV'den FARKLI olmalı |
| `PROD_POSTGRES_PASSWORD` | ✔ | DEV'den FARKLI olmalı |
| `PROD_DATABASE_URL` | ✔ | `postgresql+asyncpg://logislot:<PROD_PW>@logislot-postgres:5432/logislot` (host aynı görünse de her namespace KENDİ postgres'ine çözer — DB'ler fiziksel olarak ayrı) |
| `PROD_SMTP_*` | ○ | Gerçek SMTP gelince doldurulur + configmap'te provider `smtp` yapılır |

GHCR push için ek token GEREKMEZ: workflow `GITHUB_TOKEN` + `packages: write`
iznini kullanır. (Org ayarları paket yazmayı kısıtlıyorsa `GHCR_TOKEN` PAT'i
eklenip login adımında kullanılabilir.)

**Variables** (aynı ekran → Variables; boşsa NodePort varsayılanları kullanılır):

| Variable | Varsayılan | Açıklama |
|---|---|---|
| `DEV_NEXT_PUBLIC_API_URL` | `http://84.247.180.172:30081` | Dev web image'inin build-time API adresi |
| `PROD_NEXT_PUBLIC_API_URL` | `http://84.247.180.172:30083` | Prod web image'inin build-time API adresi |

> **NEXT_PUBLIC_API_URL build-time'dır** — değiştirmek yeni web image build'i
> gerektirir (branch'e boş commit push'u veya dispatch ile Build Images).

## 5. GHCR Image Adları

```
ghcr.io/duosis-developer-team/logislot-api:dev | dev-<sha7> | prod | prod-<sha7>
ghcr.io/duosis-developer-team/logislot-web:dev | dev-<sha7> | prod | prod-<sha7>
```

Deploy her zaman **sha'lı tag'i** sabitler (`kustomize edit set image`) —
"dev/prod" floating tag'leri yalnızca kolaylık içindir. Repo public olsa da
GHCR paketleri varsayılan private olabilir: Packages → logislot-api/web →
Package settings → **public** yapın ya da cluster'a pull secret ekleyin.

## 6. Dev Deploy Akışı

1. `dev`'e push → `ci` + `Build Images` koşar.
2. Build başarılıysa `Deploy` tetiklenir → `logislot-dev`:
   secret upsert → apply → migration (`logislot-migration-<sha7>`) →
   rollout + `/health` doğrulaması.
3. İlk kurulumda demo verisi için: Actions → Deploy → **Run workflow** →
   environment `dev`, `run_seed=true`.
4. Erişim: `http://84.247.180.172:30080` (web) / `:30081` (api).

## 7. Prod Deploy Akışı

1. `dev` → `prod` PR + merge.
2. `Build Images` (prod tag + PROD_NEXT_PUBLIC_API_URL) → `Deploy` →
   `logislot-prod` (environment: production — reviewers ekliyse onay bekler).
3. **Seed prod'da ASLA otomatik değil**; dispatch+`run_seed=true` bile
   bilinçli karar ister (demo hesaplar oluşturur).
4. Erişim: `http://84.247.180.172:30082` / `:30083`.
5. Deploy sonrası: `LOGISLOT_BASE_URL=http://84.247.180.172:30083 \
   LOGISLOT_WEB_URL=http://84.247.180.172:30082 python3 scripts/pilot_readiness.py`

## 8. Manuel Seed / Rollback

```bash
# Seed (yalnizca bilinçli): Actions → Deploy → Run workflow → run_seed=true
# veya elle: kubectl -n logislot-dev apply -f k8s/base/seed-job.yaml  (image tag'ini duzeltin)

# Rollback: onceki sha tag'ine dispatch deploy
#   Actions → Deploy → Run workflow → environment=prod, image_tag=prod-<eski_sha7>
# veya elle:
kubectl -n logislot-prod set image deploy/logislot-api api=ghcr.io/duosis-developer-team/logislot-api:prod-<eski_sha7>
kubectl -n logislot-prod set image deploy/logislot-web web=ghcr.io/duosis-developer-team/logislot-web:prod-<eski_sha7>
# Sema rollback'i: once yedekten don (k8s/README.md Backup) — alembic downgrade veri kaybettirebilir.
```

## 9. Domain Gelince

1. Variables güncelle: `PROD_NEXT_PUBLIC_API_URL=https://logislot-api.example.com`
   → prod'a push/dispatch ile **web image yeniden build**.
2. `k8s/overlays/prod/configmap-patch.yaml`: `LOGISLOT_PUBLIC_WEB_URL` +
   `LOGISLOT_CORS_ORIGINS` domain'e çevrilir.
3. `k8s/overlays/prod/ingress-patch.yaml`: `.local` host'lar gerçek
   domain'le değiştirilir; DNS A kayıtları node IP'lerine.
4. TLS: cert-manager kurulmalı veya elle TLS secret + ingress `tls:` bloğu.
5. NodePort servisleri istenirse kaldırılır (ingress 80/443 yeterli olunca).

## 10. Troubleshooting

| Belirti | Bakılacak |
|---|---|
| Build Images: GHCR push 403 | Org package izinleri; gerekirse `GHCR_TOKEN` PAT |
| Deploy: "Zorunlu secret'lar eksik" | §4 tablosundaki ✔ secret'lar tanımlı mı |
| Pod ImagePullBackOff | GHCR paketi public mi / pull secret var mı; tag mevcut mu |
| Migration job timeout | `kubectl -n logislot-<env> logs job/logislot-migration-<sha7>` |
| Web açılıyor ama API çağrıları yanlış adrese | NEXT_PUBLIC build-time — image doğru URL'le mi build edildi? |
| CORS hatası | ConfigMap `LOGISLOT_CORS_ORIGINS` erişilen origin'i içeriyor mu + rollout restart |
