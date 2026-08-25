"""Prometheus metrikleri — Drake sozlesmesi.

Drake'in sorgu kaydi BIR SOZLESMEDIR (bkz. depo kokundeki LOGISLOT_METRICS.md).
Metrik adlari ve ETIKET ADLARI birebir eslesmezse seri toplanmaya devam eder
ama hicbir ekranda gorunmez — haftalarca fark edilmeyen bir basarisizlik
bicimi. Bu dosyadaki adlari veya etiketleri degistirmeden once Drake ekibiyle
konusun; tests/test_metrics.py sozlesmeyi birebir dogrular.

Etiketler BILEREK sabit kardinalitededir. path/route/method/tenant/pod/
instance etiketi YOKTUR: bunlar sinirsiz seri uretir, Drake'in katalogu
reddeder ve metrik arka ucunu kimse panoya bakmadan cok once doldururdu.
Yol (path) bilinerek toplanip atilir.
"""

from __future__ import annotations

import logging
import time
from collections.abc import Awaitable, Callable, MutableMapping
from typing import Any

from prometheus_client import Counter, Histogram, start_http_server

logger = logging.getLogger("logislot.metrics")

Scope = MutableMapping[str, Any]
Message = MutableMapping[str, Any]
Receive = Callable[[], Awaitable[Message]]
Send = Callable[[Message], Awaitable[None]]

#: Her iki metrikte de bulunan sozlesme etiketleri.
_BASE_LABELS = ("project", "environment", "service")


def _client_gone_errors() -> tuple[type[BaseException], ...]:
    """Istemcinin ortadan kaybolmasini ifade eden istisnalar.

    Bunlar SUNUCU HATASI DEGILDIR ve 5xx sayilmamalidir: kullanici sekmeyi
    kapattiginda ya da mobil baglanti dustugunde hata orani panosunda
    olmayan bir arizanin gorunmesine yol acardi. Ozellikle uvicorn'un
    ClientDisconnected'i OSError turevidir, yani duz `except Exception`
    onu yakalar.

    Adlar surumden surume degisebildigi icin varsa import edilir.
    """
    errors: tuple[type[BaseException], ...] = (ConnectionResetError, BrokenPipeError)
    try:
        from uvicorn.protocols.utils import ClientDisconnected

        errors += (ClientDisconnected,)
    except ImportError:  # pragma: no cover — uvicorn yoksa (testler)
        pass
    try:
        from starlette.requests import ClientDisconnect

        errors += (ClientDisconnect,)
    except ImportError:  # pragma: no cover
        pass
    return errors


CLIENT_GONE_ERRORS = _client_gone_errors()

#: status_class'in alabilecegi TUM degerler — kod degil, SINIF (500 degil, 5xx).
STATUS_CLASSES = ("2xx", "3xx", "4xx", "5xx")

REQUEST_COUNT = Counter(
    "http_server_requests_total",
    "Tamamlanan HTTP isteklerinin toplam sayisi.",
    (*_BASE_LABELS, "status_class"),
)

#: SANIYE cinsinden — milisaniye DEGIL. Sozlesme acikca saniye ister ve
#: Drake p95'i bu histogramin _bucket serisinden hesaplar.
REQUEST_DURATION = Histogram(
    "http_server_request_duration_seconds",
    "HTTP istek suresi (saniye).",
    _BASE_LABELS,
    buckets=(0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0, float("inf")),
)


def status_class(status_code: int) -> str:
    """HTTP durum SINIFI dondurur — kodun kendisini degil.

    Beklenmeyen bir kod (1xx, 0, 6xx) '5xx' sayilir. Boylece etiket kumesi
    sozlesmedeki dort degerle SINIRLI kalir ve anomali kaybolmak yerine hata
    oraninda gorunur olur.
    """
    bucket = status_code // 100
    if 2 <= bucket <= 5:
        return f"{bucket}xx"
    return "5xx"


class PrometheusMiddleware:
    """Istek sayaci + sure histogrami tutan SAF ASGI middleware.

    Neden saf ASGI, BaseHTTPMiddleware DEGIL: BaseHTTPMiddleware her istek
    icin fazladan bir anyio task'i ve bellek stream'i kurar; streaming
    yanitlarin ve BackgroundTask semantiginin davranisini degistirebilir.
    Burada yapilan is iki sayac artirmaktan ibaret oldugu icin istegin
    yoluna o maliyeti eklemeye gerek yok.

    GUVENCE — bu middleware istegi asla dusurmez ve degistirmez:
      * send/receive oldugu gibi aktarilir, mesajlar kopyalanmaz.
      * Metrik kaydi try/except icindedir; kayit hatasi yutulur.
      * Uygulamanin istisnasi 5xx olarak kaydedilir ve OLDUGU GIBI yukari
        birakilir (yukaridaki ServerErrorMiddleware onu 500'e cevirir).

    Saglik yoklamalari (/health) BILEREK haric tutulmaz — bkz. modul
    dokumantasyonu ve LOGISLOT_METRICS.md raporu.
    """

    def __init__(
        self,
        app: Callable[[Scope, Receive, Send], Awaitable[None]],
        *,
        project: str,
        environment: str,
        service: str,
    ) -> None:
        self.app = app
        base = (project, environment, service)
        # Etiket degerleri surec omru boyunca sabittir; child'lar bir kez
        # baglanir, istek basina .labels() sozluk aramasi olmaz.
        self._duration = REQUEST_DURATION.labels(*base)
        self._counters = {cls: REQUEST_COUNT.labels(*base, cls) for cls in STATUS_CLASSES}

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        # lifespan ve websocket bu metriklerin konusu degil.
        if scope.get("type") != "http":
            await self.app(scope, receive, send)
            return

        started = time.perf_counter()
        # None = yanit hic baslamadi.
        status_code: int | None = None

        async def send_wrapper(message: Message) -> None:
            nonlocal status_code
            if message["type"] == "http.response.start":
                status_code = message["status"]
            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
        except CLIENT_GONE_ERRORS:
            # Istemci gitti. Yanit BASLAMISSA gercek sinifiyla sayilir
            # (200 gonderilip govde yarida kaldiysa bu bir 2xx'tir);
            # hic baslamadiysa HIC sayilmaz. 5xx yazmak, olmayan bir sunucu
            # arizasini hata oranina eklerdi.
            if status_code is not None:
                self._record(status_code, started)
            raise
        except BaseException:
            # BaseException, cunku asyncio.CancelledError Exception DEGILDIR:
            # rollout sirasinda iptal edilen istekler aksi halde iki
            # metrikten birden sessizce kaybolurdu.
            self._record(status_code if status_code is not None else 500, started)
            raise
        self._record(status_code if status_code is not None else 500, started)

    def _record(self, status_code: int, started: float) -> None:
        try:
            self._counters[status_class(status_code)].inc()
            self._duration.observe(time.perf_counter() - started)
        except Exception:  # pragma: no cover — metrik istegi dusuremez
            logger.debug("metrik kaydedilemedi", exc_info=True)


