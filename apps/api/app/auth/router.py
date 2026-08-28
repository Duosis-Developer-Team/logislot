"""Login/refresh/me endpointleri.

Uc ayri login endpoint'i vardir (API_SPEC): tenant, supplier, platform.
Her basarili/basarisiz giris audit log uretir.
"""

import uuid
from contextlib import asynccontextmanager
from datetime import UTC, datetime

import jwt as pyjwt
from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth.deps import Identity, get_identity
from app.core.config import get_settings
from app.core.db import (
    control_session,
    get_control_db,
    get_db,
    location_for_tenant,
    session_scope,
)
from app.core.enums import ActorType, SupplierStatus, UserStatus
from app.core.errors import ApiError, UnauthorizedError
from app.core.passwords import validate_password_policy
from app.core.ratelimit import client_ip, enforce_rate_limit
from app.core.responses import ok
from app.core.security import decode_token, hash_password, verify_password
from app.core.tenancy_runtime import CONTROL_LOCATION, TenantLocation
from app.models import (
    Facility,
    FacilityMembership,
    PlatformUser,
    PrincipalDirectory,
    Supplier,
    SupplierUser,
    Tenant,
    TenantUser,
)
from app.schemas.auth import (
    ChangePasswordRequest,
    FacilitySummary,
    HandoffConsumeRequest,
    LoginRequest,
    MeResponse,
    NotificationPreferencesPatch,
    RefreshRequest,
    TokenPair,
)
from app.services import auth_handoff
from app.services.audit import record_audit
from app.services.auth_sessions import open_session, revoke_user_sessions, rotate_session
from app.tenancy.directory import tenant_for_email

router = APIRouter(prefix="/auth", tags=["auth"])

_ACTOR_TYPES = {
    "platform": ActorType.platform_user,
    "tenant": ActorType.tenant_user,
    "supplier": ActorType.supplier_user,
}

#: Login endpointi -> kabul ettigi portal degeri. Endpoint ayrimi zaten
#: cross-portal login'i tablo bazinda engeller; opsiyonel `portal` alani
#: portal-specific client'lar icin ek/dogrudan bir sozlesme saglar.
_PORTAL_ERRORS = {
    "supplier": (
        "Bu hesap Tedarikci Portali icin yetkili degil. "
        "Lutfen dogru portal uzerinden giris yapin."
    ),
    "admin": (
        "Bu hesap Yonetim Paneli icin yetkili degil. "
        "Lutfen dogru portal uzerinden giris yapin."
    ),
    "platform": "Bu hesap Platform Yonetimi icin yetkili degil.",
}


def _enforce_portal(body: LoginRequest, expected: str) -> None:
    """Opsiyonel portal parametresi endpoint'in portali ile uyusmali.

    portal gonderilmediyse (eski payload) hicbir sey degismez —
    backward-compatible.
    """
    if body.portal is not None and body.portal != expected:
        raise UnauthorizedError(_PORTAL_ERRORS[body.portal])


async def _location_for_login(
    control_db: AsyncSession, user_type: str, email: str
) -> TenantLocation:
    """Login'in hangi veri alaninda aranacagini belirler.

    Dizinde kayit yoksa (henuz tasinmamis tenant) eski ortak yerlesime
    dusulur — boylece gecis doneminde mevcut kullanicilar giris yapmaya
    devam eder.
    """
    hit = await tenant_for_email(control_db, user_type, email)
    if hit is None:
        return CONTROL_LOCATION
    return await location_for_tenant(hit[0])


@asynccontextmanager
async def _login_session(control_db: AsyncSession, user_type: str, email: str):
    location = await _location_for_login(control_db, user_type, email)
    async with session_scope(location) as db:
        yield db


