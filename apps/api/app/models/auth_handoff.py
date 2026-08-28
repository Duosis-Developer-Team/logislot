"""Alan adlari arasi oturum devri icin tek kullanimlik kodlar.

Neden gerekli: oturum `localStorage`'da tutulur ve localStorage ORIGIN'e
baglidir. `yonetim.logislot.io` uzerinde acilan oturumu `cknb.logislot.io`
OKUYAMAZ; markali alt alana duz bir yonlendirme kullaniciyi login ekranina
geri dusururdu.

Neden token'i URL'e koymuyoruz: adres cubugundaki token taryici gecmisine,
eklentilere ve ekran paylasimina sizar ve uzun omurludur. Bunun yerine kaynak
origin kisa omurlu, TEK KULLANIMLIK bir kod alir; hedef origin kodu token ile
takas eder. Kod URL'e dusse bile saniyeler icinde ve ilk kullanimda olur.

Tablo CONTROL-PLANE'dedir: kod tuketilirken hangi tenant oldugu HENUZ
BILINMEZ, dolayisiyla tenant semasindan cevaplanamaz.
"""

import uuid
from datetime import datetime

import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import CONTROL_SCHEMA, Base, UUIDPkMixin


class AuthHandoffCode(Base, UUIDPkMixin):
    __tablename__ = "auth_handoff_codes"
    __table_args__ = ({"schema": CONTROL_SCHEMA},)

    #: Kodun KENDISI saklanmaz; yalnizca sha256 ozeti. Veritabanini okuyan
    #: birinin gecerli bir kod uretememesi icin.
    code_hash: Mapped[str] = mapped_column(sa.String(64), unique=True, index=True)
    user_type: Mapped[str] = mapped_column(sa.String(10))
    user_id: Mapped[uuid.UUID] = mapped_column(sa.Uuid, index=True)
    tenant_id: Mapped[uuid.UUID | None] = mapped_column(sa.Uuid)
    #: Kodun yalnizca bu origin'den tuketilebilecegi alan adi. Calinan bir kod
    #: baska bir yerden kullanilamasin diye `Origin` basligiyla karsilastirilir.
    target_host: Mapped[str] = mapped_column(sa.String(255))
    expires_at: Mapped[datetime] = mapped_column(sa.DateTime(timezone=True))
    consumed_at: Mapped[datetime | None] = mapped_column(sa.DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        sa.DateTime(timezone=True), server_default=sa.func.now()
    )
