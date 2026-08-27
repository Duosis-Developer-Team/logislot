# LogiSlot origin proxy (node1)

Cloudflare'in origin'e bağlandığı portu ingress-nginx'e taşıyan iki systemd
birimi. **Kurulu ve çalışıyor** (node1 = `84.247.180.172`).

```
kullanıcı ──443──> Cloudflare ──8443──> node1:8443 (nginx stream, ssl_preread)
                                          ├─ TLS  ──> node1:30772 (ingress HTTPS NodePort)
                                          └─ düz  ──> node1:31412 (ingress HTTP  NodePort)
                                                        └──> logislot Ingress → portal Service
```

## Neden 8443 iki protokolü birden kabul ediyor

Cloudflare'in origin'e **hangi protokolle** bağlanacağını panel ayarı
(`SSL/TLS → encryption mode`) belirler: Flexible → düz HTTP, Full → TLS.
Tek protokol dinleyen bir origin, o ayar değişince **sessizce kırılır**.

Nitekim yaşandı: panelde "Full" seçili görünürken Cloudflare düz HTTP
gönderdi ve ingress `400 The plain HTTP request was sent to HTTPS port`
döndürdü. Sayfa Hermes değil, nginx hatası veriyordu — teşhisi zorlaştıran
tam olarak buydu.

`ssl_preread` bağlantının ilk baytlarına bakıp TLS olup olmadığını anlar ve
uygun ingress portuna yollar. Böylece origin **panel ayarından bağımsız**
çalışır; Flexible↔Full geçişi kesinti yaratmaz.

## Neden socat, neden iptables değil

Önce `iptables REDIRECT 8443 → 30772` denendi ve **çalışmadı**: SYN paketleri
node'a ulaşıyor, REDIRECT sayacı artıyor, ama SYN-ACK dönmüyordu (zaman aşımı).

Sebep: `ingress-nginx-controller` **node2'de hostNetwork** ile çalışıyor
(`endpoint 84.247.180.173:443`). node1'deki zincir şu oluyor:

```
REDIRECT (netfilter NAT) → IPVS NodePort → node2:443 (masquerade)
```

netfilter NAT ile IPVS **üst üste NAT** yapıyor ve paket cevapsız kalıyor.
Aynı desen Hermes'te çalışıyor (`80→30880`) çünkü onun endpoint'i **aynı node
üzerindeki** bir pod (`10.233.64.2:443`) — cross-node masquerade yok.

`socat` **yeni bir TCP bağlantısı** açtığı için bu çakışma hiç oluşmuyor.

## Neden 80/443 değil

node1'in 80/443'ü Hermes'e ayrılmış (`iptables 80→30880, 443→30443`) ve bir
node'un 80/443'ü aynı anda iki yere gidemez. Cloudflare önde olduğu için
gerek de yok: kullanıcı her zaman `https://logislot.io` görür.

**Port seçimi keyfi değil:** Cloudflare origin'e yalnızca belirli portlardan
bağlanır — HTTPS `443, 8443, 2053, 2083, 2087, 2096`, HTTP `80, 8080, 8880,
2052, 2082, 2086, 2095`. ingress-nginx'in NodePort'ları (30772/31412) bu
listede **yok**, o yüzden bu proxy şart.

## Kurulum

```bash
# nginx stream modülü (bir kez)
ssh root@84.247.180.172 'apt-get install -y --no-install-recommends libnginx-mod-stream'

# 8443 dinleyicisi
scp k8s/origin-proxy/nginx-stream-logislot.conf \
    root@84.247.180.172:/etc/nginx/stream-enabled/logislot.conf
ssh root@84.247.180.172 'grep -q stream-enabled /etc/nginx/nginx.conf || \
  printf "\nstream {\n    include /etc/nginx/stream-enabled/*.conf;\n}\n" >> /etc/nginx/nginx.conf
  rm -f /etc/nginx/sites-enabled/default
  nginx -t && systemctl enable --now nginx'

# 8080 (yedek düz-HTTP yolu)
scp k8s/origin-proxy/logislot-origin-proxy-8080.service root@84.247.180.172:/etc/systemd/system/
ssh root@84.247.180.172 'systemctl daemon-reload && systemctl enable --now logislot-origin-proxy-8080'
```

## Doğrulama

```bash
# TLS ile (Cloudflare "Full")
curl -k -H "Host: api.logislot.io" https://84.247.180.172:8443/health   # {"status":"ok"}
# düz HTTP ile (Cloudflare "Flexible")
curl    -H "Host: api.logislot.io" http://84.247.180.172:8443/health    # {"status":"ok"}
# Hermes bozulmamalı
curl -k https://84.247.180.172/                                         # Hermes
```

## Cloudflare tarafı

| Ayar | Değer |
|---|---|
| DNS kayıtları | **Proxied** (turuncu bulut) |
| SSL/TLS → Overview | **Full** (Flexible değil, strict de değil) |
| Rules → Origin Rules | `Hostname contains logislot.io` → **Destination Port 8443** |
| SSL/TLS → Edge Certificates | **Always Use HTTPS** açık |

`Full (strict)` istenirse Cloudflare Origin CA sertifikası üretilip
`logislot-tls-logislot-io` secret'ı olarak yaratılır ve
`k8s/overlays/prod/ingress-patch.yaml` içindeki `tls:` bloğu açılır.

## Geri alma

```bash
ssh root@84.247.180.172 'systemctl disable --now nginx logislot-origin-proxy-8080'
```
Hermes'in kurallarına hiç dokunulmaz.