async def _wrong_portal_error(
    control_db: AsyncSession, email: str, password: str, current_portal: str
) -> str | None:
    """Yanlis portalda DOGRULANMIS kimlik icin net hata uretir.

    Kullanici parolasini dogru girdiyse ama hesabi BASKA bir portala aitse
    genel "e-posta veya parola hatali" yerine dogru yonlendiren mesaj doner.
    Parola dogrulanmadan hicbir sey soylenmez — hesap kesfi (enumeration)
    sizdirmaz. Yalnizca basarisiz login dalinda calisir (2 ek sorgu).
    """
    #: portal -> (model, dizindeki kimlik tipi). Platform kullanicilari
    #: control-plane'de yasar ve dizine girmez.
    others: dict[str, tuple[type, str | None]] = {
        "admin": (TenantUser, "tenant"),
        "supplier": (SupplierUser, "supplier"),
        "platform": (PlatformUser, None),
    }
    others.pop(current_portal)
    for model, directory_type in others.values():
        if directory_type is None:
            location = CONTROL_LOCATION
        else:
            location = await _location_for_login(control_db, directory_type, email)
        async with session_scope(location) as probe:
            candidate = (
                await probe.execute(select(model).where(model.email == email))
            ).scalar_one_or_none()
        if candidate is not None and verify_password(password, candidate.password_hash):
            return _PORTAL_ERRORS[current_portal]
    return None


async def _audit_login(
    db: AsyncSession,
    user_type: str,
    user_id: uuid.UUID | None,
    success: bool,
    email: str,
) -> None:
    record_audit(
        db,
        actor_type=_ACTOR_TYPES[user_type],
        actor_id=user_id,
        action="auth.login" if success else "auth.login_failed",
        metadata={"email": email},
    )
    await db.commit()


#: Portal -> tenant kaydindaki markali alan adi kolonu.
_BRANDED_HOST_FIELD = {"tenant": "admin_host", "supplier": "supplier_host"}


async def _branded_host(
    control_db: AsyncSession, user_type: str, tenant_id: uuid.UUID | None
) -> str | None:
    """Bu kullanicinin portali icin tenant'a ozel alan adi (yoksa None).

    Platform kullanicilarinin tenant'i yoktur; markali alan adi da yoktur.
    """
    field = _BRANDED_HOST_FIELD.get(user_type)
    if field is None or tenant_id is None:
        return None
    host = (
        await control_db.execute(
            select(getattr(Tenant, field)).where(Tenant.id == tenant_id)
        )
    ).scalar_one_or_none()
    return host or None


async def _token_pair(
    db: AsyncSession,
    request: Request,
    user_id: uuid.UUID,
    user_type: str,
    tenant_id: uuid.UUID | None = None,
) -> TokenPair:
    access, refresh = await open_session(
        db,
        user_type=user_type,
        user_id=user_id,
        user_agent=request.headers.get("user-agent"),
        ip=client_ip(request),
        tenant_id=tenant_id,
    )
    return TokenPair(access_token=access, refresh_token=refresh)


@router.post("/login")
async def tenant_login(
    body: LoginRequest,
    request: Request,
    control_db: AsyncSession = Depends(get_control_db),
):
    _enforce_portal(body, "admin")
    enforce_rate_limit(
        request, "login", body.email,
        times=get_settings().login_rate_limit_attempts,
    )
    async with _login_session(control_db, "tenant", body.email) as db:
        result = await db.execute(select(TenantUser).where(TenantUser.email == body.email))
        user = result.scalar_one_or_none()
        if user is None or not verify_password(body.password, user.password_hash):
            await _audit_login(db, "tenant", None, False, body.email)
            hint = await _wrong_portal_error(control_db, body.email, body.password, "admin")
            raise UnauthorizedError(hint or "E-posta veya parola hatali")
        if user.status != UserStatus.active:
            raise UnauthorizedError("Hesap pasif durumda")
        await _audit_login(db, "tenant", user.id, True, body.email)
        pair = await _token_pair(db, request, user.id, "tenant", user.tenant_id)
        await db.commit()
        return ok({
            **pair.model_dump(),
            "must_change_password": user.must_change_password,
            # Tenant'in markali alan adi varsa istemci oraya devreder.
            "branded_host": await _branded_host(control_db, "tenant", user.tenant_id),
        })


