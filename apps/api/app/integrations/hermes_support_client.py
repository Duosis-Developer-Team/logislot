"""Hermes destek API'sinin tek typed istemcisi.

TASARIM KURALLARI (00_SHARED_PLATFORM/03, bolum 9 "yasak mimariler"):
  * Service token YALNIZCA backend'dedir; hicbir yanit onu tarayiciya tasimaz.
  * Hermes veritabanina/modeline bagimlilik YOKTUR; yalnizca HTTP + JSON.
  * Istek ici retry BILEREK cok sinirlidir (yalnizca baglanti kurulamamasi).
    Asil dayaniklilik outbox + scheduler'dadir; kullanicinin istegini uzun
    retry'larla bekletmek hem UX'i hem baglanti havuzunu bozar.

Hata modeli: her basarisizlik `HermesApiError` olur ve sozlesmedeki hata
kodunu (`route_stale`, `group_inactive`, ...) tasir. Cagiran kod HTTP durum
koduna gore dallanmaz; koda gore dallanir.
"""

from __future__ import annotations

import logging
import re
import uuid
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

import httpx

from app.core.config import get_settings
from app.integrations import hermes_contract as contract

logger = logging.getLogger("logislot.hermes.client")

#: Hermes'in sema dogrulama hata kodu. Sozlesmedeki kodlardan biri DEGIL;
#: yalnizca validate ucundaki gecici uyum dalini tetiklemek icin taninir.
_PEER_VALIDATION_ERROR = "validation_error"

#: Hermes kurulumunda ek yukleme kapali (TICKET_ATTACHMENTS_ENABLED=false).
#: Sozlesmedeki kod listesinde YOK; bizim tarafta bir sey bozuk degildir, bu
#: yuzden kullaniciya "hata" degil "su anda kabul edilmiyor" denir.
PEER_SUPPORT_NOT_CONFIGURED = "support_not_configured"

#: Loglara/hata mesajlarina sizabilecek desenler. Mesajlar kullaniciya ve
#: audit'e gidebildigi icin temizlik ISTEMCIDE yapilir — cagiran her yerde
#: hatirlanmasi gereken bir kural birakmak guvenilmez olurdu.
_SECRET_PATTERNS = (
    re.compile(r"(?i)(bearer\s+)[A-Za-z0-9._\-]+"),
    re.compile(r"(?i)(\"?(?:token|secret|authorization|signature)\"?\s*[:=]\s*\"?)[^\"\s,}]+"),
)


def redact(text: str | None) -> str:
    """Token/imza benzeri degerleri maskeler."""
    if not text:
        return ""
    cleaned = text
    for pattern in _SECRET_PATTERNS:
        cleaned = pattern.sub(r"\1[REDACTED]", cleaned)
    return cleaned[:500]


class HermesApiError(Exception):
    """Hermes tarafindan (veya ulasilamamasindan) kaynaklanan hata."""

    def __init__(
        self,
        code: str,
        message: str = "",
        *,
        status_code: int | None = None,
        retryable: bool | None = None,
        details: Any = None,
        correlation_id: str | None = None,
    ) -> None:
        super().__init__(f"{code}: {redact(message)}")
        self.code = code
        self.message = redact(message)
        self.status_code = status_code
        self.details = details
        self.correlation_id = correlation_id
        self.retryable = self._resolve_retryable(retryable)

    def _resolve_retryable(self, declared: bool | None) -> bool:
        # Sunucunun `retryable` bayragi ONCELIKLIDIR; yoksa sozlesmedeki
        # siniflandirmaya, o da yoksa HTTP sinifina bakilir (408/429/5xx).
        if declared is not None:
            return declared
        if self.code in contract.RETRYABLE_ERROR_CODES:
            return True
        if self.code in contract.ROUTE_RECOVERY_ERROR_CODES:
            return False
        if self.status_code is None:
            return True  # ag/timeout — baglanti hic kurulamadi
        if self.status_code in (408, 429):
            return True
        return self.status_code >= 500


class HermesNotConfiguredError(HermesApiError):
    """Base URL/token verilmemis. Hata degil, yapilandirma eksikligidir."""

    def __init__(self) -> None:
        super().__init__(
            contract.ERROR_INTEGRATION_UNAVAILABLE,
            "Hermes destek entegrasyonu yapilandirilmamis.",
            retryable=True,
        )


@dataclass
class GroupCatalogResult:
    items: list[dict[str, Any]]
    catalog_version: str | None = None
    etag: str | None = None
    #: 304 dondugunde True — cagiran onbellegini tazeleyip birakabilir.
    not_modified: bool = False


