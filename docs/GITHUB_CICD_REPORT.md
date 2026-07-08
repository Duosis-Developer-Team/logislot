# LogiSlot GitHub + CI/CD + Dev/Prod Kubernetes Report

Tarih: 2026-07-08

## 1. Özet

`Duosis-Developer-Team/logislot` için branch stratejisi, GHCR tabanlı CI/CD
ve Kubernetes'te iki tam-izole ortam (`logislot-dev` / `logislot-prod`)
hazırlandı. Yerel git deposu `dev` ve `prod` branch'leriyle kuruldu; tüm
manifest ve workflow'lar doğrulandı. **Remote'a push YAPILMADI** — hem genel
onay kuralı gereği hem de kritik bir bulgu nedeniyle: **org'daki `logislot`
repo'su zaten var ve `main` branch'inde başka bir ekip üyesinin (Can İlbey
Sezgin, 2026-07-07) frontend prototip çalışması duruyor.** Bu içerik
korunarak nasıl ilerleneceği kullanıcı kararı bekliyor (bkz. §12).

## 2. Repo / Branch Planı

- Org: `Duosis-Developer-Team` (gh auth'lu hesabın erişimi doğrulandı).
- Repo: `logislot` — **MEVCUT ve PUBLIC**; `main` branch'inde prototip
  (JSX dosyaları, özellikler dokümanı) var; **dokunulmadı**.
- Yerel hazırlık: `git init` + tek commit + `dev` ve `prod` branch'leri
  (ikisi de aynı commit'te). Aktif branch: `dev`.
- Akış: geliştirme `dev`'de; release `dev`→`prod` PR/merge; `prod`'a
  merge → prod deploy. GitHub **production environment**'ına required
  reviewers eklenmesi önerildi (prod deploy manuel onay bekler).
- Public repo güvenliği: commit taraması yapıldı — kubeconfig/.env/gerçek
  secret YOK; yalnızca `*.example` dosyaları var. compose'taki
  `dev-secret-change-me` bilinçli dev placeholder'ıdır. `.gitignore`'a
  `kubeconfig*`, `.env.staging`, `k8s/**/secret.yaml`, `*.dump` eklendi.

## 3. GitHub Actions

| Workflow | Tetikleyici | İçerik |
|---|---|---|
| `ci.yml` | push/PR (dev, prod), dispatch | backend (ruff+pytest), frontend (tsc+lint+build), **manifests** (iki overlay'in kustomize render'ı + namespace assert + "hermes" sızıntı kontrolü) |
| `build-images.yml` ("Build Images") | push (dev, prod), dispatch | GHCR login (`GITHUB_TOKEN`, packages:write) → api+web build/push; tag: `<env>` + `<env>-<sha7>`; **web build-arg NEXT_PUBLIC_API_URL ortama göre** (vars, NodePort varsayılanlı) |
| `deploy.yml` ("Deploy") | Build Images success (workflow_run) veya dispatch (environment/image_tag/run_seed) | prepare (ortam+tag+**namespace guard**) → deploy job (`environment: production/development`) → kubeconfig (loglanmaz) → guard tekrar → namespace+secret upsert → `kustomize edit set image` (sha) → apply → **SHA'lı migration job** (silme yalnızca kendi ns + `app.kubernetes.io/name=logislot-migration` etiketi) → rollout + port-forward `/health` → seed (yalnızca dispatch+run_seed=true) |
| `e2e.yml` | dispatch, PR | mevcut compose E2E (dokunulmadı) |

Düzeltilen tuzak: secret seçiminde `prod && PROD_X || DEV_X` ternary'si
kullanılmadı — PROD secret boşken sessizce DEV'e düşerdi; seçim bash'te
açık if/else ile ve zorunlu prod secret'ları eksikse **deploy durur**.

## 4. Required Secrets / Variables

Tam tablo: [docs/GITHUB_CICD.md](GITHUB_CICD.md) §4. Özet:

- **Secrets**: `KUBE_CONFIG` (base64 kubeconfig; istenirse `KUBE_CONFIG_DEV/PROD`),
  `DEV_/PROD_LOGISLOT_SECRET_KEY`, `DEV_/PROD_POSTGRES_PASSWORD`,
  `DEV_/PROD_DATABASE_URL` (zorunlu); `DEV_/PROD_SMTP_*` (opsiyonel —
  log_only'de boş kalabilir). GHCR için ek token gerekmez.
- **Variables**: `DEV_NEXT_PUBLIC_API_URL` (vars yoksa `http://84.247.180.172:30081`),
  `PROD_NEXT_PUBLIC_API_URL` (yoksa `http://84.247.180.172:30083`).

## 5. Kubernetes Dev/Prod Yapısı

`k8s/overlays/pilot` kaldırıldı → `k8s/overlays/dev` + `k8s/overlays/prod`:

| | dev | prod |
|---|---|---|
| Namespace | logislot-dev | logislot-prod |
| PVC | **5Gi** (kendi StatefulSet'i) | **10Gi** (kendi StatefulSet'i) |
| api | 100m/192Mi → 500m/512Mi | 150m/256Mi → 700m/768Mi |
| web | 75m/128Mi → 400m/384Mi | 100m/192Mi → 500m/512Mi |
| scheduler | 25m/96Mi → 150m/192Mi | 50m/128Mi → 250m/256Mi |
| postgres | 100m/384Mi → 600m/768Mi | 150m/512Mi → 800m/1Gi |
| ENVIRONMENT / docs | development / açık | production / kapalı |
| Ingress host | logislot-dev(.–api).local | logislot-prod(.–api).local |
| NodePort web/api | 30080 / 30081 | 30082 / 30083 |

Her şey 1 replica. **DB/PVC/secret/config tam izole** — semantik doğrulama
scripti her iki render'da namespace/PVC boyutu/imaj tag'i/host/NodePort
ayrımını doğruladı. Base'den `namespace.yaml` çıkarıldı (iki env'de yanlış
`logislot` namespace'i yaratırdı); job'lardan hardcoded namespace kaldırıldı
(CI `-n $NAMESPACE` ile uygular).

## 6. Image Registry / GHCR

```
ghcr.io/duosis-developer-team/logislot-api:{dev|dev-<sha7>|prod|prod-<sha7>}
ghcr.io/duosis-developer-team/logislot-web:{dev|dev-<sha7>|prod|prod-<sha7>}
```

Deploy daima **sha'lı tag** sabitler. İlk push'tan sonra GHCR paketlerinin
public yapılması (veya pull secret) gerekir — dokümante edildi.

## 7. Migration / Seed Strategy

- Migration her deploy'da koşar: `logislot-migration-<sha7>` (isim çakışması
  yok); eski joblar yalnızca **kendi namespace'inde + kendi etiketiyle**
  silinir — Hermes job'larına dokunulması yapısal olarak imkânsız. Başarısız
  migration loglanır ve deploy'u durdurur.
- Seed: hiçbir push akışında yok; yalnızca `workflow_dispatch` +
  `run_seed=true` (prod'da da ancak bilinçli elle tetikleme) veya elle
  `kubectl apply` — manifest'te büyük uyarı.

## 8. Ingress / IP Access Strategy

Karar (repo gerçeklerine göre): Next.js'te `basePath` yok → **path-per-env
tek host çalışmaz**; `.local` host'ları her test makinesinde /etc/hosts
ister. **Birincil erişim: env başına NodePort servisleri** (30080–30083;
mevcut 31412/30772/30880/30443 ile çakışmaz) — `NEXT_PUBLIC_API_URL`
build-time olduğundan her makineden çalışan tek seçenek bu. Host-bazlı
ingress'ler `.local` placeholder'larıyla hazır (opsiyonel /etc/hosts testi;
hermes-dev'in host'suz ingress'iyle çakışmaz çünkü LogiSlot host'ludur);
domain gelince yalnızca host patch + web rebuild + DNS gerekir
(GITHUB_CICD.md §9).

## 9. Safety Rules

- Deploy workflow'unda **çift namespace guard**: `logislot-dev|logislot-prod`
  dışında her değer deploy'u durdurur. Hermes/ingress/monitoring
  namespace'lerine hiçbir komut yönelmiyor.
- `kubectl delete` yalnızca: kendi namespace + migration/seed job etiketi.
  **PVC delete hiçbir workflow'ta yok.**
- kubeconfig yalnızca dosyaya yazılır (chmod 600), asla loglanmaz/echo edilmez.
- Scheduler her ortamda replicas:1 + Recreate (+uygulama içi advisory lock).
- CI'daki manifests job'ı render'da "namespace: hermes" görürse kırılır.
- Prod/dev config karışması: ortam bash'te tek noktada seçilir; PROD secret
  eksikse dev'e düşmek yerine hata (bkz. §3).

## 10. Validation Results

- `kubectl kustomize k8s/overlays/dev` ve `.../prod` → **OK** (12'şer kaynak).
- Semantik doğrulama (Python): tüm kaynaklar doğru namespace'te; PVC 5Gi/10Gi;
  image tag'leri `:dev`/`:prod`; ingress host'ları env'e özgü; NodePort'lar
  {30080,30081}/{30082,30083}; sorun YOK.
- 4 workflow YAML parse doğrulaması → OK.
- Git güvenlik taraması: izlenen dosyalarda kubeconfig/.env/gerçek secret yok.
- `kubectl apply --dry-run` bu makineden koşulamaz (Hermes cluster erişimi
  yok — yerel context ölü k3d); master node'da koşulacak komutlar README'de.
- Gerçek apply/push YAPILMADI.

## 11. Kullanıcıdan Gereken Manuel Adımlar

1. §12'deki repo kararını verin (mevcut `main` prototipi!).
2. GitHub Secrets/Variables'ı girin (GITHUB_CICD.md §4) — kubeconfig'i
   master node'dan `base64 -w0 ~/.kube/config` ile alın.
3. (Önerilir) Settings → Environments → `production` → required reviewers.
4. İlk push sonrası GHCR paketlerini public yapın veya pull secret ekleyin.
5. İlk dev deploy sonrası: Actions → Deploy → dispatch `run_seed=true`
   (demo verisi isteniyorsa) ve `pilot_readiness.py` ile doğrulayın.

## 12. Apply/Push Öncesi Onay Bekleyenler

**KRİTİK BULGU**: `Duosis-Developer-Team/logislot` zaten var (public) ve
`main` branch'inde **Can İlbey Sezgin'in 2026-07-07 tarihli frontend
prototip çalışması** duruyor (JSX prototipleri + özellikler dokümanı).
Üzerine yazılmadı ve yazılmayacak. Seçenekler:

- **A (önerilen)**: `dev` ve `prod` branch'lerini mevcut repo'ya AYRI
  branch'ler olarak push et — `main` ve prototip aynen kalır; default
  branch'in `dev` yapılması ekip kararıyla sonra.
- **B**: Farklı repo adı (örn. `logislot-app`) — tam izolasyon.
- **C**: `main`'in değiştirilmesi — YALNIZCA prototipi push'layan ekip
  üyesiyle mutabakat + açık onayla.

Onayınızla koşulacak komutlar (Seçenek A):
```bash
git remote add origin https://github.com/Duosis-Developer-Team/logislot.git
git push -u origin dev prod
```
Ayrıca cluster'a ilk deploy da onay bekliyor (CI secrets girildikten sonra
`dev` push'u otomatik tetikler — bu nedenle push kararı = ilk deploy kararı
değildir; deploy için ek olarak KUBE_CONFIG secret'ının girilmiş olması gerekir).
