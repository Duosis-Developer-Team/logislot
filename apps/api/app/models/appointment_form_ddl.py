"""Siparis numarasi + randevu formu ayarlari kolonlarinin TEK DDL tanimi.

Musteri karari (2026-11 toplantisi): randevuda siparis no zorunlu, coklu
olabilir. Zorunlulugu tesisin randevu formu ayari belirler; NULL = varsayilan
(alan gizli), yani kurali istemeyen tenant'larin formu degismez.

Iki zincir de bu modulu cagirir (bkz. ddl_helpers.py). Tamamen eklemeli:
nullable kolonlar, eski kod bu semayla sorunsuz calisir.
"""

import sqlalchemy as sa

from app.models.ddl_helpers import JSONB, add_columns, drop_columns

APPOINTMENT_COLUMNS = (sa.Column("order_numbers", JSONB, nullable=True),)
FACILITY_COLUMNS = (sa.Column("appointment_form_json", JSONB, nullable=True),)


def upgrade() -> None:
    add_columns("appointments", APPOINTMENT_COLUMNS)
    add_columns("facilities", FACILITY_COLUMNS)


def downgrade() -> None:
    drop_columns("facilities", tuple(c.name for c in FACILITY_COLUMNS))
    drop_columns("appointments", tuple(c.name for c in APPOINTMENT_COLUMNS))
