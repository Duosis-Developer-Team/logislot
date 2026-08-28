"""Alan adlari arasi oturum devri.

Sorun: oturum `localStorage`'da tutulur ve localStorage ORIGIN'e baglidir.
`yonetim.logislot.io` uzerinde acilan oturumu `cknb.logislot.io` okuyamaz, yani
markali alt alana duz bir yonlendirme kullaniciyi login ekranina geri dusurur.

Cozum: kaynak origin kisa omurlu ve TEK KULLANIMLIK bir kod alir, hedef origin
kodu yeni bir token cifti ile takas eder. Token'in kendisi hicbir zaman URL'e
konmaz.

Kodu koruyan dort sey (dordu de gerekli):
  1. kod yalnizca sha256 ozeti olarak saklanir,
  2. omru saniyeler duzeyindedir,
  3. tuketim ATOMIKTIR — ayni kod iki kez token'a donusemez,
  4. yalnizca hedef alan adinin origin'inden tuketilebilir.
"""

import hashlib
import secrets
import uuid
from datetime import UTC, datetime, timedelta

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AuthHandoffCode

#: Kod yalnizca "giris yapildi -> yonlendirildi" araligini yasar. Uzatmak,
#: URL'e dusen bir kodun kullanilabilir kalma suresini uzatir.
CODE_TTL_SECONDS = 30


def _hash(code: str) -> str:
    return hashlib.sha256(code.encode("utf-8")).hexdigest()


async def issue_code(
    control_db: AsyncSession,
    *,
    user_type: str,
    user_id: uuid.UUID,
    tenant_id: uuid.UUID | None,
    target_host: str,
) -> str:
    """Tek kullanimlik kod uretir ve OZETINI kaydeder. Ham kodu dondurur."""
    code = secrets.token_urlsafe(32)
    control_db.add(
        AuthHandoffCode(
            code_hash=_hash(code),
            user_type=user_type,
            user_id=user_id,
            tenant_id=tenant_id,
            target_host=target_host,
            expires_at=datetime.now(UTC) + timedelta(seconds=CODE_TTL_SECONDS),
        )
    )
    await control_db.commit()
    return code


async def consume_code(
    control_db: AsyncSession, *, code: str, origin_host: str
) -> AuthHandoffCode | None:
    """Kodu ATOMIK olarak tuketir. Gecersiz/suresi gecmis/kullanilmissa None.

    Tek UPDATE ... RETURNING kullanilir: "once oku, sonra isaretle" olsaydi iki
    es zamanli istek ayni kodu iki oturuma cevirebilirdi.
    """
    now = datetime.now(UTC)
    result = await control_db.execute(
        sa.update(AuthHandoffCode)
        .where(
            AuthHandoffCode.code_hash == _hash(code),
            AuthHandoffCode.consumed_at.is_(None),
            AuthHandoffCode.expires_at > now,
            # Calinan bir kod baska bir origin'den kullanilamaz.
            AuthHandoffCode.target_host == origin_host,
        )
        .values(consumed_at=now)
        .returning(AuthHandoffCode)
    )
    row = result.scalar_one_or_none()
    await control_db.commit()
    return row


async def purge_expired(control_db: AsyncSession) -> int:
    """Suresi gecmis/kullanilmis kodlari siler. Kayitlarin saklanma degeri yok."""
    result = await control_db.execute(
        sa.delete(AuthHandoffCode).where(
            sa.or_(
                AuthHandoffCode.expires_at < datetime.now(UTC) - timedelta(hours=1),
                AuthHandoffCode.consumed_at.isnot(None),
            )
        )
    )
    await control_db.commit()
    return result.rowcount or 0
