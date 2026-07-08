#!/usr/bin/env bash
# LogiSlot yedekleme smoke testi.
#
# NE YAPAR: compose icindeki Postgres'ten pg_dump alir, dosyanin olustugunu
# ve bos olmadigini kontrol eder, `pg_restore --list` ile dump'in OKUNABILIR
# oldugunu dogrular.
#
# NE YAPMAZ: gercek restore DENEMEZ (calisan demo/pilot DB'sinin uzerine
# yazmamak icin bilincli karar). Gercek restore provasi icin runbook'taki
# adimlari ayri bir test veritabaninda kosun.
#
# Kullanim:
#   ./scripts/backup_smoke.sh            # dump'i dogrular ve SILER
#   KEEP_DUMP=1 ./scripts/backup_smoke.sh  # dump dosyasini birakir

set -euo pipefail
cd "$(dirname "$0")/.."

DB_SERVICE="${DB_SERVICE:-db}"
DB_USER="${DB_USER:-logislot}"
DB_NAME="${DB_NAME:-logislot}"
DUMP_FILE="backup_smoke_$(date +%Y%m%d_%H%M%S).dump"

echo "[1/3] pg_dump aliniyor -> ${DUMP_FILE}"
docker compose exec -T "$DB_SERVICE" pg_dump -U "$DB_USER" -d "$DB_NAME" -Fc > "$DUMP_FILE"

echo "[2/3] Dump dosyasi kontrol ediliyor"
if [ ! -s "$DUMP_FILE" ]; then
  echo "HATA: dump dosyasi bos veya olusmadi" >&2
  exit 1
fi
SIZE=$(wc -c < "$DUMP_FILE" | tr -d ' ')
echo "  boyut: ${SIZE} bayt"

echo "[3/3] pg_restore --list ile okunabilirlik dogrulaniyor"
TABLE_COUNT=$(docker compose exec -T "$DB_SERVICE" pg_restore --list < "$DUMP_FILE" \
  | grep -c "TABLE DATA" || true)
if [ "$TABLE_COUNT" -lt 5 ]; then
  echo "HATA: dump icinde beklenen tablolar yok (TABLE DATA=${TABLE_COUNT})" >&2
  exit 1
fi
echo "  TABLE DATA girdisi: ${TABLE_COUNT}"

if [ "${KEEP_DUMP:-0}" = "1" ]; then
  echo "✔ Yedek smoke basarili — dump birakildi: ${DUMP_FILE}"
else
  rm -f "$DUMP_FILE"
  echo "✔ Yedek smoke basarili — dump dogrulandi ve temizlendi"
fi
