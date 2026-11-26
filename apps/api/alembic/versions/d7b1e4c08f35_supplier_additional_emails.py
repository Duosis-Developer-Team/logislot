"""tedarikci ek bildirim e-postalari

Musteri karari (2026-11 toplantisi): tedarikciye 10'a kadar ek e-posta.

Tenant-plane tablo; bu revizyon henuz tasinmamis tenant'larin ortak
yerlesimini (public) gunceller. Kendi semasindakiler icin
alembic_tenant/versions/0009_supplier_emails.py; ikisi de
app/models/supplier_emails_ddl.py'yi cagirir.

Revision ID: d7b1e4c08f35
Revises: c9a3f71e5d24
Create Date: 2026-11-14
"""

from collections.abc import Sequence

from app.models import supplier_emails_ddl

revision: str = "d7b1e4c08f35"
down_revision: str | None = "c9a3f71e5d24"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    supplier_emails_ddl.upgrade()


def downgrade() -> None:
    supplier_emails_ddl.downgrade()
