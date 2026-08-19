"""${message}

TENANT-PLANE REVIZYONU — bu dosya HER TENANT SEMASINDA ayri kosar.
Tablo adlarini SEMASIZ yazin (`op.add_column("suppliers", ...)`): hedef sema
`alembic_tenant/env.py` icinde `search_path` ile sabitlenir. `public.` ile
nitelemek TUM tenant'lar icin ortak semayi degistirir ve neredeyse her zaman
HATADIR. Control-plane tablosu degisiyorsa revizyon `alembic/` zincirine gider.

Revision ID: ${up_revision}
Revises: ${down_revision | comma,n}
Create Date: ${create_date}

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
${imports if imports else ""}

revision: str = ${repr(up_revision)}
down_revision: str | None = ${repr(down_revision)}
branch_labels: str | Sequence[str] | None = ${repr(branch_labels)}
depends_on: str | Sequence[str] | None = ${repr(depends_on)}


def upgrade() -> None:
    ${upgrades if upgrades else "pass"}


def downgrade() -> None:
    ${downgrades if downgrades else "pass"}
