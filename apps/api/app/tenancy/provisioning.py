"""Yeni bir tenant icin kendi veri alanini acar.

Akis (hepsi idempotent — yarida kalan bir provisioning tekrar calistirilabilir):
    1. control.tenant_datastores'ta kayit (status=provisioning)
    2. gerekiyorsa veritabani, sonra sema olusturulur
    3. tenant-plane tablolari o semada yaratilir
    4. sema, tenant-plane alembic zincirinin head'ine damgalanir
    5. status=ready

4. adim onemlidir: tablolar migrationlar bastan oynatilarak degil, o anki
model durumundan yaratilir; damga ise BUNDAN SONRAKI sema degisikliklerinin
uygulanabilmesini saglar.
"""

import logging
import re
import uuid
from datetime import UTC, datetime

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession

from app.core.enums import DatastoreStatus
from app.core.tenancy_runtime import (
    TenantLocation,
    location_cache,
    schema_name_for,
    translate_map,
)
from app.models import TenantDatastore, tenant_plane_tables

logger = logging.getLogger(__name__)


def _quote(identifier: str) -> str:
    """Sema/veritabani adini guvenle tirnaklar.

    Adlar `schema_name_for()` tarafindan uretildigi (t_ + hex) icin zaten
    kullanici girdisi degildir; yine de savunma amacli dogrulanir.
    """
    if not identifier.replace("_", "").isalnum():
        raise ValueError(f"Gecersiz tanimlayici: {identifier!r}")
    return '"' + identifier.replace('"', '""') + '"'


async def ensure_database(engine: AsyncEngine, database: str) -> None:
    """Ayri veritabani modunda hedef veritabanini olusturur (yoksa).

    CREATE DATABASE transaction icinde calisamaz; bu yuzden AUTOCOMMIT.
    """
    admin_url = engine.url.set(database="postgres")
    from sqlalchemy.ext.asyncio import create_async_engine

    admin = create_async_engine(admin_url, isolation_level="AUTOCOMMIT")
    try:
        async with admin.connect() as conn:
            exists = (
                await conn.execute(
                    sa.text("SELECT 1 FROM pg_database WHERE datname = :n"), {"n": database}
                )
            ).scalar_one_or_none()
            if exists is None:
                await conn.execute(sa.text(f"CREATE DATABASE {_quote(database)}"))
    finally:
        await admin.dispose()


async def create_tenant_plane(engine: AsyncEngine, schema: str) -> str:
    """Semayi ve tenant-plane tablolarini olusturur, alembic head'ine damgalar.

    Dondurulen deger damgalanan revizyondur.
    """
    from app.tenancy.migrations import stamp_tenant_schema, tenant_head_revision

    is_sqlite = engine.dialect.name == "sqlite"
    if not is_sqlite:
        async with engine.begin() as conn:
            await conn.execute(sa.text(f"CREATE SCHEMA IF NOT EXISTS {_quote(schema)}"))

    bound = engine.execution_options(
        schema_translate_map=translate_map(schema, dialect_name=engine.dialect.name)
    )
    async with bound.begin() as conn:
        await conn.run_sync(_create_tables)

    head = tenant_head_revision()
    if not is_sqlite:
        await stamp_tenant_schema(engine, schema, head)
    return head


def _create_tables(sync_conn) -> None:
    """Yalnizca tenant-plane tablolarini yaratir (control-plane'e DOKUNMAZ)."""
    from app.models import Base

    Base.metadata.create_all(sync_conn, tables=tenant_plane_tables(), checkfirst=True)


