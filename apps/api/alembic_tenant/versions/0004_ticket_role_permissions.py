"""sistem rollerine ticket izinlerini ekler (tenant-plane)

`roles` tenant-plane bir tablodur; bu revizyon her tenant semasinda ayri ayri
kosar. Ayni esitleme, henuz kendi semasina TASINMAMIS tenant'lar icin
control-plane zincirinde de yapilir (bkz.
alembic/versions/b7e2d94c1f30_ticketing_control_plane.py). Ikisi ayni isi
FARKLI kapsamlarda yapar; biri digerinin yerine gecmez.

Yalnizca `is_system` roller guncellenir: musteri kendi olusturdugu rollere
surpriz yetki eklenmemelidir.

Revision ID: 0004_ticket_role_permissions
Revises: 0003_support_ticket_tables
"""

import sqlalchemy as sa

from alembic import op
from app.core.permissions import TenantPermission

revision = "0004_ticket_role_permissions"
down_revision = "0003_support_ticket_tables"
branch_labels = None
depends_on = None

NEW_PERMISSIONS = [
    TenantPermission.TICKET_VIEW,
    TenantPermission.TICKET_CREATE,
    TenantPermission.TICKET_COMMENT,
    TenantPermission.TICKET_VIEW_ALL,
]

#: Rol adi -> verilecek izinler. Sistem yoneticisi tamamini alir; rampa/depo
#: yoneticisi ticket acip yanit yazabilir ama TENANT GENELINI goremez
#: (`view_all` bilerek yok — baskasinin destek yazismasi operasyonel bir
#: ihtiyac degil, yonetim karari).
GRANTS = {
    "Sistem Yoneticisi": NEW_PERMISSIONS,
    "Rampa / Depo Yoneticisi": [
        TenantPermission.TICKET_VIEW,
        TenantPermission.TICKET_CREATE,
        TenantPermission.TICKET_COMMENT,
    ],
}

roles_table = sa.table(
    "roles",
    sa.column("id", sa.Uuid),
    sa.column("name", sa.String),
    sa.column("is_system", sa.Boolean),
    sa.column("permissions_json", sa.JSON),
)


def _sync(add: bool) -> None:
    conn = op.get_bind()
    rows = conn.execute(
        sa.select(roles_table.c.id, roles_table.c.name, roles_table.c.permissions_json)
        .where(roles_table.c.is_system.is_(True))
    ).all()
    for role_id, name, permissions in rows:
        granted = GRANTS.get(name)
        if granted is None:
            continue
        current = list(permissions or [])
        updated = (
            current + [p for p in granted if p not in current]
            if add
            else [p for p in current if p not in NEW_PERMISSIONS]
        )
        if updated != current:
            conn.execute(
                sa.update(roles_table)
                .where(roles_table.c.id == role_id)
                .values(permissions_json=updated)
            )


def upgrade() -> None:
    _sync(add=True)


def downgrade() -> None:
    _sync(add=False)
