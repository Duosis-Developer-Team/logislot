"""Bildirim endpointleri.

Karar (raporda): hem admin (facility-scoped) hem supplier bildirimleri tam
gercek. Bildirimler alici basinadir: tenant kullanicisi yalnizca kendi
satirlarini, tedarikci yalnizca kendi firmasinin satirlarini gorur.
Platform kullanicisi operasyonel bildirimlere erisemez (facility context 403).
"""

import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.errors import NotFoundError
from app.core.permissions import TenantPermission
from app.core.responses import ok
from app.models import Notification
from app.schemas.catalog import NotificationOut
from app.tenancy.deps import (
    FacilityContext,
    get_supplier_context,
    require_facility_permissions,
)

router = APIRouter(tags=["notifications"])


class BulkResendRequest(BaseModel):
    email_log_ids: list[uuid.UUID] = Field(min_length=1)
    only_failed: bool = True


def _out(n: Notification) -> dict:
    data = NotificationOut.model_validate(n).model_dump(mode="json")
    data["is_read"] = n.read_at is not None
    return data


# ---------- Admin (facility-scoped, alici = giris yapan tenant kullanicisi) ----------


def _own_filter(ctx: FacilityContext):
    return (
        Notification.facility_id == ctx.facility_id,
        Notification.recipient_user_id == ctx.identity.id,
    )


@router.get("/facilities/{facility_id}/notifications")
async def list_notifications(
    ctx: FacilityContext = Depends(require_facility_permissions(TenantPermission.APPT_VIEW)),
    db: AsyncSession = Depends(get_db),
    unread_only: bool = False,
    limit: int = Query(default=30, le=100),
):
    query = select(Notification).where(*_own_filter(ctx))
    if unread_only:
        query = query.where(Notification.read_at.is_(None))
    result = await db.execute(query.order_by(Notification.created_at.desc()).limit(limit))
    return ok([_out(n) for n in result.scalars()])


@router.get("/facilities/{facility_id}/notifications/unread-count")
async def unread_count(
    ctx: FacilityContext = Depends(require_facility_permissions(TenantPermission.APPT_VIEW)),
    db: AsyncSession = Depends(get_db),
):
    count = (
        await db.execute(
            select(func.count(Notification.id)).where(
                *_own_filter(ctx), Notification.read_at.is_(None)
            )
        )
    ).scalar_one()
    return ok({"unread": int(count)})


@router.post("/facilities/{facility_id}/notifications/{notification_id}/read")
async def mark_read(
    notification_id: uuid.UUID,
    ctx: FacilityContext = Depends(require_facility_permissions(TenantPermission.APPT_VIEW)),
    db: AsyncSession = Depends(get_db),
):
    notification = (
        await db.execute(
            select(Notification).where(
                Notification.id == notification_id, *_own_filter(ctx)
            )
        )
    ).scalar_one_or_none()
    if notification is None:
        raise NotFoundError("Bildirim bulunamadi")
    if notification.read_at is None:
        notification.read_at = datetime.now(UTC)
        await db.commit()
    return ok(_out(notification))


@router.post("/facilities/{facility_id}/notifications/read-all")
async def read_all(
    ctx: FacilityContext = Depends(require_facility_permissions(TenantPermission.APPT_VIEW)),
    db: AsyncSession = Depends(get_db),
):
    await db.execute(
        update(Notification)
        .where(*_own_filter(ctx), Notification.read_at.is_(None))
        .values(read_at=datetime.now(UTC))
    )
    await db.commit()
    return ok({"read_all": True})


@router.delete("/facilities/{facility_id}/notifications/{notification_id}")
async def delete_notification(
    notification_id: uuid.UUID,
    ctx: FacilityContext = Depends(require_facility_permissions(TenantPermission.APPT_VIEW)),
    db: AsyncSession = Depends(get_db),
):
    notification = (
        await db.execute(
            select(Notification).where(
                Notification.id == notification_id, *_own_filter(ctx)
            )
        )
    ).scalar_one_or_none()
    if notification is None:
        raise NotFoundError("Bildirim bulunamadi")
    await db.delete(notification)
    await db.commit()
    return ok({"deleted": True})


# ---------- Supplier portal ----------


def _supplier_filter(ctx: FacilityContext):
    assert ctx.supplier is not None
    return (Notification.recipient_supplier_id == ctx.supplier.id,)


@router.get("/supplier/notifications")
async def supplier_notifications(
    ctx: FacilityContext = Depends(get_supplier_context),
    db: AsyncSession = Depends(get_db),
    limit: int = Query(default=30, le=100),
):
    result = await db.execute(
        select(Notification)
        .where(*_supplier_filter(ctx))
        .order_by(Notification.created_at.desc())
        .limit(limit)
    )
    return ok([_out(n) for n in result.scalars()])


