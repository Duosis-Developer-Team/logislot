"""tedarikci iptal kurallari: sebep kodu, alternatif tarih, tesis politikasi

Musteri talebi (2026-10, Cakes&Bakes): tedarikci randevu iptalinde sabit
listeden sebep ve alternatif gonderim tarihi girmek zorunda olsun; randevuya
belirli bir sureden az kalinca portaldan iptal edemesin. Kurallar tesis
bazlidir (`facilities.supplier_cancellation_policy_json`, NULL = kural yok).

`appointments` ve `facilities` tenant-plane tablolardir; bu revizyon yalnizca
HENUZ kendi semasina tasinmamis tenant'larin verisini tutan ortak yerlesimi
(public) gunceller. Kendi semasindaki tenant'lar icin ayni kolonlar
alembic_tenant/versions/0006_supplier_cancel_policy.py ile eklenir;
iki revizyon da app/models/supplier_cancellation_ddl.py'yi cagirir.

Tamamen eklemeli (nullable kolonlar): eski kod bu semayla sorunsuz calisir.

Revision ID: a6d2e9c41f07
Revises: f1a6c3d84b52
Create Date: 2026-10-21
"""

from collections.abc import Sequence

from app.models import supplier_cancellation_ddl

revision: str = "a6d2e9c41f07"
down_revision: str | None = "f1a6c3d84b52"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    supplier_cancellation_ddl.upgrade()


def downgrade() -> None:
    supplier_cancellation_ddl.downgrade()
