#!/usr/bin/env bash
# LogiSlot GERCEK restore smoke testi (Sprint 11).
#
# NE YAPAR: ana DB'den pg_dump alir, GECICI bir test veritabanina
# (logislot_restore_smoke) restore eder, temel dogrulamalari yapar ve test
# DB'yi siler. ANA VERITABANINA ASLA restore/drop YAPMAZ.
#
# Kullanim:
#   ./scripts/backup_restore_smoke.sh
#   KEEP_DUMP=1 ./scripts/backup_restore_smoke.sh   # dump dosyasini birakir
#   RESTORE_DB=baska_ad ./scripts/backup_restore_smoke.sh

set -euo pipefail
cd "$(dirname "$0")/.."

DB_SERVICE="${DB_SERVICE:-db}"
DB_USER="${DB_USER:-logislot}"
DB_NAME="${DB_NAME:-logislot}"
RESTORE_DB="${RESTORE_DB:-logislot_restore_smoke}"
DUMP_FILE="restore_smoke_$(date +%Y%m%d_%H%M%S).dump"

if [ "$RESTORE_DB" = "$DB_NAME" ]; then
  echo "HATA: RESTORE_DB ana veritabaniyla ayni olamaz" >&2
  exit 1
fi

psql_cmd() { docker compose exec -T "$DB_SERVICE" psql -U "$DB_USER" -d "$1" -tAc "$2"; }

cleanup() {
  docker compose exec -T "$DB_SERVICE" psql -U "$DB_USER" -d postgres \
    -c "DROP DATABASE IF EXISTS ${RESTORE_DB} WITH (FORCE);" > /dev/null 2>&1 || true
  if [ "${KEEP_DUMP:-0}" != "1" ]; then rm -f "$DUMP_FILE"; fi
}
trap cleanup EXIT

echo "[1/5] pg_dump aliniyor -> ${DUMP_FILE}"
docker compose exec -T "$DB_SERVICE" pg_dump -U "$DB_USER" -d "$DB_NAME" -Fc > "$DUMP_FILE"
[ -s "$DUMP_FILE" ] || { echo "HATA: dump bos" >&2; exit 1; }

echo "[2/5] Gecici test DB olusturuluyor: ${RESTORE_DB}"
docker compose exec -T "$DB_SERVICE" psql -U "$DB_USER" -d postgres \
  -c "DROP DATABASE IF EXISTS ${RESTORE_DB} WITH (FORCE);" > /dev/null
docker compose exec -T "$DB_SERVICE" psql -U "$DB_USER" -d postgres \
  -c "CREATE DATABASE ${RESTORE_DB};" > /dev/null

echo "[3/5] Dump test DB'ye restore ediliyor"
docker compose exec -T "$DB_SERVICE" pg_restore -U "$DB_USER" -d "$RESTORE_DB" \
  --no-owner --exit-on-error < "$DUMP_FILE"

echo "[4/5] Dogrulamalar"
TABLES=$(psql_cmd "$RESTORE_DB" "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';")
TENANTS=$(psql_cmd "$RESTORE_DB" "SELECT count(*) FROM tenants;")
FACILITIES=$(psql_cmd "$RESTORE_DB" "SELECT count(*) FROM facilities;")
ALEMBIC=$(psql_cmd "$RESTORE_DB" "SELECT version_num FROM alembic_version;")
echo "  tablo: ${TABLES}, tenant: ${TENANTS}, tesis: ${FACILITIES}, alembic: ${ALEMBIC}"
[ "$TABLES" -gt 0 ] || { echo "HATA: tablo yok" >&2; exit 1; }
[ "$TENANTS" -gt 0 ] || { echo "HATA: tenant yok" >&2; exit 1; }
[ "$FACILITIES" -gt 0 ] || { echo "HATA: tesis yok" >&2; exit 1; }
[ -n "$ALEMBIC" ] || { echo "HATA: alembic_version yok" >&2; exit 1; }

echo "[5/5] Temizlik (trap)"
echo "✔ GERCEK restore smoke basarili — dump ${RESTORE_DB} uzerinde dogrulandi"
