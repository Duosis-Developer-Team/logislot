"""Tedarikci ek bildirim e-postalari kolonunun TEK DDL tanimi.

Musteri karari (2026-11 toplantisi): tedarikci kartina 10'a kadar ek e-posta
yazilabilir; tedarikciye giden e-postalar bunlarin hepsine gider. Iki zincir
de bu modulu cagirir (bkz. ddl_helpers.py). Tamamen eklemeli, nullable.
"""

import sqlalchemy as sa

from app.models.ddl_helpers import JSONB, add_columns, drop_columns

SUPPLIER_COLUMNS = (sa.Column("additional_emails", JSONB, nullable=True),)


def upgrade() -> None:
    add_columns("suppliers", SUPPLIER_COLUMNS)


def downgrade() -> None:
    drop_columns("suppliers", tuple(c.name for c in SUPPLIER_COLUMNS))
