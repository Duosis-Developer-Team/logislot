"""surucu kimlik numarasi (sifreli) + appt.driver_id.view izni

Musteri karari (2026-11 toplantisi): guvenlik entegrasyonu icin surucu
TCKN/pasaport numarasi.

Tenant-plane tablo; bu revizyon henuz tasinmamis tenant'larin ortak
yerlesimini (public) gunceller. Kendi semasindakiler icin
alembic_tenant/versions/0012_driver_id_number.py; ikisi de
app/models/driver_id_ddl.py'yi cagirir.

Revision ID: a2c7e5f9d184
Revises: f4d8b2a6c193
Create Date: 2026-11-14
"""

from collections.abc import Sequence

from app.models import driver_id_ddl

revision: str = "a2c7e5f9d184"
down_revision: str | None = "f4d8b2a6c193"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    driver_id_ddl.upgrade()


def downgrade() -> None:
    driver_id_ddl.downgrade()
