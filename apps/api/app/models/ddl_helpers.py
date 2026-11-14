"""Iki alembic zincirinin (control + tenant) paylastigi idempotent DDL yardimcilari.

Tenant-plane bir tabloya kolon/tablo eklerken DDL iki zincirde birden kosar
(bkz. memory: tenant tablosu = iki zincir). Islemler idempotenttir: modelden
`create_all` ile dogmus (sekli zaten dogru) semada no-op'tur. Inspector, tenant
zincirinde hedef semayi `version_table_schema`'dan alir — `public` DEGIL.

JSON kolonlari icin `JSONB` kullanin: modeldeki `JsonVariant` Postgres'te JSONB'dir;
duz `sa.JSON` migration'dan gecen semalarda `json`, modelden doganlarda `jsonb`
uretir ve ayni surumdeki iki tenant farkli tiplerle calisir.
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

JSONB = sa.JSON().with_variant(postgresql.JSONB(), "postgresql")


def schema() -> str | None:
    return op.get_context().version_table_schema


def is_sqlite() -> bool:
    return op.get_bind().dialect.name == "sqlite"


def existing_columns(table: str) -> set[str]:
    inspector = sa.inspect(op.get_bind())
    return {c["name"] for c in inspector.get_columns(table, schema=schema())}


def has_table(table: str) -> bool:
    return sa.inspect(op.get_bind()).has_table(table, schema=schema())


def add_columns(table: str, columns: tuple[sa.Column, ...]) -> None:
    present = existing_columns(table)
    for column in columns:
        if column.name not in present:
            op.add_column(table, column.copy())


def drop_columns(table: str, names: tuple[str, ...]) -> None:
    present = existing_columns(table)
    for name in names:
        if name in present:
            op.drop_column(table, name)