@router.get("/supplier/notifications/unread-count")
async def supplier_unread_count(
    ctx: FacilityContext = Depends(get_supplier_context),
    db: AsyncSession = Depends(get_db),
):
    count = (
        await db.execute(
            select(func.count(Notification.id)).where(
                *_supplier_filter(ctx), Notification.read_at.is_(None)
            )
        )
    ).scalar_one()
    return ok({"unread": int(count)})


@router.post("/supplier/notifications/{notification_id}/read")
async def supplier_mark_read(
    notification_id: uuid.UUID,
    ctx: FacilityContext = Depends(get_supplier_context),
    db: AsyncSession = Depends(get_db),
):
    notification = (
        await db.execute(
            select(Notification).where(
                Notification.id == notification_id, *_supplier_filter(ctx)
            )
        )
    ).scalar_one_or_none()
    if notification is None:
        raise NotFoundError("Bildirim bulunamadi")
    if notification.read_at is None:
        notification.read_at = datetime.now(UTC)
        await db.commit()
    return ok(_out(notification))


@router.post("/supplier/notifications/read-all")
async def supplier_read_all(
    ctx: FacilityContext = Depends(get_supplier_context),
    db: AsyncSession = Depends(get_db),
):
    await db.execute(
        update(Notification)
        .where(*_supplier_filter(ctx), Notification.read_at.is_(None))
        .values(read_at=datetime.now(UTC))
    )
    await db.commit()
    return ok({"read_all": True})


# ---------- E-posta loglari (log_only provider kayitlari) ----------


def _email_log_out(e) -> dict:
    return {
        "id": str(e.id),
        "recipient_email": e.recipient_email,
        "recipient_name": e.recipient_name,
        "subject": e.subject,
        "template_key": e.template_key,
        "status": e.status,
        "provider": e.provider,
        "appointment_id": str(e.appointment_id) if e.appointment_id else None,
        "created_at": e.created_at.isoformat(),
        "sent_at": e.sent_at.isoformat() if e.sent_at else None,
        "error_message": e.error_message,
        "retry_count": e.retry_count,
        "max_attempts": e.max_attempts,
        "next_retry_at": e.next_retry_at.isoformat() if e.next_retry_at else None,
        "last_attempt_at": e.last_attempt_at.isoformat() if e.last_attempt_at else None,
    }


@router.get("/facilities/{facility_id}/email-logs")
async def list_email_logs(
    ctx: FacilityContext = Depends(require_facility_permissions(TenantPermission.APPT_VIEW)),
    db: AsyncSession = Depends(get_db),
    appointment_id: uuid.UUID | None = None,
    status: str | None = Query(default=None, pattern="^(sent|failed|queued|skipped)$"),
    provider: str | None = None,
    recipient_email: str | None = None,
    template_key: str | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    has_error: bool | None = None,
    limit: int = Query(default=50, le=200),
    offset: int = Query(default=0, ge=0),
):
    """Filtreli/sayfali e-posta loglari + durum ozeti (Sprint 11).

    Yanit zarfi: {items, total, limit, offset, summary}.
    """
    from sqlalchemy import func as sa_func

    from app.models import EmailLog

    query = select(EmailLog).where(EmailLog.facility_id == ctx.facility_id)
    if appointment_id is not None:
        query = query.where(EmailLog.appointment_id == appointment_id)
    if status is not None:
        query = query.where(EmailLog.status == status)
    if provider is not None:
        query = query.where(EmailLog.provider == provider)
    if recipient_email:
        query = query.where(EmailLog.recipient_email.ilike(f"%{recipient_email}%"))
    if template_key is not None:
        query = query.where(EmailLog.template_key == template_key)
    if date_from is not None:
        query = query.where(EmailLog.created_at >= date_from)
    if date_to is not None:
        query = query.where(EmailLog.created_at < date_to)
    if has_error is True:
        query = query.where(EmailLog.error_message.is_not(None))
    elif has_error is False:
        query = query.where(EmailLog.error_message.is_(None))

    total = (
        await db.execute(select(sa_func.count()).select_from(query.subquery()))
    ).scalar_one()
    rows = (
        await db.execute(
            query.order_by(EmailLog.created_at.desc()).offset(offset).limit(limit)
        )
    ).scalars()

    # Ozet: filtre UYGULANMADAN tesis genelinin durum dagilimi (stat kartlari)
    summary_rows = (
        await db.execute(
            select(EmailLog.status, sa_func.count())
            .where(EmailLog.facility_id == ctx.facility_id)
            .group_by(EmailLog.status)
        )
    ).all()
    summary = {"sent": 0, "failed": 0, "queued": 0, "skipped": 0}
    for status_value, count in summary_rows:
        summary[status_value] = count

    return ok(
        {
            "items": [_email_log_out(e) for e in rows],
            "total": int(total),
            "limit": limit,
            "offset": offset,
            "summary": summary,
        }
    )


