"""ticket projeksiyonuna olay sirasi kolonu

Siralama/bosluk karari `aggregate_version` ile veriliyordu. O alan Hermes'in
OPTIMISTIC-LOCK surumu; olay basina ARTMAZ. Ticket basina artan alan zarfin
`sequence` alanidir ve saklanmiyordu.

Sonucu: durum olayiyla ayni `aggregate_version`i tasiyan bir destek yaniti
"eski/esit olay" sayilip SESSIZCE dusuyordu — inbox satiri `processed`
gorunuyor, musteri yaniti hic gormuyordu (prod, 28 Agu 2026).

Mevcut kayitlar 0 ile baslar: bir sonraki olay her zaman buyuk oldugu icin
uygulanir. Yikici islem yoktur.
"""

import sqlalchemy as sa
from alembic import op

revision = "0005_ticket_event_sequence"
down_revision = "0004_ticket_role_permissions"
branch_labels = None
depends_on = None


_TABLE = "support_ticket_projections"


def upgrade() -> None:
    # KOSULLU olmak zorunda: tablo `ticketing_ddl` ile olusturulur ve o DDL
    # kolonu ARTIK iceriyor. Yeni bir tenant'ta 0003 tabloyu kolonla birlikte
    # yaratir, burada tekrar eklemek "duplicate column" ile duserdi. Eski
    # tenant'ta ise kolon yoktur ve eklenmesi gerekir.
    bind = op.get_bind()
    existing = {c["name"] for c in sa.inspect(bind).get_columns(_TABLE)}
    if "event_sequence" in existing:
        return
    op.add_column(
        _TABLE,
        sa.Column("event_sequence", sa.Integer(), nullable=False, server_default="0"),
    )


def downgrade() -> None:
    bind = op.get_bind()
    existing = {c["name"] for c in sa.inspect(bind).get_columns(_TABLE)}
    if "event_sequence" in existing:
        op.drop_column(_TABLE, "event_sequence")
