# LogiSlot — Kubernetes Deploy (Hermes Cluster'ı, `logislot-dev` / `logislot-prod`)

> **GÜVENLİK KURALI**: Bu kurulum yalnızca **`logislot-dev`** ve
> **`logislot-prod`** namespace'lerine dokunur.
> `hermes`, `hermes-dev`, `hermes-test`, `ingress-nginx*`, `kube-system`,
> `monitoring`, `datadog`, `datalake-webui-mock`, `local-path-storage`
> namespace'lerindeki HİÇBİR kaynak silinmez/değiştirilmez.
> `kubectl apply` yalnızca kullanıcı onayıyla, aşağıdaki sırayla koşulur.

## Mimari Özet

| Bileşen | Tür | Image | Port | Not |
|---|---|---|---|---|
| logislot-postgres | StatefulSet (1) | postgres:16 | 5432 | local-path PVC 10Gi, headless svc |
| logislot-api | Deployment (1) | ghcr.io/OWNER/logislot-api:TAG | 8000 | `/health` probe; **command override**: entrypoint'in otomatik migrate+seed'i bypass edilir |
| logislot-web | Deployment (1) | ghcr.io/OWNER/logislot-web:TAG | 3000 | `/login` probe; `NEXT_PUBLIC_API_URL` **build-time** |
| logislot-scheduler | Deployment (1, Recreate) | api image | — | `python -m app.maintenance.scheduler` |
| logislot-migration | Job (elle) | api image | — | `alembic upgrade head` |
| logislot-seed | Job (elle, **bilinçli**) | api image | — | `python -m app.seed` (demo verisi!) |
| logislot-demo-scenarios | Job (elle, **bilinçli**) | api image | — | `python -m app.demo_scenarios` — sunum verisini **tazeler**; tekrar çalıştırılabilir, tarih-göreli |
| logislot-bootstrap-admin | Job (elle) | api image | — | `python -m app.bootstrap_admin` — **üretim için**: tek platform yöneticisi, demo verisi yok |
| logislot ingress | Ingress (class: nginx) | — | — | host-bazlı: `logislot-<env>.local` → web, `logislot-<env>-api.local` → api |
| logislot-*-nodeport | Service (NodePort) | — | dev 30080/30081, prod 30082/30083 | domain'siz pratik erişim |

## Ortamlar (tam izolasyon)

| | dev | prod |
|---|---|---|
| Namespace | `logislot-dev` | `logislot-prod` |
| Overlay | `k8s/overlays/dev` | `k8s/overlays/prod` |
| Branch | `dev` | `prod` |
| Image tag | `dev` / `dev-<sha7>` | `prod` / `prod-<sha7>` |
| PVC | 5Gi (kendi namespace'inde) | 10Gi (kendi namespace'inde) |
| Secret | `logislot-secrets` (DEV_* GitHub secrets) | `logislot-secrets` (PROD_* GitHub secrets) |
| Web/API NodePort | 30080 / 30081 | 30082 / 30083 |
| Docs | açık | kapalı |
| Environment | development | production |

**Dev ve prod DB'leri ASLA ortak değildir**: her namespace kendi
`logislot-postgres` StatefulSet'ine ve kendi PVC'sine sahiptir; DNS adı aynı
görünse de her namespace kendi servisine çözer.

Repo gerçekleri (incelendi): API konteyner portu **8000** (compose'ta 8010'a
maplenir), web **3000** (3010), API health `/health`, web `/login`; DB URL
formatı `postgresql+asyncpg://user:pass@host:5432/db`; scheduler komutu
`python -m app.maintenance.scheduler`; migration `alembic upgrade head`
(WORKDIR `/srv/api`); seed `python -m app.seed`.

## 0) Kritik Bilinmesi Gerekenler