# --- Ticket entegrasyonu metrikleri --------------------------------------
#
# Bunlar Drake sozlesmesinin ILK IKI metrigine EK'tir; onlarin adlarina veya
# etiketlerine dokunmazlar. Etiket kumesi yine bilerek sabit kardinalitede:
# tenant/ticket/hata metni ETIKET DEGIL, structured log alanidir
# (00_SHARED_PLATFORM/06, bolum 6).

TICKET_CREATED = Counter(
    "ticket_created_total",
    "Yerel olarak olusturulan destek ticketlari.",
    (*_BASE_LABELS, "category", "requester_type"),
)

TICKET_DELIVERY_ATTEMPT = Counter(
    "ticket_delivery_attempt_total",
    "Ticket komut/olay teslimat denemeleri.",
    (*_BASE_LABELS, "direction", "result"),
)

TICKET_WEBHOOK_SIGNATURE_FAILURE = Counter(
    "ticket_webhook_signature_failure_total",
    "Reddedilen webhook imzalari.",
    (*_BASE_LABELS, "reason"),
)

TICKET_WEBHOOK_EVENT = Counter(
    "ticket_webhook_event_total",
    "Islenen webhook olaylari (uygulandi/no-op/bosluk).",
    (*_BASE_LABELS, "outcome"),
)

TICKET_AUTHZ_DENIED = Counter(
    "ticket_authz_denied_total",
    "Ticket yuzeylerinde reddedilen yetkisiz erisimler.",
    (*_BASE_LABELS, "surface", "reason"),
)


def _base_label_values() -> tuple[str, str, str]:
    """Sozlesme etiketleri — ayarlardan okunur, cagri basina hesaplanmaz."""
    global _base_values
    if _base_values is None:
        from app.core.config import get_settings

        settings = get_settings()
        _base_values = (
            settings.metrics_project,
            settings.metrics_environment,
            settings.metrics_service,
        )
    return _base_values


_base_values: tuple[str, str, str] | None = None


def _safe_inc(counter: Counter, *labels: str) -> None:
    """Metrik kaydi ASLA is akisini dusurmez."""
    try:
        counter.labels(*_base_label_values(), *labels).inc()
    except Exception:  # pragma: no cover
        logger.debug("ticket metrigi kaydedilemedi", exc_info=True)


def record_ticket_created(category: str, requester_type: str) -> None:
    _safe_inc(TICKET_CREATED, category, requester_type)


def record_ticket_delivery(direction: str, result: str) -> None:
    _safe_inc(TICKET_DELIVERY_ATTEMPT, direction, result)


def record_webhook_signature_failure(reason: str) -> None:
    _safe_inc(TICKET_WEBHOOK_SIGNATURE_FAILURE, reason)


def record_webhook_event(outcome: str) -> None:
    _safe_inc(TICKET_WEBHOOK_EVENT, outcome)


def record_ticket_authz_denied(surface: str, reason: str) -> None:
    _safe_inc(TICKET_AUTHZ_DENIED, surface, reason)


_metrics_server_started = False


def start_metrics_server(port: int) -> bool:
    """/metrics'i AYRI ve yalnizca kume ici bir portta yayina alir.

    Uygulama portunda (8000) DEGIL, cunku o port NodePort ile disariya
    aciktir (dev 30081 / prod 30083) ve /metrics trafik seklini anlatir —
    kumeden cikmasi icin bir sebep yok. Bu port hicbir Service'e,
    NodePort'a veya Ingress'e baglanmaz; Prometheus pod IP'sine dogrudan
    gider.

    Bind edilemezse UYGULAMA ACILMAYA DEVAM EDER: gozlemlenebilirlik
    kaybi, servisin dusmesinden iyidir.
    """
    global _metrics_server_started
    if _metrics_server_started:
        return True
    try:
        start_http_server(port)
    except OSError:
        logger.warning("metrik sunucusu %s portunda baslatilamadi", port, exc_info=True)
        return False
    _metrics_server_started = True
    logger.info("metrik sunucusu dinlemede: 0.0.0.0:%s/metrics", port)
    return True
