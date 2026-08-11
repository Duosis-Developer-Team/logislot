#!/bin/sh
set -e

echo "Control-plane migrationlari uygulaniyor..."
alembic upgrade head

echo "Tenant semalari migrate ediliyor..."
python -m app.tenancy.migrations upgrade

echo "Seed kontrol ediliyor (idempotent)..."
python -m app.seed

echo "API baslatiliyor..."
exec uvicorn app.main:app --host 0.0.0.0 --port 8000