1. **`NEXT_PUBLIC_API_URL` build-time'dır.** Next.js bu değeri istemci
   bundle'ına gömer; runtime env İŞE YARAMAZ. Web image'i, kullanıcıların
   tarayıcısından erişilecek API adresiyle build edilmelidir. IP/NodePort
   kurulumunda bu adres: `http://84.247.180.172:31412/api`.
   API adresi değişirse (ör. domain gelince) **web image yeniden build edilir**.
2. **API image entrypoint'i otomatik migrate+seed yapar** (compose için
   tasarlandı). K8s manifestlerinde API/scheduler `command:` override'ıyla
   bunu bypass eder — migration ayrı Job, seed yalnızca elle.
3. **local-path PVC reclaimPolicy=Delete'dir: PVC silinirse VERİ SİLİNİR.**
   Her riskli işlemden önce pg_dump alın (aşağıda Backup).
4. cert-manager yok → TLS manifesti yok (ingress'te yorumlu). Domain gelince bkz. §9.

## 1) Cluster Ön Kontrol (master node'da, salt-okunur)

```bash
kubectl get nodes -o wide
kubectl describe nodes | egrep -A 8 "Allocated resources|Resource"
kubectl get ns
kubectl get storageclass
kubectl get ingressclass
kubectl get ingress -A
kubectl get pvc -A
```

Beklenen: `local-path (default)` StorageClass, `nginx` ingress class
(NodePort 80:31412), `logislot` namespace'inin HENÜZ olmaması.

## 2) Image Build & Push

Registry önerisi GHCR (veya erişilebilir herhangi bir registry). `OWNER` ve
`TAG`'i kendi değerlerinizle değiştirin. **Her iki build de repo KÖKÜNDEN**
koşulur (web Dockerfile'ı monorepo kökü context'i ister):

```bash
# API
docker build -t ghcr.io/duosis-developer-team/logislot-api:dev apps/api

# WEB — dikkat: context repo köküdür (-f ile Dockerfile verilir) ve
# NEXT_PUBLIC_API_URL build-arg'ı ZORUNLUDUR:
docker build -t ghcr.io/duosis-developer-team/logislot-web:dev \
  -f apps/web/Dockerfile \
  --build-arg NEXT_PUBLIC_API_URL=http://84.247.180.172:30081 \
  .

docker push ghcr.io/duosis-developer-team/logislot-api:dev
docker push ghcr.io/duosis-developer-team/logislot-web:dev
```

GHCR private ise namespace'e pull secret ekleyin ve deployment'lara
`imagePullSecrets` patch'leyin:

```bash
kubectl -n logislot-dev create secret docker-registry ghcr-pull   # prod icin ayrica -n logislot-prod \
  --docker-server=ghcr.io --docker-username=<gh-user> --docker-password=<PAT>
```

**Registry yoksa (geçici)**: image'ları node üzerinde build edip container
runtime'a import edebilirsiniz (containerd: `docker save | ctr -n k8s.io
images import -`); iki node'a da import gerekir ve sürüm yönetimi zordur —
production için registry kullanın.

Manifest'lerdeki tag'i güncelleyin:

```bash
# CI bunu otomatik yapar; elle gerekirse:
cd k8s/overlays/dev   # veya prod
kustomize edit set image \
  ghcr.io/duosis-developer-team/logislot-api=ghcr.io/duosis-developer-team/logislot-api:dev-<sha7> \
  ghcr.io/duosis-developer-team/logislot-web=ghcr.io/duosis-developer-team/logislot-web:dev-<sha7>
```

## 3) Secret Oluşturma (repo'ya asla koymayın)

```bash
kubectl create namespace logislot-dev    # (apply -k de olusturur; secret icin once gerekir)
kubectl create namespace logislot-prod

STRONG_PW="$(openssl rand -base64 24)"
kubectl -n logislot-dev create secret generic logislot-secrets \
  --from-literal=POSTGRES_USER='logislot' \
  --from-literal=POSTGRES_PASSWORD="$STRONG_PW" \
  --from-literal=POSTGRES_DB='logislot' \
  --from-literal=LOGISLOT_SECRET_KEY="$(openssl rand -hex 32)" \
  --from-literal=LOGISLOT_DATABASE_URL="postgresql+asyncpg://logislot:${STRONG_PW}@logislot-postgres:5432/logislot"
```

SMTP alanları ilk deploy'da GEREKMİYOR (`LOGISLOT_EMAIL_PROVIDER=log_only`).
SMTP hazır olunca:

```bash
kubectl -n logislot-prod create secret generic logislot-smtp \
  --from-literal=LOGISLOT_SMTP_HOST=... --from-literal=LOGISLOT_SMTP_PORT=587 \
  --from-literal=LOGISLOT_SMTP_USERNAME=... --from-literal=LOGISLOT_SMTP_PASSWORD=... \
  --from-literal=LOGISLOT_SMTP_FROM_EMAIL=... --from-literal=LOGISLOT_SMTP_FROM_NAME=LogiSlot
# api/scheduler deployment'ina envFrom secretRef: logislot-smtp ekleyin,
# configmap'te LOGISLOT_EMAIL_PROVIDER=smtp yapin ve rollout restart edin.
```

> Parola içinde `@ / : %` gibi karakterler DATABASE_URL'i bozar —
> `openssl rand -base64` çıktısında `/`,`+` olabilir; sorun yaşarsanız
> `openssl rand -hex 24` kullanın.

## 4) Dry-run / Validation (apply etmeden)

```bash
kubectl kustomize k8s/overlays/dev && kubectl kustomize k8s/overlays/prod
kubectl apply --dry-run=client -k k8s/overlays/dev     # master node'da
kubectl apply --dry-run=client -k k8s/overlays/prod
```

## 5) Deploy — CI/CD (birincil yol)

Branch push'u deploy'u tetikler (bkz. [docs/GITHUB_CICD.md](../docs/GITHUB_CICD.md)):
`dev` → logislot-dev, `prod` → logislot-prod. Workflow sırayla: namespace
guard → secret upsert (GitHub Secrets'tan) → `kustomize edit set image`
(sha tag) → `kubectl apply -k` → SHA'lı migration job → rollout + `/health`.
Seed yalnızca dispatch + `run_seed=true` ile.

### İlk giriş hesabı (boş kurulum)

Migration şemayı kurar ama **hiçbir kullanıcı oluşturmaz**; taze bir ortamda
kimse giriş yapamaz. `app.seed` bu boşluğu doldurmaz — o DEMO verisidir
(sabit `Demo123!`, sahte tenant/tedarikçi) ve üretimde çalıştırılmamalıdır.

Üretim için `logislot-bootstrap-admin` job'ı kullanılır: yalnızca tek bir
platform yöneticisi açar, parolayı secret'tan alır, ilk girişte parola
değişimini zorunlu kılar ve veritabanında zaten bir platform kullanıcısı varsa
**hiçbir şey yapmaz** (parola sıfırlamaz — yönetici ele geçirme vektörü
olmasın diye).

```bash
# Önce secret'lar (repo Settings → Secrets → Actions):
#   PROD_BOOTSTRAP_ADMIN_EMAIL     ornek: ops@firma.com
#   PROD_BOOTSTRAP_ADMIN_PASSWORD  en az 12 karakter, demo parolalar reddedilir
gh workflow run deploy.yml --ref prod \
  -f environment=prod -f image_tag=prod-<sha7> -f run_bootstrap_admin=true
```

Deploy öncesi ortamın durumunu (namespace, alembic revizyonu, riskli veri,
kayıt sayıları) salt-okunur görmek için:
`gh workflow run preflight.yml --ref dev -f environment=prod`

## 5b) Elle Deploy (CI olmadan; kullanıcı onayıyla)

```bash
# 1-2. Image build + push (yukarida)
# 3. Namespace + secret (yukarida)

# 4. Tum kaynaklar (namespace, config, postgres, api, web, scheduler, ingress):
kubectl apply -k k8s/overlays/dev     # veya k8s/overlays/prod

# 5. PostgreSQL hazir olana kadar bekle:
kubectl -n logislot-dev rollout status statefulset/logislot-postgres --timeout=300s

# 6. Migration (ELLE — her yeni surumde):
kubectl -n logislot-dev delete job -l app.kubernetes.io/name=logislot-migration --ignore-not-found
kubectl -n logislot-dev apply -f k8s/base/migration-job.yaml
kubectl -n logislot-dev wait --for=condition=complete job/logislot-migration --timeout=180s
kubectl -n logislot-dev logs job/logislot-migration

# 7. API/scheduler/web zaten apply edildi; migration oncesi CrashLoop
#    gordulerse simdi toparlanirlar:
kubectl -n logislot-dev rollout status deploy/logislot-api deploy/logislot-web deploy/logislot-scheduler

# 8. (YALNIZCA demo/pilot verisi isteniyorsa, BILINCLI karar):
kubectl -n logislot-dev apply -f k8s/base/seed-job.yaml   # PROD'da seed = bilinçli karar!
kubectl -n logislot-dev logs -f job/logislot-seed

# 9. (YALNIZCA demo ortami; sunum oncesi veriyi tazelemek icin):
kubectl -n logislot-dev delete job logislot-demo-scenarios --ignore-not-found
kubectl -n logislot-dev apply -f k8s/base/demo-scenarios-job.yaml
kubectl -n logislot-dev logs -f job/logislot-demo-scenarios
```

### Demo senaryo verisi (`logislot-demo-scenarios`)

`app.seed` bir kereliktir: tenant varsa hiç çalışmaz, dolayısıyla kurulu bir
ortamda tarihler eskir. `app.demo_scenarios` bu boşluğu doldurur —
**tekrar çalıştırılabilir** ve **tarih-göreli**dir:

* Katalog (araç/ürün kategorisi, Rampa 4, 6 yeni tedarikçi + portal hesapları)
  doğal anahtarıyla aranır; varsa dokunulmaz, yoksa eklenir.
* Randevu/seri/bildirim/takvim istisnası her koşuda silinip yeniden yazılır;
  "bugün" hep gerçekten bugündür. Silme yalnızca kendi ürettiği `uuid5`
  kimliklere dokunur — organik veri korunur.
* Yazmadan önce tesisin kendi kurallarına göre doğrular: çalışma saatleri,
  takvim istisnaları, rampa-ürün/araç uyumu, aynı rampada çakışma ve
  tedarikçi haftalık kotası. Uymayan satır uygun slota kaydırılır, olmazsa
  düşürülür ve iş çıktısında raporlanır.

Önce denemek için: `python -m app.demo_scenarios --dry-run` (hiçbir şey yazmaz).


NOT: 4. adım API'yi migration'dan önce başlatır; API migrationsız şemada
`/health`'e cevap verir ama ilk migration tamamlanana dek işlevsel değildir.
Sıfır kurulumda daha temiz akış isterseniz 4. adımı ikiye bölün:
önce `kubectl apply -f k8s/base/namespace.yaml k8s/base/configmap.yaml
k8s/base/postgres-service.yaml k8s/base/postgres-statefulset.yaml`, migration
Job'ı, sonra kalan `apply -k`.

## 6) Doğrulama

```bash
kubectl -n logislot-dev get all      # prod icin: -n logislot-prod
kubectl -n logislot-dev get pods -o wide
kubectl -n logislot-dev logs deploy/logislot-api --tail 50
kubectl -n logislot-dev logs deploy/logislot-web --tail 20
kubectl -n logislot-dev logs deploy/logislot-scheduler --tail 20   # iki job'in basladigini gorun
kubectl -n logislot-dev describe ingress logislot
kubectl -n logislot-dev get pvc

# Port-forward ile hizli test (master node'da veya kubeconfig olan makinede):
kubectl -n logislot-dev port-forward svc/logislot-api 8010:8000 &
kubectl -n logislot-dev port-forward svc/logislot-web 3010:3000 &
curl -s http://localhost:8010/health
# Tarayici: http://localhost:3010/login
#  (dikkat: port-forward'lu web'in bundle'i NodePort API adresini cagirir;
#   tam UI testi icin NodePort uzerinden girin: http://84.247.180.172:31412/)

# Uygulama seviyesi dogrulama (repo'dan):
LOGISLOT_BASE_URL=http://84.247.180.172:31412/api python3 scripts/pilot_readiness.py
LOGISLOT_BASE_URL=http://84.247.180.172:31412/api python3 scripts/demo_smoke.py  # seed'liyse
```

## 7) Rollback

```bash
# Uygulama: onceki image tag'ine don
kubectl -n logislot-prod set image deploy/logislot-api api=ghcr.io/OWNER/logislot-api:ONCEKI_TAG
kubectl -n logislot-prod set image deploy/logislot-web web=ghcr.io/OWNER/logislot-web:ONCEKI_TAG
kubectl -n logislot-prod rollout undo deploy/logislot-api   # alternatif

# SEMA rollback'i: alembic downgrade VERI KAYBETTIREBILIR.
# Kural: once yedekten don (asagida), downgrade yalnizca bos tablolar icin.
```

## 8) Backup (local-path PVC silinirse veri GIDER)

```bash
# Elle yedek:
kubectl -n logislot-prod exec statefulset/logislot-postgres -- \
  pg_dump -U logislot -d logislot -Fc > logislot_backup_$(date +%Y%m%d_%H%M).dump

# Geri yukleme (bos/yeni DB'ye):
kubectl -n logislot-prod exec -i statefulset/logislot-postgres -- \
  pg_restore -U logislot -d logislot --clean --if-exists < logislot_backup_....dump
```

Öneri: master node'a host cron (günlük dump + 14 gün saklama). **PVC'yi,
StatefulSet'i veya namespace'i silmeden önce mutlaka dump alın** —
`local-path` reclaimPolicy=Delete olduğundan PVC silinince veri kaybolur.
Kubernetes CronJob'ı bilinçli olarak eklenmedi (dump'ın güvenli saklama
hedefi cluster dışında olmalı).

## 9) Domain Geldiğinde

1. **Web image'ini yeniden build et**: `--build-arg
   NEXT_PUBLIC_API_URL=https://logislot-api.example.com` (veya path-tabanlı
   kalınacaksa `https://logislot.example.com/api`).
