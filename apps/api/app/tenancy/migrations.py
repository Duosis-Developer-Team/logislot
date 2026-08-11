"""Tenant-plane migrationlarini TUM tenant semalarinda calistirir.

Control-plane (alembic/) tek bir kez, tenant-plane (alembic_tenant/) ise her
tenant semasi icin ayri ayri calisir. Her semanin kendi alembic_version
tablosu vardir; boylece bir tenant geride kalirsa digerleri etkilenmez.

Calistirma:
    python -m app.tenancy.migrations upgrade      # tum 'ready' semalar
    python -m app.tenancy.migrations status
"""

import asyncio
import logging
import pathlib
import sys

import sqlalchemy as sa
from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy.ext.asyncio import AsyncEngine

from alembic import command
from app.core.enums import DatastoreStatus
from app.core.tenancy_runtime import translate_map
from app.models import TenantDatastore

logger = logging.getLogger(__name__)

_TENANT_ALEMBIC_DIR = pathlib.Path(__file__).resolve().parents[2] / "alembic_tenant"


def tenant_alembic_config() -> Config:
    cfg = Config()
    cfg.set_main_option("script_location", str(_TENANT_ALEMBIC_DIR))
    return cfg


def tenant_head_revision() -> str:
    return ScriptDirectory.from_config(tenant_alembic_config()).get_current_head()


def _run_upgrade(sync_conn, schema: str) -> None:
    cfg = tenant_alembic_config()
    cfg.attributes["connection"] = sync_conn
    cfg.attributes["target_schema"] = schema
    command.upgrade(cfg, "head")


def _run_stamp(sync_conn, schema: str, revision: str) -> None:
    cfg = tenant_alembic_config()
    cfg.attributes["connection"] = sync_conn
    cfg.attributes["target_schema"] = schema
    command.stamp(cfg, revision)


async def stamp_tenant_schema(engine: AsyncEngine, schema: str, revision: str) -> None:
    bound = engine.execution_options(
        schema_translate_map=translate_map(schema, dialect_name=engine.dialect.name)
    )
    async with bound.begin() as conn:
        await conn.run_sync(_run_stamp, schema, revision)


async def upgrade_tenant_schema(engine: AsyncEngine, schema: str) -> None:
    bound = engine.execution_options(
        schema_translate_map=translate_map(schema, dialect_name=engine.dialect.name)
    )
    async with bound.begin() as conn:
        await conn.run_sync(_run_upgrade, schema)


async def ready_datastores() -> list[TenantDatastore]:
    from app.core.db import control_session

    async with control_session() as db:
        return list(
            (
                await db.execute(
                    sa.select(TenantDatastore)
                    .where(TenantDatastore.status == DatastoreStatus.ready)
                    .order_by(TenantDatastore.created_at)
                )
            ).scalars()
        )


async def upgrade_all() -> int:
    """Tum hazir tenant semalarini head'e cikarir; basarisizlari raporlar.

    Bir tenant'in migration'i patlarsa DIGERLERI denenmeye devam eder —
    tek bir bozuk sema tum dagitimi kilitlemesin. Sonunda hata sayisi
    donulur; sifir degilse cagiran (migration job) basarisiz olmalidir.
    """
    from app.core.db import control_session
    from app.core.db import engine as control_engine
    from app.core.tenancy_runtime import _engine_cache

    failures = 0
    head = tenant_head_revision()
    for row in await ready_datastores():
        engine = control_engine if row.dsn_alias is None else _engine_cache.get(row.dsn_alias)
        try:
            await upgrade_tenant_schema(engine, row.schema_name)
        except Exception:
            failures += 1
            logger.exception("Tenant semasi %s migrate edilemedi", row.schema_name)
            continue
        async with control_session() as db:
            await db.execute(
                sa.update(TenantDatastore)
                .where(TenantDatastore.id == row.id)
                .values(migrated_revision=head)
            )
            await db.commit()
        logger.info("Tenant semasi %s -> %s", row.schema_name, head)
    return failures


async def _status() -> None:
    head = tenant_head_revision()
    rows = await ready_datastores()
    print(f"tenant-plane head: {head}")
    print(f"hazir sema sayisi: {len(rows)}")
    for row in rows:
        mark = "OK " if row.migrated_revision == head else "GERIDE"
        print(f"  {mark} {row.schema_name}  rev={row.migrated_revision}")


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    action = sys.argv[1] if len(sys.argv) > 1 else "upgrade"
    if action == "status":
        asyncio.run(_status())
        return
    failures = asyncio.run(upgrade_all())
    if failures:
        print(f"{failures} tenant semasi migrate EDILEMEDI", file=sys.stderr)
        sys.exit(1)
    print("tum tenant semalari guncel")


if __name__ == "__main__":
    main()
