#!/usr/bin/env bash
# LogiSlot icin 8080/8443 -> ingress-nginx NodePort yonlendirmesi.
#
# NEDEN BU PORTLAR (80/443 DEGIL)
#   node1'in 80/443'u Hermes'e ayrilmis durumda (iptables -> 30880/30443) ve
#   bir node'un 80/443'u ayni anda iki yere gidemez. LogiSlot Cloudflare'in
#   ARKASINDA duracagi icin buna gerek de yok: kullanici her zaman
#   `https://logislot.io` (443) gorur, Cloudflare origin'e BASKA bir porttan
#   baglanir.
#
#   8080 ve 8443 secildi cunku Cloudflare'in origin'e baglanabildigi portlar
#   SINIRLIDIR: HTTP 80/8080/8880/2052/2082/2086/2095, HTTPS
#   443/8443/2053/2083/2087/2096. ingress-nginx'in kendi NodePort'lari
#   (31412/30772) bu listede YOKTUR — Cloudflare onlara dogrudan baglanamaz,
#   bu yuzden yonlendirme sart.
#
#   Hermes ayni sorunu ayni yontemle cozdu: /usr/local/sbin/
#   hermes-port-redirect.sh (80->30880, 443->30443). Bu betik onun LogiSlot
#   karsiligidir ve HERMES'IN PORTLARINA DOKUNMAZ.
#
# CLOUDFLARE TARAFINDA GEREKENLER
#   1. Kayitlar "Proxied" (turuncu bulut) olmali.
#   2. Origin Rule: bu host'lar icin origin portu 8443.
#   3. SSL/TLS modu "Full" (strict DEGIL) — ingress kendi self-signed
#      sertifikasini sunar, Cloudflare dogrulamaz ama trafik sifrelidir.
#      Public sertifikayi Cloudflare kendi edge'inde saglar.
#
# DIKKAT — CAKISMA
#   Betik yine de kontrol eder: hedef portlar baska bir servise gidiyorsa
#   DURUR. Varsayilan mod YALNIZCA RAPOR verir; uygulamak icin `--apply`.
#
# KULLANIM
#   ./logislot-port-redirect.sh              # ne yapacagini yazar, DEGISTIRMEZ
#   ./logislot-port-redirect.sh --apply      # uygular (idempotent)
#   ./logislot-port-redirect.sh --remove     # yalnizca kendi zincirini siler
#
# KALICILIK
#   Yeniden baslatmada kaybolur. Hermes'teki gibi systemd oneshot ile kalici
#   yapin:  cp bu-betik /usr/local/sbin/ && systemctl enable --now \
#           logislot-port-redirect.service
set -euo pipefail

HTTP_NODEPORT=31412   # ingress-nginx-controller :80
HTTPS_NODEPORT=30772  # ingress-nginx-controller :443
# Disaridan dinlenecek portlar. Cloudflare'in origin'e baglanabildigi
# listeden secildi; 80/443 BILEREK kullanilmiyor (onlar Hermes'in).
LISTEN_HTTP="${LOGISLOT_LISTEN_HTTP:-8080}"
LISTEN_HTTPS="${LOGISLOT_LISTEN_HTTPS:-8443}"
CHAIN="LOGISLOT-REDIRECT"

MODE="${1:-report}"

need_root() {
  [[ "$(id -u)" == "0" ]] || { echo "root gerekli" >&2; exit 1; }
}

# Bizim zincirimiz DISINDA 80/443'u baska yere goturen kural var mi?
find_conflicts() {
  iptables -t nat -S PREROUTING 2>/dev/null |
    grep -E -- "--dport ($LISTEN_HTTP|$LISTEN_HTTPS) " |
    grep -v -- "-j $CHAIN" || true
}

case "$MODE" in
  report)
    echo "== Node'un mevcut nat kurallari (80/443 dahil, bilgi icin) =="
    iptables -t nat -S PREROUTING 2>/dev/null | grep -E -- "--dport (80|443|$LISTEN_HTTP|$LISTEN_HTTPS) " || echo "(yok)"
    echo
    echo "== Bu betik uygulasaydi =="
    echo "  $LISTEN_HTTP  -> $HTTP_NODEPORT   (Cloudflare HTTP origin)"
    echo "  $LISTEN_HTTPS -> $HTTPS_NODEPORT  (Cloudflare HTTPS origin)"
    echo "  80/443'e DOKUNULMAZ — onlar Hermes'in."
    echo
    CONFLICTS="$(find_conflicts)"
    if [[ -n "$CONFLICTS" ]]; then
      echo "!! CAKISMA: $LISTEN_HTTP/$LISTEN_HTTPS zaten baska bir yere gidiyor."
      echo "$CONFLICTS" | sed 's/^/   /'
      echo "   Baska port secin: LOGISLOT_LISTEN_HTTPS=2053 ./$(basename "$0") --apply"
    else
      echo "Cakisma yok; --apply guvenli gorunuyor."
    fi
    ;;

  --apply)
    need_root
    CONFLICTS="$(find_conflicts)"
    if [[ -n "$CONFLICTS" ]]; then
      echo "DURDURULDU — cakisan kurallar var:" >&2
      echo "$CONFLICTS" | sed 's/^/   /' >&2
      echo "Bu node'un 80/443'u baska bir servise ait. Once onu tasiyin." >&2
      exit 2
    fi
    # Kendi zincirimiz: silmesi ve denetlemesi kolay olsun.
    iptables -t nat -N "$CHAIN" 2>/dev/null || true
    iptables -t nat -F "$CHAIN"
    iptables -t nat -A "$CHAIN" -p tcp --dport "$LISTEN_HTTP"  -j REDIRECT --to-port "$HTTP_NODEPORT"
    iptables -t nat -A "$CHAIN" -p tcp --dport "$LISTEN_HTTPS" -j REDIRECT --to-port "$HTTPS_NODEPORT"
    # PREROUTING'e YALNIZCA bir kez bagla (idempotent).
    iptables -t nat -C PREROUTING -p tcp -j "$CHAIN" 2>/dev/null ||
      iptables -t nat -I PREROUTING 1 -p tcp -j "$CHAIN"
    echo "Uygulandi: $LISTEN_HTTP->$HTTP_NODEPORT, $LISTEN_HTTPS->$HTTPS_NODEPORT"
    echo "Dogrulama (baska bir makineden):"
    echo "  curl -k -H 'Host: logislot.io' https://<node-ip>:$LISTEN_HTTPS/"
    ;;

  --remove)
    need_root
    iptables -t nat -D PREROUTING -p tcp -j "$CHAIN" 2>/dev/null || true
    iptables -t nat -F "$CHAIN" 2>/dev/null || true
    iptables -t nat -X "$CHAIN" 2>/dev/null || true
    echo "Kaldirildi."
    ;;

  *)
    echo "Bilinmeyen mod: $MODE (report | --apply | --remove)" >&2
    exit 1
    ;;
esac