async def provision_tenant(
    control_db: AsyncSession,
    tenant_id: uuid.UUID,
    *,
    dsn_alias: str | None = None,
) -> TenantDatastore:
    """Tenant icin veri alanini acar ve kaydi `ready` yapar.

    control_db uzerinde COMMIT eder — provisioning bir DDL islemidir ve
    cagiranin transaction'ina baglanmasi (DDL geri alinamayan adimlar
    icerdiginden) yaniltici olurdu.
    """
    from app.core.db import engine as control_engine
    from app.core.tenancy_runtime import _engine_cache

    row = (
        await control_db.execute(
            sa.select(TenantDatastore).where(TenantDatastore.tenant_id == tenant_id)
        )
    ).scalar_one_or_none()

    if row is None:
        row = TenantDatastore(
            tenant_id=tenant_id,
            schema_name=schema_name_for(tenant_id),
            dsn_alias=dsn_alias,
            status=DatastoreStatus.provisioning,
        )
        control_db.add(row)
    else:
        if row.status == DatastoreStatus.ready:
            return row
        row.status = DatastoreStatus.provisioning
    await control_db.commit()
    await control_db.refresh(row)

    try:
        engine = control_engine if row.dsn_alias is None else _engine_cache.get(row.dsn_alias)
        if row.dsn_alias is not None:
            await ensure_database(engine, engine.url.database or "")
        revision = await create_tenant_plane(engine, row.schema_name)
    except Exception:
        row.status = DatastoreStatus.failed
        row.notes = "Provisioning basarisiz — platform panelinden yeniden denenebilir."
        await control_db.commit()
        logger.exception("Tenant %s icin veri alani acilamadi", tenant_id)
        raise

    row.status = DatastoreStatus.ready
    row.provisioned_at = datetime.now(UTC)
    row.migrated_revision = revision
    row.notes = None
    await control_db.commit()
    await control_db.refresh(row)
    location_cache.invalidate(tenant_id)
    return row


def location_of(row: TenantDatastore) -> TenantLocation:
    return TenantLocation(schema=row.schema_name, dsn_alias=row.dsn_alias)


#: Provisioning'in urettigi sema adi kalibi. Silme islemi YALNIZCA bu kalibi
#: saglayan semalar uzerinde calisir.
_TENANT_SCHEMA_RE = re.compile(r"^t_[0-9a-f]{32}$")


async def deprovision_tenant(control_db: AsyncSession, tenant_id: uuid.UUID) -> None:
    """Yarida kalmis bir tenant olusturmayi geri alir: semayi ve kaydi siler.

    YIKICI islem. Bu yuzden uc katmanli koruma vardir:
      1. sema adi `t_<32 hex>` kalibina uymak ZORUNDA,
      2. ad, tenant'in UUID'sinden turetilen adla birebir esitlenir,
      3. 'public' ve control-plane semasi hicbir kosulda hedeflenemez.
    Yalnizca `create_tenant` telafi yolundan cagrilir.
    """
    from app.core.db import engine as control_engine
    from app.core.tenancy_runtime import CONTROL_SCHEMA_REAL, _engine_cache

    row = (
        await control_db.execute(
            sa.select(TenantDatastore).where(TenantDatastore.tenant_id == tenant_id)
        )
    ).scalar_one_or_none()

    if row is not None:
        schema = row.schema_name
        expected = schema_name_for(tenant_id)
        if (
            schema == expected
            and _TENANT_SCHEMA_RE.match(schema)
            and schema not in ("public", CONTROL_SCHEMA_REAL)
        ):
            engine = (
                control_engine if row.dsn_alias is None else _engine_cache.get(row.dsn_alias)
            )
            if engine.dialect.name != "sqlite":
                async with engine.begin() as conn:
                    await conn.execute(sa.text(f"DROP SCHEMA IF EXISTS {_quote(schema)} CASCADE"))
        else:
            logger.error(
                "Sema silme REDDEDILDI (beklenen %r, bulunan %r) — elle inceleyin",
                expected, schema,
            )

    # tenants satirinin silinmesi datastore kaydini da CASCADE ile dusurur.
    from app.models import Tenant

    await control_db.execute(sa.delete(Tenant).where(Tenant.id == tenant_id))
    await control_db.commit()
    location_cache.invalidate(tenant_id)
