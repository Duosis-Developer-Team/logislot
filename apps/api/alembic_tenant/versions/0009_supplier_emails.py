"""tedarikci ek bildirim e-postalari (tenant-plane)

Bu revizyon HER TENANT SEMASINDA ayri ayri kosar; ayni degisiklik henuz
tasinmamis tenant'lar icin control-plane zincirinde de vardir
(bkz. alembic/versions/d7b1e4c08f35_supplier_additional_emails.py).

Revision ID: 0009_supplier_emails
Revises: 0008_order_numbers_form
"""

from app.models import supplier_emails_ddl

revision = "0009_supplier_emails"
down_revision = "0008_order_numbers_form"
branch_labels = None
depends_on = None


def upgrade() -> None:
    supplier_emails_ddl.upgrade()


def downgrade() -> None:
    supplier_emails_ddl.downgrade()
