"""Islem suresi kurallari semasinin TEK DDL tanimi (iki zincir de kullanir).

Musteri karari (2026-11 toplantisi): sure sevkiyat tipi, miktar, arac tipi ve
urun kategorisine gore sistemce hesaplansin. Tesis bazli kural tablosu
(`duration_rules`), tesis politikasi (`facilities.duration_policy_json`) ve
randevuda surenin kaynagi (`appointments.duration_source`).

Idempotent ve tamamen eklemeli (bkz. ddl_helpers.py): politika NULL =
tedarikci secer, yani eski davranis aynen surer.
"""

import sqlalchemy as sa

from alembic import op
from app.core.tenancy_runtime import CONTROL_SCHEMA_REAL
from app.models.ddl_helpers import JSONB, add_columns, drop_columns, has_table

TABLE = "duration_rules"
FACILITY_COLUMNS = (sa.Column("duration_policy_json", JSONB, nullable=True),)
APPOINTMENT_COLUMNS = (sa.Column("duration_source", sa.String(16), nullable=True),)


def _create_table() -> None:
    if has_table(TABLE):
        return
    op.create_table(
        TABLE,
        sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("name", sa.String(length=120), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("vehicle_category_id", sa.Uuid(), nullable=True),
        sa.Column("product_category_id", sa.Uuid(), nullable=True),
        sa.Column("quantity_unit", sa.String(length=32), nullable=True),
        sa.Column("min_quantity", sa.Integer(), nullable=True),
        sa.Column("max_quantity", sa.Integer(), nullable=True),
        sa.Column("calc_type", sa.String(length=32), nullable=False),
        sa.Column("fixed_minutes", sa.Integer(), nullable=True),
        sa.Column("base_minutes", sa.Integer(), nullable=True),
        sa.Column("per_unit_minutes", sa.Numeric(7, 2), nullable=True),
        sa.Column("min_minutes", sa.Integer(), nullable=True),
        sa.Column("max_minutes", sa.Integer(), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column("tenant_id", sa.Uuid(), nullable=False),
        sa.Column("facility_id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(
            ["vehicle_category_id"],
            ["vehicle_categories.id"],
            name="fk_duration_rules_vehicle_category_id_vehicle_categories",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["product_category_id"],
            ["product_categories.id"],
            name="fk_duration_rules_product_category_id_product_categories",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["tenant_id"],
            [f"{CONTROL_SCHEMA_REAL}.tenants.id"],
            name="fk_duration_rules_tenant_id_tenants",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["facility_id"],
            ["facilities.id"],
            name="fk_duration_rules_facility_id_facilities",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_duration_rules"),
    )
    op.create_index("ix_duration_rules_tenant_id", TABLE, ["tenant_id"])
    op.create_index("ix_duration_rules_facility_id", TABLE, ["facility_id"])


def upgrade() -> None:
    _create_table()
    add_columns("facilities", FACILITY_COLUMNS)
    add_columns("appointments", APPOINTMENT_COLUMNS)


def downgrade() -> None:
    drop_columns("appointments", tuple(c.name for c in APPOINTMENT_COLUMNS))
    drop_columns("facilities", tuple(c.name for c in FACILITY_COLUMNS))
    if has_table(TABLE):
        op.drop_table(TABLE)
