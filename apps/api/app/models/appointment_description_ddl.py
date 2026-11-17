"""Randevu aciklamasi kolonunun TEK DDL tanimi.

Musteri karari (2026-11, Cakes & Bakes): ayni sevkiyatta birden fazla urun
geldigi icin randevuya serbest metin "Aciklama". Urun adi aynen kalir.
Gorunurlugu tesisin randevu formu ayari belirler (varsayilan gizli).

Iki zincir de bu modulu cagirir (bkz. ddl_helpers.py). Tamamen eklemeli:
nullable kolon, eski kod bu semayla sorunsuz calisir.
"""

import sqlalchemy as sa

from app.models.ddl_helpers import add_columns, drop_columns

APPOINTMENT_COLUMNS = (sa.Column("description", sa.Text, nullable=True),)


def upgrade() -> None:
    add_columns("appointments", APPOINTMENT_COLUMNS)


def downgrade() -> None:
    drop_columns("appointments", tuple(c.name for c in APPOINTMENT_COLUMNS))
