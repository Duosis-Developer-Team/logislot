# LogiSlot Kubernetes Deployment Report

Tarih: 2026-07-08

## 1. Özet

LogiSlot'un mevcut Hermes cluster'ına **ayrı `logislot` namespace'inde**
deploy'u için tüm manifestler üretildi (`k8s/base` + `k8s/overlays/pilot`,
plain YAML + Kustomize; Helm yok), offline doğrulaması yapıldı ve deploy
runbook'u (`k8s/README.md`) yazıldı. **Cluster'a hiçbir değişiklik
yapılmadı** — bu makinede zaten Hermes cluster'ına kubectl erişimi yok
(yerel context ölü bir k3d'ye işaret ediyor), apply adımları kullanıcı
onayıyla master node'da koşulacak. Hermes/ingress/monitoring dahil mevcut
hiçbir kaynağa dokunulmuyor; tüm kaynaklar `logislot` namespace'inde ve
`app.kubernetes.io/part-of: logislot` etiketli.

Repo incelemesinde iki kritik gerçek bulundu ve tasarıma işlendi:
1. **`NEXT_PUBLIC_API_URL` build-time'dır** (Next.js standalone; ARG→ENV
   `npm run build` sırasında bundle'a gömülür) → web image'i doğru API
   adresiyle build edilmek ZORUNDA; runtime env işe yaramaz.
2. **API image entrypoint'i açılışta otomatik `alembic upgrade` + seed
   koşar** (compose için tasarlanmış) → K8s'te API ve scheduler
   `command:` override ile doğrudan uvicorn/scheduler başlatır; migration
   ayrı Job, seed YALNIZCA elle uygulanan ayrı Job.

## 2. Cluster Capacity Report

- **Nodes**: 2 × (6 CPU / ~12 GB RAM; allocatable 5400m / ~11.3 GB).
- **Allocated resources** (describe nodes çıktısından; Metrics API YOK,
  gerçek kullanım ölçülemedi — kapasite kararı request/limit üzerinden):
  - node1: CPU request 1120m (%20), limit 800m (%14); RAM request ~409Mi (%3), limit ~1.75Gi (%16)
  - node2: CPU request 1275m (%23), limit 4700m (%87); RAM request ~1.75Gi (%16), limit ~5.2Gi (%47)
- **Hermes footprint**: hermes/hermes-dev/hermes-test namespace'leri;
  PostgreSQL'i StatefulSet + local-path PVC (1Gi'lık PVC'ler) — LogiSlot
  aynı modeli kullanıyor (cluster düzenine uyumlu).
- **Storage**: `local-path` (default, rancher.io/local-path,
  **reclaimPolicy: Delete**, WaitForFirstConsumer, expansion kapalı).
- **Ingress**: `nginx` (NodePort 80:31412, 443:30772) ve `nginx-test`
  (80:30880, 443:30443) class'ları; LogiSlot `nginx` class'ını host'suz
  kuralla kullanır — mevcut ingress'lere dokunulmaz (hermes-dev `*` host'lu
  aynı class'ta; path çakışması riski §13'te).
- **TLS/cert-manager**: YOK → TLS manifesti üretilmedi (ingress'te yorumlu
  blok; domain gelince §9 akışı).
- **Risks**: node2'de CPU **limit** toplamı %87 (overcommit — request %23
  olduğundan scheduling sorunu değil ama gürültülü komşu olasılığı var);
  metrics-server yokken kullanım görünürlüğü sınırlı; iki mevcut
  ImagePullBackOff pod'una (hermes core-service, datalake-webui-mock)
  DOKUNULMUYOR.

**Sonuç**: LogiSlot'un toplam ~450m CPU / ~1.1Gi request'i iki node'lu bu
cluster için rahatça güvenli; Hermes'i zorlaması beklenmez.

## 3. Deployment Decision

