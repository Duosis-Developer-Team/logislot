"""Destek ticket tablolarinin TEK DDL tanimi (iki alembic zinciri de kullanir).

Hem control-plane (`alembic/`) hem tenant-plane (`alembic_tenant/`) zinciri bu
fonksiyonlari cagirir; boylece "kendi semasindaki tenant" ile "ortak semadaki
tenant" ayni tablo seklini alir. `app/models/ticketing.py` ile de birebir ayni
olmak zorundadir: yeni semalar tablolari `create_all` ile MODELDEN alir.

NEDEN `app/` ALTINDA: imaj yalnizca `app`, `alembic`, `alembic_tenant` ve
`scripts` dizinlerini kopyalar; `pyproject.toml` da yalnizca `app*` paketlerini
kurar. Ust seviyede yeni bir paket acmak, yerelde calisip IMAJDA
`ModuleNotFoundError` ile migration job'ini dusurur — 2026-08-25'te tam olarak
boyle oldu. Migrationlarin paylastigi her sey `app.` altinda yasar.
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op
from app.core.enums import (
    TicketAttachmentScanStatus,
    TicketCategory,
    TicketCommandType,
    TicketDeliveryStatus,
    TicketImpact,
    TicketMessageAuthorType,
    TicketOutboxStatus,
    TicketRequesterType,
    TicketStatus,
)
from app.core.tenancy_runtime import CONTROL_SCHEMA_REAL

JSONB = sa.JSON().with_variant(postgresql.JSONB(), "postgresql")


def _enum(enum_cls) -> sa.Enum:
    """Modeldeki `str_enum()` ile BIREBIR ayni kolon tipi.

    Ayni sekli uretmek sart: yeni semalar tablolari modelden (`create_all`),
    eski semalar bu DDL'den alir. Ikisi ayrisirsa ayni surumdeki iki tenant
    farkli kisitlarla calisirdi.
    """
    return sa.Enum(
        enum_cls,
        native_enum=False,
        length=32,
        values_callable=lambda e: [m.value for m in e],
    )


def create_ticket_tables() -> None:
    op.create_table(
        "support_ticket_projections",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("tenant_id", sa.Uuid(), nullable=False),
        sa.Column("facility_id", sa.Uuid(), nullable=False),
        sa.Column("requester_type", _enum(TicketRequesterType), nullable=False),
        sa.Column("requester_id", sa.Uuid(), nullable=False),
        sa.Column("requester_name", sa.String(length=255), nullable=True),
        sa.Column("requester_email", sa.String(length=255), nullable=True),
        sa.Column("supplier_id", sa.Uuid(), nullable=True),
        sa.Column("supplier_name", sa.String(length=255), nullable=True),
        sa.Column("remote_ticket_id", sa.Uuid(), nullable=True),
        sa.Column("remote_ticket_number", sa.String(length=40), nullable=True),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("category", _enum(TicketCategory), nullable=False),
        sa.Column("impact", _enum(TicketImpact), nullable=False),
        sa.Column("reproduction_steps", sa.Text(), nullable=True),
        sa.Column("expected_result", sa.Text(), nullable=True),
        sa.Column("actual_result", sa.Text(), nullable=True),
        sa.Column("error_code", sa.String(length=120), nullable=True),
        sa.Column("correlation_id", sa.Uuid(), nullable=True),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("client_context_json", JSONB, nullable=True),
        sa.Column("route_group_id", sa.Uuid(), nullable=True),
        sa.Column("route_group_name", sa.String(length=255), nullable=True),
        sa.Column("route_version", sa.Integer(), nullable=True),
        sa.Column("remote_status", _enum(TicketStatus), nullable=False),
        sa.Column("aggregate_version", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("sync_gap", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("resolution_summary", sa.Text(), nullable=True),
        sa.Column("resolution_code", sa.String(length=40), nullable=True),
        sa.Column("resolution_fix_version", sa.String(length=120), nullable=True),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("resolved_by_group_name", sa.String(length=255), nullable=True),
        sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("first_response_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("delivery_status", _enum(TicketDeliveryStatus), nullable=False),
        sa.Column("last_sync_error_code", sa.String(length=64), nullable=True),
        sa.Column("last_sync_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("remote_created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("remote_updated_at", sa.DateTime(timezone=True), nullable=True),
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
            [f"{CONTROL_SCHEMA_REAL}.tenants.id"],
            name="fk_support_ticket_projections_tenant_id_tenants",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["facility_id"],
            ["facilities.id"],
            name="fk_support_ticket_projections_facility_id_facilities",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_support_ticket_projections"),
        sa.UniqueConstraint("remote_ticket_id", name="uq_support_tickets_remote_id"),
    )
    op.create_index(
        "ix_support_ticket_projections_tenant_id",
        "support_ticket_projections",
        ["tenant_id"],
    )
    op.create_index(
        "ix_support_ticket_projections_facility_id",
        "support_ticket_projections",
        ["facility_id"],
    )
    op.create_index(
        "ix_support_ticket_projections_requester_id",
        "support_ticket_projections",
        ["requester_id"],
    )
    op.create_index(
        "ix_support_ticket_projections_supplier_id",
        "support_ticket_projections",
        ["supplier_id"],
    )
    op.create_index(
        "ix_support_ticket_projections_remote_ticket_number",
        "support_ticket_projections",
        ["remote_ticket_number"],
    )
    op.create_index(
        "ix_support_ticket_projections_category",
        "support_ticket_projections",
        ["category"],
    )
    op.create_index(
        "ix_support_tickets_requester",
        "support_ticket_projections",
        ["requester_type", "requester_id"],
    )
    op.create_index(
        "ix_support_tickets_status_updated",
        "support_ticket_projections",
        ["remote_status", "updated_at"],
    )
    op.create_index(
        "ix_support_tickets_delivery", "support_ticket_projections", ["delivery_status"]
    )

    op.create_table(
        "support_ticket_message_projections",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("ticket_id", sa.Uuid(), nullable=False),
        sa.Column("remote_message_id", sa.Uuid(), nullable=True),
        sa.Column(
            "visibility", sa.String(length=10), nullable=False, server_default="public"
        ),
        sa.Column("author_type", _enum(TicketMessageAuthorType), nullable=False),
        sa.Column("author_display_name", sa.String(length=255), nullable=True),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column(
            "body_format", sa.String(length=20), nullable=False, server_default="text"
        ),
        sa.Column("aggregate_version", sa.Integer(), nullable=True),
        sa.Column("is_pending", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["ticket_id"],
            ["support_ticket_projections.id"],
            name=(
                "fk_support_ticket_message_projections_ticket_id_"
                "support_ticket_projections"
            ),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_support_ticket_message_projections"),
        sa.UniqueConstraint(
            "remote_message_id", name="uq_support_ticket_messages_remote"
        ),
        # Savunma derinligi: ic notlar bu tabloya YAZILAMAZ.
        sa.CheckConstraint(
            "visibility = 'public'",
            name="ck_support_ticket_message_projections_public_only",
        ),
    )
    op.create_index(
        "ix_support_ticket_message_projections_ticket_id",
        "support_ticket_message_projections",
        ["ticket_id"],
    )
    op.create_index(
        "ix_support_ticket_messages_ticket_created",
        "support_ticket_message_projections",
        ["ticket_id", "created_at"],
    )

    op.create_table(
        "support_ticket_attachment_projections",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("ticket_id", sa.Uuid(), nullable=True),
        sa.Column("message_id", sa.Uuid(), nullable=True),
        sa.Column("upload_id", sa.Uuid(), nullable=False),
        sa.Column("remote_attachment_id", sa.Uuid(), nullable=True),
        sa.Column("file_name", sa.String(length=255), nullable=False),
        sa.Column("mime_type", sa.String(length=120), nullable=True),
        sa.Column("size_bytes", sa.BigInteger(), nullable=True),
        sa.Column("scan_status", _enum(TicketAttachmentScanStatus), nullable=False),
        sa.Column(
            "visibility", sa.String(length=10), nullable=False, server_default="public"
        ),
        sa.Column("uploaded_by_id", sa.Uuid(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["ticket_id"],
            ["support_ticket_projections.id"],
            name=(
                "fk_support_ticket_attachment_projections_ticket_id_"
                "support_ticket_projections"
            ),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["message_id"],
            ["support_ticket_message_projections.id"],
            name=(
                "fk_support_ticket_attachment_projections_message_id_"
                "support_ticket_message_projections"
            ),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_support_ticket_attachment_projections"),
        sa.UniqueConstraint("upload_id", name="uq_support_ticket_attachments_upload"),
    )
    op.create_index(
        "ix_support_ticket_attachment_projections_ticket_id",
        "support_ticket_attachment_projections",
        ["ticket_id"],
    )
    op.create_index(
        "ix_support_ticket_attachments_ticket",
        "support_ticket_attachment_projections",
        ["ticket_id"],
    )

    op.create_table(
        "support_ticket_outbox",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("command_id", sa.Uuid(), nullable=False),
        sa.Column("ticket_id", sa.Uuid(), nullable=False),
        sa.Column("message_id", sa.Uuid(), nullable=True),
        sa.Column("command_type", _enum(TicketCommandType), nullable=False),
        sa.Column(
            "payload_version", sa.String(length=10), nullable=False, server_default="1.0"
        ),
        sa.Column("payload_json", JSONB, nullable=False),
        sa.Column("correlation_id", sa.Uuid(), nullable=True),
        sa.Column("status", _enum(TicketOutboxStatus), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("next_attempt_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_error_code", sa.String(length=64), nullable=True),
        sa.Column("last_error_message", sa.String(length=500), nullable=True),
        sa.Column("locked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("locked_by", sa.String(length=64), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("dead_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["ticket_id"],
            ["support_ticket_projections.id"],
            name="fk_support_ticket_outbox_ticket_id_support_ticket_projections",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_support_ticket_outbox"),
        sa.UniqueConstraint("command_id", name="uq_support_ticket_outbox_command"),
    )
    op.create_index(
        "ix_support_ticket_outbox_ticket_id", "support_ticket_outbox", ["ticket_id"]
    )
    op.create_index(
        "ix_support_ticket_outbox_status", "support_ticket_outbox", ["status"]
    )
    op.create_index(
        "ix_support_ticket_outbox_next_attempt_at",
        "support_ticket_outbox",
        ["next_attempt_at"],
    )
    op.create_index(
        "ix_support_ticket_outbox_due",
        "support_ticket_outbox",
        ["status", "next_attempt_at"],
    )
    op.create_index(
        "ix_support_ticket_outbox_ticket", "support_ticket_outbox", ["ticket_id"]
    )


def drop_ticket_tables() -> None:
    # Yalnizca bu revizyonun oLUSTURDUGU tablolar dusurulur; baska hicbir
    # tabloya dokunulmaz. Geri alma yine de VERI KAYBIDIR ve uretimde
    # kullanilmamalidir — kod rollback'i tablolari yerinde birakir.
    op.drop_table("support_ticket_outbox")
    op.drop_table("support_ticket_attachment_projections")
    op.drop_table("support_ticket_message_projections")
    op.drop_table("support_ticket_projections")
