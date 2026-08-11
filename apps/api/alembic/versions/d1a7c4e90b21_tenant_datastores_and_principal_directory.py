"""tenant datastores + principal directory (control-plane)

Sema-basina-tenant izolasyonunun control-plane tablolari. TAMAMEN ADDITIVE:
mevcut hicbir tablo/kolon/veri degismez, bu yuzden calisan sisteme etkisi
yoktur. Tenant'lar bu tabloya 'ready' kaydi eklenene kadar eski ortak
yerlesimde calismaya devam eder.

Revision ID: d1a7c4e90b21
Revises: d3c1f6a27b90
"""

import sqlalchemy as sa
from alembic import op

revision = "d1a7c4e90b21"
down_revision = "d3c1f6a27b90"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "tenant_datastores",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("tenant_id", sa.Uuid(), nullable=False),
        sa.Column("schema_name", sa.String(length=63), nullable=False),
        sa.Column("dsn_alias", sa.String(length=64), nullable=True),
        sa.Column(
            "status",
            sa.Enum(
                "pending",
                "provisioning",
                "ready",
                "failed",
                name="datastorestatus",
                native_enum=False,
                length=32,
            ),
            nullable=False,
        ),
        sa.Column("provisioned_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("migrated_revision", sa.String(length=64), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(
            ["tenant_id"], ["tenants.id"], name=op.f("fk_tenant_datastores_tenant_id_tenants"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_tenant_datastores")),
        sa.UniqueConstraint("tenant_id", name=op.f("uq_tenant_datastores_tenant_id")),
        sa.UniqueConstraint("schema_name", name=op.f("uq_tenant_datastores_schema_name")),
    )
    op.create_index(
        op.f("ix_tenant_datastores_tenant_id"), "tenant_datastores", ["tenant_id"], unique=False
    )
    op.create_index(
        op.f("ix_tenant_datastores_status"), "tenant_datastores", ["status"], unique=False
    )

    op.create_table(
        "principal_directory",
        sa.Column("principal_id", sa.Uuid(), nullable=False),
        sa.Column("user_type", sa.String(length=20), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("tenant_id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(
            ["tenant_id"], ["tenants.id"], name=op.f("fk_principal_directory_tenant_id_tenants"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("principal_id", name=op.f("pk_principal_directory")),
        sa.UniqueConstraint("user_type", "email", name="uq_principal_directory_type_email"),
    )
    op.create_index(
        op.f("ix_principal_directory_email"), "principal_directory", ["email"], unique=False
    )
    op.create_index(
        op.f("ix_principal_directory_tenant_id"), "principal_directory", ["tenant_id"], unique=False
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_principal_directory_tenant_id"), table_name="principal_directory")
    op.drop_index(op.f("ix_principal_directory_email"), table_name="principal_directory")
    op.drop_table("principal_directory")
    op.drop_index(op.f("ix_tenant_datastores_status"), table_name="tenant_datastores")
    op.drop_index(op.f("ix_tenant_datastores_tenant_id"), table_name="tenant_datastores")
    op.drop_table("tenant_datastores")
