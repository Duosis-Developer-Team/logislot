"""plan limits (dinamik kota) + tenant-facility 1-1 kisiti

Urun kararlari (2026-07):
1. Planlara DINAMIK kota tanimi: `plans.limits_json` (key->sayi). Yeni bir
   limit turu eklemek icin migration gerekmez; bkz. app/core/plan_limits.py.
2. "1 tenant = 1 tesis": tesis artik ayri bir varlik olarak yonetilmez,
   tenant ile birlikte acilir. Kisit veritabani seviyesinde zorlanir.

Guvenlik: unique kisit eklenmeden ONCE, bir tenant'in birden fazla tesisi
varsa migration acik bir hatayla durur (sessizce veri kaybi yasanmaz);
operator fazlalik tesisleri elle birlestirmelidir.

Revision ID: c7f1a2b93d40
Revises: ca5e432dfa5e
Create Date: 2026-07-29
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "c7f1a2b93d40"
down_revision: str | None = "ca5e432dfa5e"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 1) Plan limitleri
    op.add_column("plans", sa.Column("limits_json", sa.JSON(), nullable=True))

    # 2) Tenant basina birden fazla tesis var mi? Varsa DURDUR.
    conn = op.get_bind()
    duplicates = conn.execute(
        sa.text(
            "SELECT tenant_id, COUNT(*) AS c FROM facilities "
            "GROUP BY tenant_id HAVING COUNT(*) > 1"
        )
    ).fetchall()
    if duplicates:
        detail = ", ".join(f"{row[0]} ({row[1]} tesis)" for row in duplicates)
        raise RuntimeError(
            "1 tenant = 1 tesis kisiti uygulanamadi; su tenant'larda birden fazla "
            f"tesis var: {detail}. Fazlalik tesisleri birlestirip tekrar deneyin."
        )

    op.create_unique_constraint("uq_facilities_tenant_single", "facilities", ["tenant_id"])


def downgrade() -> None:
    op.drop_constraint("uq_facilities_tenant_single", "facilities", type_="unique")
    op.drop_column("plans", "limits_json")
