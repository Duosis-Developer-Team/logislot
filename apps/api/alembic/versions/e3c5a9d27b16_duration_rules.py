"""islem suresi kurallari + sure politikasi

Musteri karari (2026-11 toplantisi): sure sevkiyat tipi, miktar, arac tipi ve
urun kategorisine gore sistemce hesaplansin (konfigure edilebilir kurallar).

Tenant-plane; bu revizyon henuz tasinmamis tenant'larin ortak yerlesimini
(public) gunceller. Kendi semasindakiler icin
alembic_tenant/versions/0010_duration_rules.py; ikisi de
app/models/duration_rules_ddl.py'yi cagirir.

Revision ID: e3c5a9d27b16
Revises: d7b1e4c08f35
Create Date: 2026-11-14
"""

from collections.abc import Sequence

from app.models import duration_rules_ddl

revision: str = "e3c5a9d27b16"
down_revision: str | None = "d7b1e4c08f35"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    duration_rules_ddl.upgrade()


def downgrade() -> None:
    duration_rules_ddl.downgrade()
