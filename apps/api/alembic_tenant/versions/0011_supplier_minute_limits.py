"""tedarikci sure limitleri (tenant-plane)

Bu revizyon HER TENANT SEMASINDA ayri ayri kosar; ayni degisiklik henuz
tasinmamis tenant'lar icin control-plane zincirinde de vardir
(bkz. alembic/versions/f4d8b2a6c193_supplier_minute_limits.py).

Revision ID: 0011_supplier_minute_limits
Revises: 0010_duration_rules
"""

from app.models import supplier_minute_limits_ddl

revision = "0011_supplier_minute_limits"
down_revision = "0010_duration_rules"
branch_labels = None
depends_on = None


def upgrade() -> None:
    supplier_minute_limits_ddl.upgrade()


def downgrade() -> None:
    supplier_minute_limits_ddl.downgrade()
