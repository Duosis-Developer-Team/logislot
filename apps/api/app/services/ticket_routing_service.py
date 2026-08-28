"""Hermes ticket yonlendirmesi — control-plane servisi.

Sorumluluk siniri: bu modul "hangi tenant hangi Hermes ekibine gidiyor"
sorusunu yonetir. Ticket ICERIGINE hicbir noktada dokunmaz; platform
yoneticisinin izinleri de icerik erisimi vermez (00_SHARED_PLATFORM/01).

Kritik kural: KATALOG ONBELLEGI OTORITE DEGILDIR. Kaydetme her zaman uzak
dogrulamadan gecer. Hermes erisilemezken mevcut route CALISMAYA DEVAM eder
ama yeni/degistirilmis bir route KAYDEDILEMEZ — aksi halde yanlis ya da
kapatilmis bir gruba sessizce ticket akmaya baslardi.
"""

from __future__ import annotations

import logging
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

import sqlalchemy as sa
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.enums import ActorType, TenantStatus
from app.core.errors import ApiError, NotFoundError
from app.integrations import hermes_contract as contract
from app.integrations.hermes_support_client import HermesApiError, get_hermes_client
from app.models import HermesGroupCatalogCache, Tenant, TicketRoutingConfig
from app.services.audit import record_audit

logger = logging.getLogger("logislot.ticket.routing")


class RouteConfigError(ApiError):
    """Yonlendirme kaydedilemedi. `code` sozlesmedeki hata kodunu tasir."""

    def __init__(self, code: str, message: str, status_code: int = 400) -> None:
        super().__init__(code.upper(), message, status_code)


# ---------------------------------------------------------------- katalog


async def cached_groups(
    db: AsyncSession, *, application_code: str | None = None
) -> list[HermesGroupCatalogCache]:
    app_code = application_code or get_settings().hermes_support_application_code
    result = await db.execute(
        sa.select(HermesGroupCatalogCache)
        .where(HermesGroupCatalogCache.application_code == app_code)
        .order_by(HermesGroupCatalogCache.name)
    )
    return list(result.scalars())


async def _upsert_group(
    db: AsyncSession, *, app_code: str, group_id: uuid.UUID, values: dict[str, Any]
) -> None:
    """Katalog satirini INSERT ... ON CONFLICT DO UPDATE ile yazar.

    `refresh_catalog` mevcut satirlari once OKUR sonra eksikleri EKLER. Platform
    ekrani ayni anda birkac istek attigi icin (grup listesi + tenant detayi) iki
    tazeleme yarisabilir: ikisi de ayni grubu gormeden INSERT eder ve kaybeden
    taraf `uq_hermes_group_catalog_app_group` ihlaliyle 500 dondururdu. Upsert
    yarisi kisitin kendisiyle cozer — kaybeden taraf ayni degerleri yazar,
    yeniden deneme ya da kilit gerekmez.
    """
    if db.get_bind().dialect.name == "postgresql":
        from sqlalchemy.dialects.postgresql import insert
    else:  # SQLite (test paketi) de ON CONFLICT destekler.
        from sqlalchemy.dialects.sqlite import insert

    stmt = insert(HermesGroupCatalogCache).values(
        application_code=app_code, group_id=group_id, **values
    )
    await db.execute(
        stmt.on_conflict_do_update(
            index_elements=["application_code", "group_id"],
            # `onupdate=now()` Core upsert'te otomatik islemez, acikca yazilir.
            set_={**values, "updated_at": sa.func.now()},
        )
    )


def catalog_is_stale(rows: list[HermesGroupCatalogCache]) -> bool:
    """Onbellek TTL'i gecmisse (veya hic doldurulmamissa) True."""
    if not rows:
        return True
    ttl = get_settings().hermes_support_catalog_ttl_seconds
    newest = max(r.fetched_at for r in rows)
    if newest.tzinfo is None:
        newest = newest.replace(tzinfo=UTC)
    return datetime.now(UTC) - newest > timedelta(seconds=ttl)