@router.post("/supplier-login")
async def supplier_login(
    body: LoginRequest,
    request: Request,
    control_db: AsyncSession = Depends(get_control_db),
):
    _enforce_portal(body, "supplier")
    enforce_rate_limit(
        request, "login", body.email,
        times=get_settings().login_rate_limit_attempts,
    )
    async with _login_session(control_db, "supplier", body.email) as db:
        result = await db.execute(
            select(SupplierUser)
            .options(selectinload(SupplierUser.supplier))
            .where(SupplierUser.email == body.email)
        )
        user = result.scalar_one_or_none()
        if user is None or not verify_password(body.password, user.password_hash):
            await _audit_login(db, "supplier", None, False, body.email)
            hint = await _wrong_portal_error(control_db, body.email, body.password, "supplier")
            raise UnauthorizedError(hint or "E-posta veya parola hatali")
        if user.status != UserStatus.active:
            raise UnauthorizedError("Hesap pasif durumda")
        # Pasif tedarikci firmasi portala giris yapamaz (karar: login'de engelle).
        if user.supplier.status != SupplierStatus.active:
            await _audit_login(db, "supplier", user.id, False, body.email)
            raise UnauthorizedError("Tedarikci hesabi pasif durumda")
        await _audit_login(db, "supplier", user.id, True, body.email)
        pair = await _token_pair(
            db, request, user.id, "supplier", user.supplier.tenant_id
        )
        await db.commit()
        return ok({
            **pair.model_dump(),
            "must_change_password": user.must_change_password,
            "branded_host": await _branded_host(
                control_db, "supplier", user.supplier.tenant_id
            ),
        })


@router.post("/platform-login")
async def platform_login(
    body: LoginRequest, request: Request, db: AsyncSession = Depends(get_control_db)
):
    _enforce_portal(body, "platform")
    enforce_rate_limit(
        request, "login", body.email,
        times=get_settings().login_rate_limit_attempts,
    )
    result = await db.execute(select(PlatformUser).where(PlatformUser.email == body.email))
    user = result.scalar_one_or_none()
    if user is None or not verify_password(body.password, user.password_hash):
        await _audit_login(db, "platform", None, False, body.email)
        hint = await _wrong_portal_error(db, body.email, body.password, "platform")
        raise UnauthorizedError(hint or "E-posta veya parola hatali")
    if user.status != UserStatus.active:
        raise UnauthorizedError("Hesap pasif durumda")
    await _audit_login(db, "platform", user.id, True, body.email)
    pair = await _token_pair(db, request, user.id, "platform")
    await db.commit()
    return ok({**pair.model_dump(), "must_change_password": user.must_change_password})


@router.post("/refresh")
async def refresh(body: RefreshRequest, request: Request):
    """Rotation: refresh her kullanimda eski oturumu kapatir, yenisini acar.

    Refresh token govdede gelir (Authorization basligi yok), bu yuzden
    istegin tenant'i `get_db` tarafindan cozulemez; burada token'in kendi
    `tid` claim'inden (yoksa dizinden) cozulur.
    """
    try:
        payload = decode_token(body.refresh_token)
    except pyjwt.PyJWTError as exc:
        raise UnauthorizedError("Gecersiz refresh token") from exc
    if payload.get("token_type") != "refresh" or "jti" not in payload:
        raise UnauthorizedError("Refresh token gerekli")
    user_id = uuid.UUID(payload["sub"])
    user_type = payload["user_type"]

    tenant_id = await _tenant_of_token(payload, user_id, user_type)
    location = CONTROL_LOCATION if tenant_id is None else await location_for_tenant(tenant_id)

    async with session_scope(location) as db:
        # Kullanici hala aktif mi? (pasif supplier/kullanici refresh edemez)
        await _ensure_user_active(db, user_type, user_id)

        access, new_refresh_token = await rotate_session(
            db,
            jti=uuid.UUID(payload["jti"]),
            user_type=user_type,
            user_id=user_id,
            user_agent=request.headers.get("user-agent"),
            ip=client_ip(request),
            tenant_id=tenant_id,
        )
        return ok(
            TokenPair(access_token=access, refresh_token=new_refresh_token).model_dump()
        )


# ------------------------------------------------- alan adlari arasi devir


