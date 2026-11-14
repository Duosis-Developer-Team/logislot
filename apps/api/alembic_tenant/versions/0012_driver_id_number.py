"""surucu kimlik numarasi + appt.driver_id.view izni (tenant-plane)

Bu revizyon HER TENANT SEMASINDA ayri ayri kosar; ayni degisiklik henuz
tasinmamis tenant'lar icin control-plane zincirinde de vardir
(bkz. alembic/versions/a2c7e5f9d184_driver_id_number.py).

Revision ID: 0012_driver_id_number
Revises: 0011_supplier_minute_limits
"""

from app.models import driver_id_ddl

revision = "0012_driver_id_number"
down_revision = "0011_supplier_minute_limits"
branch_labels = None
depends_on = None


def upgrade() -> None:
    driver_id_ddl.upgrade()


def downgrade() -> None:
    driver_id_ddl.downgrade()
