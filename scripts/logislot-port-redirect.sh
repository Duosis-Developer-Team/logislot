#!/usr/bin/env bash
# LogiSlot icin 80/443 -> ingress-nginx NodePort yonlendirmesi.
#
# NEDEN GEREKLI
#   `logislot-prod`daki Ingress'i yalnizca `ingress-nginx` controller'i gorur
#   (digeri `--watch-namespace=hermes-test` ile sinirli). O controller'in
#   Service'i NodePort: 80:31412, 443:30772. Alan adlarinin PORTSUZ calismasi
#   icin host'un 80/443'unun bu portlara dusmesi gerekir.
#
#   Hermes ayni sorunu ayni yontemle cozdu: /usr/local/sbin/
#   hermes-port-redirect.sh (80->30880, 443->30443). Bu betik onun LogiSlot
#   karsiligidir.
#
# DIKKAT — CAKISMA
#   Bir node'un 80/443'u AYNI ANDA iki yere gidemez. Bu betigi Hermes'in
#   yonlendirmesi olan bir node'da calistirmak Hermes'in o node uzerinden
#   erisimini KESER. Bu yuzden betik varsayilan olarak YALNIZCA RAPOR verir;
#   uygulamak icin acikca `--apply` gerekir ve cakisma bulursa durur.
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
CHAIN="LOGISLOT-REDIRECT"

MODE="${1:-report}"

need_root() {
  [[ "$(id -u)" == "0" ]] || { echo "root gerekli" >&2; exit 1; }
}

# Bizim zincirimiz DISINDA 80/443'u baska yere goturen kural var mi?
find_conflicts() {
  iptables -t nat -S PREROUTING 2>/dev/null |
    grep -E -- "--dport (80|443) " |
    grep -v -- "-j $CHAIN" || true
}

case "$MODE" in
  report)
    echo "== Mevcut 80/443 nat kurallari =="
    iptables -t nat -S PREROUTING 2>/dev/null | grep -E -- "--dport (80|443) " || echo "(yok)"
    echo
    echo "== Bu betik uygulasaydi =="
    echo "  80  -> $HTTP_NODEPORT"
    echo "  443 -> $HTTPS_NODEPORT"
    echo
    CONFLICTS="$(find_conflicts)"
    if [[ -n "$CONFLICTS" ]]; then
      echo "!! CAKISMA: bu node'un 80/443'u zaten baska bir yere gidiyor."
      echo "$CONFLICTS" | sed 's/^/   /'
      echo "   Buyuk olasilikla Hermes. BASKA BIR NODE secin ya da once"
      echo "   sahibiyle konusun; --apply bu durumda calismaz."
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
    iptables -t nat -A "$CHAIN" -p tcp --dport 80  -j REDIRECT --to-port "$HTTP_NODEPORT"
    iptables -t nat -A "$CHAIN" -p tcp --dport 443 -j REDIRECT --to-port "$HTTPS_NODEPORT"
    # PREROUTING'e YALNIZCA bir kez bagla (idempotent).
    iptables -t nat -C PREROUTING -p tcp -j "$CHAIN" 2>/dev/null ||
      iptables -t nat -I PREROUTING 1 -p tcp -j "$CHAIN"
    echo "Uygulandi: 80->$HTTP_NODEPORT, 443->$HTTPS_NODEPORT"
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
