"""Hermes webhook imzasinin dogrulanmasi (HMAC-SHA256, v1).

Imzali baytlar: ``<timestamp>.<ham istek govdesi>``. GOVDE PARSE EDILMEDEN
ONCE dogrulanir — aksi halde imzasiz bir payload JSON ayristiricisina, oradan
da is mantigina ulasirdi.

Uc bagimsiz kontrol vardir ve ucu de gereklidir:
  1. imza esitligi (sabit zamanli karsilastirma),
  2. timestamp penceresi (eski bir istegin tekrar oynatilmasini engeller),
  3. `event_id` UNIQUE inbox kaydi (pencere icindeki tekrari da idempotent
     kilar; 1 ve 2 tek basina replay'i tam kapatmaz).
"""

import hashlib
import hmac
import logging
import time
from dataclasses import dataclass

logger = logging.getLogger("logislot.hermes.webhook")


@dataclass(frozen=True)
class SignatureCheck:
    valid: bool
    #: Guvenlik logu icin makine-okunur sebep; yanit govdesine KONULMAZ.
    reason: str | None = None


def expected_signature(secret: str, timestamp: str, raw_body: bytes) -> str:
    payload = timestamp.encode("utf-8") + b"." + raw_body
    return hmac.new(secret.encode("utf-8"), payload, hashlib.sha256).hexdigest()


def _timestamp_seconds(timestamp: str) -> float | None:
    """`X-Hermes-Timestamp` degerini saniyeye cevirir.

    Hem epoch saniye hem ISO-8601 kabul edilir: sozlesme bicimi acikca
    sabitlemedigi icin gonderen tarafin secimi ne olursa olsun pencere
    kontrolu CALISMALIDIR — aksi halde kontrol sessizce devre disi kalirdi.
    """
    raw = timestamp.strip()
    try:
        return float(raw)
    except ValueError:
        pass
    from datetime import datetime

    try:
        parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError:
        return None
    return parsed.timestamp()


def verify_webhook_signature(
    *,
    raw_body: bytes,
    timestamp: str | None,
    signature: str | None,
    secrets: list[str],
    tolerance_seconds: int,
    now: float | None = None,
) -> SignatureCheck:
    """Imzayi dogrular. Birden fazla secret rotasyon penceresi icindir.

    Yalnizca True/False degil, SEBEP de dondurur: tekrarlayan imza
    hatalarinin alarma donusebilmesi icin sebebin loglanabilir olmasi gerekir.
    Sebep istemciye GONDERILMEZ (00_SHARED_PLATFORM/05, bolum 7).
    """
    if not signature:
        return SignatureCheck(False, "missing_signature")
    if not timestamp:
        return SignatureCheck(False, "missing_timestamp")
    usable = [s for s in secrets if s]
    if not usable:
        # Sir yapilandirilmamis: fail-CLOSED. Imzasiz kabul etmek, uc noktayi
        # internete acik bir yazma arayuzune cevirirdi.
        return SignatureCheck(False, "secret_not_configured")

    sent_at = _timestamp_seconds(timestamp)
    if sent_at is None:
        return SignatureCheck(False, "invalid_timestamp")
    current = time.time() if now is None else now
    if abs(current - sent_at) > tolerance_seconds:
        return SignatureCheck(False, "timestamp_out_of_window")

    candidate = signature.strip()
    # `sha256=<hex>` bicimini de kabul et; imza govdesi ayni kalir.
    if "=" in candidate and candidate.lower().startswith("sha256="):
        candidate = candidate.split("=", 1)[1]

    for secret in usable:
        if hmac.compare_digest(expected_signature(secret, timestamp, raw_body), candidate):
            return SignatureCheck(True)
    return SignatureCheck(False, "signature_mismatch")
