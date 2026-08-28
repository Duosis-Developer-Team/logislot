"""ticket olay sirasi kolonu — HENUZ TASINMAMIS tenant'lar icin

`support_ticket_projections` tenant-plane bir tablodur. Kendi semasina tasinmis
tenant'lar icin kolon alembic_tenant/0005 ile eklenir; bu revizyon eski ortak
yerlesimdeki (public) kayitlari gunceller. Yeni kolonun IKI zincire birden
girmesi zorunludur, aksi halde tasinmamis tenant'ta sorgu patlar.

Gerekce icin bkz. alembic_tenant/versions/0005_ticket_event_sequence.py.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "f1a6c3d84b52"
down_revision: str | None = "e8b2c4d19a37"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_TABLE = "support_ticket_projections"


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if _TABLE not in inspector.get_table_names():
        return  # bu kurulumda eski ortak yerlesim yok
    existing = {c["name"] for c in inspector.get_columns(_TABLE)}
    if "event_sequence" in existing:
        return
    op.add_column(
        _TABLE,
        sa.Column("event_sequence", sa.Integer(), nullable=False, server_default="0"),
    )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if _TABLE in inspector.get_table_names():
        op.drop_column(_TABLE, "event_sequence")
