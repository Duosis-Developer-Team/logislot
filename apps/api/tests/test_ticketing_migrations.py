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
        assert "from app.models.ticketing_ddl import" in source, name
        assert "create_ticket_tables()" in source, name
        assert "drop_ticket_tables()" in source, name


def test_shared_ddl_covers_every_ticket_table():
    from app.models import ticketing_ddl

    source = pathlib.Path(ticketing_ddl.__file__).read_text()
    for name in TICKET_TABLES:
        assert f'op.create_table(\n        "{name}"' in source, name


def test_migrations_only_import_modules_that_ship_in_the_image():
    """Migrationlar YALNIZCA imaja giren birinci-taraf modulleri import etmeli.

    Yerelde her sey calisir (cwd `apps/api`), fakat imaj yalnizca Dockerfile'in
    KOPYALADIGI dizinleri tasir. Ust seviyede yeni bir paket acmak migration
    job'ini `ModuleNotFoundError` ile dusurur — 2026-08-25'te tam olarak boyle
    oldu ve dev deploy'u kirdi. Bu test o sinifi yerelde yakalar.
    """
    import re

    root = pathlib.Path(".")
    dockerfile = (root / "Dockerfile").read_text()
    copied = set(re.findall(r"^COPY\s+(\S+)\s", dockerfile, flags=re.MULTILINE))

    #: Depoda var olan ust seviye dizinler = birinci-taraf paket adaylari.
    first_party = {
        entry.name
        for entry in root.iterdir()
        if entry.is_dir() and not entry.name.startswith((".", "__"))
    }

    offenders: list[str] = []
    for chain in ("alembic/versions", "alembic_tenant/versions"):
        for migration in pathlib.Path(chain).glob("*.py"):
            source = migration.read_text()
            for module in re.findall(r"^\s*from\s+([\w.]+)\s+import", source, re.MULTILINE):
                top = module.split(".")[0]
                if top in first_party and top not in copied:
                    offenders.append(f"{migration}: {module}")

    assert not offenders, (
        "Migrationlar imaja KOPYALANMAYAN modulleri import ediyor: "
        + ", ".join(offenders)
    )


def test_model_and_migration_produce_identical_constraint_names():
    """Model ile migration AYNI kisit adlarini uretmeli.

    Yeni tenant semalari tablolari MODELDEN (`create_all`), mevcut semalar
    MIGRATION'dan alir. Adlar ayrisirsa ayni surumdeki iki tenant farkli
    kisit adlariyla yasar ve sonraki bir `ALTER ... DROP CONSTRAINT` yalnizca
    birinde calisir.

    Bu test ayrica SESSIZ KISALTMAYI yakalar: adlandirma sozlesmesinin
    uretecegi ad Postgres'in 63 karakter sinirini asarsa SQLAlchemy onu
    kisaltip sonuna hash ekler (`..._4aab`), elle yazilan migration ise ayni
    adi asla uretemez. 2026-08-25'te dev migration job'i tam olarak bu yuzden
    `IdentifierError` ile dustu — SQLite sinir uygulamadigi icin testler
    goremiyordu.
    """
    import re

    from sqlalchemy.dialects import postgresql
    from sqlalchemy.schema import CreateIndex, CreateTable

    from app.models import Base, ticketing_ddl

    ddl_source = pathlib.Path(ticketing_ddl.__file__).read_text()
    dialect = postgresql.dialect()

    for name in TICKET_TABLES:
        table = Base.metadata.tables[name]
        compiled = str(CreateTable(table).compile(dialect=dialect))
        for line in compiled.splitlines():
            if "CONSTRAINT" not in line:
                continue
            label = line.strip().split()[1]
            assert len(label) <= 63, f"{name}: '{label}' 63 karakteri asiyor"
            assert not re.search(r"_[0-9a-f]{4}$", label), (
                f"{name}: '{label}' SESSIZCE kisaltilmis — kisit adini "
                "modelde ACIKCA verin, yoksa migration ayni adi uretemez"
            )
            assert f'"{label}"' in ddl_source, (
                f"{name}: model '{label}' uretiyor ama migration DDL'inde yok"
            )

        for index in table.indexes:
            CreateIndex(index).compile(dialect=dialect)
            assert len(index.name or "") <= 63, f"{name}: index '{index.name}' cok uzun"


def test_every_table_compiles_against_postgres():
    """Tum tablolar Postgres lehcesinde derlenebilmeli.

    Test paketi SQLite'ta kosar ve SQLite identifier uzunlugu SINIRLAMAZ;
    bu yuzden yalnizca `create_all` gecmesi bir sey KANITLAMAZ.
    """
    from sqlalchemy.dialects import postgresql
    from sqlalchemy.schema import CreateTable

    from app.models import control_plane_tables, tenant_plane_tables

    dialect = postgresql.dialect()
    for table in control_plane_tables() + tenant_plane_tables():
        CreateTable(table).compile(dialect=dialect)
