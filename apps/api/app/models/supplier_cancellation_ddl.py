"""Tedarikci iptal kurallari kolonlarinin TEK DDL tanimi (iki alembic zinciri de kullanir).

`appointments` ve `facilities` tenant-plane tablolardir: kendi semasina
tasinmis tenant'lar `alembic_tenant/` zincirinden, henuz tasinmamis olanlar
ortak yerlesimde (`public`) `alembic/` zincirinden gecer. Iki zincir de bu
modulu cagirir ki kolon sekilleri ayrismasin. Model (`app/models/appointment.py`,
`app/models/tenant.py`) ile birebir ayni olmak zorundadir: yeni semalar
tablolari `create_all` ile modelden alir.

Islemler IDEMPOTENTTIR: modelden olusturulmus (kolonlari zaten tasiyan) bir
semada no-op'tur. Tamamen eklemelidir — nullable kolonlar, NULL = "kural yok /
eski davranis" — bu yuzden eski kod bu semayla sorunsuz calisir, deploy sirasi
serbesttir.

`app/` ALTINDA durur: imaj yalnizca `app`, `alembic`, `alembic_tenant`,
`scripts` dizinlerini kopyalar (bkz. ticketing_ddl.py).
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

#: Modeldeki `JsonVariant` ile ayni: Postgres'te JSONB. Duz `sa.JSON` kullanmak
#: migration'dan gecen semalarda `json`, modelden dogan semalarda `jsonb`
#: uretir ve ayni surumdeki iki tenant farkli tiplerle calisir.
JSONB = sa.JSON().with_variant(postgresql.JSONB(), "postgresql")

#: (tablo, kolon) — modeldeki tanimla AYNI tipler.
COLUMNS: tuple[tuple[str, sa.Column], ...] = (
    ("appointments", sa.Column("cancellation_reason_code", sa.String(32), nullable=True)),
    ("appointments", sa.Column("cancellation_alternative_date", sa.Date(), nullable=True)),
    ("facilities", sa.Column("supplier_cancellation_policy_json", JSONB, nullable=True)),
)


def _existing_columns(table: str) -> set[str]:
    inspector = sa.inspect(op.get_bind())
    schema = op.get_context().version_table_schema
    return {column["name"] for column in inspector.get_columns(table, schema=schema)}


def upgrade() -> None:
    for table, column in COLUMNS:
        if column.name not in _existing_columns(table):
            op.add_column(table, column.copy())


def downgrade() -> None:
    for table, column in reversed(COLUMNS):
        if column.name in _existing_columns(table):
            op.drop_column(table, column.name)
