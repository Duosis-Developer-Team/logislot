"""Hermes destek sozlesmesi v1 — LogiSlot tarafindaki TEK kaynak.

Bu dosya `hermes-logislot-ticketing-cto-pack-v1.0/00_SHARED_PLATFORM/
04_API_AND_EVENT_CONTRACT.md` dosyasinin kod karsiligidir. LogiSlot bu
sozlesmenin CONSUMER tarafidir: burada tek tarafli alan/enum/kod eklenmez.
Sozlesme degisikligi gerekiyorsa once ortak karar gunlugu guncellenir.

Alan adlari ve enum degerleri `tests/contracts/hermes_support_v1/` altindaki
fixture'larla birebir dogrulanir; drift CI'da kirmizi verir.
"""

from typing import Final

#: Payload'larda tasinan sozlesme surumu. Major degisiklik URL'de (`/v1`).
CONTRACT_VERSION: Final = "1.0"

#: LogiSlot'un Hermes'teki uygulama kodu — token bu koda baglidir ve
#: baska bir uygulama adina istek yapilamaz.
APPLICATION_CODE: Final = "logislot"

# --- Uc noktalar (base URL'e gore GOREL) --------------------------------

ROUTING_GROUPS_PATH: Final = "/support/routing-groups"
ROUTE_VALIDATE_PATH: Final = "/support/routes/validate"
ATTACHMENT_SESSIONS_PATH: Final = "/support/attachments/sessions"
TICKETS_PATH: Final = "/support/tickets"


def attachment_content_path(upload_id: str) -> str:
    """Dosya baytlarinin yazildigi uc.

    Sozlesme (bolum 5) `upload_url`'i "short-lived-presigned-url" olarak tarif
    eder, yani tarayici DOGRUDAN yukler. Hermes'in bu ucu ise servis token'i
    istiyor ve CORS izni vermiyor; bu yuzden baytlar LogiSlot uzerinden gecer
    (bkz. ticket_service.upload_attachment_content).
    """
    return f"/support/attachments/{upload_id}/content"


def attachment_complete_path(upload_id: str) -> str:
    return f"/support/attachments/{upload_id}/complete"


def attachment_download_path(attachment_id: str) -> str:
    return f"/support/attachments/{attachment_id}/download"


def ticket_path(ticket_id: str) -> str:
    return f"/support/tickets/{ticket_id}"


def ticket_by_source_path(source_ticket_id: str) -> str:
    return f"/support/tickets/by-source/{source_ticket_id}"


def ticket_messages_path(ticket_id: str) -> str:
    return f"/support/tickets/{ticket_id}/messages"


def ticket_reopen_path(ticket_id: str) -> str:
    return f"/support/tickets/{ticket_id}/reopen"


def ticket_confirm_close_path(ticket_id: str) -> str:
    return f"/support/tickets/{ticket_id}/confirm-close"


def ticket_cancel_path(ticket_id: str) -> str:
    return f"/support/tickets/{ticket_id}/cancel"


# --- Basliklar ----------------------------------------------------------

HEADER_IDEMPOTENCY: Final = "Idempotency-Key"
HEADER_CORRELATION: Final = "X-Correlation-Id"

WEBHOOK_HEADER_EVENT_ID: Final = "X-Hermes-Event-Id"
WEBHOOK_HEADER_TIMESTAMP: Final = "X-Hermes-Timestamp"
WEBHOOK_HEADER_SIGNATURE: Final = "X-Hermes-Signature"
WEBHOOK_HEADER_KEY_ID: Final = "X-Hermes-Key-Id"

# --- Event tipleri ------------------------------------------------------
#
# Internal note olayi BU LISTEDE YOKTUR ve olmayacaktir: Hermes'in ic notlari
# kaynak uygulamaya hicbir kanaldan cikmaz (00_SHARED_PLATFORM/04, bolum 10).

EVENT_TICKET_CREATED: Final = "ticket.created.v1"
EVENT_TICKET_STATUS_CHANGED: Final = "ticket.status_changed.v1"
EVENT_TICKET_PUBLIC_MESSAGE_ADDED: Final = "ticket.public_message_added.v1"
EVENT_TICKET_ASSIGNMENT_CHANGED: Final = "ticket.assignment_changed.v1"
EVENT_TICKET_RESOLVED: Final = "ticket.resolved.v1"
EVENT_TICKET_REOPENED: Final = "ticket.reopened.v1"
EVENT_TICKET_CLOSED: Final = "ticket.closed.v1"
EVENT_TICKET_ATTACHMENT_READY: Final = "ticket.attachment_ready.v1"

