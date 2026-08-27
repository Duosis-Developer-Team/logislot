"""Hermes'ten gelen imzali ticket olaylarinin giris noktasi.

Bu uc nokta TENANT OTURUMU KULLANMAZ: cagiran bir insan degil, Hermes'in
dispatcher'idir. Kimlik dogrulamasi HMAC imzasiyla yapilir ve govde imza
dogrulanmadan ONCE parse edilmez.

Yanit sozlesmesi: olay DAYANIKLI biçimde kaydedildiyse 2xx doneriz — isleme
sirasinda hata olsa bile. Sebep: kayit bizde, yeniden deneme sorumlulugu da
bizde (`ticket_inbox_recovery`). Aksi halde Hermes ayni olayi tekrar tekrar
gonderir ve iki taraf ayni isi ikilerdi.
"""

import json
import logging

from fastapi import APIRouter, Request, Response
from fastapi.responses import JSONResponse

from app.core.config import get_settings
from app.core.db import control_session
from app.core.enums import TicketWebhookStatus
from app.core.metrics import record_webhook_signature_failure
from app.integrations import hermes_contract as contract
from app.integrations.hermes_support_signing import verify_webhook_signature
from app.maintenance.ticket_inbox import process_inbox_row, record_event

logger = logging.getLogger("logislot.ticket.webhook")
security_logger = logging.getLogger("logislot.security")

router = APIRouter(prefix="/integrations/hermes-support/v1", tags=["hermes-webhook"])


def _reject(status_code: int, code: str) -> JSONResponse:
    """Sebep DETAYI govdeye konmaz (00_SHARED_PLATFORM/05, bolum 7)."""
    return JSONResponse(status_code=status_code, content={"error": {"code": code}})


@router.post("/events")
async def receive_event(request: Request) -> Response:
    settings = get_settings()
    if not settings.ticketing_enabled:
        # Ozellik kapaliyken 503: Hermes retry etsin, olay kaybolmasin.
        return _reject(503, "feature_disabled")

    raw = await request.body()
    if len(raw) > settings.hermes_support_webhook_max_body_bytes:
        security_logger.warning("Hermes webhook govdesi cok buyuk: %s bayt", len(raw))
        return _reject(413, "payload_too_large")

    check = verify_webhook_signature(
        raw_body=raw,
        timestamp=request.headers.get(contract.WEBHOOK_HEADER_TIMESTAMP),
        signature=request.headers.get(contract.WEBHOOK_HEADER_SIGNATURE),
        secrets=[
            settings.hermes_support_webhook_secret,
            settings.hermes_support_webhook_secret_previous,
        ],
        tolerance_seconds=settings.hermes_support_webhook_tolerance_seconds,
    )
    if not check.valid:
        record_webhook_signature_failure(check.reason or "unknown")
        security_logger.warning(
            "Hermes webhook imzasi reddedildi: sebep=%s key_id=%s",
            check.reason,
            request.headers.get(contract.WEBHOOK_HEADER_KEY_ID),
        )
        return _reject(401, "invalid_signature")

    try:
        envelope = json.loads(raw)
    except ValueError:
        return _reject(400, "invalid_payload")
    if not isinstance(envelope, dict) or not envelope.get("event_id"):
        return _reject(400, "invalid_payload")

    # Uygulama kodu TAM esitlikle kontrol edilir: LogiSlot yalnizca kendi
    # olaylarini kabul eder, baska bir urunun olayini islemez.
    if str(envelope.get("application_code") or "") != settings.hermes_support_application_code:
        security_logger.warning(
            "Hermes webhook yanlis uygulama koduyla geldi: %s",
            envelope.get("application_code"),
        )
        return _reject(403, "application_mismatch")

    # Baslikta gelen olay kimligi ile govdedeki AYNI olmali; farkliysa
    # imzalanan govde ile islenen olay ayrisirdi.
    header_event_id = request.headers.get(contract.WEBHOOK_HEADER_EVENT_ID)
    if header_event_id and str(header_event_id) != str(envelope.get("event_id")):
        security_logger.warning("Hermes webhook olay kimligi baslikla uyusmuyor")
        return _reject(400, "event_id_mismatch")

    async with control_session() as db:
        try:
            row, is_new = await record_event(db, envelope=envelope)
        except (ValueError, TypeError):
            return _reject(400, "invalid_payload")

        if not is_new and row.status is TicketWebhookStatus.processed:
            # Replay: idempotent kabul. Ikinci bir projeksiyon/bildirim yok.
            return JSONResponse(status_code=200, content={"status": "duplicate"})

        outcome = await process_inbox_row(db, row)

    status_code = 200 if outcome in ("applied", "noop", "unknown_event") else 202
    return JSONResponse(status_code=status_code, content={"status": outcome})
