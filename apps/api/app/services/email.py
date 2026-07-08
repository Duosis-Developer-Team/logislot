"""E-posta soyutlamasi.

Iki provider vardir (LOGISLOT_EMAIL_PROVIDER ile secilir):
- `log_only` (VARSAYILAN): gondermez, EmailLog'a `sent` yazar.
- `smtp`: gercek SMTP (STARTTLS + timeout). Eksik konfigurasyonda API yine
  boot eder; gonderim `failed` olarak loglanir (karar: fail-safe — e-posta
  altyapisi randevu operasyonunu ASLA durdurmaz).

Provider hatasi her durumda yakalanir: EmailLog `failed` yazilir, lifecycle
transaction'i etkilenmez.
"""

import asyncio
import logging
import smtplib
import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from email.message import EmailMessage as MimeEmailMessage
from email.utils import formataddr, make_msgid
from typing import Any, Protocol

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models import EmailLog

logger = logging.getLogger("logislot.email")


@dataclass
class EmailMessage:
    tenant_id: uuid.UUID
    facility_id: uuid.UUID
    recipient_email: str
    subject: str
    body: str
    template_key: str
    recipient_name: str | None = None
    appointment_id: uuid.UUID | None = None
    notification_id: uuid.UUID | None = None
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class EmailSendResult:
    status: str  # sent / failed / skipped
    error_message: str | None = None
    provider_message_id: str | None = None


class EmailProvider(Protocol):
    name: str

    async def send(self, message: EmailMessage) -> EmailSendResult: ...


class LogOnlyEmailProvider:
    """Demo/dev provider: e-posta GONDERMEZ; yalnizca loglar."""

    name = "log_only"

    async def send(self, message: EmailMessage) -> EmailSendResult:
        logger.info(
            "email[log_only] to=%s template=%s subject=%r",
            message.recipient_email,
            message.template_key,
            message.subject,
        )
        return EmailSendResult(status="sent")


class SMTPEmailProvider:
    """Gercek SMTP gonderimi (duz metin; STARTTLS + timeout).

    smtplib senkron oldugu icin gonderim thread'e alinir (event loop
    bloklanmaz). Her turlu hata EmailSendResult(failed) olarak doner.
    """

    name = "smtp"

    #: smtp secildiginde zorunlu ayarlar (bos ise gonderim failed olur).
    REQUIRED_FIELDS = ("smtp_host", "smtp_from_email")

    def _missing_config(self) -> list[str]:
        settings = get_settings()
        return [f for f in self.REQUIRED_FIELDS if not getattr(settings, f)]

    def _send_sync(self, message: EmailMessage) -> str:
        """Thread icinde kosar; Message-ID dondurur, hata firlatabilir."""
        settings = get_settings()
        mime = MimeEmailMessage()
        mime["Subject"] = message.subject
        mime["From"] = formataddr((settings.smtp_from_name, settings.smtp_from_email))
        mime["To"] = (
            formataddr((message.recipient_name, message.recipient_email))
            if message.recipient_name
            else message.recipient_email
        )
        message_id = make_msgid(domain=settings.smtp_from_email.split("@")[-1])
        mime["Message-ID"] = message_id
        mime.set_content(message.body)

        with smtplib.SMTP(
            settings.smtp_host, settings.smtp_port, timeout=settings.smtp_timeout_seconds
        ) as smtp:
            if settings.smtp_use_tls:
                smtp.starttls()
            if settings.smtp_username:
                smtp.login(settings.smtp_username, settings.smtp_password)
            smtp.send_message(mime)
        return message_id

    async def send(self, message: EmailMessage) -> EmailSendResult:
        missing = self._missing_config()
        if missing:
            return EmailSendResult(
                status="failed",
                error_message=(
                    "SMTP yapilandirmasi eksik: "
                    + ", ".join(f"LOGISLOT_{f.upper()}" for f in missing)
                ),
            )
        try:
            message_id = await asyncio.to_thread(self._send_sync, message)
        except Exception as exc:
            return EmailSendResult(status="failed", error_message=str(exc))
        return EmailSendResult(status="sent", provider_message_id=message_id)


_PROVIDERS: dict[str, EmailProvider] = {
    "log_only": LogOnlyEmailProvider(),
    "smtp": SMTPEmailProvider(),
}


def get_email_provider() -> EmailProvider:
    name = getattr(get_settings(), "email_provider", "log_only")
    return _PROVIDERS.get(name, _PROVIDERS["log_only"])


