"""Veritabani oturumlari — istek, tenant'inin semasina baglanir.

`get_db` artik "tek bir veritabani oturumu" degil, "BU istegin tenant'ina
ait oturum" dondurur. Duzlem kimlikten turer:

    platform kullanicisi / kimliksiz istek -> control-plane
    tenant / tedarikci kullanicisi         -> tenant'in kendi semasi

Boylece routerlar degismeden izolasyon kazanir.
"""

import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import jwt as pyjwt
from fastapi import Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.core.config import get_settings
from app.core.enums import DatastoreStatus
from app.core.errors import ApiError
from app.core.security import decode_token
from app.core.tenancy_runtime import (
    CONTROL_LOCATION,
    TenantLocation,
    _engine_cache,
    location_cache,
    translate_map,
)

#: Control-plane engine — ayni zamanda sema modundaki TUM tenant'larin
#: paylastigi baglanti havuzu.
engine = create_async_engine(get_settings().database_url)

#: Konum -> engine/sessionmaker onbellegi. OptionEngine'ler alttaki havuzu
#: PAYLASIR; tenant basina yeni baglanti acilmaz.
_bound: dict[tuple[str | None, str | None], async_sessionmaker[AsyncSession]] = {}


def _base_engine(location: TenantLocation) -> AsyncEngine:
    if location.dsn_alias is None:
        return engine
    return _engine_cache.get(location.dsn_alias)


def sessionmaker_for(location: TenantLocation) -> async_sessionmaker[AsyncSession]:
    key = (location.dsn_alias, location.schema)
    cached = _bound.get(key)
    if cached is not None:
        return cached
    base = _base_engine(location)
    bound_engine = base.execution_options(
        schema_translate_map=translate_map(location.schema, dialect_name=base.dialect.name)
    )
    maker = async_sessionmaker(bound_engine, expire_on_commit=False)
    _bound[key] = maker
    return maker


#: Geriye donuk uyumluluk: eski kod `SessionLocal()` ile control-plane
#: oturumu aciyordu; ayni anlami korur.
SessionLocal = sessionmaker_for(CONTROL_LOCATION)


@asynccontextmanager
async def session_scope(location: TenantLocation) -> AsyncIterator[AsyncSession]:
    """Verilen adrese baglanmis bir oturum acar."""
    async with sessionmaker_for(location)() as session:
        yield session


@asynccontextmanager
async def control_session() -> AsyncIterator[AsyncSession]:
    async with session_scope(CONTROL_LOCATION) as session:
        yield session


async def location_for_tenant(tenant_id: uuid.UUID) -> TenantLocation:
    """Tenant'in veri adresini cozer (kisa omurlu onbellekli).

    Kaydi olmayan tenant gecis donemi boyunca eski ortak yerlesimde kalir;
    `tenant_datastore_required` acikken bu sessiz geri dusus HATAYA cevrilir.
    """
    cached = location_cache.get(tenant_id)
    if cached is not None:
        return cached

    from app.models import TenantDatastore  # dairesel import kacinmasi

    async with control_session() as db:
        row = (
            await db.execute(
                select(TenantDatastore).where(TenantDatastore.tenant_id == tenant_id)
            )
        ).scalar_one_or_none()

    if row is not None and row.status == DatastoreStatus.ready:
        location = TenantLocation(schema=row.schema_name, dsn_alias=row.dsn_alias)
    elif get_settings().tenant_datastore_required:
        raise ApiError(
            "TENANT_DATASTORE_NOT_READY",
            "Musteri veri alani hazir degil; lutfen sistem yoneticisine basvurun.",
            503,
        )
    else:
        location = CONTROL_LOCATION

    location_cache.put(tenant_id, location)
    return location


def _bearer_token(request: Request) -> str | None:
    header = request.headers.get("authorization")
    if not header:
        return None
    scheme, _, token = header.partition(" ")
    if scheme.lower() != "bearer" or not token:
        return None
    return token.strip()


async def _tenant_id_from_directory(principal_id: uuid.UUID, user_type: str) -> uuid.UUID | None:
    """`tid` claim'i tasimayan ESKI tokenlar icin yonlendirme.

    Deploy aninda elde token'i olan kullanicilarin oturumu dusmesin diye
    vardir; tum tokenlar dogal olarak yenilendikten sonra bu yol soguk kalir.
    """
    from app.models import PrincipalDirectory

    async with control_session() as db:
        return (
            await db.execute(
                select(PrincipalDirectory.tenant_id).where(
                    PrincipalDirectory.principal_id == principal_id,
                    PrincipalDirectory.user_type == user_type,
                )
            )
        ).scalar_one_or_none()


async def location_for_request(request: Request) -> TenantLocation:
    """Istegin hangi veri alaninda calisacagini belirler.

    Token GECERSIZ ise control-plane dondurulur; 401'i uretmek `get_identity`
    islerine aittir — burada kimlik dogrulanmaz, yalnizca adres secilir.
    """
    cached = getattr(request.state, "tenant_location", None)
    if cached is not None:
        return cached

    location = CONTROL_LOCATION
    token = _bearer_token(request)
    if token is not None:
        try:
            payload = decode_token(token)
        except pyjwt.PyJWTError:
            payload = None
        if payload is not None and payload.get("user_type") in ("tenant", "supplier"):
            tenant_id: uuid.UUID | None = None
            raw_tid = payload.get("tid")
            if raw_tid:
                try:
                    tenant_id = uuid.UUID(str(raw_tid))
                except ValueError:
                    tenant_id = None
            if tenant_id is None:
                try:
                    principal_id = uuid.UUID(str(payload.get("sub")))
                except (ValueError, TypeError):
                    principal_id = None
                if principal_id is not None:
                    tenant_id = await _tenant_id_from_directory(
                        principal_id, str(payload["user_type"])
                    )
            if tenant_id is not None:
                location = await location_for_tenant(tenant_id)

    request.state.tenant_location = location
    return location


async def get_db(request: Request) -> AsyncIterator[AsyncSession]:
    """FastAPI bagimliligi: bu istegin tenant'ina baglanmis oturum."""
    location = await location_for_request(request)
    async with session_scope(location) as session:
        yield session


async def get_control_db() -> AsyncIterator[AsyncSession]:
    """Acikca control-plane oturumu isteyen uc noktalar icin (platform, login)."""
    async with control_session() as session:
        yield session