async def refresh_catalog(
    db: AsyncSession,
    *,
    actor_id: uuid.UUID | None = None,
    correlation_id: uuid.UUID | None = None,
) -> dict[str, Any]:
    """Hermes'ten aktif gruplari ceker ve onbellegi tazeler.

    Katalogdan DUSEN gruplar silinmez, `is_active=False` yapilir: bir grubun
    kaybolmasi, o gruba bagli route'un adini da kaybetmesi anlamina gelmemeli;
    platform ekrani "grup artik aktif degil" diyebilmelidir.
    """
    app_code = get_settings().hermes_support_application_code
    client = get_hermes_client()
    existing = {row.group_id: row for row in await cached_groups(db)}
    etag = next((r.catalog_version for r in existing.values() if r.catalog_version), None)

    result = await client.list_routing_groups(etag=etag)
    if result.not_modified:
        now = datetime.now(UTC)
        for row in existing.values():
            row.fetched_at = now
        await db.commit()
        return {"changed": False, "count": len(existing), "catalog_version": etag}

    seen: set[uuid.UUID] = set()
    for item in result.items:
        try:
            group_id = uuid.UUID(str(item.get("id")))
        except (ValueError, TypeError):
            logger.warning("Hermes katalogunda gecersiz grup kimligi atlandi")
            continue
        seen.add(group_id)
        member_count = item.get("member_count")
        values: dict[str, Any] = {
            "name": str(item.get("name") or "")[:255],
            "description": item.get("description"),
            "member_count": int(member_count) if isinstance(member_count, int) else None,
            "is_active": True,
            "catalog_version": result.catalog_version or result.etag,
            "remote_updated_at": _parse_dt(item.get("updated_at")),
            "fetched_at": datetime.now(UTC),
        }
        row = existing.get(group_id)
        if row is None:
            # Bu tazeleme grubu GORMEDI; ayni anda kosan baska bir tazeleme
            # onu eklemis olabilir, o yuzden duz INSERT degil upsert.
            await _upsert_group(db, app_code=app_code, group_id=group_id, values=values)
        else:
            for field, value in values.items():
                setattr(row, field, value)

    for group_id, row in existing.items():
        if group_id not in seen and row.is_active:
            # Katalog yalnizca AKTIF gruplari dondurur; listede olmayan grup
            # pasiflesmis demektir.
            row.is_active = False
            row.fetched_at = datetime.now(UTC)

    record_audit(
        db,
        actor_type=ActorType.platform_user if actor_id else ActorType.system,
        actor_id=actor_id,
        action="ticket_routing.catalog_refresh",
        metadata={
            "group_count": len(seen),
            "catalog_version": result.catalog_version,
            "correlation_id": str(correlation_id) if correlation_id else None,
        },
    )
    await db.commit()
    return {"changed": True, "count": len(seen), "catalog_version": result.catalog_version}


async def ensure_catalog_fresh(
    db: AsyncSession,
) -> tuple[list[HermesGroupCatalogCache], str | None]:
    """Gerekiyorsa katalogu tazeler; basarisiz olursa ESKI listeyi dondurur.

    Ikinci deger hata kodudur: UI "liste eski, dogrulama gerekli" uyarisi
    gosterebilsin diye. Hata firlatilmaz — Hermes'in gecici arizasi platform
    ekranini tamamen bos birakmamali.
    """
    rows = await cached_groups(db)
    if not catalog_is_stale(rows):
        return rows, None
    try:
        await refresh_catalog(db)
    except HermesApiError as exc:
        logger.warning("Hermes grup katalogu tazelenemedi: %s", exc.code)
        return rows, exc.code
    return await cached_groups(db), None


def _parse_dt(value: Any) -> datetime | None:
    if not isinstance(value, str):
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


# ---------------------------------------------------------- route config


