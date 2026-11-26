"""iptal sebepleri firma listesi + zorunlu telafi randevusu (tenant-plane)

Bu revizyon HER TENANT SEMASINDA ayri ayri kosar. Ayni degisiklik henuz
tasinmamis tenant'lar icin control-plane zincirinde de vardir
(bkz. alembic/versions/b4e8c2d61a93_cancellation_reasons_makeup.py); ikisi de
app/models/cancellation_reasons_ddl.py'yi cagirir.

Revision ID: 0007_cancel_reasons_makeup
Revises: 0006_supplier_cancel_policy
"""

from app.models import cancellation_reasons_ddl

revision = "0007_cancel_reasons_makeup"
down_revision = "0006_supplier_cancel_policy"
branch_labels = None
depends_on = None


def upgrade() -> None:
    cancellation_reasons_ddl.upgrade()


def downgrade() -> None:
    cancellation_reasons_ddl.downgrade()