2. Ingress'e host ekle (tercih edilen: host-bazlı iki kayıt):
   `logislot.example.com` → web, `logislot-api.example.com` → api
   (host-bazlıda rewrite annotation'ı kaldırılır; API kökte servis edilir).
3. ConfigMap patch: `LOGISLOT_PUBLIC_WEB_URL` + `LOGISLOT_CORS_ORIGINS`
   → domain değerleri; `kubectl -n logislot-prod rollout restart deploy/logislot-api deploy/logislot-scheduler`.
4. TLS: önce cert-manager kurulmalı (cluster'da YOK) veya elle TLS secret
   (`kubectl -n logislot-prod create secret tls logislot-tls --cert=... --key=...`)
   verilip ingress'teki yorumlu `tls:` bloğu açılmalı.

## 10) NetworkPolicy (opsiyonel)

`k8s/base/networkpolicy.yaml` kustomization'a dahil DEĞİLDİR. Cluster CNI'si
NetworkPolicy desteklemiyorsa etkisizdir; destekliyorsa postgres'e yalnızca
LogiSlot pod'larından erişime izin verir. Uygulamadan önce CNI desteğini
küçük bir test policy'siyle doğrulayın; ilk pilotta default-deny YOKTUR.
```
kubectl apply -f k8s/base/networkpolicy.yaml   # yalnizca CNI destekliyorsa
```
