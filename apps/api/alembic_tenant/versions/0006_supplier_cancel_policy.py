"""tedarikci iptal kurallari kolonlari (tenant-plane)

Bu revizyon HER TENANT SEMASINDA ayri ayri kosar. Ayni kolonlar, henuz kendi
semasina TASINMAMIS tenant'larin verisi ortak yerlesimde (public) durdugu icin
control-plane zincirine de eklenmistir
(bkz. alembic/versions/a6d2e9c41f07_supplier_cancellation_policy.py); iki
revizyon da app/models/supplier_cancellation_ddl.py'yi cagirir.

Yeni tenant semalari `create_all` ile modelden yaratilip bu zincirin head'ine
damgalandigi icin onlarda bu revizyon no-op'tur.

Revision ID: 0006_supplier_cancel_policy
Revises: 0005_ticket_event_sequence
"""

from app.models import supplier_cancellation_ddl

revision = "0006_supplier_cancel_policy"
down_revision = "0005_ticket_event_sequence"
branch_labels = None
depends_on = None


def upgrade() -> None:
    supplier_cancellation_ddl.upgrade()


def downgrade() -> None:
    supplier_cancellation_ddl.downgrade()
