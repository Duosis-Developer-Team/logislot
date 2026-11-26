"""siparis numaralari + randevu formu ayarlari

Musteri karari (2026-11 toplantisi): randevuda siparis no zorunlu, coklu
olabilir; zorunluluk tesis bazli randevu formu ayaridir.

Tenant-plane tablolar; bu revizyon henuz tasinmamis tenant'larin ortak
yerlesimini (public) gunceller. Kendi semasindakiler icin
alembic_tenant/versions/0008_order_numbers_form.py; ikisi de
app/models/appointment_form_ddl.py'yi cagirir.

Revision ID: c9a3f71e5d24
Revises: b4e8c2d61a93
Create Date: 2026-11-14
"""

from collections.abc import Sequence

from app.models import appointment_form_ddl

revision: str = "c9a3f71e5d24"
down_revision: str | None = "b4e8c2d61a93"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    appointment_form_ddl.upgrade()


def downgrade() -> None:
    appointment_form_ddl.downgrade()
