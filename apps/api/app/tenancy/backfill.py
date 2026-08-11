"""Mevcut (ortak tablolardaki) tenant verisini kendi semasina tasir.

GUVENLIK SOZLESMESI:
  * Kaynak satirlar SILINMEZ. Tasima dogrulanana kadar eski veri yerinde
    durur; geri donus yolu acik kalir.
  * Her tablo icin satir sayilari karsilastirilir; uyusmazsa tenant
    `ready` YAPILMAZ (istekler eski yerlesimde kalmaya devam eder).
  * Islem idempotenttir: yarida kalirsa yeniden calistirilabilir.

Kullanim:
    python -m app.tenancy.backfill plan            # ne yapilacagini goster
    python -m app.tenancy.backfill run --slug bta  # tek tenant tasi
    python -m app.tenancy.backfill run --all
    python -m app.tenancy.backfill verify --slug bta
"""

import argparse
import asyncio
import logging
import sys
import uuid

import sqlalchemy as sa

from app.core.enums import DatastoreStatus
from app.core.tenancy_runtime import LEGACY_SCHEMA
from app.models import Tenant, TenantDatastore, tenant_plane_tables

logger = logging.getLogger("logislot.backfill")

#: tenant_id kolonu OLMAYAN tablolar icin "bu satir hangi tenant'a ait"
#: kosullari. Anahtar tablo adi, deger SQL WHERE parcasidir (:tid bagli).
_PARENT_FILTERS: dict[str, str] = {
    "appointment_revisions": (
        f"appointment_id IN (SELECT id FROM {LEGACY_SCHEMA}.appointments WHERE tenant_id = :tid)"
    ),
    "dock_conflict_group_members": (
        f"group_id IN (SELECT id FROM {LEGACY_SCHEMA}.dock_conflict_groups "
        "WHERE tenant_id = :tid)"
    ),
    "dock_product_categories": (
        f"dock_id IN (SELECT id FROM {LEGACY_SCHEMA}.docks WHERE tenant_id = :tid)"
    ),
    "dock_vehicle_categories": (
        f"dock_id IN (SELECT id FROM {LEGACY_SCHEMA}.docks WHERE tenant_id = :tid)"
    ),
    "facility_membership_roles": (
        f"membership_id IN (SELECT id FROM {LEGACY_SCHEMA}.facility_memberships "
        "WHERE tenant_id = :tid)"
    ),
    "supplier_product_categories": (
        f"supplier_id IN (SELECT id FROM {LEGACY_SCHEMA}.suppliers WHERE tenant_id = :tid)"
    ),
    "supplier_users": (
        f"supplier_id IN (SELECT id FROM {LEGACY_SCHEMA}.suppliers WHERE tenant_id = :tid)"
    ),
    # Aktif oturumlar tasinmazsa tum kullanicilar cikis yapmis olur; bu
    # yuzden tenant'in kullanicilarina ait oturumlar da tasinir.
    "auth_sessions": (
        f"(user_type = 'tenant' AND user_id IN (SELECT id FROM {LEGACY_SCHEMA}.tenant_users "
        "WHERE tenant_id = :tid)) OR (user_type = 'supplier' AND user_id IN "
        f"(SELECT su.id FROM {LEGACY_SCHEMA}.supplier_users su "
        f"JOIN {LEGACY_SCHEMA}.suppliers s ON su.supplier_id = s.id WHERE s.tenant_id = :tid))"
    ),
}

#: Tenant'a ait OLMAYAN, control/platform duzleminde kalmasi gereken tablolar.
_SKIP_TABLES = {"maintenance_runs"}


def _where_for(table_name: str, columns: set[str]) -> str | None:
    if table_name in _SKIP_TABLES:
        return None
    if "tenant_id" in columns:
        return "tenant_id = :tid"
    return _PARENT_FILTERS.get(table_name)


def _plan_for_tenant() -> list[tuple[str, str, str]]:
    """(tablo, kolon listesi, where) — FK bagimlilik sirasinda."""
    plan: list[tuple[str, str, str]] = []
    for table in tenant_plane_tables():
        columns = {c.name for c in table.columns}
        where = _where_for(table.name, columns)
        if where is None:
            continue
        col_list = ", ".join(f'"{c.name}"' for c in table.columns)
        plan.append((table.name, col_list, where))
    return plan


async def _tenant_by_slug(db, slug: str) -> Tenant:
    tenant = (
        await db.execute(sa.select(Tenant).where(Tenant.slug == slug))
    ).scalar_one_or_none()
    if tenant is None:
        raise SystemExit(f"Tenant bulunamadi: {slug}")
    return tenant


async def copy_tenant(tenant_id: uuid.UUID, schema: str) -> dict[str, tuple[int, int]]:
    """Satirlari kopyalar; {tablo: (kaynak, hedef)} sayilarini dondurur."""
    from app.core.db import engine
    from app.core.tenancy_runtime import schema_name_for

    # Sema adi SQL'e dogrudan gomuldugu icin, kayitta ne yazarsa yazsin
    # tenant UUID'sinden turetilen adla birebir esitlenir.
    if schema != schema_name_for(tenant_id):
        raise SystemExit(
            f"Sema adi beklenenle uyusmuyor ({schema!r}); tasima durduruldu."
        )

    counts: dict[str, tuple[int, int]] = {}
    async with engine.begin() as conn:
        for table, col_list, where in _plan_for_tenant():
            src = f'{LEGACY_SCHEMA}."{table}"'
            dst = f'"{schema}"."{table}"'
            # ON CONFLICT DO NOTHING: yarida kalmis bir kosum tekrar
            # calistirilabilsin (idempotent).
            await conn.execute(
                sa.text(
                    f"INSERT INTO {dst} ({col_list}) "
                    f"SELECT {col_list} FROM {src} WHERE {where} "
                    "ON CONFLICT DO NOTHING"
                ),
                {"tid": tenant_id},
            )
            source_n = (
                await conn.execute(
                    sa.text(f"SELECT count(*) FROM {src} WHERE {where}"), {"tid": tenant_id}
                )
            ).scalar_one()
            target_n = (
                await conn.execute(sa.text(f"SELECT count(*) FROM {dst}"))
            ).scalar_one()
            counts[table] = (int(source_n), int(target_n))
    return counts