async def get_route_config(
    db: AsyncSession, tenant_id: uuid.UUID
) -> TicketRoutingConfig | None:
    app_code = get_settings().hermes_support_application_code
    return (
        await db.execute(
            sa.select(TicketRoutingConfig).where(
                TicketRoutingConfig.tenant_id == tenant_id,
                TicketRoutingConfig.application_code == app_code,
            )
        )
    ).scalar_one_or_none()


async def all_route_configs(db: AsyncSession) -> dict[uuid.UUID, TicketRoutingConfig]:
    app_code = get_settings().hermes_support_application_code
    rows = (
        await db.execute(
            sa.select(TicketRoutingConfig).where(
                TicketRoutingConfig.application_code == app_code
            )
        )
    ).scalars()
    return {row.tenant_id: row for row in rows}


def route_status(config: TicketRoutingConfig | None) -> str:
    """UI'da gosterilen tek kelimelik yonlendirme durumu."""
    if config is None:
        return "unconfigured"
    if not config.is_active:
        return "disabled"
    if config.last_error_code:
        return "error"
    if config.last_verified_at is None:
        return "needs_verification"
    return "ready"


async def save_route(
    db: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    group_id: uuid.UUID,
    is_active: bool,
    expected_route_version: int | None,
    actor_id: uuid.UUID,
    correlation_id: uuid.UUID | None = None,
) -> TicketRoutingConfig:
    """Tenant icin TEK aktif hedef grubu kaydeder.

    Sira onemlidir: once yerel on kosullar, sonra UZAK dogrulama, en son
    commit. Uzak dogrulama basarisizsa hicbir sey degismez — yarim kaydedilmis
    bir route, ticketlarin kaybolacagi bir yol acardi.
    """
    settings = get_settings()
    tenant = (
        await db.execute(sa.select(Tenant).where(Tenant.id == tenant_id))
    ).scalar_one_or_none()
    if tenant is None:
        raise NotFoundError("Musteri hesabi bulunamadi")

    config = await get_route_config(db, tenant_id)

    if tenant.status == TenantStatus.archived and is_active:
        # Arsivlenmis tenant icin yalnizca DEVRE DISI birakma yapilabilir.
        raise RouteConfigError(
            "tenant_archived",
            "Arsivlenmis musteri hesabi icin yeni yonlendirme etkinlestirilemez.",
        )

    if expected_route_version is not None:
        current_version = config.route_version if config else 0
        if current_version != expected_route_version:
            raise RouteConfigError(
                "route_version_conflict",
                "Yonlendirme baska bir yonetici tarafindan guncellendi; sayfayi yenileyin.",
                409,
            )

    cached = {row.group_id: row for row in await cached_groups(db)}
    cached_group = cached.get(group_id)
    if cached_group is not None and not cached_group.is_active:
        raise RouteConfigError(
            contract.ERROR_GROUP_INACTIVE,
            "Secilen Hermes ekibi artik aktif degil; listeyi yenileyip yeniden secin.",
        )

    # Uzak dogrulama: grup gercekten aktif mi ve entegrasyon bu tenant adina
    # yetkili mi? Cevap "hayir" ise kayit YAPILMAZ.
    verification = await _validate_remote(
        tenant_id=tenant_id, group_id=group_id, correlation_id=correlation_id
    )

    before = _audit_snapshot(config)
    if config is None:
        config = TicketRoutingConfig(
            tenant_id=tenant_id,
            application_code=settings.hermes_support_application_code,
            hermes_group_id=group_id,
            route_version=0,
        )
        db.add(config)

    config.hermes_group_id = group_id
    config.hermes_group_name_snapshot = (
        verification.get("group_name")
        or (cached_group.name if cached_group else None)
        or config.hermes_group_name_snapshot
    )
    config.is_active = is_active
    # BIZIM sayacimiz (platform ekranindaki iyimser kilit). Hermes bunu tanimaz.
    config.route_version = (config.route_version or 0) + 1
    # HERMES'IN surumu dogrulama yanitindan alinir; create payload'inda bu gider.
    # Kendi sayimizi gondermek her teslimatta `route_stale` uretiyordu.
    config.hermes_route_version = _remote_route_version(verification)
    config.last_verified_at = datetime.now(UTC)
    config.catalog_version = (
        cached_group.catalog_version if cached_group else config.catalog_version
    )
    config.last_error_code = None
    config.last_error_at = None
    config.configured_by_platform_user_id = actor_id

    record_audit(
        db,
        actor_type=ActorType.platform_user,
        actor_id=actor_id,
        action="ticket_routing.update" if before else "ticket_routing.create",
        tenant_id=tenant_id,
        entity_type="ticket_routing_config",
        entity_id=config.id,
        before=before,
        after=_audit_snapshot(config),
        metadata={"correlation_id": str(correlation_id) if correlation_id else None},
    )
    try:
        await db.commit()
    except IntegrityError as exc:
        # Ayni tenant icin ILK route'u iki yonetici (ya da cift tiklama) ayni
        # anda kaydetti: ikisi de `config is None` gordu ve ikisi de INSERT
        # etti. Bu, katalog tazelemesindeki SELECT-sonra-INSERT yarisinin ayni
        # sinifi; burada dogru sonuc zaten tanimli olan surum catismasidir —
        # yoneticiye 500 yerine "sayfayi yenileyin" denir.
        await db.rollback()
        raise RouteConfigError(
            "route_version_conflict",
            "Yonlendirme baska bir yonetici tarafindan guncellendi; sayfayi yenileyin.",
            409,
        ) from exc
    await db.refresh(config)
    return config