async def send_email(db: AsyncSession, message: EmailMessage) -> EmailLog:
    """Provider'a gonderir ve sonucu EmailLog olarak kalicilastirir.

    Provider hatasi istegi DUSURMEZ: kayit `failed` yazilir, akis devam eder.
    Commit cagirana aittir (lifecycle transaction'inin parcasi).
    """
    provider = get_email_provider()
    try:
        result = await provider.send(message)
    except Exception as exc:  # provider hatasi operasyonu bozmasin
        logger.warning("email provider error: %s", exc)
        result = EmailSendResult(status="failed", error_message=str(exc))

    metadata = dict(message.metadata or {})
    if result.provider_message_id:
        metadata["provider_message_id"] = result.provider_message_id
    if result.status == "failed":
        logger.warning(
            "email FAILED to=%s template=%s: %s",
            message.recipient_email, message.template_key, result.error_message,
        )

    entry = EmailLog(
        tenant_id=message.tenant_id,
        facility_id=message.facility_id,
        recipient_email=message.recipient_email,
        recipient_name=message.recipient_name,
        subject=message.subject,
        body=message.body,
        template_key=message.template_key,
        status=result.status,
        provider=provider.name,
        appointment_id=message.appointment_id,
        notification_id=message.notification_id,
        metadata_json=metadata or None,
        error_message=result.error_message,
        # Column default'lari INSERT'te uygulanir; backoff hesabi icin acikca ver.
        retry_count=0,
        max_attempts=3,
        last_attempt_at=datetime.now(UTC),
        sent_at=datetime.now(UTC) if result.status == "sent" else None,
    )
    if result.status == "failed":
        # Ilk deneme dustu: processor'un alabilmesi icin backoff planla.
        _schedule_next_retry(entry, datetime.now(UTC))
    db.add(entry)
    return entry


#: Retry backoff'u: 1. deneme +5 dk, 2. +30 dk, 3. +2 saat (rapor karari).
RETRY_BACKOFF_MINUTES = [5, 30, 120]


def _schedule_next_retry(entry: EmailLog, now: datetime) -> None:
    """retry_count'a gore siradaki deneme zamanini yazar (kalmadiysa None)."""
    if entry.retry_count < entry.max_attempts:
        delay = RETRY_BACKOFF_MINUTES[
            min(entry.retry_count, len(RETRY_BACKOFF_MINUTES) - 1)
        ]
        entry.next_retry_at = now + timedelta(minutes=delay)
    else:
        entry.next_retry_at = None


async def retry_email(db: AsyncSession, entry: EmailLog) -> EmailLog:
    """Failed/queued e-postayi YENIDEN gonderir (lifecycle'i tekrar CALISTIRMAZ).

    Kurallar:
    - sent/skipped kayitlar yeniden gonderilmez (409 EMAIL_ALREADY_SENT).
    - retry_count >= max_attempts -> 409 EMAIL_MAX_RETRIES_REACHED.
    - Basari: status=sent; basarisizlik: retry_count++, backoff'la next_retry_at.
    Commit CAGIRANA aittir.
    """
    from app.core.errors import ApiError

    if entry.status == "sent":
        raise ApiError("EMAIL_ALREADY_SENT", "Bu e-posta zaten gonderilmis", 409)
    if entry.status not in ("failed", "queued"):
        raise ApiError(
            "EMAIL_NOT_RETRYABLE", f"'{entry.status}' durumundaki kayit gonderilemez", 409
        )
    if entry.retry_count >= entry.max_attempts:
        raise ApiError(
            "EMAIL_MAX_RETRIES_REACHED",
            f"En fazla {entry.max_attempts} yeniden deneme yapilabilir",
            409,
        )

    provider = get_email_provider()
    message = EmailMessage(
        tenant_id=entry.tenant_id,
        facility_id=entry.facility_id,
        recipient_email=entry.recipient_email,
        recipient_name=entry.recipient_name,
        subject=entry.subject,
        body=entry.body or "",
        template_key=entry.template_key,
        appointment_id=entry.appointment_id,
        notification_id=entry.notification_id,
        metadata=dict(entry.metadata_json or {}),
    )
    now = datetime.now(UTC)
    entry.retry_count += 1
    entry.last_attempt_at = now
    try:
        result = await provider.send(message)
    except Exception as exc:
        result = EmailSendResult(status="failed", error_message=str(exc))

    entry.provider = provider.name
    if result.status == "sent":
        entry.status = "sent"
        entry.sent_at = now
        entry.error_message = None
        entry.next_retry_at = None
        if result.provider_message_id:
            metadata = dict(entry.metadata_json or {})
            metadata["provider_message_id"] = result.provider_message_id
            entry.metadata_json = metadata
    else:
        entry.status = "failed"
        entry.error_message = result.error_message
        _schedule_next_retry(entry, now)
        logger.warning(
            "email retry FAILED id=%s attempt=%s: %s",
            entry.id, entry.retry_count, result.error_message,
        )
    return entry


async def process_due_retries(db: AsyncSession, limit: int = 50) -> dict:
    """Zamani gelmis failed/queued kayitlari topluca yeniden dener.

    Maintenance komutu icindir (cron); commit cagirana aittir.
    """
    from sqlalchemy import select

    now = datetime.now(UTC)
    rows = list(
        (
            await db.execute(
                select(EmailLog)
                .where(
                    EmailLog.status.in_(["failed", "queued"]),
                    EmailLog.retry_count < EmailLog.max_attempts,
                    EmailLog.next_retry_at.is_not(None),
                    EmailLog.next_retry_at <= now,
                )
                .order_by(EmailLog.next_retry_at)
                .limit(limit)
            )
        ).scalars()
    )
    sent = failed = 0
    for entry in rows:
        await retry_email(db, entry)
        if entry.status == "sent":
            sent += 1
        else:
            failed += 1
    return {"processed": len(rows), "sent": sent, "failed": failed}
