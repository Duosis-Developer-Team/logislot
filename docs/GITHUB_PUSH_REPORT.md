# LogiSlot Repo Creation + Push Correction Report

Tarih: 2026-07-08

## 1. Özet

Repo tespiti düzeltildi ve Seçenek A yerine doğru senaryo uygulandı:
`Duosis-Developer-Team/logislot` GERÇEKTE YOKTU — önceki tespit, GitHub'ın
**eski-ad yönlendirmesine** takılmıştı (`logislot` adı `logislot-webui`'ye
redirect ediyor; prototip repo'su eskiden `logislot` adındaymış ve
yeniden adlandırılmış). Yeni **public `logislot` repo'su oluşturuldu**,
`dev` + `prod` branch'leri push edildi, default branch `dev` yapıldı.
`logislot-webui`'ye DOKUNULMADI (pushed_at değişmedi: 2026-07-07T20:28:21Z).

**Tek blokaj**: workflow'lar push'a rağmen tetiklenmiyor — teşhis, org
Actions politikasının **"selected repositories"** modunda olması (Hermes
koşabiliyor, yeni repo izin listesinde değil; okuma/değiştirme org admin
yetkisi istiyor). Org admin'in repo'yu Actions izin listesine eklemesi
gerekiyor (§7). Cluster'a hiçbir şey uygulanmadı; GitHub Secrets de henüz
girilmediği için deploy zaten güvenli şekilde duracaktı.

## 2. Repo Kontrolü

- `gh repo list Duosis-Developer-Team` (100 repo): **`logislot` YOK**,
  `logislot-webui` VAR — kullanıcının gözlemi doğrulandı.
- Redirect kanıtı: `gh api repos/Duosis-Developer-Team/logislot` →
  `resolved_name: "Duosis-Developer-Team/logislot-webui"` — önceki "repo
  zaten var, main'de prototip var" raporunun kök nedeni bu redirect'ti.
  (Not: yeni `logislot` oluşturulduğu için bu eski-ad redirect'i artık
  geçersiz — `logislot-webui`'ye artık yalnızca gerçek adıyla erişilir;
  içerik olarak hiçbir şey değişmedi.)
- `logislot-webui`: farklı repo, prototip içerikli, **dokunulmadı**.

## 3. Repo Oluşturma

- URL: https://github.com/Duosis-Developer-Team/logislot
- Visibility: **public** · Açıklama: "LogiSlot - Smart Receiving Dock
  Appointment Platform"
- Remote: `origin = https://github.com/Duosis-Developer-Team/logislot.git`
- Default branch: **dev** (API ile ayarlandı).

## 4. Branch Push

- `dev` → push edildi ✔ · `prod` → push edildi ✔ (ikisi de aynı güvenli
  commit; sonrasında her birine birer boş "trigger" commit'i eklendi).
- `main` branch'i YOK ve oluşturulmadı (boş repo'ya gerek yok; ekip isterse
  sonradan README yönlendirme branch'i olarak açılabilir).
- Force push YOK; `logislot-webui` ve Hermes repo/namespace'lerine hiçbir
  işlem YOK.

## 5. Security Scan (push öncesi koşuldu)

- `git ls-files` taraması: `.env`/kubeconfig/secret.yaml/anahtar dosyası **YOK**.
- İçerik taraması: private key YOK; `LOGISLOT_SECRET_KEY`/`POSTGRES_PASSWORD`
  eşleşmeleri yalnızca `.env.example`, compose dev placeholder'ları
  (`dev-secret-change-me`, yerel `logislot` şifresi) ve dokümantasyon —
  hepsi bilinçli örnek değerler. Gerçek secret push EDİLMEDİ.

## 6. GitHub Actions Durumu

- Workflow dosyaları remote `dev`'de mevcut (`ci.yml`, `build-images.yml`,
  `deploy.yml`, `e2e.yml`) ve repo-level Actions "enabled/all" görünüyor.
- **Ancak** push'lar (ilk push + iki tetikleme boş commit'i) hiçbir workflow
  koşusu üretmedi; `gh workflow list` yalnızca GitHub'ın dahili "Dependency
  Graph"ını gösteriyor; dispatch denemesi 404 (workflow indekslenmemiş).
- Teşhis: aynı org'daki **Hermes Actions koşabiliyor** → org politikası
  büyük olasılıkla "selected repositories" ve yeni repo listede değil.
  Org policy okuma denemesi 403 (admin:org gerekir) — kesinleştirme org
  admin'de.
- Sonuç: CI/build/deploy henüz KOŞMADI. Secrets da boş olduğundan, Actions
  açılsa bile deploy "zorunlu secret eksik" diyerek güvenli duracak;
  cluster'a hiçbir apply olmadı.

## 7. Kullanıcıdan Beklenenler (sırayla)

1. **Org admin**: GitHub → Organization Settings → Actions → General →
   "Allow select repositories" listesine **logislot**'u ekleyin (veya
   politikayı "All repositories" yapın). Ardından `dev`'e boş commit veya
   Actions sekmesinden dispatch ile koşular başlar.
2. **Secrets** (repo → Settings → Secrets and variables → Actions):
   `KUBE_CONFIG` (master'da `base64 -w0 ~/.kube/config`),
   `DEV_LOGISLOT_SECRET_KEY`, `DEV_POSTGRES_PASSWORD`, `DEV_DATABASE_URL`,
   `PROD_LOGISLOT_SECRET_KEY`, `PROD_POSTGRES_PASSWORD`, `PROD_DATABASE_URL`
   (DB URL: `postgresql+asyncpg://logislot:<PW>@logislot-postgres:5432/logislot`;
   dev/prod parolaları FARKLI olsun). SMTP'ler log_only'de opsiyonel.
3. **Variables**: `DEV_NEXT_PUBLIC_API_URL=http://84.247.180.172:30081`,
   `PROD_NEXT_PUBLIC_API_URL=http://84.247.180.172:30083`.
4. **production environment koruması**: Settings → Environments →
   `production` → Required reviewers (prod deploy manuel onay bekler).
5. İlk Build Images koşusundan sonra **GHCR paketlerini public** yapın
   (`logislot-api`, `logislot-web`) veya pull secret ekleyin.
6. Master node'da deploy öncesi kontroller:
   `kubectl get svc -A | grep -E "30080|30081|30082|30083"` (boş olmalı) ve
   `kubectl apply --dry-run=client -k k8s/overlays/dev` (+prod).
7. Secrets girildikten sonra ilk deploy: `dev`'e boş commit → doğrulama:
   `curl http://84.247.180.172:30081/health`, `kubectl -n logislot-dev get all`,
   `pilot_readiness.py`; demo verisi istenirse Actions → Deploy →
   dispatch `run_seed=true` (yalnızca dev). Prod: `dev`→`prod` PR;
   **prod'da seed yok** (müşteri onboarding UI'dan).
