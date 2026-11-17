"""Self-servis "Sifremi unuttum" ve "Kullanici adimi unuttum".

Tasarim kararlari:

- **Token DURUMSUZDUR** (migration yok): JWT, uygulama sirrindan TURETILMIS
  ayri bir anahtarla imzalanir. Bu yuzden bir sifirlama token'i hicbir
  zaman access/refresh token yerine gecemez (imza tutmaz) ve tersi de olmaz.
- **Tek kullanimlik:** token, kullanicinin MEVCUT parola hash'inin parmak
  izini tasir. Argon2 hash'i tuzlu oldugu icin parola degistigi anda (ayni
  parola yeniden yazilsa bile) parmak izi degisir ve token olur.
- **Portal baglidir:** token hangi portal icin uretildiyse yalnizca o
  portalin sayfasindan tuketilebilir. Platform kullanicilari bu akisa
  HIC girmez (gizli portal hicbir public yuzeyde gorunmez).
- **Hesap kesfi yok:** istek uclari her durumda ayni genel yaniti doner;
  arama ve gonderim yanit gonderildikten SONRA arka planda calisir, boylece
  yanit suresi de hesabin varligini ele vermez.
- E-postalar normal hattan (send_email -> tenant'in email_logs'u) gider.
"""

import hashlib
import hmac
import logging
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any, Literal
from urllib.parse import quote

import jwt
from sqlalchemy import or_, select
from sqlalchemy.orm import selectinload

from app.core.config import get_settings
from app.core.db import control_session, location_for_tenant, session_scope
from app.core.enums import SupplierStatus, TenantStatus, UserStatus
from app.core.tenancy_runtime import CONTROL_LOCATION
from app.models import Facility, Supplier, SupplierUser, Tenant, TenantUser
from app.services.email import EmailMessage, send_email
from app.tenancy.directory import tenant_for_email

logger = logging.getLogger("logislot.password_reset")

ResetPortal = Literal["supplier", "admin"]

#: portal -> (model, dizindeki kimlik tipi)
PORTAL_USER_TYPES: dict[str, str] = {"supplier": "supplier", "admin": "tenant"}

TOKEN_PURPOSE = "password_reset"
TOKEN_TTL_MINUTES = 30


class InvalidResetToken(Exception):
    """Token gecersiz, suresi dolmus, kullanilmis ya da yanlis portala ait."""


# ------------------------------------------------------------------ token


def _signing_key() -> str:
    """Uygulama sirrindan amaca ozel anahtar turetir (oturum token'larindan ayri)."""
    secret = get_settings().secret_key.encode()
    return hmac.new(secret, b"logislot:password-reset:v1", hashlib.sha256).hexdigest()


def password_fingerprint(password_hash: str) -> str:
    """Parola hash'inin anahtarli parmak izi (hash'in kendisi token'a girmez)."""
    secret = get_settings().secret_key.encode()
    return hmac.new(secret, password_hash.encode(), hashlib.sha256).hexdigest()[:32]


def create_reset_token(
    *,
    portal: ResetPortal,
    user_id: uuid.UUID,
    tenant_id: uuid.UUID | None,
    password_hash: str,
    now: datetime | None = None,
) -> str:
    now = now or datetime.now(UTC)
    payload: dict[str, Any] = {
        "purpose": TOKEN_PURPOSE,
        "portal": portal,
        "sub": str(user_id),
        "tid": str(tenant_id) if tenant_id else None,
        "fp": password_fingerprint(password_hash),
        "iat": now,
        "exp": now + timedelta(minutes=TOKEN_TTL_MINUTES),
    }
    return jwt.encode(payload, _signing_key(), algorithm="HS256")