def _remote_route_version(verification: dict[str, Any]) -> int | None:
    """Dogrulama yanitindaki Hermes route surumu (yoksa None).

    Hermes kendi sayacini tutar ve create payload'inda BASKA bir sayi gorurse
    `route_stale` doner. Canli olarak yasandi: bizde 1, Hermes'te 5 idi ve her
    ticket teslimatta takiliyordu.
    """
    raw = verification.get("route_version")
    if isinstance(raw, bool) or not isinstance(raw, int):
        return None
    return raw


async def _validate_remote(
    *, tenant_id: uuid.UUID, group_id: uuid.UUID, correlation_id: uuid.UUID | None
) -> dict[str, Any]:
    client = get_hermes_client()
    try:
        result = await client.validate_route(
            source_tenant_id=tenant_id, group_id=group_id, correlation_id=correlation_id
        )
    except HermesApiError as exc:
        raise RouteConfigError(
            exc.code,
            _validation_message(exc.code),
            503 if exc.retryable else 400,
        ) from exc
    if result.get("valid") is False:
        code = str(result.get("error_code") or contract.ERROR_GROUP_INACTIVE)
        raise RouteConfigError(code, _validation_message(code))
    return result


def _validation_message(code: str) -> str:
    return {
        contract.ERROR_GROUP_INACTIVE: (
            "Secilen Hermes ekibi aktif degil; listeyi yenileyip yeniden secin."
        ),
        contract.ERROR_SOURCE_TENANT_UNKNOWN: (
            "Bu musteri hesabi Hermes tarafinda tanimli degil; destek ekibiyle iletisime gecin."
        ),
        contract.ERROR_FORBIDDEN: (
            "Hermes entegrasyon yetkisi reddedildi; servis kimlik bilgilerini kontrol edin."
        ),
        contract.ERROR_INTEGRATION_UNAVAILABLE: (
            "Hermes'e su anda ulasilamiyor; mevcut yonlendirme calismaya devam eder."
        ),
        contract.ERROR_RATE_LIMITED: (
            "Hermes istek sinirina takildi; kisa bir sure sonra tekrar deneyin."
        ),
    }.get(code, "Yonlendirme Hermes tarafinda dogrulanamadi.")


def _audit_snapshot(config: TicketRoutingConfig | None) -> dict[str, Any] | None:
    if config is None:
        return None
    return {
        "hermes_group_id": str(config.hermes_group_id),
        "hermes_group_name": config.hermes_group_name_snapshot,
        "route_version": config.route_version,
        "is_active": config.is_active,
    }