KNOWN_EVENT_TYPES: Final = frozenset(
    {
        EVENT_TICKET_CREATED,
        EVENT_TICKET_STATUS_CHANGED,
        EVENT_TICKET_PUBLIC_MESSAGE_ADDED,
        EVENT_TICKET_ASSIGNMENT_CHANGED,
        EVENT_TICKET_RESOLVED,
        EVENT_TICKET_REOPENED,
        EVENT_TICKET_CLOSED,
        EVENT_TICKET_ATTACHMENT_READY,
    }
)

# --- Hata kodlari -------------------------------------------------------

ERROR_ROUTE_MISSING: Final = "route_missing"
ERROR_ROUTE_STALE: Final = "route_stale"
ERROR_GROUP_INACTIVE: Final = "group_inactive"
ERROR_SOURCE_TENANT_UNKNOWN: Final = "source_tenant_unknown"
ERROR_IDEMPOTENCY_CONFLICT: Final = "idempotency_conflict"
ERROR_ATTACHMENT_NOT_READY: Final = "attachment_not_ready"
ERROR_TICKET_VERSION_CONFLICT: Final = "ticket_version_conflict"
ERROR_FORBIDDEN: Final = "forbidden"
ERROR_RATE_LIMITED: Final = "rate_limited"
ERROR_INTEGRATION_UNAVAILABLE: Final = "integration_unavailable"

KNOWN_ERROR_CODES: Final = frozenset(
    {
        ERROR_ROUTE_MISSING,
        ERROR_ROUTE_STALE,
        ERROR_GROUP_INACTIVE,
        ERROR_SOURCE_TENANT_UNKNOWN,
        ERROR_IDEMPOTENCY_CONFLICT,
        ERROR_ATTACHMENT_NOT_READY,
        ERROR_TICKET_VERSION_CONFLICT,
        ERROR_FORBIDDEN,
        ERROR_RATE_LIMITED,
        ERROR_INTEGRATION_UNAVAILABLE,
    }
)

#: Yeniden denenmesi ANLAMLI olan hata kodlari. Digerleri (ornegin
#: `forbidden`, `idempotency_conflict`) sonsuz retry firtinasi yaratir;
#: outbox onlari dead-letter'a alir ve operator inceler.
RETRYABLE_ERROR_CODES: Final = frozenset(
    {ERROR_RATE_LIMITED, ERROR_INTEGRATION_UNAVAILABLE}
)

#: `route_stale` ozel bir kurtarma is akisidir (bkz. 02_LOGISLOT/01, bolum 6):
#: retry ETMEK yerine komut "route yenilenmeli" olarak isaretlenir; platform
#: yoneticisi route'u tazeledikten sonra AYNI source_ticket_id ile YENI bir
#: idempotency key uzerinden tekrar gonderilir.
ROUTE_RECOVERY_ERROR_CODES: Final = frozenset(
    {ERROR_ROUTE_STALE, ERROR_ROUTE_MISSING, ERROR_GROUP_INACTIVE}
)

# --- Alan limitleri (Hermes ile ayni) ------------------------------------
#
# Alt sinirlar LogiSlot'un tercihi DEGIL, Hermes'in sunucu tarafi kuralidir
# (canli dogrulandi: title < 8 ve description < 20 -> 422 validation_error).
# Formda uygulanmalarinin sebebi kayit yerelde olusup teslimatta 422 ile
# takilmasin: musteri "talep acildi" sanir, destek hicbir zaman gormezdi.
# DUSURMEYIN — once Hermes tarafi gevsetilmeli, sonra buradaki sayi.

TITLE_MIN_LENGTH: Final = 8
TITLE_MAX_LENGTH: Final = 160
DESCRIPTION_MIN_LENGTH: Final = 20
DESCRIPTION_MAX_LENGTH: Final = 10_000
MESSAGE_MIN_LENGTH: Final = 1
MESSAGE_MAX_LENGTH: Final = 10_000
REOPEN_REASON_MIN_LENGTH: Final = 5
REOPEN_REASON_MAX_LENGTH: Final = 2_000

#: Otomatik toplanan tarayici baglaminda IZIN VERILEN alanlar. Allowlist'tir:
#: burada olmayan hicbir sey Hermes'e gitmez (query string, cookie, token,
#: form degeri, localStorage ...). Bkz. 00_SHARED_PLATFORM/05, bolum 4.
CLIENT_CONTEXT_ALLOWED_FIELDS: Final = (
    "app_version",
    "environment",
    "page_path",
    "browser",
    "os",
    "locale",
    "timezone",
    "device_class",
    "client_timestamp",
)
