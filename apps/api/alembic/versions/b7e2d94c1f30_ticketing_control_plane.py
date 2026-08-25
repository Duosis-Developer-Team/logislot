"""Hermes ticket entegrasyonu — control-plane tablolari ve izin esitlemesi

Additive: yalnizca yeni tablolar ve MEVCUT satirlarin izin listelerine ekleme
yapilir. DROP/TRUNCATE/genis DELETE yoktur; downgrade eklenen tablolari ve
YALNIZCA bu surumde eklenen izinleri geri alir, hicbir isletme verisi silmez.

BU MIGRATION IKI ISI BIRDEN YAPAR:

1. Control-plane tablolari (routing config, katalog onbellegi, webhook inbox).
2. TENANT-PLANE ticket tablolarinin ortak `public` semadaki kopyasi.

(2) dekoratif degildir: `tenant_datastore_required` varsayilan olarak KAPALI
oldugundan, `control.tenant_datastores`'ta 'ready' kaydi olmayan bir tenant
eski ortak yerlesimde calismaya devam eder ve istekleri `public` semaya duser
(bkz. `app/core/db.py::location_for_tenant`). Tablolar orada yoksa o tenant'in
her ticket istegi `UndefinedTable` ile 500 doner ve outbox isi her turda
patlar. Ayni desen `roles`/`suppliers` gibi tenant tablolarinda da vardir:
initial schema onlari public'te, tenant zinciri kendi semalarinda olusturur.

`roles` izin esitlemesi de ayni sebeple burada yapilir; tasinmis tenant'lar
icin karsiligi tenant zincirindeki `0004_ticket_role_permissions`'dir. Ikisi
de gerekli: biri digerinin kapsamini gormez.

Revision ID: b7e2d94c1f30
Revises: a1c9d4e07b31
Create Date: 2026-08-25
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op
from app.core.permissions import PlatformPermission, TenantPermission
from app.models.ticketing_ddl import create_ticket_tables, drop_ticket_tables

revision = "b7e2d94c1f30"
down_revision = "a1c9d4e07b31"
branch_labels = None
depends_on = None

JSONB = sa.JSON().with_variant(postgresql.JSONB(), "postgresql")

#: Bu surumde eklenen izinler — downgrade tam olarak bunlari geri ceker.
NEW_TENANT_PERMISSIONS = [
    TenantPermission.TICKET_VIEW,
    TenantPermission.TICKET_CREATE,
    TenantPermission.TICKET_COMMENT,
    TenantPermission.TICKET_VIEW_ALL,
]
NEW_PLATFORM_PERMISSIONS = [
    PlatformPermission.TICKET_ROUTING_VIEW,
    PlatformPermission.TICKET_ROUTING_MANAGE,
    PlatformPermission.TICKET_INTEGRATION_HEALTH_VIEW,
]

roles_table = sa.table(
    "roles",
    sa.column("id", sa.Uuid),
    sa.column("name", sa.String),
    sa.column("is_system", sa.Boolean),
    sa.column("permissions_json", sa.JSON),
)

platform_roles_table = sa.table(
    "platform_roles",
    sa.column("id", sa.Uuid),
    sa.column("name", sa.String),
    sa.column("permissions_json", sa.JSON),
)


def upgrade() -> None:
    op.create_table(
        "ticket_routing_configs",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("tenant_id", sa.Uuid(), nullable=False),
        sa.Column(
            "application_code",
            sa.String(length=50),
            nullable=False,
            server_default="logislot",
        ),
        sa.Column("hermes_group_id", sa.Uuid(), nullable=False),
        sa.Column("hermes_group_name_snapshot", sa.String(length=255), nullable=True),
        sa.Column("route_version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("last_verified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("catalog_version", sa.String(length=128), nullable=True),
        sa.Column("last_error_code", sa.String(length=64), nullable=True),
        sa.Column("last_error_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("configured_by_platform_user_id", sa.Uuid(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["tenant_id"],
            ["tenants.id"],
            name="fk_ticket_routing_configs_tenant_id_tenants",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_ticket_routing_configs"),
        sa.UniqueConstraint(
            "tenant_id", "application_code", name="uq_ticket_routing_configs_tenant_app"
        ),
    )
    op.create_index(
        "ix_ticket_routing_configs_tenant_id",
        "ticket_routing_configs",
        ["tenant_id"],
    )

    op.create_table(
        "hermes_group_catalog_cache",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "application_code",
            sa.String(length=50),
            nullable=False,
            server_default="logislot",
        ),
        sa.Column("group_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("member_count", sa.Integer(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("catalog_version", sa.String(length=128), nullable=True),
        sa.Column("remote_updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "fetched_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id", name="pk_hermes_group_catalog_cache"),
        sa.UniqueConstraint(
            "application_code", "group_id", name="uq_hermes_group_catalog_app_group"
        ),
    )

    op.create_table(
        "ticket_webhook_inbox",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("event_id", sa.Uuid(), nullable=False),
        sa.Column("application_code", sa.String(length=50), nullable=False),
        sa.Column("source_tenant_id", sa.Uuid(), nullable=True),
        sa.Column("source_ticket_id", sa.Uuid(), nullable=True),
        sa.Column("remote_ticket_id", sa.Uuid(), nullable=True),
        sa.Column("remote_ticket_number", sa.String(length=40), nullable=True),
        sa.Column("event_type", sa.String(length=80), nullable=False),
        sa.Column("aggregate_version", sa.Integer(), nullable=True),
        sa.Column("sequence", sa.Integer(), nullable=True),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("correlation_id", sa.Uuid(), nullable=True),
        sa.Column("payload_json", JSONB, nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("next_attempt_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_error_code", sa.String(length=64), nullable=True),
        sa.Column("locked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "received_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("processed_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id", name="pk_ticket_webhook_inbox"),
        sa.UniqueConstraint("event_id", name="uq_ticket_webhook_inbox_event_id"),
    )
    op.create_index(
        "ix_ticket_webhook_inbox_event_id", "ticket_webhook_inbox", ["event_id"]
    )
    op.create_index(
        "ix_ticket_webhook_inbox_status", "ticket_webhook_inbox", ["status"]
    )
    op.create_index(
        "ix_ticket_webhook_inbox_source_tenant_id",
        "ticket_webhook_inbox",
        ["source_tenant_id"],
    )
    op.create_index(
        "ix_ticket_webhook_inbox_event_type", "ticket_webhook_inbox", ["event_type"]
    )
    op.create_index(
        "ix_ticket_webhook_inbox_status_attempt",
        "ticket_webhook_inbox",
        ["status", "next_attempt_at"],
    )
    op.create_index(
        "ix_ticket_webhook_inbox_source_ticket",
        "ticket_webhook_inbox",
        ["source_ticket_id"],
    )

    # Ortak yerlesimdeki (henuz kendi semasina tasinmamis) tenant'lar icin
    # tenant-plane ticket tablolari — bkz. modul docstring'i.
    create_ticket_tables()

    _sync_permissions(add=True)


def downgrade() -> None:
    _sync_permissions(add=False)
    drop_ticket_tables()
    op.drop_table("ticket_webhook_inbox")
    op.drop_table("hermes_group_catalog_cache")
    op.drop_table("ticket_routing_configs")


def _sync_permissions(*, add: bool) -> None:
    """Sistem rollerine ticket izinlerini ekler/geri ceker.

    Yalnizca `is_system` roller ve platform superadmin rolu guncellenir; el ile
    olusturulmus musteri rollerine izin EKLENMEZ (yetki genislemesi surpriz
    olmamali). `Izleyici / Planlama` gibi salt-okur roller yalnizca `ticket.view`
    ALMAZ: ticket acmak bir izleyici islevi degildir; yonetici gerekiyorsa
    izin ekranindan verir.
    """
    conn = op.get_bind()

    rows = conn.execute(
        sa.select(roles_table.c.id, roles_table.c.name, roles_table.c.permissions_json)
        .where(roles_table.c.is_system.is_(True))
    ).all()
    for role_id, name, permissions in rows:
        current = list(permissions or [])
        if name == "Sistem Yoneticisi":
            granted = NEW_TENANT_PERMISSIONS
        elif name == "Rampa / Depo Yoneticisi":
            granted = [
                TenantPermission.TICKET_VIEW,
                TenantPermission.TICKET_CREATE,
                TenantPermission.TICKET_COMMENT,
            ]
        else:
            continue
        updated = (
            current + [p for p in granted if p not in current]
            if add
            else [p for p in current if p not in NEW_TENANT_PERMISSIONS]
        )
        if updated != current:
            conn.execute(
                sa.update(roles_table)
                .where(roles_table.c.id == role_id)
                .values(permissions_json=updated)
            )

    platform_rows = conn.execute(
        sa.select(
            platform_roles_table.c.id,
            platform_roles_table.c.name,
            platform_roles_table.c.permissions_json,
        ).where(platform_roles_table.c.name == "Platform Yoneticisi")
    ).all()
    for role_id, _name, permissions in platform_rows:
        current = list(permissions or [])
        updated = (
            current + [p for p in NEW_PLATFORM_PERMISSIONS if p not in current]
            if add
            else [p for p in current if p not in NEW_PLATFORM_PERMISSIONS]
        )
        if updated != current:
            conn.execute(
                sa.update(platform_roles_table)
                .where(platform_roles_table.c.id == role_id)
                .values(permissions_json=updated)
            )