async def test_route(
    db: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    actor_id: uuid.UUID,
    group_id: uuid.UUID | None = None,
    correlation_id: uuid.UUID | None = None,
) -> dict[str, Any]:
    """Baglanti/dogrulama testi. TICKET OLUSTURMAZ.

    Test sonucu kalici bir dogrulama sayilir (basariliysa `last_verified_at`
    guncellenir), cunku Hermes'e sorulan sorunun yaniti kaydetmedekiyle aynidir.
    """
    config = await get_route_config(db, tenant_id)
    target = group_id or (config.hermes_group_id if config else None)
    if target is None:
        raise RouteConfigError(
            contract.ERROR_ROUTE_MISSING,
            "Once bir Hermes ekibi secin.",
        )
    try:
        result = await _validate_remote(
            tenant_id=tenant_id, group_id=target, correlation_id=correlation_id
        )
        ok_result = {
            "ok": True,
            "group_id": str(target),
            "group_name": result.get("group_name"),
            "checked_at": datetime.now(UTC).isoformat(),
        }
        if config is not None and config.hermes_group_id == target:
            config.last_verified_at = datetime.now(UTC)
            config.last_error_code = None
            config.last_error_at = None
            # Hermes route surumunu TAZELE: karsi taraf surumu degistirdiyse
            # teslimat `route_stale` ile takilir; Test bunu duzeltebilmeli.
            config.hermes_route_version = _remote_route_version(result)
    except RouteConfigError as exc:
        ok_result = {
            "ok": False,
            "group_id": str(target),
            "error_code": exc.code.lower(),
            "message": exc.message,
            "checked_at": datetime.now(UTC).isoformat(),
        }
        if config is not None and config.hermes_group_id == target:
            config.last_error_code = exc.code.lower()[:64]
            config.last_error_at = datetime.now(UTC)

    record_audit(
        db,
        actor_type=ActorType.platform_user,
        actor_id=actor_id,
        action="ticket_routing.test",
        tenant_id=tenant_id,
        entity_type="ticket_routing_config",
        entity_id=config.id if config else None,
        metadata={"ok": ok_result["ok"], "group_id": str(target)},
    )
    await db.commit()
    return ok_result


async def refresh_remote_route_version(
    db: AsyncSession, tenant_id: uuid.UUID
) -> int | None:
    """Hermes'in route surumunu yeniden okuyup kaydeder (en iyi caba).

    `route_stale` genelde karsi tarafin surumu degistirmesi demektir. Bunu elle
    "Test"e birakmak teslimati insan aksiyonuna kilitlerdi; burada tazelenince
    bir sonraki kosum dogru surumle gider ve akis KENDINI ONARIR.
    """
    config = await get_route_config(db, tenant_id)
    if config is None or not config.is_active:
        return None
    try:
        verification = await _validate_remote(
            tenant_id=tenant_id, group_id=config.hermes_group_id, correlation_id=None
        )
    except (RouteConfigError, HermesApiError) as exc:
        logger.warning("Route surumu tazelenemedi (%s)", getattr(exc, "code", exc))
        return None
    version = _remote_route_version(verification)
    if version is not None and version != config.hermes_route_version:
        config.hermes_route_version = version
        await db.commit()
        logger.info("Hermes route surumu %s olarak tazelendi", version)
    return version


async def mark_route_error(
    db: AsyncSession, *, tenant_id: uuid.UUID, error_code: str
) -> None:
    """Teslimat sirasinda olusan yonlendirme hatasini config'e isler.

    Boylece platform ekrani "bu tenantin route'u guncellenmeli" diyebilir;
    hata yalnizca tenant semasindaki outbox satirinda kalmaz.
    """
    config = await get_route_config(db, tenant_id)
    if config is None:
        return
    config.last_error_code = error_code[:64]
    config.last_error_at = datetime.now(UTC)
    await db.commit()