def decode_reset_token(token: str, portal: str) -> dict[str, Any]:
    """Imza + sure + amac + portal kontrolu. Hata durumunda InvalidResetToken."""
    try:
        payload = jwt.decode(
            token,
            _signing_key(),
            algorithms=["HS256"],
            options={"require": ["exp", "sub", "purpose", "portal", "fp"]},
        )
    except jwt.PyJWTError as exc:
        raise InvalidResetToken() from exc
    if payload.get("purpose") != TOKEN_PURPOSE:
        raise InvalidResetToken()
    if payload.get("portal") not in PORTAL_USER_TYPES or payload["portal"] != portal:
        raise InvalidResetToken()
    try:
        payload["sub"] = uuid.UUID(str(payload["sub"]))
        payload["tid"] = uuid.UUID(str(payload["tid"])) if payload.get("tid") else None
    except ValueError as exc:
        raise InvalidResetToken() from exc
    return payload


# ------------------------------------------------------------------ linkler


def portal_base_url(portal: str) -> str:
    """E-posta linklerinin taban adresi.

    LOGISLOT_SUPPLIER_PORTAL_URL / LOGISLOT_ADMIN_PORTAL_URL verilmisse o portalin
    kendi deployment'ina gider; yoksa public_web_url'e (entry/"all" modu)
    dusulur — web tarafi bu sayfalari entry modunda da `?portal=` ile sunar.
    """
    settings = get_settings()
    explicit = (
        settings.supplier_portal_url if portal == "supplier" else settings.admin_portal_url
    )
    return (explicit or settings.public_web_url).rstrip("/")


def reset_link(portal: str, token: str) -> str:
    return f"{portal_base_url(portal)}/reset-password?portal={portal}&token={quote(token)}"


def forgot_password_link(portal: str) -> str:
    return f"{portal_base_url(portal)}/forgot-password?portal={portal}"


def login_link(portal: str) -> str:
    return f"{portal_base_url(portal)}/login"


# --------------------------------------------------------------- yardimcilar


async def _facility_id_for_tenant(db, tenant_id: uuid.UUID) -> uuid.UUID | None:
    return (
        await db.execute(select(Facility.id).where(Facility.tenant_id == tenant_id))
    ).scalars().first()


async def _location_for_principal(user_type: str, email: str):
    async with control_session() as control_db:
        hit = await tenant_for_email(control_db, user_type, email)
    if hit is None:
        return CONTROL_LOCATION
    return await location_for_tenant(hit[0])


def _normalize(email: str) -> str:
    return email.strip()


# ------------------------------------------------------- sifremi unuttum


async def send_password_reset(email: str, portal: ResetPortal) -> bool:
    """Hesap varsa ve aktifse sifirlama baglantisini gonderir.

    Donus degeri yalnizca test/loglama icindir; API yanitina ASLA yansimaz.
    """
    email = _normalize(email)
    user_type = PORTAL_USER_TYPES[portal]
    location = await _location_for_principal(user_type, email)
    async with session_scope(location) as db:
        if portal == "supplier":
            user = (
                await db.execute(
                    select(SupplierUser)
                    .options(selectinload(SupplierUser.supplier))
                    .where(SupplierUser.email == email)
                )
            ).scalar_one_or_none()
            if (
                user is None
                or user.status != UserStatus.active
                or user.supplier.status != SupplierStatus.active
            ):
                return False
            tenant_id = user.supplier.tenant_id
            facility_id = user.supplier.facility_id
        else:
            user = (
                await db.execute(select(TenantUser).where(TenantUser.email == email))
            ).scalar_one_or_none()
            if user is None or user.status != UserStatus.active:
                return False
            tenant_id = user.tenant_id
            facility_id = user.default_facility_id or await _facility_id_for_tenant(
                db, tenant_id
            )
        if facility_id is None:
            # email_logs tesis kapsamli; tesisi olmayan tenant'a log yazilamaz.
            logger.warning("password reset: tenant %s icin tesis yok", tenant_id)
            return False

        token = create_reset_token(
            portal=portal,
            user_id=user.id,
            tenant_id=tenant_id,
            password_hash=user.password_hash,
        )
        portal_name = "Tedarikçi Portalı" if portal == "supplier" else "Yönetim Paneli"
        body = (
            f"Sayın {user.name},\n\n"
            f"LogiSlot {portal_name} hesabınız ({user.email}) için şifre sıfırlama "
            "talebi aldık. Yeni şifrenizi belirlemek için aşağıdaki bağlantıyı "
            f"kullanın (bağlantı {TOKEN_TTL_MINUTES} dakika geçerlidir ve "
            "yalnızca bir kez kullanılabilir):\n\n"
            f"{reset_link(portal, token)}\n\n"
            "Bu talebi siz yapmadıysanız bu e-postayı dikkate almayın; "
            "şifreniz değişmeyecektir.\n\n"
            "LogiSlot"
        )
        await send_email(
            db,
            EmailMessage(
                tenant_id=tenant_id,
                facility_id=facility_id,
                recipient_email=user.email,
                recipient_name=user.name,
                subject="LogiSlot şifre sıfırlama",
                body=body,
                template_key="password_reset",
                metadata={"portal": portal},
            ),
        )
        await db.commit()
        return True


