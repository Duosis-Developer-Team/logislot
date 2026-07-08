#!/bin/sh
set -e

echo "Migrationlar uygulaniyor..."
alembic upgrade head

echo "Seed kontrol ediliyor (idempotent)..."
python -m app.seed

echo "API baslatiliyor..."
exec uvicorn app.main:app --host 0.0.0.0 --port 8000
