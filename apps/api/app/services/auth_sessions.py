"""Refresh oturum yonetimi (rotation — Option A).

- Login yeni oturum acar (jti).
- Refresh: jti dogrulanir -> eski oturum revoke edilir -> yeni oturum + token.
- Eski/revoked/expired jti ile refresh 401.
- Logout kullanicinin TUM aktif oturumlarini kapatir (karar: logout-everywhere).
"""

import hashlib
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.errors import UnauthorizedError
from app.core.security import create_access_token, create_refresh_token
from app.models import AuthSession


def _ip_hash(ip: str | None) -> str | None:
    if not ip:
        return None
    return hashlib.sha256(ip.encode()).hexdigest()[:32]


async def open_session(
    db: AsyncSession,
    *,
    user_type: str,
    user_id: uuid.UUID,
    user_agent: str | None = None,
    ip: str | None = None,
) -> tuple[str, str]:
    """Yeni oturum acar; (access_token, refresh_token) dondurur."""
    jti = uuid.uuid4()
    settings = get_settings()
    db.add(
        AuthSession(
            user_type=user_type,
            user_id=user_id,
            refresh_jti=jti,
            expires_at=datetime.now(UTC)
            + timedelta(minutes=settings.refresh_token_expire_minutes),
            user_agent=(user_agent or "")[:255] or None,
            ip_hash=_ip_hash(ip),
        )
    )
    return (
        create_access_token(user_id, user_type),  # type: ignore[arg-type]
        create_refresh_token(user_id, user_type, jti),  # type: ignore[arg-type]
    )


async def rotate_session(
    db: AsyncSession,
    *,
    jti: uuid.UUID,
    user_type: str,
    user_id: uuid.UUID,
    user_agent: str | None = None,
    ip: str | None = None,
) -> tuple[str, str]:
    """Eski oturumu kapatip yenisini acar; gecersiz jti'de 401."""
    session = (
        await db.execute(select(AuthSession).where(AuthSession.refresh_jti == jti))
    ).scalar_one_or_none()
    now = datetime.now(UTC)
    expires_at = None
    if session is not None:
        expires_at = session.expires_at
        if expires_at.tzinfo is None:  # SQLite naive doner
            expires_at = expires_at.replace(tzinfo=UTC)
    if (
        session is None
        or session.revoked_at is not None
        or session.user_id != user_id
        or session.user_type != user_type
        or (expires_at is not None and expires_at < now)
    ):
        raise UnauthorizedError("Gecersiz veya kullanilmis refresh token")
    session.revoked_at = now
    session.last_used_at = now
    tokens = await open_session(
        db, user_type=user_type, user_id=user_id, user_agent=user_agent, ip=ip
    )
    await db.commit()
    return tokens


async def revoke_user_sessions(
    db: AsyncSession, *, user_type: str, user_id: uuid.UUID
) -> int:
    result = await db.execute(
        update(AuthSession)
        .where(
            AuthSession.user_type == user_type,
            AuthSession.user_id == user_id,
            AuthSession.revoked_at.is_(None),
        )
        .values(revoked_at=datetime.now(UTC))
    )
    return result.rowcount or 0
