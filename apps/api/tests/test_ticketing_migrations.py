"""Tenant-plane migration zinciri: ticket tablolari her semada olusmali.

Bu testler "mevcut tenant semasi" senaryosunu taklit eder: sema 0002'de
damgali ve ticket tablolari YOK. `upgrade head` sonrasi tablolarin, kolonlarin
ve kisitlarin MODELLE ayni olmasi beklenir — yeni semalar tablolari modelden
(`create_all`) aldigi icin ikisi ayrisirsa ayni surumdeki iki tenant farkli
sekillerle calisirdi.
"""

import pathlib

import sqlalchemy as sa

from app.models import Base, tenant_plane_tables
from app.tenancy.migrations import tenant_alembic_config, tenant_head_revision

TICKET_TABLES = (
    "support_ticket_projections",
    "support_ticket_message_projections",
    "support_ticket_attachment_projections",
    "support_ticket_outbox",
)


def _upgrade_from_0002(engine: sa.Engine) -> None:
    """0002'de damgali bos bir semayi head'e cikarir."""
    from alembic import command

    # Ticket tablolari HARIC tum tenant-plane tablolari (mevcut sema hali).
    existing = [t for t in tenant_plane_tables() if t.name not in TICKET_TABLES]
    with engine.begin() as conn:
        # Control-plane'e verilen FK'ler SQLite'ta cozulemez; test icin
        # `public.tenants` yerine ayni adli yerel tablo yeterlidir.
        Base.metadata.create_all(conn, tables=existing, checkfirst=True)

    cfg = tenant_alembic_config()
    with engine.begin() as conn:
        cfg.attributes["connection"] = conn
        cfg.attributes["target_schema"] = None
        command.stamp(cfg, "0002_supplier_cargo_enabled")
    with engine.begin() as conn:
        cfg.attributes["connection"] = conn
        cfg.attributes["target_schema"] = None
        command.upgrade(cfg, "head")


def _sqlite_engine(tmp_path) -> sa.Engine:
    from app.core.tenancy_runtime import translate_map

    url = f"sqlite:///{tmp_path / 'tenant.db'}"
    return sa.create_engine(url).execution_options(
        schema_translate_map=translate_map(None, dialect_name="sqlite")
    )


def test_tenant_head_is_ticket_revision():
    assert tenant_head_revision() == "0004_ticket_role_permissions"


def test_upgrade_creates_all_ticket_tables_with_model_columns(tmp_path):
    engine = _sqlite_engine(tmp_path)
    _upgrade_from_0002(engine)

    inspector = sa.inspect(engine)
    tables = set(inspector.get_table_names())
    assert set(TICKET_TABLES) <= tables, "migration ticket tablolarini olusturmadi"

    for name in TICKET_TABLES:
        model_table = Base.metadata.tables[name]
        migrated = {c["name"] for c in inspector.get_columns(name)}
        expected = {c.name for c in model_table.columns}
        assert migrated == expected, f"{name}: kolonlar modelle ayrisiyor"


def test_migration_does_not_touch_existing_tables(tmp_path):
    """Additive garantisi: mevcut tablo ve kolonlar DEGISMEZ."""
    engine = _sqlite_engine(tmp_path)
    before_engine = _sqlite_engine(tmp_path.parent / "before")
    (tmp_path.parent / "before").mkdir(exist_ok=True)
    existing = [t for t in tenant_plane_tables() if t.name not in TICKET_TABLES]
    with before_engine.begin() as conn:
        Base.metadata.create_all(conn, tables=existing, checkfirst=True)

    _upgrade_from_0002(engine)

    after = sa.inspect(engine)
    before = sa.inspect(before_engine)
    for table in existing:
        assert {c["name"] for c in after.get_columns(table.name)} == {
            c["name"] for c in before.get_columns(table.name)
        }, f"{table.name} degismis"