async def rebuild_directory(tenant_id: uuid.UUID, schema: str) -> int:
    """Tasinan tenant'in kullanicilarini login dizinine yazar."""
    from app.core.db import control_session, session_scope
    from app.core.tenancy_runtime import TenantLocation
    from app.models import Supplier, SupplierUser, TenantUser
    from app.tenancy.directory import ensure_registered

    async with session_scope(TenantLocation(schema=schema)) as tdb:
        tenant_users = list(
            (await tdb.execute(sa.select(TenantUser.id, TenantUser.email))).all()
        )
        supplier_users = list(
            (
                await tdb.execute(
                    sa.select(SupplierUser.id, SupplierUser.email)
                    .join(Supplier, SupplierUser.supplier_id == Supplier.id)
                    .where(Supplier.tenant_id == tenant_id)
                )
            ).all()
        )

    async with control_session() as db:
        for pid, email in tenant_users:
            await ensure_registered(
                db, principal_id=pid, user_type="tenant", email=email, tenant_id=tenant_id
            )
        for pid, email in supplier_users:
            await ensure_registered(
                db, principal_id=pid, user_type="supplier", email=email, tenant_id=tenant_id
            )
        await db.commit()
    return len(tenant_users) + len(supplier_users)


async def migrate_tenant(slug: str, *, activate: bool) -> bool:
    """Tek tenant'i tasir. Dogrulama gecerse `ready` yapar."""
    from app.core.db import control_session
    from app.tenancy.provisioning import provision_tenant

    async with control_session() as db:
        tenant = await _tenant_by_slug(db, slug)
        tenant_id = tenant.id
        # Sema + tablolar (idempotent). Kayit 'provisioning'de kalir; tasima
        # dogrulanmadan istekler YONLENDIRILMEZ.
        row = await provision_tenant(db, tenant_id)
        schema = row.schema_name
        if activate:
            # Dogrulama bitene kadar geri al: istekler eski yerlesimde kalsin.
            row.status = DatastoreStatus.provisioning
            await db.commit()

    print(f"[{slug}] sema: {schema}")
    counts = await copy_tenant(tenant_id, schema)

    ok = True
    for table, (source_n, target_n) in sorted(counts.items()):
        mark = "OK " if target_n >= source_n else "FARK"
        if target_n < source_n:
            ok = False
        if source_n or target_n:
            print(f"  {mark} {table}: kaynak={source_n} hedef={target_n}")

    if not ok:
        print(f"[{slug}] DOGRULAMA BASARISIZ — tenant eski yerlesimde birakildi", file=sys.stderr)
        return False

    registered = await rebuild_directory(tenant_id, schema)
    print(f"[{slug}] dizin kaydi: {registered} kullanici")

    if activate:
        async with control_session() as db:
            await db.execute(
                sa.update(TenantDatastore)
                .where(TenantDatastore.tenant_id == tenant_id)
                .values(status=DatastoreStatus.ready)
            )
            await db.commit()
        from app.core.tenancy_runtime import location_cache

        location_cache.invalidate(tenant_id)
        print(f"[{slug}] AKTIF — istekler artik {schema} semasina gidiyor")
    else:
        print(f"[{slug}] kopyalandi ama AKTIF EDILMEDI (--activate ile aktif edin)")
    return True


async def _all_slugs() -> list[str]:
    from app.core.db import control_session

    async with control_session() as db:
        return list((await db.execute(sa.select(Tenant.slug).order_by(Tenant.slug))).scalars())


async def _plan() -> None:
    print("Tasinacak tablolar (FK sirasinda):")
    for table, _cols, where in _plan_for_tenant():
        print(f"  {table:32s} WHERE {where[:70]}")
    skipped = sorted(_SKIP_TABLES)
    print(f"\nAtlanan (tenant'a ait degil): {', '.join(skipped)}")
    print(f"\nTenant'lar: {', '.join(await _all_slugs())}")


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    parser = argparse.ArgumentParser(description="Tenant verisini kendi semasina tasir")
    parser.add_argument("action", choices=["plan", "run", "verify"])
    parser.add_argument("--slug", help="tek tenant")
    parser.add_argument("--all", action="store_true", help="tum tenant'lar")
    parser.add_argument(
        "--activate",
        action="store_true",
        help="dogrulama gecerse tenant'i yeni semaya YONLENDIR (kesme ani)",
    )
    args = parser.parse_args()

    if args.action == "plan":
        asyncio.run(_plan())
        return

    slugs = [args.slug] if args.slug else (asyncio.run(_all_slugs()) if args.all else [])
    if not slugs:
        parser.error("--slug veya --all gerekli")

    activate = args.activate and args.action == "run"
    failures = 0
    for slug in slugs:
        if not asyncio.run(migrate_tenant(slug, activate=activate)):
            failures += 1
    if failures:
        print(f"\n{failures} tenant tasinamadi", file=sys.stderr)
        sys.exit(1)
    print("\nTamam.")


if __name__ == "__main__":
    main()
