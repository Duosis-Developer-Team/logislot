"""Tenant-plane alembic ortami.

Bu zincir HER TENANT SEMASINDA ayri ayri calisir. Hedef sema ve baglanti,
`app.tenancy.migrations` tarafindan `context` uzerinden verilir; bu yuzden
burada bagimsiz (offline/standalone) calisma desteklenmez.

HEDEF SEMA `search_path` ILE SABITLENIR — bu satir dekoratif degildir:
Alembic'in `op.add_column("suppliers", ...)` gibi islemleri ALTER TABLE'i
SEMASIZ render eder ve `schema_translate_map` bunlari CEVIRMEZ (harita
yalnizca Table/MetaData'dan uretilen SQL'e uygulanir). search_path
verilmezse tenant migrationlari sessizce PUBLIC semayi degistirir; 2026-08'de
ilk tenant-plane migration'i tam olarak boyle davranip control-plane'in
zaten ekledigi kolona carparak dusmustu (DuplicateColumnError) ve tenant
semasi migrate edilmemis kaldi.
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
        if schema and connection.dialect.name == "postgresql":
            # SET LOCAL: yalnizca bu transaction boyunca gecerlidir. Havuzdan
            # gelen baglanti baska bir tenant'a verildiginde ayar tasinmaz.
            # `public` BILEREK listede yok — nitelenmemis bir DDL kazara ortak
            # semayi degistirmektense HATA vermelidir.
            # SQLite'ta sema kavrami yoktur; orada zincir zaten kosturulmaz.
            connection.exec_driver_sql(f'SET LOCAL search_path TO "{schema}"')
        context.run_migrations()


run_migrations_online()