@router.post("/handoff/issue")
async def handoff_issue(
    identity: Identity = Depends(get_identity),
    control_db: AsyncSession = Depends(get_control_db),
):
    """Markali alan adina gecis icin tek kullanimlik kod uretir.

    Hedef alan adini ISTEMCI SECMEZ: tenant kaydindan okunur. Aksi halde
    saldirgan kendi kontrolundeki bir adrese gecerli kod cikartabilirdi.
    """
    host = await _branded_host(control_db, identity.user_type, identity.tenant_id)
    if host is None:
        raise ApiError("NO_BRANDED_HOST", "Bu hesap icin markali alan adi tanimli degil", 400)
    code = await auth_handoff.issue_code(
        control_db,
        user_type=identity.user_type,
        user_id=identity.id,
        tenant_id=identity.tenant_id,
        target_host=host,
    )
    return ok({
        "code": code,
        "host": host,
        "expires_in": auth_handoff.CODE_TTL_SECONDS,
    })


@router.post("/handoff/consume")
async def handoff_consume(body: HandoffConsumeRequest, request: Request):
    """Devir kodunu YENI bir oturumla takas eder.

    Kimlik dogrulamasi YOKTUR — hedef origin'in henuz oturumu yoktur, kodun
    kendisi kimlik dogrulayicidir. Bu yuzden kod tek kullanimlik, saniyeler
    omurlu ve yalnizca hedef origin'den tuketilebilir.
    """
    enforce_rate_limit(request, "handoff_consume", client_ip(request) or "-", times=20)

    # `Origin` ZORUNLU: kod yalnizca hedef alan adinin sayfasindan tuketilebilir.
    # Basligi olmayan bir istemci (calinan kodu curl ile deneyen biri) gecemez.
    origin = request.headers.get("origin") or ""
    origin_host = origin.split("://", 1)[-1].split("/", 1)[0].split(":", 1)[0]
    if not origin_host:
        raise UnauthorizedError("Gecersiz devir kodu")

    async with control_session() as control_db:
        row = await auth_handoff.consume_code(
            control_db, code=body.code, origin_host=origin_host
        )
    if row is None:
        raise UnauthorizedError("Gecersiz devir kodu")

    location = (
        CONTROL_LOCATION
        if row.tenant_id is None
        else await location_for_tenant(row.tenant_id)
    )
    async with session_scope(location) as db:
        # Kod uretildikten sonra hesap pasiflestirilmis olabilir.
        await _ensure_user_active(db, row.user_type, row.user_id)
        pair = await _token_pair(db, request, row.user_id, row.user_type, row.tenant_id)
        await db.commit()
        return ok(pair.model_dump())


async def _tenant_of_token(
    payload: dict, user_id: uuid.UUID, user_type: str
) -> uuid.UUID | None:
    """Token'dan tenant'i cozer: once `tid` claim'i, sonra dizin."""
    if user_type == "platform":
        return None
    raw = payload.get("tid")
    if raw:
        try:
            return uuid.UUID(str(raw))
        except ValueError:
            pass
    async with control_session() as control_db:
        row = (
            await control_db.execute(
                select(PrincipalDirectory.tenant_id).where(
                    PrincipalDirectory.principal_id == user_id,
                    PrincipalDirectory.user_type == user_type,
                )
            )
        ).scalar_one_or_none()
    return row


async def _ensure_user_active(db: AsyncSession, user_type: str, user_id: uuid.UUID) -> None:
    from sqlalchemy.orm import selectinload

    if user_type == "tenant":
        user = (
            await db.execute(select(TenantUser).where(TenantUser.id == user_id))
        ).scalar_one_or_none()
        if user is None or user.status != UserStatus.active:
            raise UnauthorizedError("Hesap pasif durumda")
    elif user_type == "supplier":
        user = (
            await db.execute(
                select(SupplierUser)
                .options(selectinload(SupplierUser.supplier))
                .where(SupplierUser.id == user_id)
            )
        ).scalar_one_or_none()
        if (
            user is None
            or user.status != UserStatus.active
            or user.supplier.status != SupplierStatus.active
        ):
            raise UnauthorizedError("Hesap pasif durumda")
    elif user_type == "platform":
        user = (
            await db.execute(select(PlatformUser).where(PlatformUser.id == user_id))
        ).scalar_one_or_none()
        if user is None or user.status != UserStatus.active:
            raise UnauthorizedError("Hesap pasif durumda")


