"""tedarikci bazinda kargo teslimat izni (tenant-plane)

`suppliers` tenant-plane bir tablodur; bu revizyon her tenant semasinda
ayri ayri calisir. Ayni kolon, henuz kendi semasina TASINMAMIS tenant'larin
verisi eski ortak yerlesimde (public) durdugu icin control-plane zincirine
de eklenmistir (bkz. alembic/versions/a1c9d4e07b31_supplier_cargo_enabled.py).

Yeni tenant semalari `create_all` ile modelden yaratilip bu zincirin
head'ine damgalandigi icin onlarda bu revizyon no-op'tur.

Revision ID: 0002_supplier_cargo_enabled
Revises: 0001_tenant_baseline
"""

import sqlalchemy as sa
from alembic import op

revision = "0002_supplier_cargo_enabled"
down_revision = "0001_tenant_baseline"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "suppliers",
        sa.Column(
            "cargo_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )


def downgrade() -> None:
    op.drop_column("suppliers", "cargo_enabled")
