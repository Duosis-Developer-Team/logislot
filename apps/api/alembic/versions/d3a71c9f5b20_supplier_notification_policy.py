"""tedarikci bildirim politikasi tesis seviyesine tasindi

Urun karari (2026-08): tedarikciye hangi bildirim/e-postanin gidecegine
YONETIM karar verir. Tedarikci bu tercihleri kendi panelinde goremez ve
degistiremez. Politika tesis genelinde tektir (1 tenant = 1 tesis).

Migration TAMAMEN EKLEMELIDIR (nullable kolon); mevcut satirlarda NULL kalir
ve NULL = "tum bildirimler acik" varsayilanina cozulur. Bu yuzden eski kod
(kolonu bilmeyen surum) bu semayla sorunsuz calisir — deploy sirasi serbest.

`supplier_users.notification_preferences_json` bilerek DROP EDILMEDI: canli
veriyi geri donusu olmayan sekilde silmemek icin kolon yerinde birakildi,
uygulama artik okumaz/yazmaz.

Revision ID: d3a71c9f5b20
Revises: c7f1a2b93d40
Create Date: 2026-08-11
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "d3a71c9f5b20"
down_revision: str | None = "c7f1a2b93d40"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "facilities",
        sa.Column("supplier_notification_policy_json", sa.JSON(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("facilities", "supplier_notification_policy_json")
