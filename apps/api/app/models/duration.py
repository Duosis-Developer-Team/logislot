"""Islem suresi kurallari — tesisin KENDI tanimladigi tablo.

Musteri karari (2026-11 toplantisi): islem suresini tedarikci secmesin; sevkiyat
tipi (palet, cuval...), miktar, arac tipi ve urun kategorisine gore sistem
hesaplasin. Ayni arac az ya da cok yukle gelebildigi icin sure miktara baglidir.

Algoritma (bkz. services/duration_rules.py ve docs/SURE_HESAPLAMA.md):
kurallar `position` sirasiyla taranir, kosullari tutan ILK kural uygulanir.
Bos kosul "hepsi" demektir. Sonuc ya sabit dakika ya da
taban + birim basina dakika x miktar; istege bagli alt/ust sinirla kirpilir ve
tesisin yuvarlama adimina yukari yuvarlanir.
"""

import uuid
from decimal import Decimal

import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column

from app.core.enums import DurationCalcType
from app.models.base import Base, FacilityScopedMixin, TimestampMixin, UUIDPkMixin, str_enum


class DurationRule(Base, UUIDPkMixin, TimestampMixin, FacilityScopedMixin):
    __tablename__ = "duration_rules"

    position: Mapped[int] = mapped_column(sa.Integer, default=0, server_default="0")
    name: Mapped[str | None] = mapped_column(sa.String(120))
    is_active: Mapped[bool] = mapped_column(sa.Boolean, default=True, server_default=sa.true())

    # --- kosullar (NULL = hepsi). Kategori/arac silinirse kural da silinir:
    # sessizce "hepsi"ne genislemesi yanlis sure uretirdi.
    vehicle_category_id: Mapped[uuid.UUID | None] = mapped_column(
        sa.Uuid, sa.ForeignKey("vehicle_categories.id", ondelete="CASCADE")
    )
    product_category_id: Mapped[uuid.UUID | None] = mapped_column(
        sa.Uuid, sa.ForeignKey("product_categories.id", ondelete="CASCADE")
    )
    quantity_unit: Mapped[str | None] = mapped_column(sa.String(32))
    min_quantity: Mapped[int | None] = mapped_column(sa.Integer)
    max_quantity: Mapped[int | None] = mapped_column(sa.Integer)

    # --- hesap
    calc_type: Mapped[DurationCalcType] = mapped_column(
        str_enum(DurationCalcType), default=DurationCalcType.fixed
    )
    fixed_minutes: Mapped[int | None] = mapped_column(sa.Integer)
    base_minutes: Mapped[int | None] = mapped_column(sa.Integer)
    per_unit_minutes: Mapped[Decimal | None] = mapped_column(sa.Numeric(7, 2))
    min_minutes: Mapped[int | None] = mapped_column(sa.Integer)
    max_minutes: Mapped[int | None] = mapped_column(sa.Integer)
