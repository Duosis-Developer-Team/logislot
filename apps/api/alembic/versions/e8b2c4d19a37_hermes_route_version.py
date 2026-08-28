"""route_version ayrimi: bizim sayacimiz ile Hermes'in surumu

`ticket_routing_configs.route_version` iki isi birden yapiyordu: platform
ekranindaki iyimser kilit (`expected_route_version`) VE Hermes create
payload'indaki `route.route_version`.

Ikisi ayni sayi olamaz. Hermes kendi route surumunu tutuyor ve payload'da baska
bir sayi gorurse `route_stale` donuyor. Canli olarak yasandi: bizde 1, Hermes'te
5 idi ve HER ticket teslimatta takildi ("Talep destek merkezine iletilemedi").

Bu revizyon Hermes'in surumu icin ayri bir kolon acar. NULL edilebilir: deger
ilk basarili dogrulamada dolar ve bilinmiyorken payload'a alan HIC konmaz.
Mevcut kayitlar etkilenmez; yikici islem yoktur.

Revision ID: e8b2c4d19a37
Revises: d3f5a81c6e24
Create Date: 2026-08-28
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "e8b2c4d19a37"
down_revision: str | None = "d3f5a81c6e24"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "ticket_routing_configs",
        sa.Column("hermes_route_version", sa.Integer(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("ticket_routing_configs", "hermes_route_version")
