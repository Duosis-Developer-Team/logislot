"""Tedarikci sure limitleri kolonlarinin TEK DDL tanimi.

Musteri karari (2026-11 toplantisi): tedarikci limiti randevu SAYISI yerine
SURE (dakika) uzerinden; gunluk + haftalik + aylik, tesis varsayilani ve
tedarikci bazli ezme. Iki zincir de bu modulu cagirir (bkz. ddl_helpers.py).
Tamamen eklemeli, nullable: None = eski davranis (sinirsiz).
"""

import sqlalchemy as sa

from app.models.ddl_helpers import JSONB, add_columns, drop_columns

FACILITY_COLUMNS = (sa.Column("supplier_minute_limits_json", JSONB, nullable=True),)
SUPPLIER_COLUMNS = (sa.Column("minute_limits_json", JSONB, nullable=True),)


def upgrade() -> None:
    add_columns("facilities", FACILITY_COLUMNS)
    add_columns("suppliers", SUPPLIER_COLUMNS)


def downgrade() -> None:
    drop_columns("suppliers", tuple(c.name for c in SUPPLIER_COLUMNS))
    drop_columns("facilities", tuple(c.name for c in FACILITY_COLUMNS))
