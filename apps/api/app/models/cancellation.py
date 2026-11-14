"""Tedarikci iptal sebepleri — FIRMANIN KENDI tanimladigi liste.

Musteri karari (2026-11 toplantisi): tedarikci iptal ederken "daha onceden
belirlenmis" listeden secer; listeyi tesis yonetimi duzenler. Randevuya
sebebin kimligi ve O ANKI etiketi birlikte yazilir: sebep sonradan yeniden
adlandirilsa veya silinse de gecmis randevunun kaydi degismez.
"""

import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, FacilityScopedMixin, TimestampMixin, UUIDPkMixin

#: Yeni tesislere ve migration aninda mevcut tesislere eklenen baslangic listesi.
#: Musteri "aciklama istege bagli" dedigi icin hicbiri aciklama zorunlu degildir;
#: yonetim isterse sebep bazinda acar.
DEFAULT_CANCELLATION_REASONS: tuple[str, ...] = (
    "Ürün / stok hazır değil",
    "Araç / nakliye sorunu",
    "Sürücü bulunamadı",
    "Sipariş iptal edildi / değişti",
    "Hava / yol koşulları",
    "Randevu yanlışlıkla oluşturuldu",
    "Diğer",
)

#: Bir tesiste tanimlanabilecek en fazla sebep sayisi (liste ekranda okunur kalsin).
MAX_CANCELLATION_REASONS = 30
REASON_LABEL_MAX = 120


class CancellationReason(Base, UUIDPkMixin, TimestampMixin, FacilityScopedMixin):
    __tablename__ = "cancellation_reasons"

    label: Mapped[str] = mapped_column(sa.String(REASON_LABEL_MAX))
    # Bu sebep secildiginde aciklama zorunlu mu (varsayilan: hayir).
    note_required: Mapped[bool] = mapped_column(
        sa.Boolean, default=False, server_default=sa.false()
    )
    # Pasif sebep tedarikciye gosterilmez; gecmis randevularda etiket korunur.
    is_active: Mapped[bool] = mapped_column(sa.Boolean, default=True, server_default=sa.true())
    position: Mapped[int] = mapped_column(sa.Integer, default=0, server_default="0")
