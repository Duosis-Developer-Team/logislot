"""Iptal sebepleri + telafi randevusu semasinin TEK DDL tanimi (iki zincir de kullanir).

Musteri karari (2026-11 toplantisi):
- iptal sebebi FIRMANIN duzenledigi listeden secilir (`cancellation_reasons`),
- tedarikci iptalinde telafi randevusu zorunludur ve bayrakla isaretlenir
  (`appointments.is_makeup` + iki yonlu baglanti),
- dev'e giden ilk surumdeki sabit sebep kodu ve "alternatif gonderim tarihi"
  ISTENMEDI; kolonlari burada dusurulur (prod'a hic gitmediler).

Kendi semasindaki tenant'lar `alembic_tenant/`, henuz tasinmamis olanlar
(`public`) `alembic/` zincirinden gecer; ikisi de bu modulu cagirir. Islemler
IDEMPOTENTTIR: modelden olusturulmus (sekli zaten dogru) bir semada no-op'tur.
Varsayilan sebepler SQL fonksiyonu (gen_random_uuid) yerine Python'da
uretilir: tenant zinciri testlerde SQLite uzerinde de kosar.

`app/` ALTINDA durur: imaj yalnizca `app`, `alembic`, `alembic_tenant`,
`scripts` dizinlerini kopyalar (bkz. ticketing_ddl.py).
"""

import uuid
from datetime import UTC, datetime

import sqlalchemy as sa

from alembic import op
from app.core.tenancy_runtime import CONTROL_SCHEMA_REAL
from app.models.cancellation import DEFAULT_CANCELLATION_REASONS

TABLE = "cancellation_reasons"

#: appointments'a eklenen kolonlar ve (varsa) FK hedefi + kisit adi — model ile AYNI.
NEW_APPOINTMENT_COLUMNS: tuple[tuple[sa.Column, tuple[str, str] | None], ...] = (
    (
        sa.Column("cancellation_reason_id", sa.Uuid(), nullable=True),
        ("cancellation_reasons", "fk_appointments_cancellation_reason_id_cancellation_reasons"),
    ),
    (sa.Column("cancellation_reason_label", sa.String(120), nullable=True), None),
    (
        sa.Column("is_makeup", sa.Boolean(), nullable=False, server_default=sa.false()),
        None,
    ),
    (
        sa.Column("makeup_of_id", sa.Uuid(), nullable=True),
        ("appointments", "fk_appointments_makeup_of_id_appointments"),
    ),
    (
        sa.Column("makeup_appointment_id", sa.Uuid(), nullable=True),
        ("appointments", "fk_appointments_makeup_appointment_id_appointments"),
    ),
)

#: Ilk surumden kalan, artik istenmeyen kolonlar.
DROPPED_APPOINTMENT_COLUMNS: tuple[sa.Column, ...] = (
    sa.Column("cancellation_reason_code", sa.String(32), nullable=True),
    sa.Column("cancellation_alternative_date", sa.Date(), nullable=True),
)


def _schema() -> str | None:
    return op.get_context().version_table_schema


def _inspector():
    return sa.inspect(op.get_bind())


def _columns(table: str) -> set[str]:
    return {c["name"] for c in _inspector().get_columns(table, schema=_schema())}


def _is_sqlite() -> bool:
    return op.get_bind().dialect.name == "sqlite"


def _create_reason_table() -> None:
    if _inspector().has_table(TABLE, schema=_schema()):
        return
    op.create_table(
        TABLE,
        sa.Column("label", sa.String(length=120), nullable=False),
        sa.Column("note_required", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column("tenant_id", sa.Uuid(), nullable=False),
        sa.Column("facility_id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(
            ["tenant_id"],
            [f"{CONTROL_SCHEMA_REAL}.tenants.id"],
            name="fk_cancellation_reasons_tenant_id_tenants",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["facility_id"],
            ["facilities.id"],
            name="fk_cancellation_reasons_facility_id_facilities",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_cancellation_reasons"),
    )
    op.create_index("ix_cancellation_reasons_tenant_id", TABLE, ["tenant_id"])
    op.create_index("ix_cancellation_reasons_facility_id", TABLE, ["facility_id"])


def _seed_default_reasons() -> None:
    """Hic sebebi olmayan her tesise baslangic listesini ekler."""
    bind = op.get_bind()
    schema = _schema()
    facilities = sa.table(
        "facilities", sa.column("id", sa.Uuid()), sa.column("tenant_id", sa.Uuid()), schema=schema
    )
    reasons = sa.table(
        TABLE,
        sa.column("id", sa.Uuid()),
        sa.column("tenant_id", sa.Uuid()),
        sa.column("facility_id", sa.Uuid()),
        sa.column("label", sa.String()),
        sa.column("note_required", sa.Boolean()),
        sa.column("is_active", sa.Boolean()),
        sa.column("position", sa.Integer()),
        sa.column("created_at", sa.DateTime(timezone=True)),
        sa.column("updated_at", sa.DateTime(timezone=True)),
        schema=schema,
    )
    seeded = {row[0] for row in bind.execute(sa.select(reasons.c.facility_id).distinct())}
    now = datetime.now(UTC)
    rows = []
    for facility_id, tenant_id in bind.execute(sa.select(facilities.c.id, facilities.c.tenant_id)):
        if facility_id in seeded:
            continue
        for position, label in enumerate(DEFAULT_CANCELLATION_REASONS):
            rows.append(
                {
                    "id": uuid.uuid4(),
                    "tenant_id": tenant_id,
                    "facility_id": facility_id,
                    "label": label,
                    "note_required": False,
                    "is_active": True,
                    "position": position,
                    "created_at": now,
                    "updated_at": now,
                }
            )
    if rows:
        bind.execute(reasons.insert(), rows)


def upgrade() -> None:
    _create_reason_table()
    _seed_default_reasons()
    existing = _columns("appointments")
    for column, fk in NEW_APPOINTMENT_COLUMNS:
        if column.name in existing:
            continue
        op.add_column("appointments", column.copy())
        if fk is not None and not _is_sqlite():
            target, name = fk
            op.create_foreign_key(
                name, "appointments", target, [column.name], ["id"], ondelete="SET NULL"
            )
    for column in DROPPED_APPOINTMENT_COLUMNS:
        if column.name in existing:
            op.drop_column("appointments", column.name)


def downgrade() -> None:
    existing = _columns("appointments")
    for column in DROPPED_APPOINTMENT_COLUMNS:
        if column.name not in existing:
            op.add_column("appointments", column.copy())
    for column, fk in reversed(NEW_APPOINTMENT_COLUMNS):
        if column.name not in existing:
            continue
        if fk is not None and not _is_sqlite():
            op.drop_constraint(fk[1], "appointments", type_="foreignkey")
        op.drop_column("appointments", column.name)
    if _inspector().has_table(TABLE, schema=_schema()):
        op.drop_table(TABLE)