- **Namespace**: `logislot` (yeni; başka hiçbir namespace'e dokunulmaz).
- **PostgreSQL**: cluster içi **StatefulSet + local-path PVC 10Gi**
  (Hermes ile aynı model). PVC silmenin veri sileceği runbook'ta ve
  manifest yorumunda büyük harfle uyarıldı.
- **SMTP**: `LOGISLOT_EMAIL_PROVIDER=log_only` (gerçek SMTP bilgisi yok;
  sistem e-postasız tam çalışır, e-postalar email_logs'ta görünür). SMTP
  secret placeholder'ları hazır; sonradan secret + configmap patch +
  rollout restart ile açılır.
- **Domain/IP**: domain yok → **path-tabanlı ingress** tek NodePort'tan:
  `http://84.247.180.172:31412/` → web, `.../api/...` → api (nginx
  rewrite `/$2`, regex `/api(/|$)(.*)` — API route'ları kökte yaşadığı
  için rewrite ZORUNLU ve eklendi). Aynı origin olduğundan tarayıcı CORS
  sorunu da yok. Domain gelince tercih edilen yöntem host-bazlı iki kayıt
  (README §9).
- **Registry**: bilinmiyor → `ghcr.io/OWNER/logislot-api:TAG` /
  `...-web:TAG` placeholder'ları + README'de GHCR push ve geçici node-import
  (`ctr -n k8s.io images import`) seçenekleri; production için registry önerisi.

## 4. Prepared Manifests

```
k8s/
  base/
    namespace.yaml              # logislot
    configmap.yaml              # non-secret env (IP degerleri overlay'de)
    secret.example.yaml         # SADECE ornek; kustomization'a dahil DEGIL
    postgres-service.yaml       # headless (clusterIP: None)
    postgres-statefulset.yaml   # postgres:16, PVC 10Gi local-path, PGDATA alt dizin, pg_isready probelari
    api-deployment.yaml         # command override (uvicorn), /health probelari, envFrom cm+secret
    api-service.yaml            # ClusterIP 8000
    web-deployment.yaml         # 3000, /login probelari, build-time env uyarisi
    web-service.yaml            # ClusterIP 3000
    scheduler-deployment.yaml   # api image + scheduler command, replicas 1 + Recreate
    migration-job.yaml          # alembic upgrade head — ELLE; kustomization disi
    seed-job.yaml               # python -m app.seed — ELLE + buyuk uyari; kustomization disi
    ingress.yaml                # nginx class, path-based + rewrite, TLS yorumlu
    networkpolicy.yaml          # OPSIYONEL; kustomization disi (CNI kontrolu sart)
    kustomization.yaml
  overlays/pilot/
    kustomization.yaml          # namespace, image tag'leri, patch listesi
    configmap-patch.yaml        # PUBLIC_WEB_URL + CORS (node IP'leri + localhost:3010)
    ingress-patch.yaml          # IP erisim notu; domain patch sablonu yorumda
    resources-patch.yaml        # pilot kaynak degerlerinin acik kaydi
  README.md                     # on kontrol, build/push, secret, dry-run, deploy sirasi, dogrulama, rollback, backup, domain
```

Repo incelemesi cevapları: API portu **8000** (health `/health`); web portu
**3000** (probe `/login`); scheduler `python -m app.maintenance.scheduler`;
migration `alembic upgrade head` (WORKDIR /srv/api); seed `python -m
app.seed`; DB URL `postgresql+asyncpg://logislot:PASS@logislot-postgres:5432/
logislot`; API env'leri `LOGISLOT_*` (environment, secret_key, database_url,
cors_origins, public_web_url, email/smtp, parola politikası, rate limit,
docs, scheduler aralıkları); web'in **runtime env ihtiyacı yok** —
`NEXT_PUBLIC_API_URL` yalnızca build-arg (bu yüzden prompt'taki ConfigMap'e
koyma önerisi bilinçli uygulanmadı; yanıltıcı olurdu — README'de açıklandı).

## 5. Resource Requests/Limits

| Bileşen | Request | Limit |
|---|---|---|
| api | 150m / 256Mi | 700m / 768Mi |
| web | 100m / 192Mi | 500m / 512Mi |
| scheduler | 50m / 128Mi | 250m / 256Mi |
| postgres | 150m / 512Mi | 800m / 1Gi |
| **Toplam** | **450m / ~1.1Gi** | **2250m / ~2.5Gi** |

(Migration/seed jobları geçici: 100m/256Mi request.) Mevcut request
oranlarına eklendiğinde iki node da rahat; limit toplamı da kabul edilebilir.

## 6. Database Plan

postgres:16 StatefulSet (1 replica) + headless service; PVC 10Gi
`local-path` (WaitForFirstConsumer — node pinlemesi YOK, scheduler karar
verir; volume hangi node'da bind olursa pod oraya sabitlenir — local-path
doğası). `PGDATA=/var/lib/postgresql/data/pgdata` (hostPath init
uyumluluğu). Bağlantı: `logislot-postgres:5432`. **Kritik uyarı**: PVC/
StatefulSet/namespace silmek = veri kaybı (reclaim Delete) — yedek komutu
README §8'de; günlük host-cron dump önerildi (K8s CronJob bilinçli
eklenmedi: dump'ın cluster dışında saklanması gerekir).

## 7. Ingress/IP Access Plan

- İlk erişim: `http://84.247.180.172:31412/` (veya `.173`) — nginx ingress
  NodePort 80:31412; `/` web'e, `/api(/|$)(.*)` rewrite ile API köküne.
- Web image'i `--build-arg NEXT_PUBLIC_API_URL=http://84.247.180.172:31412/api`
  ile build edilmeli (build komutu README §2'de).
- Hızlı doğrulama alternatifi: `kubectl port-forward svc/logislot-api
  8010:8000` + `svc/logislot-web 3010:3000` (README'de; port-forward'lu
  web'in bundle'ının yine NodePort API'sini çağıracağı uyarısıyla).
- Domain gelince: host-bazlı iki ingress kaydı + web rebuild + configmap
  patch + (cert-manager kurulumu veya elle TLS secret) — README §9.

## 8. Secrets and Config

- `logislot-config` (ConfigMap, non-secret): environment=production,
  docs kapalı, rate limit açık, log_only, scheduler açık + aralıklar,
  PUBLIC_WEB_URL/CORS (pilot patch'te node IP'leri + localhost:3010).
- `logislot-secrets` (kubectl ile oluşturulur, repo'da YOK):
  POSTGRES_USER/PASSWORD/DB, LOGISLOT_SECRET_KEY, LOGISLOT_DATABASE_URL;
  SMTP alanları opsiyonel (log_only'de gereksiz). `secret.example.yaml`
  yalnızca placeholder ve kustomization dışı. Oluşturma komutu (README §3):

```bash
kubectl -n logislot create secret generic logislot-secrets \
  --from-literal=POSTGRES_USER='logislot' \
  --from-literal=POSTGRES_PASSWORD='<strong>' \
  --from-literal=POSTGRES_DB='logislot' \
  --from-literal=LOGISLOT_SECRET_KEY='<openssl rand -hex 32>' \
  --from-literal=LOGISLOT_DATABASE_URL='postgresql+asyncpg://logislot:<strong>@logislot-postgres:5432/logislot'
```

## 9. Migration/Seed Plan

- **Migration**: `logislot-migration` Job (api image, `alembic upgrade
  head`, restartPolicy Never, backoffLimit 1, envFrom cm+secret) — her
  sürümde elle: delete → apply → wait → logs. Kustomization'a dahil değil
  (tamamlanmış Job tekrar apply edilemez).
- **Seed**: `logislot-seed` Job — **otomatik deploy'un parçası DEĞİL**;
  manifest başında büyük uyarı (idempotent ama demo hesaplar üretir;
  gerçek müşteri verisinde bilinçli karar).
- API/scheduler pod'ları migrate/seed KOŞMAZ (command override) — image
  entrypoint'inin compose davranışı K8s'e taşınmadı.

## 10. Validation Results

Bu makinede Hermes cluster erişimi yok (context ölü k3d'ye işaret ediyor;
`cluster-info` connection refused) → **server'lı doğrulama master node'a
bırakıldı**, offline doğrulama yapıldı:

- `kubectl kustomize k8s/overlays/pilot` → **OK** (10 kaynak: Namespace,
  ConfigMap, 3 Service, 3 Deployment, StatefulSet, Ingress).
- `kustomize build` (standalone v5.4.2) → **OK**.
- Python YAML şema taraması → tüm dokümanlar parse; **hepsi `logislot`
  namespace'inde**; pod üreten her container'da request/limit mevcut;
  job/secret-example/networkpolicy render dışında (bilinçli).
- Render içerik kontrolleri: pilot configmap değerleri uygulanmış, API
  uvicorn command override'ı mevcut, image placeholder'ları doğru.
- `kubectl apply --dry-run=client -k` bu makineden **koşulamadı**
  (API discovery için sunucu gerekir) — master node'da koşulacak komut
  README §4'te. Uydurma "dry-run geçti" iddiası YOKTUR.

## 11. Deploy Commands (kullanıcı onayı sonrası, master node'da)

```bash
# 0. On kontrol (salt-okunur)         -> k8s/README.md §1
# 1. Image build + push (OWNER/TAG)   -> k8s/README.md §2 (web build-arg ZORUNLU)
# 2. Namespace + secret               -> k8s/README.md §3
kubectl create namespace logislot
kubectl -n logislot create secret generic logislot-secrets ...
# 3. Dry-run:
kubectl apply --dry-run=client -k k8s/overlays/pilot
# 4. Apply:
kubectl apply -k k8s/overlays/pilot
kubectl -n logislot rollout status statefulset/logislot-postgres --timeout=300s
# 5. Migration:
kubectl -n logislot apply -f k8s/base/migration-job.yaml
kubectl -n logislot wait --for=condition=complete job/logislot-migration --timeout=180s
# 6. (Istege bagli, bilinçli) Seed:
kubectl -n logislot apply -f k8s/base/seed-job.yaml
```

## 12. Verification Commands

```bash
kubectl -n logislot get all && kubectl -n logislot get pvc
kubectl -n logislot logs deploy/logislot-api --tail 50
kubectl -n logislot logs deploy/logislot-scheduler --tail 20   # iki job basladi mi
kubectl -n logislot describe ingress logislot
kubectl -n logislot port-forward svc/logislot-api 8010:8000 &
curl -s http://localhost:8010/health
# Uygulama seviyesi:
LOGISLOT_BASE_URL=http://84.247.180.172:31412/api python3 scripts/pilot_readiness.py
LOGISLOT_BASE_URL=http://84.247.180.172:31412/api python3 scripts/demo_smoke.py   # seed'liyse
```

## 13. Risks / Warnings

- **Ingress host çakışması**: hermes-dev ingress'i `nginx` class'ında `*`
  host'la çalışıyor; LogiSlot da host'suz kural ekliyor. nginx path'e göre
  ayırır (`/api`, `/` LogiSlot'a; hermes-dev'in path'leri neyse onlar ona)
  ama `/` path'i hermes-dev'de de tanımlıysa **çakışır**. Deploy öncesi
  master'da `kubectl -n hermes-dev get ingress -o yaml | grep -A3 paths`
  ile kontrol edin; çakışıyorsa LogiSlot domain gelene kadar port-forward
  ile test edilir veya ingress'e geçici benzersiz host verilir. Mevcut
  ingress'lere DOKUNULMAZ.
- **local-path = tek-node disk**: Postgres pod'u volume'un olduğu node'a
  bağlanır; node arızasında veri o node'dadır. Günlük dump şart.
- **NodePort IP erişimi**: 84.247.180.x doğrudan internete açıksa LogiSlot
  login'i internete açılmış olur — rate limit + güçlü parolalar açık, yine
  de firewall'da erişimi sınırlamak önerilir; docs kapalı, environment=
  production (demo parolalar kalıcı parola olamaz).
- **Seed demo hesapları** `Demo123!` içerir — seed yalnızca pilot demo
  isteniyorsa koşulmalı; koşulursa `pilot_readiness` production+demo
  parola kombinasyonunu WARN'lar.
- metrics-server yok — kaynak ayarı allocated-resources üzerinden yapıldı;
  gerçek kullanım gözlemi için metrics-server kurulumu düşünülebilir
  (bu sprintte kurulmadı, cluster'a dokunmama kuralı).
- NetworkPolicy CNI desteği bilinmiyor → dosya hazır ama uygulanmıyor.

## 14. User Action Required

1. **Registry kararı**: GHCR mi, başka registry mi, geçici node-import mu?
   `OWNER/TAG` değerlerini belirleyin (README §2; private ise pull secret).
2. **Image build**: API + web'i build/push edin — web'de
   `--build-arg NEXT_PUBLIC_API_URL=http://84.247.180.172:31412/api` ZORUNLU.
3. **Secret oluşturun** (README §3) — güçlü parola + `openssl rand -hex 32`.
4. Master node'da **dry-run** koşun: `kubectl apply --dry-run=client -k
   k8s/overlays/pilot` (ve mümkünse `--dry-run=server`).
5. hermes-dev ingress path'lerini kontrol edin (§13 ilk madde).
6. Onay verin → apply sırası README §5. **Onay olmadan cluster'a hiçbir
   şey uygulanmayacak.**
7. Deploy sonrası: `pilot_readiness.py` + (seed'liyse) `demo_smoke.py`.
8. Domain patron tarafından gelince: README §9 (web rebuild + ingress host
   + configmap patch + TLS planı).
