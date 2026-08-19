"""tedarikci bazinda kargo teslimat izni

Urun karari (2026-08): "Kargo" teslimat tipi artik her tedarikci icin
otomatik gorunmez. Yonetim panelindeki tedarikci kartindan acilirsa
tedarikci portalinda secenek olarak belirir; kapaliyken tedarikci
yalnizca standart randevu olusturabilir. Standart tipi her zaman aciktir.

`suppliers` tenant-plane bir tablodur; bu revizyon yalnizca HENUZ kendi
semasina tasinmamis tenant'larin verisini tutan eski ortak yerlesimi
(public) gunceller. Kendi semasindaki tenant'lar icin ayni kolon
alembic_tenant/versions/0002_supplier_cargo_enabled.py ile eklenir.

Geriye uyumluluk: kolon NOT NULL + server_default=false, yani MEVCUT tum
tedarikciler kapali gelir (istenen davranis). Halihazirda olusmus kargo
randevulari ETKILENMEZ; kural yalnizca yeni olusturmada uygulanir.
Kargo kullanan tedarikciler icin yonetim anahtari acmalidir.

Revision ID: a1c9d4e07b31
Revises: e5b3d17c4a92
Create Date: 2026-08-19
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "a1c9d4e07b31"
down_revision: str | None = "e5b3d17c4a92"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


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
