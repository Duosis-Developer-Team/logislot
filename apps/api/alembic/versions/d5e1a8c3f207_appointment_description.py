"""randevu aciklamasi (serbest metin)

Musteri karari (2026-11): ayni sevkiyatta birden fazla urun; randevuya genel
bir "Aciklama" alani. Gorunurlugu randevu formu ayaridir (varsayilan gizli).

Tenant-plane tablo; bu revizyon henuz tasinmamis tenant'larin ortak
yerlesimini (public) gunceller. Kendi semasindakiler icin
alembic_tenant/versions/0013_appt_description.py; ikisi de
app/models/appointment_description_ddl.py'yi cagirir.

Revision ID: d5e1a8c3f207
Revises: a2c7e5f9d184
Create Date: 2026-11-17
"""

from collections.abc import Sequence

from app.models import appointment_description_ddl

revision: str = "d5e1a8c3f207"
down_revision: str | None = "a2c7e5f9d184"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    appointment_description_ddl.upgrade()


def downgrade() -> None:
    appointment_description_ddl.downgrade()