@router.post("/change-password")
async def change_password(
    body: ChangePasswordRequest,
    request: Request,
    identity: Identity = Depends(get_identity),
    db: AsyncSession = Depends(get_db),
):
    """Parola degistirme (tenant/supplier/platform ortak).

    Karar (rapor): basarida TUM refresh oturumlari dusurulur ve yeni bir
    token cifti DONULUR — kullanici yeniden login olmadan devam eder,
    calinmis eski oturumlar ise aninda gecersizlesir.
    """
    user = identity.user
    if not verify_password(body.current_password, user.password_hash):
        raise ApiError("INVALID_CURRENT_PASSWORD", "Mevcut parola hatali", 422)
    if verify_password(body.new_password, user.password_hash):
        raise ApiError("SAME_PASSWORD", "Yeni parola eskisiyle ayni olamaz", 422)
    validate_password_policy(body.new_password)

    user.password_hash = hash_password(body.new_password)
    user.must_change_password = False
    user.password_changed_at = datetime.now(UTC)
    await revoke_user_sessions(db, user_type=identity.user_type, user_id=identity.id)
    pair = await _token_pair(db, request, identity.id, identity.user_type)
    record_audit(
        db,
        actor_type=_ACTOR_TYPES[identity.user_type],
        actor_id=identity.id,
        action="auth.change_password",
        metadata={"email": user.email},
    )
    await db.commit()
    return ok({**pair.model_dump(), "must_change_password": False})


@router.post("/logout")
async def logout(identity: Identity = Depends(get_identity), db: AsyncSession = Depends(get_db)):
    """Logout-everywhere: kullanicinin tum refresh oturumlarini kapatir."""
    revoked = await revoke_user_sessions(
        db, user_type=identity.user_type, user_id=identity.id
    )
    record_audit(
        db,
        actor_type=_ACTOR_TYPES[identity.user_type],
        actor_id=identity.id,
        action="auth.logout",
        metadata={"revoked_sessions": revoked},
    )
    await db.commit()
    return ok({"logged_out": True, "revoked_sessions": revoked})


def _require_tenant_user(identity: Identity) -> None:
    """Bildirim tercihi YALNIZCA tenant kullanicisinindir.

    - platform: operasyonel bildirim almaz, tercihi de yoktur.
    - supplier: tercihini yonetim belirler; kendi goremez/degistiremez.
    """
    from app.core.errors import ForbiddenError

    if identity.user_type == "supplier":
        raise ForbiddenError(
            "Tedarikci bildirim tercihleri tesis yonetimi tarafindan belirlenir"
        )
    if identity.user_type != "tenant":
        raise ForbiddenError("Bu kullanici turu icin bildirim tercihi yoktur")


@router.get("/notification-preferences")
async def get_notification_preferences(
    identity: Identity = Depends(get_identity),
):
    """TENANT kullanicisinin kendi bildirim tercihleri.

    Tedarikci bu uca erisemez: tedarikciye hangi bildirimin gidecegine yonetim
    karar verir (facilities.supplier_notification_policy_json) ve tedarikci bu
    politikayi ne gorur ne degistirir.
    """
    from app.services.notification_preferences import resolve_preferences

    _require_tenant_user(identity)
    return ok(resolve_preferences(identity.user))


