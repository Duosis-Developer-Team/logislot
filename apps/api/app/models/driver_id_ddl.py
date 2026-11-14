"""Surucu kimlik numarasi kolonlari + sistem yoneticisi izninin TEK tanimi.

Musteri karari (2026-11): guvenlik entegrasyonu icin surucu TCKN/pasaport.
Iki zincir de bu modulu cagirir (bkz. ddl_helpers.py). Kolonlar eklemeli ve
nullable. Yeni `appt.driver_id.view` izni YALNIZCA "Sistem Yoneticisi" sistem
rolune eklenir: kisisel veriyi gormek bilincli bir karar olmali; guvenlik
personeli icin rol, rol yonetiminden bu izinle olusturulur.
"""

import sqlalchemy as sa

from alembic import op
from app.core.permissions import TenantPermission
from app.models.ddl_helpers import add_columns, drop_columns, schema

APPOINTMENT_COLUMNS = (
    sa.Column("driver_id_type", sa.String(16), nullable=True),
    sa.Column("driver_id_ciphertext", sa.Text, nullable=True),
    sa.Column("driver_id_hash", sa.String(64), nullable=True),
    sa.Column("driver_id_last4", sa.String(4), nullable=True),
    sa.Column("driver_id_purged_at", sa.DateTime(timezone=True), nullable=True),
)
INDEX = "ix_appointments_driver_id_hash"
PERMISSION = TenantPermission.APPT_DRIVER_ID_VIEW

_roles = sa.table(
    "roles",
    sa.column("id", sa.Uuid),
    sa.column("name", sa.String),
    sa.column("is_system", sa.Boolean),
    sa.column("permissions_json", sa.JSON),
    schema=None,
)


def _indexes() -> set[str]:
    inspector = sa.inspect(op.get_bind())
    return {i["name"] for i in inspector.get_indexes("appointments", schema=schema())}


def _sync_permission(add: bool) -> None:
    conn = op.get_bind()
    rows = conn.execute(
        sa.select(_roles.c.id, _roles.c.name, _roles.c.permissions_json).where(
            _roles.c.is_system.is_(True)
        )
    ).all()
    for role_id, name, permissions in rows:
        current = list(permissions or [])
        if add and name == "Sistem Yoneticisi" and PERMISSION not in current:
            updated = current + [PERMISSION]
        elif not add and PERMISSION in current:
            updated = [p for p in current if p != PERMISSION]
        else:
            continue
        conn.execute(
            sa.update(_roles).where(_roles.c.id == role_id).values(permissions_json=updated)
        )


def upgrade() -> None:
    add_columns("appointments", APPOINTMENT_COLUMNS)
    if INDEX not in _indexes():
        op.create_index(INDEX, "appointments", ["driver_id_hash"], schema=schema())
    _sync_permission(add=True)


def downgrade() -> None:
    _sync_permission(add=False)
    if INDEX in _indexes():
        op.drop_index(INDEX, table_name="appointments", schema=schema())
    drop_columns("appointments", tuple(c.name for c in APPOINTMENT_COLUMNS))
