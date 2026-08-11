"""urun kategorisine opsiyonel maksimum blokaj suresi

Urun karari (2026-08): "Mal kategorisine gore zaman araligi". Kategoride
zaten `min_block_minutes` (taban sure) vardi; ust sinir yalnizca tedarikci
kartinda tanimlanabiliyordu. Bu migration kategoriye opsiyonel bir ust
sinir ekler; boylece "Et: 30-120 dk" gibi bir aralik urunun kendisinde
tanimlanabilir.

Geriye uyumluluk: kolon NULLABLE ve varsayilani YOKTUR. Mevcut tum
kategoriler NULL ile gelir = "ust sinir yok" = bugunku davranisin
birebir aynisi. Canli randevular etkilenmez.

Revision ID: d3c1f6a27b90
Revises: d3a71c9f5b20
Create Date: 2026-08-11
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "d3c1f6a27b90"
down_revision: str | None = "d3a71c9f5b20"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "product_categories",
        sa.Column("max_block_minutes", sa.Integer(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("product_categories", "max_block_minutes")