# ------------------------------------------------ kullanici adimi unuttum


def _matches(supplier: Supplier, email: str) -> bool:
    needle = email.lower()
    if supplier.contact_email and supplier.contact_email.strip().lower() == needle:
        return True
    return any(
        isinstance(extra, str) and extra.strip().lower() == needle
        for extra in (supplier.additional_emails or [])
    )


async def send_supplier_username_reminder(email: str) -> int:
    """Firma iletisim / ek bildirim adresine portal kullanici adlarini gonderir.

    Hatirlatma YALNIZCA girilen adrese gider ve yalnizca o adresin kayitli
    oldugu tedarikci firmalarinin AKTIF portal hesaplarini listeler. Donus:
    gonderilen e-posta sayisi (test/log icin; API yanitina yansimaz).
    """
    from app.tenancy.fanout import gather_by_tenant

    email = _normalize(email)
    if not email:
        return 0
    async with control_session() as control_db:
        tenant_ids = list(
            (
                await control_db.execute(
                    select(Tenant.id).where(
                        Tenant.status.in_([TenantStatus.active, TenantStatus.trial])
                    )
                )
            ).scalars()
        )

    lowered = email.lower()

    async def load(db, tenant_id: uuid.UUID) -> int:
        # Aday daraltma SQL'de; ek adresler (JSON listesi) Python'da eslenir.
        from sqlalchemy import func

        candidates = (
            await db.execute(
                select(Supplier)
                .options(selectinload(Supplier.users))
                .where(
                    Supplier.tenant_id == tenant_id,
                    Supplier.status == SupplierStatus.active,
                    or_(
                        func.lower(Supplier.contact_email) == lowered,
                        Supplier.additional_emails.is_not(None),
                    ),
                )
            )
        ).scalars().all()
        sent = 0
        for supplier in candidates:
            if not _matches(supplier, email):
                continue
            accounts = sorted(
                u.email for u in supplier.users if u.status == UserStatus.active
            )
            if not accounts:
                continue
            listing = "\n".join(f"  • {a}" for a in accounts)
            body = (
                "Merhaba,\n\n"
                f"Bu adres LogiSlot'ta {supplier.company_name} firmasının iletişim "
                "adresi olarak kayıtlı. Firmanızın Tedarikçi Portalı kullanıcı "
                "adları (giriş e-postaları) şunlardır:\n\n"
                f"{listing}\n\n"
                f"Giriş: {login_link('supplier')}\n"
                f"Şifrenizi de hatırlamıyorsanız: {forgot_password_link('supplier')}\n\n"
                "Bu talebi siz yapmadıysanız bu e-postayı dikkate almayın.\n\n"
                "LogiSlot"
            )
            await send_email(
                db,
                EmailMessage(
                    tenant_id=supplier.tenant_id,
                    facility_id=supplier.facility_id,
                    recipient_email=email,
                    subject="LogiSlot kullanıcı adı hatırlatma",
                    body=body,
                    template_key="username_reminder",
                    metadata={"supplier_id": str(supplier.id)},
                ),
            )
            sent += 1
        if sent:
            await db.commit()
        return sent

    results = await gather_by_tenant(tenant_ids, load)
    return sum(results.values())
