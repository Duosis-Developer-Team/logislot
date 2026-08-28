"""tenant markali alan adlari + alan adlari arasi oturum devri

Iki sey ekler:

1. `tenants.admin_host` / `tenants.supplier_host` — tenant'a ozel alan adlari
   (orn. cknb.logislot.io / cknbtedarik.logislot.io). Ikisi de NULL edilebilir:
   MEVCUT tenant'lar etkilenmez ve bos birakildiginda hicbir yonlendirme
   yapilmaz. Kayit tek basina yeterli degildir, alan adinin DNS'i ve ingress
   girdisi de acilmis olmalidir (wildcard yok).

2. `control.auth_handoff_codes` — tek kullanimlik, kisa omurlu oturum devri
   kodlari. Oturum `localStorage`'da ve ORIGIN'e bagli oldugu icin markali alt
   alana duz yonlendirme kullaniciyi login ekranina geri dusururdu. Token'i
   URL'e koymak yerine kaynak origin bir kod alir, hedef origin kodu token ile
   takas eder. Tablo CONTROL-plane'dedir: kod tuketilirken hangi tenant oldugu
   henuz bilinmez.

Yikici islem YOKTUR: yalnizca iki nullable kolon ve bir yeni tablo.

Revision ID: d3f5a81c6e24
Revises: b7e2d94c1f30
Create Date: 2026-08-28
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "d3f5a81c6e24"
down_revision: str | None = "b7e2d94c1f30"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("tenants", sa.Column("admin_host", sa.String(length=255), nullable=True))
    op.add_column(
        "tenants", sa.Column("supplier_host", sa.String(length=255), nullable=True)
    )

    op.create_table(
        "auth_handoff_codes",
        sa.Column("id", sa.Uuid(), nullable=False),
        # Kodun kendisi DEGIL, sha256 ozeti saklanir.
        sa.Column("code_hash", sa.String(length=64), nullable=False),
        sa.Column("user_type", sa.String(length=10), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("tenant_id", sa.Uuid(), nullable=True),
        sa.Column("target_host", sa.String(length=255), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("consumed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id", name="pk_auth_handoff_codes"),
        sa.UniqueConstraint("code_hash", name="uq_auth_handoff_codes_code_hash"),
    )
    op.create_index("ix_auth_handoff_codes_code_hash", "auth_handoff_codes", ["code_hash"])
    op.create_index("ix_auth_handoff_codes_user_id", "auth_handoff_codes", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_auth_handoff_codes_user_id", table_name="auth_handoff_codes")
    op.drop_index("ix_auth_handoff_codes_code_hash", table_name="auth_handoff_codes")
    op.drop_table("auth_handoff_codes")
    op.drop_column("tenants", "supplier_host")
    op.drop_column("tenants", "admin_host")
