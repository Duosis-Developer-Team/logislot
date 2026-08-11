"""Sema-basina-tenant izolasyonunun uctan uca dogrulamasi (Postgres).

Test paketi SQLite uzerinde kostugu icin GERCEK sema izolasyonunu
dogrulayamaz. Bu script, tek kullanimlik bir Postgres veritabaninda:

  1. eski (ortak tablolu) yerlesimi kurar ve iki tenant'in verisini oraya yazar
  2. backfill ile bir tenant'i kendi semasina tasir
  3. tasima sonrasi izolasyonu, sayimlari ve login yonlendirmesini dogrular

Calistirma (API imajinin icinde):
    python scripts/verify_tenant_isolation.py

CANLI VERITABANINA DOKUNMAZ — kendi tek kullanimlik veritabanini yaratir.
"""

import asyncio
import os
import sys
import uuid

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import create_async_engine

VERIFY_DB = "logislot_isolation_check"
_live = os.environ["LOGISLOT_DATABASE_URL"]
_base = _live.rsplit("/", 1)[0]
ADMIN_URL = f"{_base}/postgres"
VERIFY_URL = f"{_base}/{VERIFY_DB}"

if _live.rsplit("/", 1)[1] == VERIFY_DB:  # pragma: no cover
    raise SystemExit("Canli veritabani adi dogrulama adiyla ayni — durduruldu.")

os.environ["LOGISLOT_DATABASE_URL"] = VERIFY_URL

failures: list[str] = []


def check(label: str, ok: bool, detail: str = "") -> None:
    print(("  OK   " if ok else "  FAIL ") + label + (f"  [{detail}]" if detail else ""))
    if not ok:
        failures.append(label)


async def _admin(sql: str) -> None:
    engine = create_async_engine(ADMIN_URL, isolation_level="AUTOCOMMIT")
    async with engine.connect() as conn:
        await conn.execute(sa.text(sql))
    await engine.dispose()


