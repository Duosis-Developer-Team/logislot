"""tedarikci sure limitleri (gunluk/haftalik/aylik dakika)

Musteri karari (2026-11 toplantisi): tedarikci limiti sure uzerinden; tesis
varsayilani + tedarikci bazli ezme.

Tenant-plane tablo; bu revizyon henuz tasinmamis tenant'larin ortak
yerlesimini (public) gunceller. Kendi semasindakiler icin
alembic_tenant/versions/0011_supplier_minute_limits.py; ikisi de
app/models/supplier_minute_limits_ddl.py'yi cagirir.

Revision ID: f4d8b2a6c193
Revises: e3c5a9d27b16
Create Date: 2026-11-14
"""

from collections.abc import Sequence

from app.models import supplier_minute_limits_ddl

revision: str = "f4d8b2a6c193"
down_revision: str | None = "e3c5a9d27b16"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    supplier_minute_limits_ddl.upgrade()


def downgrade() -> None:
    supplier_minute_limits_ddl.downgrade()
