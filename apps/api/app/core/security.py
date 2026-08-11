"""Parola hash (Argon2) ve JWT uretim/dogrulama.

Token'lar `user_type` claim'i tasir: platform / tenant / supplier.
Platform ve tenant izin uzaylari asla ayni token'da birlesmez.
"""

import uuid
from datetime import UTC, datetime, timedelta
from typing import Any, Literal

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError

from app.core.config import get_settings

UserType = Literal["platform", "tenant", "supplier"]

_hasher = PasswordHasher()


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return _hasher.verify(password_hash, password)
    except VerifyMismatchError:
        return False


def _create_token(
    subject: uuid.UUID | str,
    user_type: UserType,
    token_type: Literal["access", "refresh"],
    expires_minutes: int,
    jti: uuid.UUID | None = None,
    tenant_id: uuid.UUID | None = None,
) -> str:
    settings = get_settings()
    now = datetime.now(UTC)
    payload: dict[str, Any] = {
        "sub": str(subject),
        "user_type": user_type,
        "token_type": token_type,
        "iat": now,
        "exp": now + timedelta(minutes=expires_minutes),
    }
    if jti is not None:
        payload["jti"] = str(jti)
    # `tid`: istegin hangi tenant semasina yonlendirilecegi. Token IMZALI
    # oldugundan istemci bunu degistiremez. Claim'i tasimayan eski tokenlar
    # control.principal_directory uzerinden cozulur (bkz. core/db.py).
    if tenant_id is not None:
        payload["tid"] = str(tenant_id)
    return jwt.encode(payload, settings.secret_key, algorithm=settings.jwt_algorithm)


def create_access_token(
    subject: uuid.UUID | str, user_type: UserType, tenant_id: uuid.UUID | None = None
) -> str:
    return _create_token(
        subject, user_type, "access", get_settings().access_token_expire_minutes,
        tenant_id=tenant_id,
    )


def create_refresh_token(
    subject: uuid.UUID | str,
    user_type: UserType,
    jti: uuid.UUID,
    tenant_id: uuid.UUID | None = None,
) -> str:
    """Refresh token her zaman bir oturum jti'sine baglidir (rotation)."""
    return _create_token(
        subject, user_type, "refresh",
        get_settings().refresh_token_expire_minutes, jti=jti,
        tenant_id=tenant_id,
    )


def decode_token(token: str) -> dict[str, Any]:
    """Gecersiz/suresi dolmus token'da jwt.PyJWTError firlatir."""
    settings = get_settings()
    return jwt.decode(token, settings.secret_key, algorithms=[settings.jwt_algorithm])
