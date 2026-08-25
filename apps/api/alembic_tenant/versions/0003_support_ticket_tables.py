"""destek ticket projeksiyonu ve giden komut kuyrugu (tenant-plane)

Bu revizyon HER TENANT SEMASINDA ayri ayri kosar. Tamamen additive: yalnizca
dort yeni tablo olusturulur, mevcut hicbir tablo/kolon/veri degismez.

Yeni tenant semalari `create_all` ile modelden yaratilip bu zincirin head'ine
damgalandigi icin onlarda bu revizyon no-op'tur; mevcut semalar ise
`python -m app.tenancy.migrations upgrade` ile buraya cikar.

`tenant_id` kolonu control-plane'deki `public.tenants` tablosuna referans
verir ve BILEREK acikca nitelenmistir: tenant migrationlari `search_path`'i
yalnizca hedef semaya sabitler (public listede YOKTUR), bu yuzden niteliksiz
bir referans cozulemezdi.

Revision ID: 0003_support_ticket_tables
Revises: 0002_supplier_cargo_enabled
"""

from alembic_shared.ticketing_tables import create_ticket_tables, drop_ticket_tables

revision = "0003_support_ticket_tables"
down_revision = "0002_supplier_cargo_enabled"
branch_labels = None
depends_on = None


def upgrade() -> None:
    create_ticket_tables()


def downgrade() -> None:
    # Yalnizca bu revizyonun OLUSTURDUGU tablolar dusurulur; baska hicbir
    # tabloya dokunulmaz. Geri alma yine de VERI KAYBIDIR ve uretimde
    # kullanilmamalidir — kod rollback'i tablolari yerinde birakir.
    drop_ticket_tables()
