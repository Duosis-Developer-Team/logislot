# Gozlemlenebilirlik — Prometheus / Drake

Drake (platform ekibinin Kubernetes gozlemlenebilirlik kontrol duzlemi)
LogiSlot'un CPU, bellek, restart ve pod sagligini Kubernetes'ten zaten
goruyor. Uygulamadan yalnizca uc sey isteniyor: **istek hizi, hata orani ve
p95 gecikme**. Bunlar yalnizca uygulama yayinlarsa var olur.

Sozlesmenin kaynagi depo kokundeki `LOGISLOT_METRICS.md`'dir.

## Sozlesme

| | |
|---|---|
| `http_server_requests_total` | counter — `project`, `environment`, `service`, `status_class` |
| `http_server_request_duration_seconds` | histogram — `project`, `environment`, `service` (**saniye**) |

`status_class` **sinif**tir, kod degil: `2xx`, `3xx`, `4xx`, `5xx`.
`environment` **katalog anahtaridir**, namespace degil: `dev`, `prod`.

**Yasak etiketler:** `pod`, `container`, `instance`, `route`, `path`,
`tenant`, `customer`, kullanici id/e-postasi, request id — sinirsiz
kardinaliteli her sey. Yol bilerek toplanip atilir.

## Neler enstrumante edildi

| Servis | Durum | Neden |
|---|---|---|
| `logislot-api` | **Evet** — `service="logislot-api"` | Gercek HTTP trafiginin tamami burada |
| `logislot-scheduler` | Hayir | HTTP dinleyicisi YOK; `python -m app.maintenance.scheduler` saf asyncio dongusu. Sayilacak istek yok |
| `logislot-web` + `-admin` / `-platform` / `-supplier` | Hayir | Next.js Edge middleware yanit URETILMEDEN once kosar, nihai durum kodunu goremez -> `status_class` elde edilemez. Alternatifler (deneysel Node middleware'e gecis, ya da `http.createServer` yamalamasi) canli web istek yoluna sozlesmenin uyardigi turden risk ekler. Ayri bir is olarak degerlendirilmeli |
| `logislot-postgres` | Hayir | Ucuncu parti imaj, uygulama kodu yok. Drake zaten `kubernetes-service-v1` profiliyle kume envanterinden goruyor |

## Metrik portu: 9464

`/metrics` **ayri bir portta** yayinlanir, uygulama portunda (8000) degil.

Sebep: 8000 NodePort ile disariya aciktir (dev `30081`, prod `30083`).
`/metrics` sir icermez ama trafik seklini anlatir ve kumeden cikmasi icin bir
sebep yoktur. 9464 **hicbir** Service, NodePort veya Ingress'e baglanmaz;
Prometheus dogrudan pod IP'sine gider.

9464 secildi cunku uygulama portlariyla (8000/3000), Prometheus sunucusunun
kendi portuyla (9090) ve node_exporter ile (9100) cakismaz.

## Scrape anotasyonlari — POD template'inde

```yaml
# k8s/base/api-deployment.yaml
spec:
  template:
    metadata:
      annotations:
        prometheus.io/scrape: "true"
        prometheus.io/port: "9464"
        prometheus.io/path: "/metrics"
```

**Service'e konursa hicbir sey toplanmaz** ve belirti "hic metrik yayinlamamak"
ile birebir ayni gorunur. `scripts/verify_metrics_manifests.py` bunu engeller.

## Guvenlik agi

Bu sozlesmenin bozulmasi *sessizdir*: seri toplanmaya devam eder, panolar
bos kalir, kimse haftalarca fark etmez. Iki guard bu yuzden var:

- `apps/api/tests/test_metrics.py` — metrik/etiket adlari, `status_class`'in
  sinif oldugu, histogramin saniye oldugu, yasak etiketlerin bulunmadigi ve
  middleware'in istegi dusurmedigi/degistirmedigi.
- `scripts/verify_metrics_manifests.py` (CI: `ci.yml` -> `manifests`) —
  `environment` katalog anahtari mi, anotasyonlar pod template'inde mi,
  metrik portu bir Service'ten sizmis mi.

## Middleware notlari

`app/core/metrics.py` icindeki `PrometheusMiddleware` **saf ASGI**'dir,
`BaseHTTPMiddleware` degil: ikincisi her istek icin fazladan task + bellek
stream'i kurar ve streaming/BackgroundTask semantigini degistirebilir.
Yapilan is iki sayac artirmaktan ibaret.

Guvenceler: mesajlar oldugu gibi aktarilir; metrik kaydi `try/except`
icindedir ve hata yutulur; uygulamanin istisnasi 5xx sayilir ama **oldugu
gibi** yukari birakilir. Middleware en son eklenir, yani en distadir —
olculen sure CORS ve guvenlik basliklari dahil istegin tamamidir.

## Bilinen kabuller

- **Saglik yoklamalari sayilir.** `/health` haric tutulmadi: sozlesme etiket
  kumesini tuketici sekilde tanimliyor ama yol filtresinden hic bahsetmiyor
  ve sessiz bir sapma tam da kacinilmasi istenen hata bicimi. Yan etkisi:
  tek replikada readiness (10 sn) + liveness (20 sn) ~0.15 req/sn taban
  trafik uretir ve dusuk trafikte p95'i asagi ceker. Haric tutulmasi
  istenirse tek satirlik ve geri alinabilir bir degisiklik.
- `prometheus_client` sozlesme metriklerinin yani sira standart
  `*_created` gauge'lari ve `process_*` / `python_*` serilerini de yayinlar.
  Drake'in sorgulariyla cakismazlar.
- **Tek uvicorn sureci varsayilir.** Sayaclar surec ici bellektedir.
  Deployment `uvicorn ... --port 8000` komutunu `--workers` OLMADAN kosar,
  yani bugun dogru. `--workers` eklenirse her worker 9464'u bind etmeye
  calisir; yalnizca biri basarir (digerleri uyari loglayip acilmaya devam
  eder) ve metrikler tek worker'i yansitir. O gun gerekecek olan
  `prometheus_client`'in multiprocess modudur.
- Scheduler ve migration/seed/bootstrap job'lari ayni imaji farkli komutla
  kosar; `app.main` import edilmedigi icin metrik sunucusu acilmaz ve port
  cakismasi olmaz.
