"""tenant_datastores.db_role (veritabani seviyesinde tenant yetkilendirmesi)

Additive kolon. Bos oldugu surece davranis DEGISMEZ: SET LOCAL ROLE yalnizca
kolon doluysa calisir, bu yuzden mevcut tenant'lar etkilenmez.

Revision ID: e5b3d17c4a92
Revises: d1a7c4e90b21
"""

import sqlalchemy as sa
from alembic import op

revision = "e5b3d17c4a92"
down_revision = "d1a7c4e90b21"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("tenant_datastores", sa.Column("db_role", sa.String(length=63), nullable=True))


def downgrade() -> None:
    op.drop_column("tenant_datastores", "db_role")