@dataclass
class HermesResponse:
    """Basarili bir cagrinin govdesi + tekrar kullanilabilir ETag."""

    data: dict[str, Any] = field(default_factory=dict)
    status_code: int = 200
    etag: str | None = None


class HermesSupportClient:
    """Hermes destek uc noktalarinin ince, typed sarmalayicisi."""

    def __init__(
        self,
        *,
        base_url: str | None = None,
        token: str | None = None,
        application_code: str | None = None,
        timeout: float | None = None,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        settings = get_settings()
        raw_base = base_url if base_url is not None else settings.hermes_support_base_url
        self.base_url = raw_base.rstrip("/")
        self._token = token if token is not None else settings.hermes_support_token
        self.application_code = application_code or settings.hermes_support_application_code
        self._timeout = timeout if timeout is not None else settings.hermes_support_timeout_seconds
        self._transport = transport

    @property
    def configured(self) -> bool:
        return bool(self.base_url and self._token)

    # ---------- alt seviye ----------

    def _headers(
        self, *, idempotency_key: uuid.UUID | None, correlation_id: uuid.UUID | None
    ) -> dict[str, str]:
        headers = {
            "Authorization": f"Bearer {self._token}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }
        if idempotency_key is not None:
            headers[contract.HEADER_IDEMPOTENCY] = str(idempotency_key)
        if correlation_id is not None:
            headers[contract.HEADER_CORRELATION] = str(correlation_id)
        return headers

    async def _request(
        self,
        method: str,
        path: str,
        *,
        json_body: dict[str, Any] | None = None,
        idempotency_key: uuid.UUID | None = None,
        correlation_id: uuid.UUID | None = None,
        etag: str | None = None,
        allow_not_modified: bool = False,
    ) -> HermesResponse:
        if not self.configured:
            raise HermesNotConfiguredError()

        headers = self._headers(
            idempotency_key=idempotency_key, correlation_id=correlation_id
        )
        if etag:
            headers["If-None-Match"] = etag

        try:
            async with httpx.AsyncClient(
                base_url=self.base_url, timeout=self._timeout, transport=self._transport
            ) as client:
                response = await client.request(
                    method, path, json=json_body, headers=headers
                )
        except httpx.HTTPError as exc:
            # Ag/timeout: kod bilinmez, retry EDILIR. Istisna metni URL ve
            # bazen basliklari icerebildigi icin redaksiyondan gecer.
            raise HermesApiError(
                contract.ERROR_INTEGRATION_UNAVAILABLE,
                f"Hermes'e ulasilamadi: {type(exc).__name__}",
                retryable=True,
            ) from exc

        if allow_not_modified and response.status_code == 304:
            return HermesResponse(status_code=304, etag=response.headers.get("ETag") or etag)

        if response.status_code >= 400:
            raise self._error_from(response)

        try:
            body = response.json() if response.content else {}
        except ValueError as exc:
            raise HermesApiError(
                contract.ERROR_INTEGRATION_UNAVAILABLE,
                "Hermes yaniti JSON degil",
                status_code=response.status_code,
                retryable=True,
            ) from exc

        if not isinstance(body, dict):
            raise HermesApiError(
                contract.ERROR_INTEGRATION_UNAVAILABLE,
                "Hermes yaniti beklenen sekilde degil",
                status_code=response.status_code,
                retryable=True,
            )
        return HermesResponse(
            data=body, status_code=response.status_code, etag=response.headers.get("ETag")
        )

    def _error_from(self, response: httpx.Response) -> HermesApiError:
        code = contract.ERROR_INTEGRATION_UNAVAILABLE
        message = ""
        details = None
        retryable: bool | None = None
        correlation_id = None
        try:
            payload = response.json()
        except ValueError:
            payload = None
        if isinstance(payload, dict):
            error = payload.get("error")
            if isinstance(error, dict):
                code = str(error.get("code") or code)
                message = str(error.get("message") or "")
                details = error.get("details")
                correlation_id = error.get("correlation_id")
                if isinstance(error.get("retryable"), bool):
                    retryable = bool(error["retryable"])
        if code == contract.ERROR_INTEGRATION_UNAVAILABLE and response.status_code == 403:
            code = contract.ERROR_FORBIDDEN
        if code == contract.ERROR_INTEGRATION_UNAVAILABLE and response.status_code == 429:
            code = contract.ERROR_RATE_LIMITED
        return HermesApiError(
            code,
            message,
            status_code=response.status_code,
            retryable=retryable,
            details=details,
            correlation_id=correlation_id,
        )

    # ---------- grup katalogu ----------

    async def list_routing_groups(self, *, etag: str | None = None) -> GroupCatalogResult:
        response = await self._request(
            "GET",
            contract.ROUTING_GROUPS_PATH,
            etag=etag,
            allow_not_modified=True,
        )
        if response.status_code == 304:
            return GroupCatalogResult(items=[], etag=response.etag, not_modified=True)
        items = response.data.get("items")
        return GroupCatalogResult(
            items=list(items) if isinstance(items, list) else [],
            catalog_version=response.data.get("catalog_version"),
            etag=response.etag,
        )

    async def validate_route(
        self,
        *,
        source_tenant_id: uuid.UUID,
        group_id: uuid.UUID,
        correlation_id: uuid.UUID | None = None,
    ) -> dict[str, Any]:
        """Route dogrulamasi. Once SOZLESME govdesi, gerekirse uyum govdesi.

        GECICI UYUM KATMANI (28 Agu 2026). Hermes'in `/support/routes/validate`
        uygulamasi ortak fixture'dan (`route_validate_request.json`, iki repoda
        birebir ayni) SAPIYOR:

          sozlesme : {application_code, contract_version, group_id, source_tenant_id}
          Hermes   : {source_tenant: {id}, group_id}
                     — `application_code` ve `contract_version` "Extra inputs
                       are not permitted" ile 422 reddedilir.

        Sapma Hermes'in KENDI iclerinde de tutarsiz: ayni kurulumun
        `POST /support/tickets` ucu `contract_version` ve `source_tenant`
        nesnesini sorunsuz kabul ediyor. Yani duzeltilmesi gereken taraf
        Hermes; fixture TEK TARAFLI DEGISTIRILMEZ.

        Bu yuzden kanonik govde ONCE denenir (sozlesme otorite olarak kalir) ve
        yalnizca `validation_error` gelirse bir kez uyum govdesiyle tekrarlanir.
        Hermes ucu duzeltince ilk deneme gecer ve bu dal kendiliginden olur —
        o zaman blok silinebilir.
        """
        canonical = {
            "contract_version": contract.CONTRACT_VERSION,
            "application_code": self.application_code,
            "source_tenant_id": str(source_tenant_id),
            "group_id": str(group_id),
        }
        try:
            response = await self._request(
                "POST",
                contract.ROUTE_VALIDATE_PATH,
                json_body=canonical,
                correlation_id=correlation_id,
            )
        except HermesApiError as exc:
            if exc.code != _PEER_VALIDATION_ERROR:
                raise
            logger.warning(
                "Hermes /support/routes/validate sozlesme govdesini reddetti "
                "(%s); uyum govdesiyle tekrarlaniyor. Hermes ucu duzelince bu "
                "yedek dal kaldirilmali.",
                exc.code,
            )
            response = await self._request(
                "POST",
                contract.ROUTE_VALIDATE_PATH,
                json_body={
                    "source_tenant": {"id": str(source_tenant_id)},
                    "group_id": str(group_id),
                },
                correlation_id=correlation_id,
            )
        return response.data

    # ---------- ekler ----------

    async def upload_attachment_content(
        self,
        *,
        upload_id: uuid.UUID,
        content: bytes,
        content_type: str,
        correlation_id: uuid.UUID | None = None,
    ) -> dict[str, Any]:
        """Dosya baytlarini Hermes'e yazar (servis kimligiyle).

        Tarayici bu ucu KENDISI cagiramaz: servis token'i ister ve CORS izni
        vermez. Token tarayiciya cikamayacagi icin baytlar LogiSlot uzerinden
        gecer. Hermes gercek bir presigned URL dondurmeye baslarsa bu adim
        gereksizlesir.
        """
        if not self.configured:
            raise HermesNotConfiguredError()
        headers = self._headers(idempotency_key=None, correlation_id=correlation_id)
        headers["Content-Type"] = content_type
        try:
            async with httpx.AsyncClient(
                base_url=self.base_url, timeout=self._timeout, transport=self._transport
            ) as client:
                response = await client.put(
                    contract.attachment_content_path(str(upload_id)),
                    content=content,
                    headers=headers,
                )
        except httpx.HTTPError as exc:
            raise HermesApiError(
                contract.ERROR_INTEGRATION_UNAVAILABLE,
                f"Hermes'e ulasilamadi: {type(exc).__name__}",
                retryable=True,
            ) from exc
        if response.status_code >= 400:
            raise self._error_from(response)
        try:
            body = response.json() if response.content else {}
        except ValueError:
            body = {}
        return body if isinstance(body, dict) else {}

    async def create_upload_session(
        self,
        *,
        source_tenant_id: uuid.UUID,
        file_name: str,
        size_bytes: int,
        declared_mime_type: str,
        sha256: str | None = None,
        correlation_id: uuid.UUID | None = None,
    ) -> dict[str, Any]:
        body: dict[str, Any] = {
            "source_tenant_id": str(source_tenant_id),
            "file_name": file_name,
            "size_bytes": size_bytes,
            "declared_mime_type": declared_mime_type,
        }
        if sha256:
            body["sha256"] = sha256
        response = await self._request(
            "POST",
            contract.ATTACHMENT_SESSIONS_PATH,
            json_body=body,
            correlation_id=correlation_id,
        )
        return response.data

    async def complete_upload(
        self, *, upload_id: uuid.UUID, correlation_id: uuid.UUID | None = None
    ) -> dict[str, Any]:
        response = await self._request(
            "POST",
            contract.attachment_complete_path(str(upload_id)),
            json_body={},
            correlation_id=correlation_id,
        )
        return response.data

    async def attachment_download(
        self,
        *,
        attachment_id: uuid.UUID,
        ticket_id: uuid.UUID,
        source_tenant_id: uuid.UUID,
        correlation_id: uuid.UUID | None = None,
    ) -> dict[str, Any]:
        """Kisa omurlu indirme baglantisi ister. URL SAKLANMAZ, aninda kullanilir."""
        response = await self._request(
            "POST",
            contract.attachment_download_path(str(attachment_id)),
            json_body={
                "application_code": self.application_code,
                "source_tenant_id": str(source_tenant_id),
                "ticket_id": str(ticket_id),
            },
            correlation_id=correlation_id,
        )
        return response.data

    # ---------- ticket komutlari ----------

    async def create_ticket(
        self,
        payload: dict[str, Any],
        *,
        idempotency_key: uuid.UUID,
        correlation_id: uuid.UUID | None = None,
    ) -> dict[str, Any]:
        response = await self._request(
            "POST",
            contract.TICKETS_PATH,
            json_body=payload,
            idempotency_key=idempotency_key,
            correlation_id=correlation_id,
        )
        return response.data

    async def get_ticket_by_source(
        self,
        *,
        source_ticket_id: uuid.UUID,
        source_tenant_id: uuid.UUID | None = None,
        correlation_id: uuid.UUID | None = None,
    ) -> dict[str, Any]:
        """Kaynak kimligiyle ticket snapshot'i.

        `source_tenant_id` sozlesmede (bolum 7) YAZMIYOR ama Hermes ZORUNLU
        tutuyor; verilmedigi surece 422 doner ve mutabakat — yani kacan
        olaylarin guvenlik agi — hic calismaz. Tenant kapsami istemek makul
        oldugu icin gonderiliyor; cagiran tenant'i zaten biliyor.
        """
        path = contract.ticket_by_source_path(str(source_ticket_id))
        if source_tenant_id is not None:
            path = f"{path}?source_tenant_id={source_tenant_id}"
        response = await self._request("GET", path, correlation_id=correlation_id)
        return response.data

    async def get_ticket(
        self, *, ticket_id: uuid.UUID, correlation_id: uuid.UUID | None = None
    ) -> dict[str, Any]:
        response = await self._request(
            "GET", contract.ticket_path(str(ticket_id)), correlation_id=correlation_id
        )
        return response.data

    async def add_public_message(
        self,
        *,
        ticket_id: uuid.UUID,
        payload: dict[str, Any],
        idempotency_key: uuid.UUID,
        correlation_id: uuid.UUID | None = None,
    ) -> dict[str, Any]:
        response = await self._request(
            "POST",
            contract.ticket_messages_path(str(ticket_id)),
            json_body=payload,
            idempotency_key=idempotency_key,
            correlation_id=correlation_id,
        )
        return response.data

    async def reopen_ticket(
        self,
        *,
        ticket_id: uuid.UUID,
        payload: dict[str, Any],
        idempotency_key: uuid.UUID,
        correlation_id: uuid.UUID | None = None,
    ) -> dict[str, Any]:
        response = await self._request(
            "POST",
            contract.ticket_reopen_path(str(ticket_id)),
            json_body=payload,
            idempotency_key=idempotency_key,
            correlation_id=correlation_id,
        )
        return response.data

    async def confirm_close_ticket(
        self,
        *,
        ticket_id: uuid.UUID,
        payload: dict[str, Any],
        idempotency_key: uuid.UUID,
        correlation_id: uuid.UUID | None = None,
    ) -> dict[str, Any]:
        response = await self._request(
            "POST",
            contract.ticket_confirm_close_path(str(ticket_id)),
            json_body=payload,
            idempotency_key=idempotency_key,
            correlation_id=correlation_id,
        )
        return response.data

    async def cancel_ticket(
        self,
        *,
        ticket_id: uuid.UUID,
        payload: dict[str, Any],
        idempotency_key: uuid.UUID,
        correlation_id: uuid.UUID | None = None,
    ) -> dict[str, Any]:
        response = await self._request(
            "POST",
            contract.ticket_cancel_path(str(ticket_id)),
            json_body=payload,
            idempotency_key=idempotency_key,
            correlation_id=correlation_id,
        )
        return response.data


#: Testler ve ileride farkli ortamlar icin degistirilebilir fabrika.
#: Uretimde ayarlardan okuyan varsayilan kullanilir.
_client_factory: Callable[[], HermesSupportClient] = HermesSupportClient


def get_hermes_client() -> HermesSupportClient:
    return _client_factory()


def set_client_factory(factory: Callable[[], HermesSupportClient]) -> None:
    """Testlerde sahte tasima katmani baglamak icin."""
    global _client_factory
    _client_factory = factory


def reset_client_factory() -> None:
    global _client_factory
    _client_factory = HermesSupportClient


def register_hermes_error_handler(app) -> None:
    """`HermesApiError`'i standart hata zarfina cevirir.

    Bu handler OLMADAN Hermes'in her arizasi (ve "henuz yapilandirilmadi"
    durumu — dev/compose varsayilani tam olarak budur) uc noktalardan ham 500
    olarak cikardi: istemci hatanin gecici mi kalici mi oldugunu ayirt edemez
    ve kullaniciya anlamli bir sey gosteremezdi.

    Durum kodu semantigi:
      503 — gecici; istemci tekrar deneyebilir.
      502 — Hermes reddetti/anlasilmaz yanit verdi; tekrar denemek ayni sonucu
            verir, yapilandirma veya karsi taraf duzeltilmelidir.
    """
    from fastapi.responses import JSONResponse

    @app.exception_handler(HermesApiError)
    async def _handle(_request, exc: HermesApiError) -> JSONResponse:
        status_code = 503 if exc.retryable else 502
        logger.warning(
            "Hermes cagrisi basarisiz: code=%s status=%s retryable=%s",
            exc.code,
            exc.status_code,
            exc.retryable,
        )
        return JSONResponse(
            status_code=status_code,
            content={
                "success": False,
                "data": None,
                "error": {
                    "code": f"HERMES_{exc.code.upper()}",
                    "message": _user_message(exc),
                    "details": None,
                },
            },
        )


def _user_message(exc: HermesApiError) -> str:
    """Kullaniciya gosterilecek metin — teknik ayrinti ve secret TASIMAZ."""
    if isinstance(exc, HermesNotConfiguredError):
        return (
            "Destek merkezi baglantisi henuz yapilandirilmamis. Talebiniz "
            "kaydedildi ve baglanti kurulunca otomatik iletilecek."
        )
    return {
        contract.ERROR_INTEGRATION_UNAVAILABLE: (
            "Destek merkezine su anda ulasilamiyor; lutfen biraz sonra tekrar deneyin."
        ),
        contract.ERROR_RATE_LIMITED: (
            "Destek merkezi istek sinirina takildi; kisa bir sure sonra tekrar deneyin."
        ),
        contract.ERROR_FORBIDDEN: (
            "Destek merkezi entegrasyon yetkisini reddetti; sistem yoneticinize bildirin."
        ),
        contract.ERROR_ATTACHMENT_NOT_READY: (
            "Dosya henuz hazir degil; guvenlik kontrolu tamamlaninca kullanilabilir."
        ),
        PEER_SUPPORT_NOT_CONFIGURED: (
            "Destek merkezi su anda dosya eki kabul etmiyor. Talebinizi ek "
            "olmadan gonderebilirsiniz."
        ),
    }.get(exc.code, "Destek merkezi istegi tamamlayamadi.")
