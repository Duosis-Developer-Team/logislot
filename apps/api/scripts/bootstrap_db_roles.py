"""Veritabani seviyesinde tenant yetkilendirmesini kurar.

Uygulama bugun superuser ile baglaniyor; superuser TUM yetki kontrollerini
atladigi icin GRANT'lar tek basina bir sey ifade etmez. Bu script:

  1. dusuk yetkili uygulama rolunu (NOINHERIT) olusturur ve control-plane
     yetkilerini verir,
  2. mevcut 'ready' tenant'lar icin rol + GRANT'lari acar ve kayda yazar.

NOINHERIT kritik: uygulama rolu tenant rollerine UYEDIR ama yetkiyi ancak
acikca `SET ROLE` yapinca kazanir. Rol degisimi atlanirsa istek sessizce
genis yetkiyle degil, HATAYLA sonuclanir (fail-closed).

Calistirma:
    python scripts/bootstrap_db_roles.py --print-dsn   # ne yapilacagini goster
    python scripts/bootstrap_db_roles.py --apply
"""

import argparse
import asyncio

import sqlalchemy as sa

from app.core.config import get_settings
from app.core.enums import DatastoreStatus
from app.core.tenancy_runtime import role_name_for
from app.models import TenantDatastore


async def apply(dry_run: bool) -> None:
    from app.core.db import admin_engine, control_session
    from app.tenancy.provisioning import _quote, grant_tenant_role

    settings = get_settings()
    app_role = settings.app_db_role
    q_app = _quote(app_role)

    if dry_run:
        print(f"Uygulama rolu       : {app_role} (NOLOGIN->LOGIN, NOINHERIT, NOSUPERUSER)")
    else:
        async with admin_engine.begin() as conn:
            exists = (
                await conn.execute(
                    sa.text("SELECT 1 FROM pg_roles WHERE rolname = :r"), {"r": app_role}
                )
            ).scalar()
            if exists is None:
                await conn.execute(sa.text(f"CREATE ROLE {q_app} LOGIN NOINHERIT NOSUPERUSER"))
            # Control-plane: platform verisi + kayit tablolari
            await conn.execute(sa.text(f"GRANT USAGE ON SCHEMA public TO {q_app}"))
            await conn.execute(
                sa.text(
                    f"GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public "
                    f"TO {q_app}"
                )
            )
            await conn.execute(
                sa.text(f"GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO {q_app}")
            )
            owner = admin_engine.url.username
            await conn.execute(
                sa.text(
                    f"ALTER DEFAULT PRIVILEGES FOR ROLE {_quote(owner)} IN SCHEMA public "
                    f"GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO {q_app}"
                )
            )
        print(f"OK  uygulama rolu hazir: {app_role}")

    async with control_session() as db:
        rows = list(
            (
                await db.execute(
                    sa.select(TenantDatastore).where(
                        TenantDatastore.status == DatastoreStatus.ready
                    )
                )
            ).scalars()
        )

    for row in rows:
        role = role_name_for(row.tenant_id)
        if dry_run:
            print(f"  tenant {row.schema_name} -> rol {role}")
            continue
        await grant_tenant_role(admin_engine, row.schema_name, role, app_role)
        async with control_session() as db:
            await db.execute(
                sa.update(TenantDatastore)
                .where(TenantDatastore.id == row.id)
                .values(db_role=role)
            )
            await db.commit()
        print(f"OK  {row.schema_name} -> {role}")

    if not rows:
        print("Hazir tenant yok — yeni tenant'lar provisioning sirasinda rolunu alir.")

    if not dry_run:
        print(
            "\nSON ADIM (elle): LOGISLOT_DATABASE_URL'i "
            f"{app_role} kullanicisina cevirin ve API'yi yeniden baslatin.\n"
            "Superuser ile baglanildigi surece GRANT'lar ETKISIZDIR."
        )


def main() -> None:
    parser = argparse.ArgumentParser(description="Tenant veritabani rollerini kurar")
    parser.add_argument("--apply", action="store_true", help="degisiklikleri uygula")
    parser.add_argument("--print-dsn", action="store_true", help="yalnizca plani goster")
    args = parser.parse_args()
    if not args.apply and not args.print_dsn:
        parser.error("--apply veya --print-dsn gerekli")
    asyncio.run(apply(dry_run=not args.apply))


if __name__ == "__main__":
    main()
