"""randevu aciklamasi (tenant-plane)

Bu revizyon HER TENANT SEMASINDA ayri ayri kosar; ayni degisiklik henuz
tasinmamis tenant'lar icin control-plane zincirinde de vardir
(bkz. alembic/versions/d5e1a8c3f207_appointment_description.py).

Revision ID: 0013_appt_description
Revises: 0012_driver_id_number
"""

from app.models import appointment_description_ddl

revision = "0013_appt_description"
down_revision = "0012_driver_id_number"
branch_labels = None
depends_on = None


def upgrade() -> None:
    appointment_description_ddl.upgrade()


def downgrade() -> None:
    appointment_description_ddl.downgrade()
