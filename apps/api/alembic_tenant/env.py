"""Tenant-plane alembic ortami.

Bu zincir HER TENANT SEMASINDA ayri ayri calisir. Hedef sema ve baglanti,
`app.tenancy.migrations` tarafindan `context` uzerinden verilir; bu yuzden
burada bagimsiz (offline/standalone) calisma desteklenmez.
"""

from alembic import context
from app.models import Base

target_metadata = Base.metadata


def run_migrations_online() -> None:
    connection = context.config.attributes.get("connection")
    schema = context.config.attributes.get("target_schema")
    if connection is None:
        raise RuntimeError(
            "Tenant migrationlari yalnizca app.tenancy.migrations uzerinden calistirilir."
        )
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        compare_type=True,
        # Her tenant semasi KENDI alembic_version tablosunu tasir.
        version_table="alembic_version",
        version_table_schema=schema,
        include_schemas=False,
    )
    with context.begin_transaction():
        context.run_migrations()


run_migrations_online()
