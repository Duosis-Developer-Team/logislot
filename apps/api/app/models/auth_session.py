import uuid
from datetime import datetime

import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, UUIDPkMixin


class AuthSession(Base, UUIDPkMixin):
    """Refresh token oturumu (rotation icin).

    Her login bir oturum acar; her refresh eski jti'yi revoke edip yenisini
    uretir. Logout kullanicinin TUM aktif oturumlarini kapatir (karar).
    Access token'lar stateless kalir (kisa omurlu).
    """

    __tablename__ = "auth_sessions"

    user_type: Mapped[str] = mapped_column(sa.String(10))  # platform/tenant/supplier
    user_id: Mapped[uuid.UUID] = mapped_column(sa.Uuid, index=True)
    refresh_jti: Mapped[uuid.UUID] = mapped_column(sa.Uuid, unique=True, index=True)
    revoked_at: Mapped[datetime | None] = mapped_column(sa.DateTime(timezone=True))
    expires_at: Mapped[datetime] = mapped_column(sa.DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        sa.DateTime(timezone=True), server_default=sa.func.now()
    )
    last_used_at: Mapped[datetime | None] = mapped_column(sa.DateTime(timezone=True))
    user_agent: Mapped[str | None] = mapped_column(sa.String(255))
    ip_hash: Mapped[str | None] = mapped_column(sa.String(64))
