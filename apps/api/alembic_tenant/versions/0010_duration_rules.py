"""islem suresi kurallari + sure politikasi (tenant-plane)

Bu revizyon HER TENANT SEMASINDA ayri ayri kosar; ayni degisiklik henuz
tasinmamis tenant'lar icin control-plane zincirinde de vardir
(bkz. alembic/versions/e3c5a9d27b16_duration_rules.py).

Revision ID: 0010_duration_rules
Revises: 0009_supplier_emails
"""

from app.models import duration_rules_ddl

revision = "0010_duration_rules"
down_revision = "0009_supplier_emails"
branch_labels = None
depends_on = None


def upgrade() -> None:
    duration_rules_ddl.upgrade()


def downgrade() -> None:
    duration_rules_ddl.downgrade()
