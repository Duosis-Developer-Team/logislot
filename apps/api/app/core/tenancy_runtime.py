"""Tenant verisinin NEREDE durdugunu cozen katman.

Izolasyonun mekanigi burada: her istek, tenant'ina ait bir semaya baglanmis
bir oturum alir. Bir sorguda WHERE tenant_id unutulsa bile baska bir
tenant'in satirina ULASILAMAZ, cunku o satirlar baska bir semadaki baska
bir tablodadir.

SQLAlchemy sozlesmesi (deneyle dogrulandi, kirilirsa uretim patlar):
    ``schema_translate_map`` sozlugunun ANAHTAR KUMESI ardisik cagrilarda
    AYNI kalmalidir. Derlenmis sorgu onbellegi anahtar kumesine gore
    tutuldugundan, bir cagride {"control": ...}, digerinde {None: ...,
    "control": ...} kullanmak InvalidRequestError firlatir. Bu yuzden
    haritayi ELLE kurmayin — daima `translate_map()` kullanin.
"""

import time
import uuid
from collections import OrderedDict
from dataclasses import dataclass

from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine

from app.core.config import get_settings
from app.models.base import CONTROL_SCHEMA

#: Control-plane'in Postgres'teki GERCEK sema adi. Bilerek sabit: migrationlar
#: da varsayilan semaya yazdigi icin bunu ayarlanabilir yapmak iki kaynagin
#: birbirinden kaymasina davetiye olurdu.
CONTROL_SCHEMA_REAL = "public"

#: Kaydi olmayan (henuz tasinmamis) tenant'larin gecis donemi yerlesimi.
LEGACY_SCHEMA = "public"


@dataclass(frozen=True)
class TenantLocation:
    """Bir tenant'in verisinin fiziksel adresi ve calisacagi veritabani rolu.

    schema=None + dsn_alias=None  -> control-plane / eski ortak yerlesim
    schema='t_ab12' , dsn_alias=None -> ayni veritabaninda kendi semasi
    schema='t_ab12' , dsn_alias='eu2' -> ayri veritabaninda kendi semasi

    db_role doluysa her transaction basinda `SET LOCAL ROLE` calisir; o
    transaction Postgres tarafinda BASKA hicbir tenant semasina erisemez.
    None ise (henuz rol acilmamis tenant) yalnizca uygulama seviyesindeki
    yonlendirme korur — gecis donemi icin bilerek geriye donuk uyumludur.
    """

    schema: str | None = None
    dsn_alias: str | None = None
    db_role: str | None = None

    @property
    def is_control(self) -> bool:
        return self.schema is None and self.dsn_alias is None


#: Control-plane / kimliksiz istekler icin adres.
CONTROL_LOCATION = TenantLocation()


def schema_name_for(tenant_id: uuid.UUID) -> str:
    """Tenant UUID'sinden kararli sema adi uretir.

    Slug DEGIL UUID kullanilir: slug urun tarafinda degistirilebilir, sema
    adinin degismesi ise veri tasima demektir. 2+32=34 karakter, Postgres'in
    63 baytlik identifier sinirinin altinda.
    """
    return f"t_{tenant_id.hex}"


def role_name_for(tenant_id: uuid.UUID) -> str:
    """Tenant'in veritabani rolu — sema adi gibi UUID'den turer.

    Rol yalnizca kendi semasina yetkilidir; uygulama bu role gecerek
    calistigi surece capraz tenant erisimi Postgres tarafindan reddedilir.
    """
    return f"tr_{tenant_id.hex}"


def translate_map(schema: str | None, *, dialect_name: str) -> dict[str | None, str | None]:
    """Bir baglantiya verilecek sema ceviri haritasi.

    Anahtar kumesi HER ZAMAN {None, CONTROL_SCHEMA} — bkz. modul docstring'i.
    """
    if dialect_name == "sqlite":
        # SQLite'in Postgres anlaminda semasi yoktur; test paketi tek bir
        # veritabaninda calisir ve her iki duzlem de oraya cevrilir.
        # Gercek sema izolasyonu Postgres'e ozgudur ve entegrasyon
        # dogrulamasiyla (scripts/verify_tenant_isolation.py) sinanir.
        return {None: None, CONTROL_SCHEMA: None}
    return {
        None: schema or LEGACY_SCHEMA,
        CONTROL_SCHEMA: CONTROL_SCHEMA_REAL,
    }


class _EngineCache:
    """Ayri veritabani kullanan tenant'lar icin sinirli engine havuzu.

    Sema modundaki tenant'lar TEK engine'i paylasir; bu yuzden yuzlerce
    tenant baglanti patlamasina yol acmaz. Yalnizca kendi veritabanina
    tasinmis tenant'lar icin ek engine acilir ve sayilari LRU ile sinirlanir.
    """

    def __init__(self) -> None:
        self._engines: OrderedDict[str, AsyncEngine] = OrderedDict()

    def get(self, alias: str) -> AsyncEngine:
        settings = get_settings()
        if alias in self._engines:
            self._engines.move_to_end(alias)
            return self._engines[alias]
        dsn = settings.tenant_database_dsns.get(alias)
        if not dsn:
            raise RuntimeError(
                f"Tenant veritabani takma adi '{alias}' ayarlarda tanimli degil "
                "(LOGISLOT_TENANT_DATABASE_DSNS)."
            )
        engine = create_async_engine(dsn, pool_size=3, max_overflow=2, pool_pre_ping=True)
        self._engines[alias] = engine
        self._engines.move_to_end(alias)
        while len(self._engines) > max(1, settings.tenant_engine_cache_size):
            _, evicted = self._engines.popitem(last=False)
            # pool.dispose() yalnizca BOSTAKI baglantilari kapatir; o an
            # kullanimda olan baglantilar iade edildiklerinde atilir. Bu
            # yuzden devam eden bir istegi yarida kesmez.
            evicted.sync_engine.pool.dispose()
        return engine

    def clear(self) -> None:
        self._engines.clear()


_engine_cache = _EngineCache()


class _LocationCache:
    """tenant_id -> TenantLocation icin kisa omurlu bellek onbellegi.

    Kayitlar cok nadir degistigi icin her istekte control-plane'e gitmeyi
    onler. TTL kisa tutulur ki provisioning sonrasi yeni adres hizla gorunur;
    ayrica provisioning kodu `invalidate()` ile onbellegi dogrudan duser.
    """

    def __init__(self, ttl_seconds: float = 30.0) -> None:
        self._ttl = ttl_seconds
        self._data: dict[uuid.UUID, tuple[float, TenantLocation]] = {}

    def get(self, tenant_id: uuid.UUID) -> TenantLocation | None:
        hit = self._data.get(tenant_id)
        if hit is None:
            return None
        expires_at, location = hit
        if time.monotonic() >= expires_at:
            self._data.pop(tenant_id, None)
            return None
        return location

    def put(self, tenant_id: uuid.UUID, location: TenantLocation) -> None:
        self._data[tenant_id] = (time.monotonic() + self._ttl, location)

    def invalidate(self, tenant_id: uuid.UUID | None = None) -> None:
        if tenant_id is None:
            self._data.clear()
        else:
            self._data.pop(tenant_id, None)


location_cache = _LocationCache()
