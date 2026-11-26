"""iptal sebepleri firma listesi + zorunlu telafi randevusu

Musteri karari (2026-11 toplantisi): iptal sebebi firmanin duzenledigi
listeden secilir, aciklama istege baglidir; tedarikci iptalinde telafi
randevusu zorunludur ve bayrakla isaretlenir. Ilk surumdeki sabit sebep kodu
ve alternatif gonderim tarihi kolonlari dusurulur (yalnizca dev'e gitmisti).

`appointments` ve `cancellation_reasons` tenant-plane tablolardir; bu revizyon
HENUZ kendi semasina tasinmamis tenant'larin ortak yerlesimini (public)
gunceller. Kendi semasindakiler icin ayni degisiklik
alembic_tenant/versions/0007_cancel_reasons_makeup.py ile yapilir; ikisi de
app/models/cancellation_reasons_ddl.py'yi cagirir.

Revision ID: b4e8c2d61a93
Revises: a6d2e9c41f07
Create Date: 2026-11-14
"""

from collections.abc import Sequence

from app.models import cancellation_reasons_ddl

revision: str = "b4e8c2d61a93"
down_revision: str | None = "a6d2e9c41f07"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    cancellation_reasons_ddl.upgrade()


def downgrade() -> None:
    cancellation_reasons_ddl.downgrade()