async def main() -> None:
    await _admin(f"DROP DATABASE IF EXISTS {VERIFY_DB} WITH (FORCE)")
    await _admin(f"CREATE DATABASE {VERIFY_DB}")

    from alembic.config import Config

    from alembic import command

    print("\n[1] control-plane semasi (eski yerlesim: her sey public'te)")
    cfg = Config("alembic.ini")
    cfg.set_main_option("script_location", "alembic")
    await asyncio.to_thread(command.upgrade, cfg, "head")

    from app.core.db import control_session, engine, session_scope
    from app.core.enums import DatastoreStatus, TenantStatus
    from app.core.security import hash_password
    from app.core.tenancy_runtime import CONTROL_LOCATION, TenantLocation, location_cache
    from app.models import (
        Dock,
        Facility,
        FacilityMembership,
        PrincipalDirectory,
        Role,
        Tenant,
        TenantDatastore,
        TenantUser,
    )

    # --- eski yerlesimi doldur: iki tenant AYNI tablolarda ---
    ids = {"alfa": uuid.uuid4(), "beta": uuid.uuid4()}
    async with session_scope(CONTROL_LOCATION) as db:
        for slug, tid in ids.items():
            db.add(
                Tenant(
                    id=tid, commercial_name=slug, display_name=slug, slug=slug,
                    status=TenantStatus.active,
                )
            )
        await db.flush()
        for slug, tid in ids.items():
            fac = Facility(tenant_id=tid, name=f"{slug}-tesis", timezone="Europe/Istanbul")
            db.add(fac)
            await db.flush()
            role = Role(tenant_id=tid, facility_id=fac.id, name="Sistem Yoneticisi",
                        permissions_json=["appt.view"])
            db.add(role)
            await db.flush()
            user = TenantUser(
                tenant_id=tid, name=f"{slug} admin", email=f"admin@{slug}.example.com",
                password_hash=hash_password("Demo123!"), default_facility_id=fac.id,
            )
            db.add(user)
            await db.flush()
            db.add(FacilityMembership(tenant_user_id=user.id, tenant_id=tid,
                                      facility_id=fac.id, roles=[role]))
            for n in range(3):
                db.add(Dock(tenant_id=tid, facility_id=fac.id, name=f"{slug}-rampa-{n}"))
        await db.commit()

    async with engine.connect() as conn:
        total = (await conn.execute(sa.text("SELECT count(*) FROM public.docks"))).scalar_one()
    check("eski yerlesimde iki tenant ayni tabloda", total == 6, f"public.docks={total}")

    print("\n[2] alfa'yi kendi semasina tasi (backfill)")
    from app.tenancy.backfill import migrate_tenant

    ok = await migrate_tenant("alfa", activate=True)
    check("backfill basarili", ok)
    location_cache.invalidate()

    schema = f"t_{ids['alfa'].hex}"
    async with engine.connect() as conn:
        moved = (
            await conn.execute(sa.text(f'SELECT count(*) FROM "{schema}".docks'))
        ).scalar_one()
        still = (await conn.execute(sa.text("SELECT count(*) FROM public.docks"))).scalar_one()
    check("alfa'nin rampalari kendi semasinda", moved == 3, f"{schema}.docks={moved}")
    check("KAYNAK VERI SILINMEDI (geri donus mumkun)", still == 6, f"public.docks={still}")

    print("\n[3] tasima sonrasi izolasyon")
    async with session_scope(TenantLocation(schema=schema)) as db:
        names = (await db.execute(sa.select(Dock.name))).scalars().all()
    check("alfa oturumu YALNIZCA kendi rampalarini gorur",
          len(names) == 3 and all(n.startswith("alfa") for n in names), str(names))

    print("\n[4] beta hala eski yerlesimde calisiyor (kademeli gecis)")
    from app.core.db import location_for_tenant

    beta_loc = await location_for_tenant(ids["beta"])
    check("beta control-plane'e cozuluyor", beta_loc.schema is None, str(beta_loc))
    alfa_loc = await location_for_tenant(ids["alfa"])
    check("alfa kendi semasina cozuluyor", alfa_loc.schema == schema, str(alfa_loc))

    print("\n[5] login yonlendirme dizini")
    async with control_session() as db:
        rows = list(
            (
                await db.execute(
                    sa.select(PrincipalDirectory.email, PrincipalDirectory.tenant_id)
                )
            ).all()
        )
    emails = {e: t for e, t in rows}
    check("alfa admini dizine yazildi",
          emails.get("admin@alfa.example.com") == ids["alfa"], str(emails))
    check("beta (tasinmamis) dizine YAZILMADI", "admin@beta.example.com" not in emails)

    print("\n[6] kayit durumu")
    async with control_session() as db:
        ds = list((await db.execute(sa.select(TenantDatastore))).scalars())
    check("yalnizca alfa ready", len(ds) == 1 and ds[0].status == DatastoreStatus.ready,
          str([(d.schema_name, d.status) for d in ds]))

    print("\n[7] backfill tekrar calistirilabilir (idempotent)")
    ok2 = await migrate_tenant("alfa", activate=True)
    async with engine.connect() as conn:
        again = (
            await conn.execute(sa.text(f'SELECT count(*) FROM "{schema}".docks'))
        ).scalar_one()
    check("ikinci kosum satirlari COGALTMADI", ok2 and again == 3, f"docks={again}")

    print("\n[8] VERITABANI SEVIYESINDE YETKILENDIRME")
    # alfa provisioning sirasinda kendi rolunu aldi mi?
    async with control_session() as db:
        row = (
            await db.execute(
                sa.select(TenantDatastore).where(TenantDatastore.tenant_id == ids["alfa"])
            )
        ).scalar_one()
    beklenen_rol = f"tr_{ids['alfa'].hex}"
    check("alfa'ya veritabani rolu atandi", row.db_role == beklenen_rol, str(row.db_role))

    # beta icin de sema + rol ac (capraz erisim denemesi icin gerekli)
    from app.tenancy.provisioning import provision_tenant

    async with control_session() as db:
        beta_ds = await provision_tenant(db, ids["beta"])
    beta_schema = beta_ds.schema_name

    # Tenant rolune GECILDIGINDE capraz sema REDDEDILMELI
    async with engine.connect() as conn:
        await conn.execute(sa.text(f'SET ROLE "{row.db_role}"'))
        own = (
            await conn.execute(sa.text(f'SELECT count(*) FROM "{schema}".docks'))
        ).scalar_one()
        check("tenant rolu kendi semasini okuyor", own == 3, f"docks={own}")
        try:
            await conn.execute(sa.text(f'SELECT count(*) FROM "{beta_schema}".docks'))
            check("tenant rolu BASKA semayi okuyamiyor", False, "OKUYABILDI")
        except Exception as exc:
            check("tenant rolu BASKA semayi okuyamiyor", "permission denied" in str(exc).lower(),
                  type(exc).__name__)
        await conn.rollback()

    # public.tenants'a SELECT verilmedi -> diger musterilerin kaydi gorunmemeli
    async with engine.connect() as conn:
        await conn.execute(sa.text(f'SET ROLE "{row.db_role}"'))
        try:
            await conn.execute(sa.text("SELECT count(*) FROM public.tenants"))
            check("tenant rolu public.tenants'i okuyamiyor", False, "OKUYABILDI")
        except Exception as exc:
            check("tenant rolu public.tenants'i okuyamiyor",
                  "permission denied" in str(exc).lower(), type(exc).__name__)
        await conn.rollback()
        # ...ama plan tanimlarini okuyabilmeli (reports.py buna ihtiyac duyar)
        await conn.execute(sa.text(f'SET ROLE "{row.db_role}"'))
        await conn.execute(sa.text("SELECT count(*) FROM public.plans"))
        check("tenant rolu public.plans'i okuyabiliyor", True)
        await conn.rollback()

    # Sonradan eklenen tablo da otomatik yetkilensin (DEFAULT PRIVILEGES)
    async with engine.begin() as conn:
        await conn.execute(sa.text(f'CREATE TABLE "{schema}".sonradan(id int)'))
    async with engine.connect() as conn:
        await conn.execute(sa.text(f'SET ROLE "{row.db_role}"'))
        try:
            await conn.execute(sa.text(f'SELECT count(*) FROM "{schema}".sonradan'))
            check("sonradan eklenen tablo otomatik yetkili", True)
        except Exception as exc:
            check("sonradan eklenen tablo otomatik yetkili", False, str(exc)[:60])
        await conn.rollback()

    print("\n[9] UYGULAMA OTURUMU tenant roluyle calisiyor mu")
    from app.core.tenancy_runtime import location_cache as _lc

    _lc.invalidate()
    loc = await location_for_tenant(ids["alfa"])
    check("konum cozumu rolu tasiyor", loc.db_role == row.db_role, str(loc.db_role))
    async with session_scope(loc) as db:
        who = (await db.execute(sa.text("SELECT current_user"))).scalar_one()
        check("oturum SET LOCAL ROLE ile tenant rolunde", who == row.db_role, who)
        names = (await db.execute(sa.select(Dock.name))).scalars().all()
        check("tenant rolunde kendi verisi okunuyor", len(names) == 3, str(names))
    # transaction bitince baglanti temiz donmeli (havuz guvenligi)
    async with engine.connect() as conn:
        who = (await conn.execute(sa.text("SELECT current_user"))).scalar_one()
        check("baglanti havuza TEMIZ dondu", who != row.db_role, who)

    await engine.dispose()
    await _admin(f"DROP DATABASE IF EXISTS {VERIFY_DB} WITH (FORCE)")

    print("\n" + "=" * 62)
    if failures:
        print(f"BASARISIZ ({len(failures)}): " + ", ".join(failures))
        sys.exit(1)
    print("TUM IZOLASYON DOGRULAMALARI GECTI")


if __name__ == "__main__":
    asyncio.run(main())
