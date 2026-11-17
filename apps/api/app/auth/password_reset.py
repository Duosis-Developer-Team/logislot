"""Self-servis sifre sifirlama ve kullanici adi hatirlatma uclari.

Uclarin TAMAMI kimlik dogrulamasizdir; bu yuzden:
- istek uclari hesap var/yok bilgisini ASLA sizdirmaz (tek genel yanit,
  arama/gonderim yanittan sonra arka planda),
- tum uclar IP+anahtar bazli hiz sinirina tabidir,
- token API yanitinda ASLA donmez; yalnizca e-postayla gider.
Ayrintili tasarim: app/services/password_reset.py.
"""

import logging
from datetime import UTC, datetime

from fastapi import APIRouter, BackgroundTasks, Request
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.config import get_settings
from app.core.db import location_for_tenant, session_scope
from app.core.enums import ActorType, SupplierStatus, UserStatus
from app.core.errors import ApiError
from app.core.passwords import validate_password_policy
from app.core.ratelimit import client_ip, enforce_rate_limit
from app.core.responses import ok
from app.core.security import hash_password, verify_password
from app.core.tenancy_runtime import CONTROL_LOCATION
from app.models import SupplierUser, TenantUser
from app.schemas.auth import (
    PasswordResetConfirm,
    PasswordResetRequest,
    UsernameReminderRequest,
)
from app.services import password_reset as svc
from app.services.audit import record_audit
from app.services.auth_sessions import revoke_user_sessions

logger = logging.getLogger("logislot.password_reset")

router = APIRouter(prefix="/auth", tags=["auth"])

GENERIC_RESET_MESSAGE = (
    "Bu adres kayitliysa sifre sifirlama baglantisini gonderdik. "
    "Lutfen gelen kutunuzu kontrol edin."
)
GENERIC_USERNAME_MESSAGE = (
    "Bu adres bir tedarikci firmasina kayitliysa kullanici adlarinizi "
    "bu adrese gonderdik."
)
INVALID_TOKEN_MESSAGE = (
    "Sifre sifirlama baglantisi gecersiz veya suresi dolmus. "
    "Lutfen yeni bir baglanti isteyin."
)


def _invalid_token() -> ApiError:
    return ApiError("INVALID_RESET_TOKEN", INVALID_TOKEN_MESSAGE, 400)


async def _safe(coro_fn, *args) -> None:
    """Arka plan isi: hata yanita sizmaz, yalnizca loglanir."""
    try:
        await coro_fn(*args)
    except Exception:  # noqa: BLE001
        logger.exception("self-servis e-posta isi basarisiz")


@router.post("/password-reset/request")
async def password_reset_request(
    body: PasswordResetRequest, request: Request, background: BackgroundTasks
):
    # IP basina genel + IP/e-posta basina dar sinir (posta kutusu bombardimani).
    enforce_rate_limit(request, "pw_reset_req_ip", "-", times=20, per_seconds=300)
    enforce_rate_limit(request, "pw_reset_req", body.email.lower(), times=3, per_seconds=300)
    background.add_task(_safe, svc.send_password_reset, str(body.email), body.portal)
    return ok({"accepted": True, "message": GENERIC_RESET_MESSAGE})


@router.post("/username-reminder/request")
async def username_reminder_request(
    body: UsernameReminderRequest, request: Request, background: BackgroundTasks
):
    """Yalnizca Tedarikci Portali: yonetim kullanicilarinin kullanici adi
    e-postalarinin kendisidir ve hatirlatma tesis yoneticisi uzerinden yapilir."""
    enforce_rate_limit(request, "user_rem_ip", "-", times=20, per_seconds=300)
    enforce_rate_limit(request, "user_rem", body.email.lower(), times=3, per_seconds=300)
    background.add_task(_safe, svc.send_supplier_username_reminder, str(body.email))
    return ok({"accepted": True, "message": GENERIC_USERNAME_MESSAGE})


@router.post("/password-reset/confirm")
async def password_reset_confirm(body: PasswordResetConfirm, request: Request):
    enforce_rate_limit(
        request, "pw_reset_confirm", "-",
        times=get_settings().login_rate_limit_attempts,
    )
    try:
        claims = svc.decode_reset_token(body.token, body.portal)
    except svc.InvalidResetToken:
        raise _invalid_token() from None

    user_type = svc.PORTAL_USER_TYPES[body.portal]
    tenant_id = claims["tid"]
    location = CONTROL_LOCATION if tenant_id is None else await location_for_tenant(tenant_id)
    async with session_scope(location) as db:
        if user_type == "supplier":
            user = (
                await db.execute(
                    select(SupplierUser)
                    .options(selectinload(SupplierUser.supplier))
                    .where(SupplierUser.id == claims["sub"])
                )
            ).scalar_one_or_none()
            active = (
                user is not None
                and user.status == UserStatus.active
                and user.supplier.status == SupplierStatus.active
                and (tenant_id is None or user.supplier.tenant_id == tenant_id)
            )
            facility_id = user.supplier.facility_id if user is not None else None
        else:
            user = (
                await db.execute(select(TenantUser).where(TenantUser.id == claims["sub"]))
            ).scalar_one_or_none()
            active = (
                user is not None
                and user.status == UserStatus.active
                and (tenant_id is None or user.tenant_id == tenant_id)
            )
            facility_id = user.default_facility_id if user is not None else None
        # Parmak izi tutmuyorsa token zaten kullanilmis (ya da parola baska
        # yoldan degismis) demektir -> tek kullanimlik.
        if not active or claims["fp"] != svc.password_fingerprint(user.password_hash):
            raise _invalid_token()

        if verify_password(body.new_password, user.password_hash):
            raise ApiError("SAME_PASSWORD", "Yeni parola eskisiyle ayni olamaz", 422)
        validate_password_policy(body.new_password)

        user.password_hash = hash_password(body.new_password)
        user.must_change_password = False
        user.password_changed_at = datetime.now(UTC)
        revoked = await revoke_user_sessions(db, user_type=user_type, user_id=user.id)
        record_audit(
            db,
            actor_type=(
                ActorType.supplier_user if user_type == "supplier" else ActorType.tenant_user
            ),
            actor_id=user.id,
            action="auth.password_reset",
            tenant_id=tenant_id,
            facility_id=facility_id,
            metadata={
                "email": user.email,
                "revoked_sessions": revoked,
                "ip": client_ip(request),
            },
        )
        await db.commit()
    return ok({"reset": True})
