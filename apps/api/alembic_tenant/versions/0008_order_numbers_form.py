"""siparis numaralari + randevu formu ayarlari (tenant-plane)

Bu revizyon HER TENANT SEMASINDA ayri ayri kosar; ayni degisiklik henuz
tasinmamis tenant'lar icin control-plane zincirinde de vardir
(bkz. alembic/versions/c9a3f71e5d24_order_numbers_form.py).

Revision ID: 0008_order_numbers_form
Revises: 0007_cancel_reasons_makeup
"""

from app.models import appointment_form_ddl

revision = "0008_order_numbers_form"
down_revision = "0007_cancel_reasons_makeup"
branch_labels = None
depends_on = None


def upgrade() -> None:
    appointment_form_ddl.upgrade()


def downgrade() -> None:
    appointment_form_ddl.downgrade()