@router.patch("/notification-preferences")
async def patch_notification_preferences(
    body: NotificationPreferencesPatch,
    identity: Identity = Depends(get_identity),
    db: AsyncSession = Depends(get_db),
):
    """TENANT kullanicisi YALNIZCA kendi tercihini gunceller.

    Tedarikci bu uca erisemez (yonetim politikasi gecerlidir). Kritik istisna:
    appointment_revised panel bildirimi kapatilamaz (servis katmaninda
    zorlanir); e-postalarin tumu kapatilabilir.
    """
    from app.services.notification_preferences import (
        EMAIL_EVENT_KEYS,
        TENANT_EMAIL_EVENT_KEYS,
        resolve_preferences,
    )

    _require_tenant_user(identity)

    user = identity.user
    current = resolve_preferences(user)
    changes = body.model_dump(exclude_unset=True)
    if "in_app_enabled" in changes:
        current["in_app_enabled"] = changes["in_app_enabled"]
    if "email_enabled" in changes:
        current["email_enabled"] = changes["email_enabled"]
    if changes.get("email_events"):
        unknown = set(changes["email_events"]) - set(EMAIL_EVENT_KEYS)
        if unknown:
            raise ApiError(
                "INVALID_PREFERENCE_EVENT",
                f"Bilinmeyen event anahtarlari: {', '.join(sorted(unknown))}",
                422,
            )
        # Tedarikciye giden sablon anahtarlari burada YOK SAYILIR: onlar tesis
        # politikasina aittir. (Eski/onbellekli istemciler tumunu gonderebilir;
        # 422 vermek yerine ilgisiz anahtarlar sessizce dusurulur.)
        current["email_events"].update(
            {
                key: value
                for key, value in changes["email_events"].items()
                if key in TENANT_EMAIL_EVENT_KEYS
            }
        )
    user.notification_preferences_json = current
    record_audit(
        db,
        actor_type=_ACTOR_TYPES[identity.user_type],
        actor_id=identity.id,
        action="notification_preferences.update",
        metadata=current,
    )
    await db.commit()
    return ok(current)


@router.get("/me")
async def me(identity: Identity = Depends(get_identity), db: AsyncSession = Depends(get_db)):
    user = identity.user

    if identity.user_type == "platform":
        data = MeResponse(
            id=user.id,
            user_type="platform",
            name=user.name,
            email=user.email,
            permissions=sorted(identity.permissions),
        )
        return ok(data.model_dump(mode="json"))

    if identity.user_type == "supplier":
        supplier: Supplier = user.supplier  # type: ignore[union-attr]
        result = await db.execute(select(Facility).where(Facility.id == supplier.facility_id))
        facility = result.scalar_one()
        data = MeResponse(
            id=user.id,
            user_type="supplier",
            name=user.name,
            email=user.email,
            tenant_id=supplier.tenant_id,
            supplier_id=supplier.id,
            default_facility_id=supplier.facility_id,
            facilities=[
                FacilitySummary(
                    id=facility.id,
                    tenant_id=facility.tenant_id,
                    name=facility.name,
                    timezone=facility.timezone,
                    status=facility.status.value,
                )
            ],
        )
        return ok(data.model_dump(mode="json"))

    # tenant kullanicisi: uyelik oldugu tesisler + aktif tesisteki izinler
    result = await db.execute(
        select(FacilityMembership)
        .options(selectinload(FacilityMembership.roles))
        .where(FacilityMembership.tenant_user_id == user.id)
    )
    memberships = list(result.scalars())
    facility_ids = [m.facility_id for m in memberships]
    facilities: list[Facility] = []
    if facility_ids:
        result = await db.execute(select(Facility).where(Facility.id.in_(facility_ids)))
        facilities = list(result.scalars())

    default_facility_id = user.default_facility_id or (facility_ids[0] if facility_ids else None)
    active_membership = next(
        (m for m in memberships if m.facility_id == default_facility_id), None
    )
    data = MeResponse(
        id=user.id,
        user_type="tenant",
        name=user.name,
        email=user.email,
        tenant_id=user.tenant_id,
        default_facility_id=default_facility_id,
        permissions=sorted(active_membership.permissions) if active_membership else [],
        facility_permissions={
            str(m.facility_id): sorted(m.permissions) for m in memberships
        },
        facilities=[
            FacilitySummary(
                id=f.id,
                tenant_id=f.tenant_id,
                name=f.name,
                timezone=f.timezone,
                status=f.status.value,
            )
            for f in facilities
        ],
    )
    return ok(data.model_dump(mode="json"))