@router.post("/facilities/{facility_id}/email-logs/bulk-resend")
async def bulk_resend_emails(
    body: "BulkResendRequest",
    ctx: FacilityContext = Depends(require_facility_permissions(TenantPermission.USER_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    """Toplu yeniden gonderim — PARTIAL RESULT doner (karar, rapor).

    - sent/skipped kayitlar ve hak asimi HATA DEGIL, sonucta `skipped`/
      `max_retries` olarak raporlanir; retryable olanlar denenir.
    - Izin karari: tekil resend appt.view'da kalir; TOPLU gonderim daha
      genis etki yarattigi icin user.manage ister.
    - Lifecycle TEKRAR CALISMAZ; yalnizca stored subject/body gider.
    """
    from app.core.enums import ActorType
    from app.core.errors import ApiError
    from app.models import EmailLog
    from app.services.audit import record_audit
    from app.services.email import retry_email

    if len(body.email_log_ids) > 50:
        raise ApiError("BULK_TOO_LARGE", "Tek seferde en fazla 50 kayit gonderilebilir", 422)

    rows = {
        e.id: e
        for e in (
            await db.execute(
                select(EmailLog).where(
                    EmailLog.id.in_(body.email_log_ids),
                    EmailLog.facility_id == ctx.facility_id,
                )
            )
        ).scalars()
    }
    results = []
    sent = 0
    for log_id in body.email_log_ids:
        entry = rows.get(log_id)
        if entry is None:
            results.append({"id": str(log_id), "result": "skipped", "reason": "NOT_FOUND"})
            continue
        if entry.status == "sent":
            results.append({"id": str(log_id), "result": "skipped", "reason": "ALREADY_SENT"})
            continue
        if body.only_failed and entry.status not in ("failed", "queued"):
            results.append({"id": str(log_id), "result": "skipped", "reason": entry.status})
            continue
        if entry.retry_count >= entry.max_attempts:
            results.append({"id": str(log_id), "result": "max_retries"})
            continue
        await retry_email(db, entry)
        if entry.status == "sent":
            sent += 1
            results.append({"id": str(log_id), "result": "sent"})
        else:
            results.append(
                {"id": str(log_id), "result": "failed", "error": entry.error_message}
            )

    record_audit(
        db,
        actor_type=ActorType.tenant_user,
        actor_id=ctx.identity.id,
        action="email.bulk_resend",
        tenant_id=ctx.tenant_id,
        facility_id=ctx.facility_id,
        metadata={"requested": len(body.email_log_ids), "sent": sent},
    )
    await db.commit()
    return ok({"results": results, "sent": sent, "requested": len(body.email_log_ids)})


@router.post("/facilities/{facility_id}/email-logs/{email_log_id}/resend")
async def resend_email(
    email_log_id: uuid.UUID,
    ctx: FacilityContext = Depends(require_facility_permissions(TenantPermission.APPT_VIEW)),
    db: AsyncSession = Depends(get_db),
):
    """Failed e-postayi yeniden gonderir (lifecycle'i TEKRAR CALISTIRMAZ).

    Izin karari (rapor): operasyon ekibinin tamami mudahale edebilsin diye
    appt.view yeterlidir — icerik zaten ayni ekipte gorunur; supplier ve
    platform kullanicilari bu endpoint'e erisemez (facility context).
    """
    from app.core.enums import ActorType
    from app.models import EmailLog
    from app.services.audit import record_audit
    from app.services.email import retry_email

    entry = (
        await db.execute(
            select(EmailLog).where(
                EmailLog.id == email_log_id, EmailLog.facility_id == ctx.facility_id
            )
        )
    ).scalar_one_or_none()
    if entry is None:
        raise NotFoundError("E-posta kaydi bulunamadi")
    await retry_email(db, entry)
    record_audit(
        db,
        actor_type=ActorType.tenant_user,
        actor_id=ctx.identity.id,
        action="email.resend",
        tenant_id=ctx.tenant_id,
        facility_id=ctx.facility_id,
        entity_type="email_log",
        entity_id=entry.id,
        after={"status": entry.status, "retry_count": entry.retry_count},
    )
    await db.commit()
    await db.refresh(entry)
    return ok(
        {
            "id": str(entry.id),
            "status": entry.status,
            "retry_count": entry.retry_count,
            "max_attempts": entry.max_attempts,
            "error_message": entry.error_message,
            "sent_at": entry.sent_at.isoformat() if entry.sent_at else None,
        }
    )