def test_existing_rows_survive_upgrade(tmp_path):
    """Mevcut veri korunur — migration hicbir satiri silmez/yeniden yazmaz."""
    engine = _sqlite_engine(tmp_path)
    existing = [t for t in tenant_plane_tables() if t.name not in TICKET_TABLES]
    with engine.begin() as conn:
        Base.metadata.create_all(conn, tables=existing, checkfirst=True)
        conn.execute(
            sa.text(
                "INSERT INTO roles (id, tenant_id, name, permissions_json, is_default,"
                " is_system, is_active, created_at, updated_at)"
                " VALUES ('11111111111111111111111111111111',"
                " '22222222222222222222222222222222',"
                " 'Sistem Yoneticisi', '[\"appt.view\"]', 1, 1, 1,"
                " '2026-01-01', '2026-01-01')"
            )
        )

    from alembic import command

    cfg = tenant_alembic_config()
    with engine.begin() as conn:
        cfg.attributes["connection"] = conn
        cfg.attributes["target_schema"] = None
        command.stamp(cfg, "0002_supplier_cargo_enabled")
    with engine.begin() as conn:
        cfg.attributes["connection"] = conn
        cfg.attributes["target_schema"] = None
        command.upgrade(cfg, "head")

    with engine.begin() as conn:
        rows = conn.execute(sa.text("SELECT id, permissions_json FROM roles")).all()
    assert len(rows) == 1
    permissions = rows[0][1]
    # Satir SILINMEDI ve eski izin KORUNDU; ticket izinleri EKLENDI.
    assert "appt.view" in permissions
    assert "ticket.view" in permissions
    assert "ticket.view_all" in permissions


def test_public_only_check_constraint_is_created(tmp_path):
    """Ic not tenant tablosuna YAZILAMAZ — kisit migration'da da var."""
    engine = _sqlite_engine(tmp_path)
    _upgrade_from_0002(engine)
    ddl = None
    with engine.begin() as conn:
        ddl = conn.execute(
            sa.text(
                "SELECT sql FROM sqlite_master WHERE name ="
                " 'support_ticket_message_projections'"
            )
        ).scalar_one()
    assert "visibility = 'public'" in ddl


def test_new_tenant_provisioning_includes_ticket_tables():
    """Yeni tenant semasi tablolari MODELDEN alir; liste otomatik dogru kalir."""
    names = {t.name for t in tenant_plane_tables()}
    assert set(TICKET_TABLES) <= names


def test_control_plane_tables_include_routing_and_inbox():
    from app.models import control_plane_tables

    names = {t.name for t in control_plane_tables()}
    assert {
        "ticket_routing_configs",
        "hermes_group_catalog_cache",
        "ticket_webhook_inbox",
    } <= names


def test_both_chains_use_the_same_ticket_ddl():
    """Tek DDL kaynagi: iki zincir de paylasilan yardimciyi cagirir.

    Neden onemli: `tenant_datastore_required` varsayilan olarak KAPALIDIR,
    yani kendi semasina henuz tasinmamis bir tenant ortak `public` semada
    calisir. Ticket tablolari orada da olusmali; DDL iki yere kopyalanirsa
    iki yerin zamanla ayrismasi kacinilmazdir.
    """
    control = pathlib.Path(
        "alembic/versions/b7e2d94c1f30_ticketing_control_plane.py"
    ).read_text()
    tenant = pathlib.Path(
        "alembic_tenant/versions/0003_support_ticket_tables.py"
    ).read_text()

    for source, name in ((control, "control"), (tenant, "tenant")):
        assert "from alembic_shared.ticketing_tables import" in source, name
        assert "create_ticket_tables()" in source, name
        assert "drop_ticket_tables()" in source, name


def test_shared_ddl_covers_every_ticket_table():
    from alembic_shared import ticketing_tables

    source = pathlib.Path(ticketing_tables.__file__).read_text()
    for name in TICKET_TABLES:
        assert f'op.create_table(\n        "{name}"' in source, name
