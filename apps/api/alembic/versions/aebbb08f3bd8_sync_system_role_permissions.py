"""Sistem rolu izinlerini guncel sozlukle esitler (Sprint 11 data migration).

Mevcut kurulumlarda seed yeniden kosulamadigi icin system rollerin
permissions_json'u eski kalir (appt.create Sprint 10'da, audit.view Sprint
11'de eklendi). Bu migration:
- "Sistem Yoneticisi" (is_system) -> guncel TenantPermission.ALL
- "Rampa / Depo Yoneticisi" (is_system) -> appt.create eklenir (yoksa)

Downgrade eklenen izinleri geri cikarir (guvenli).

Revision ID: aebbb08f3bd8
Revises: eb8c040a882b
Create Date: 2026-07-08
"""

import sqlalchemy as sa
from alembic import op

from app.core.permissions import TenantPermission

revision = "aebbb08f3bd8"
down_revision = "eb8c040a882b"
branch_labels = None
depends_on = None

roles_table = sa.table(
    "roles",
    sa.column("id", sa.Uuid),
    sa.column("name", sa.String),
    sa.column("is_system", sa.Boolean),
    sa.column("permissions_json", sa.JSON),
)


def upgrade() -> None:
    conn = op.get_bind()
    rows = conn.execute(
        sa.select(roles_table.c.id, roles_table.c.name, roles_table.c.permissions_json)
        .where(roles_table.c.is_system.is_(True))
    ).all()
    for role_id, name, permissions in rows:
        current = list(permissions or [])
        if name == "Sistem Yoneticisi":
            updated = list(TenantPermission.ALL)
        elif name == "Rampa / Depo Yoneticisi":
            updated = current + (
                [TenantPermission.APPT_CREATE]
                if TenantPermission.APPT_CREATE not in current
                else []
            )
        else:
            continue
        if updated != current:
            conn.execute(
                sa.update(roles_table)
                .where(roles_table.c.id == role_id)
                .values(permissions_json=updated)
            )


def downgrade() -> None:
    conn = op.get_bind()
    rows = conn.execute(
        sa.select(roles_table.c.id, roles_table.c.name, roles_table.c.permissions_json)
        .where(roles_table.c.is_system.is_(True))
    ).all()
    removed = {TenantPermission.AUDIT_VIEW, TenantPermission.APPT_CREATE}
    for role_id, name, permissions in rows:
        if name not in ("Sistem Yoneticisi", "Rampa / Depo Yoneticisi"):
            continue
        current = list(permissions or [])
        updated = [p for p in current if p not in removed]
        if name == "Sistem Yoneticisi":
            # sysadmin'de appt.create Sprint 10 oncesinde de vardi (ALL)
            updated = [p for p in current if p != TenantPermission.AUDIT_VIEW]
        if updated != current:
            conn.execute(
                sa.update(roles_table)
                .where(roles_table.c.id == role_id)
                .values(permissions_json=updated)
            )
