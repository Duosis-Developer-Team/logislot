"""Musteri ticket uc noktalari — yonetim ve tedarikci portallari ayni servis.

Iki router vardir cunku iki portalin YOL sozlesmesi farklidir (`/tickets` ve
`/supplier/tickets`), fakat ikisi de ayni servis katmanini ve ayni gorunurluk
kurallarini kullanir; boylece izolasyon mantigi tek yerde kalir.

Tenant/kullanici kimligi ISTEK GOVDESINDEN OKUNMAZ — daima dogrulanmis
oturumdan turer (00_SHARED_PLATFORM/05, bolum 2).
"""

import uuid

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.db import get_db
from app.core.errors import ApiError
from app.core.metrics import record_ticket_created
from app.core.ratelimit import enforce_rate_limit
from app.core.responses import ok
from app.models import SupportTicketProjection
from app.schemas.ticketing import (
    AttachmentSessionRequest,
    TicketCancelRequest,
    TicketCreateRequest,
    TicketReopenRequest,
    TicketReplyRequest,
)
from app.services import ticket_service as svc
from app.tenancy.deps import get_ticket_requester

router = APIRouter(prefix="/tickets", tags=["tickets"])
supplier_router = APIRouter(prefix="/supplier/tickets", tags=["supplier-tickets"])


# ------------------------------------------------------------- serilestirme


def _message_out(message) -> dict:
    return {
        "id": str(message.id),
        "author_type": message.author_type.value,
        "author_display_name": message.author_display_name,
        "body": message.body,
        "body_format": message.body_format,
        "created_at": message.created_at.isoformat() if message.created_at else None,
        "is_pending": message.is_pending,
    }


def _attachment_out(attachment) -> dict:
    return {
        "id": str(attachment.id),
        "file_name": attachment.file_name,
        "mime_type": attachment.mime_type,
        "size_bytes": attachment.size_bytes,
        "scan_status": attachment.scan_status.value,
        "message_id": str(attachment.message_id) if attachment.message_id else None,
        # Indirilebilirlik yalnizca tarama temizse; UI butonu buna gore acar.
        "downloadable": attachment.scan_status.value == "clean",
    }


def _ticket_row(ticket: SupportTicketProjection) -> dict:
    """Liste satiri — konusma govdesi TASIMAZ (liste hafif kalsin)."""
    return {
        "id": str(ticket.id),
        "ticket_number": ticket.remote_ticket_number,
        "title": ticket.title,
        "category": ticket.category.value,
        "impact": ticket.impact.value,
        "status": ticket.remote_status.value,
        "delivery_status": ticket.delivery_status.value,
        "requester_name": ticket.requester_name,
        "requester_type": ticket.requester_type.value,
        "supplier_name": ticket.supplier_name,
        "group_name": ticket.route_group_name,
        "created_at": ticket.created_at.isoformat() if ticket.created_at else None,
        "updated_at": ticket.updated_at.isoformat() if ticket.updated_at else None,
        "resolved_at": ticket.resolved_at.isoformat() if ticket.resolved_at else None,
        "sync_gap": ticket.sync_gap,
        "last_sync_error_code": ticket.last_sync_error_code,
    }


def _ticket_detail(ticket: SupportTicketProjection, requester) -> dict:
    messages = sorted(ticket.messages, key=lambda m: (m.created_at, str(m.id)))
    return {
        **_ticket_row(ticket),
        "description": ticket.description,
        "reproduction_steps": ticket.reproduction_steps,
        "expected_result": ticket.expected_result,
        "actual_result": ticket.actual_result,
        "error_code": ticket.error_code,
        "correlation_id": str(ticket.correlation_id) if ticket.correlation_id else None,
        "occurred_at": ticket.occurred_at.isoformat() if ticket.occurred_at else None,
        "client_context": ticket.client_context_json or {},
        "resolution": (
            {
                "summary": ticket.resolution_summary,
                "code": ticket.resolution_code,
                "fix_version": ticket.resolution_fix_version,
                "resolved_at": (
                    ticket.resolved_at.isoformat() if ticket.resolved_at else None
                ),
                "resolved_by_group_name": ticket.resolved_by_group_name,
            }
            if ticket.resolution_summary
            else None
        ),
        "messages": [_message_out(m) for m in messages],
        "attachments": [_attachment_out(a) for a in ticket.attachments],
        "last_sync_at": ticket.last_sync_at.isoformat() if ticket.last_sync_at else None,
        "permissions": {
            "can_reply": requester.can_comment,
            "can_reopen": requester.can_comment,
            "can_cancel": ticket.requester_id == requester.id or requester.can_view_all,
        },
    }


# ---------------------------------------------------------------- islemler


async def _config_payload(requester) -> dict:
    settings = get_settings()
    route = await svc.resolve_route(requester.tenant_id)
    return {
        "enabled": settings.ticketing_enabled,
        "can_create": requester.can_create and route.ready,
        "can_comment": requester.can_comment,
        "can_view_all": requester.can_view_all,
        "routing": {
            "ready": route.ready,
            # Grup KIMLIGI bilerek gonderilmez: musteri grup secmez, dolayisiyla
            # tarayicinin grup ID'sini bilmesine gerek yoktur.
            "group_display_name": route.group_name,
            "verified_at": route.verified_at.isoformat() if route.verified_at else None,
            "reason": route.reason,
        },
        "attachments": {
            # Hermes ek yuklemeyi kapatmissa form alani hic gosterilmez:
            # kullaniciyi dosya secip hata almaya birakmanin anlami yok.
            "enabled": svc.attachments_available(),
            "max_files": settings.ticket_attachment_max_files,
            "max_file_size_bytes": settings.ticket_attachment_max_file_size_bytes,
            "max_total_bytes": settings.ticket_attachment_max_total_bytes,
            "allowed_mime_types": sorted(svc.ALLOWED_ATTACHMENT_MIME_TYPES),
        },
    }


async def _list(db: AsyncSession, requester, status_group, category, search, limit, offset):
    rows, total = await svc.list_tickets(
        db,
        requester,
        status_group=status_group,
        category=category,
        search=search,
        limit=limit,
        offset=offset,
    )
    return ok([_ticket_row(r) for r in rows], meta={"total": total, "offset": offset})


async def _create(request: Request, db: AsyncSession, requester, body: TicketCreateRequest):
    # Ticket olusturma kotasi: form spam'ini ve Hermes'e ani yuku sinirlar.
    enforce_rate_limit(
        request,
        "ticket_create",
        str(requester.id),
        times=get_settings().create_rate_limit_attempts,
    )
    tenant_slug, tenant_display_name = await _tenant_identity(requester.tenant_id)
    ticket = await svc.create_ticket(
        db,
        requester,
        svc.TicketCreateInput(
            title=body.title,
            description=body.description,
            category=body.category,
            impact=body.impact,
            reproduction_steps=body.reproduction_steps,
            expected_result=body.expected_result,
            actual_result=body.actual_result,
            error_code=body.error_code,
            correlation_id=body.correlation_id,
            occurred_at=body.occurred_at,
            client_context=body.client_context,
            attachment_upload_ids=body.attachment_upload_ids,
        ),
        tenant_slug=tenant_slug,
        tenant_display_name=tenant_display_name,
    )
    record_ticket_created(ticket.category.value, ticket.requester_type.value)
    detail = await svc.get_ticket(db, requester, ticket.id)
    return ok(_ticket_detail(detail, requester))


async def _tenant_identity(tenant_id: uuid.UUID) -> tuple[str | None, str | None]:
    import sqlalchemy as sa

    from app.core.db import control_session
    from app.models import Tenant

    async with control_session() as control_db:
        tenant = (
            await control_db.execute(sa.select(Tenant).where(Tenant.id == tenant_id))
        ).scalar_one_or_none()
        if tenant is None:
            return None, None
        return tenant.slug, (tenant.display_name or tenant.commercial_name)


# ------------------------------------------------------- yonetim portali


@router.get("/config")
async def ticket_config(requester=Depends(get_ticket_requester)):
    return ok(await _config_payload(requester))


@router.get("")
async def list_tickets(
    requester=Depends(get_ticket_requester),
    db: AsyncSession = Depends(get_db),
    status_group: str | None = None,
    category: str | None = None,
    search: str | None = None,
    limit: int = Query(default=50, le=100),
    offset: int = Query(default=0, ge=0),
):
    return await _list(db, requester, status_group, category, search, limit, offset)


@router.post("")
async def create_ticket(
    request: Request,
    body: TicketCreateRequest,
    requester=Depends(get_ticket_requester),
    db: AsyncSession = Depends(get_db),
):
    return await _create(request, db, requester, body)


@router.get("/{ticket_id}")
async def get_ticket(
    ticket_id: uuid.UUID,
    requester=Depends(get_ticket_requester),
    db: AsyncSession = Depends(get_db),
):
    ticket = await svc.get_ticket(db, requester, ticket_id)
    return ok(_ticket_detail(ticket, requester))


@router.post("/{ticket_id}/messages")
async def reply(
    ticket_id: uuid.UUID,
    body: TicketReplyRequest,
    requester=Depends(get_ticket_requester),
    db: AsyncSession = Depends(get_db),
):
    await svc.add_public_reply(
        db,
        requester,
        ticket_id,
        body.body,
        attachment_upload_ids=body.attachment_upload_ids,
    )
    ticket = await svc.get_ticket(db, requester, ticket_id)
    return ok(_ticket_detail(ticket, requester))


@router.post("/{ticket_id}/reopen")
async def reopen(
    ticket_id: uuid.UUID,
    body: TicketReopenRequest,
    requester=Depends(get_ticket_requester),
    db: AsyncSession = Depends(get_db),
):
    await svc.reopen_ticket(db, requester, ticket_id, body.reason)
    ticket = await svc.get_ticket(db, requester, ticket_id)
    return ok(_ticket_detail(ticket, requester))


@router.post("/{ticket_id}/confirm-close")
async def confirm_close(
    ticket_id: uuid.UUID,
    requester=Depends(get_ticket_requester),
    db: AsyncSession = Depends(get_db),
):
    await svc.confirm_close_ticket(db, requester, ticket_id)
    ticket = await svc.get_ticket(db, requester, ticket_id)
    return ok(_ticket_detail(ticket, requester))


@router.post("/{ticket_id}/cancel")
async def cancel(
    ticket_id: uuid.UUID,
    body: TicketCancelRequest,
    requester=Depends(get_ticket_requester),
    db: AsyncSession = Depends(get_db),
):
    await svc.cancel_ticket(db, requester, ticket_id, body.reason)
    ticket = await svc.get_ticket(db, requester, ticket_id)
    return ok(_ticket_detail(ticket, requester))


async def _proxy_upload(db, requester, upload_id: uuid.UUID, request: Request):
    """Tarayicidan gelen dosyayi Hermes'e GECIRIR (hicbir yere yazmadan).

    Neden proxy: Hermes'in yukleme ucu servis token'i istiyor ve CORS izni
    vermiyor, yani tarayici dogrudan yukleyemiyor; token da tarayiciya
    cikamaz. Ayrintili gerekce: ticket_service.upload_attachment_content.

    Govde AKARAK okunur ve sinir asilinca ANINDA kesilir: `size_bytes` istemci
    beyanidir, gercek govde onu asabilir. Sinirsiz okumak 15 MB'lik bir limitte
    bellek tuketimini istemciye birakirdi.
    """
    limit = get_settings().ticket_attachment_max_file_size_bytes
    chunks: list[bytes] = []
    total = 0
    async for chunk in request.stream():
        total += len(chunk)
        if total > limit:
            raise ApiError(
                "TICKET_ATTACHMENT_TOO_LARGE",
                f"Dosya boyutu en fazla {limit // (1024 * 1024)} MB olabilir.",
                400,
            )
        chunks.append(chunk)
    return await svc.upload_attachment_content(
        db,
        requester,
        upload_id,
        content=b"".join(chunks),
        content_type=request.headers.get("content-type") or "application/octet-stream",
    )


@router.post("/attachments/sessions")
async def create_attachment_session(
    body: AttachmentSessionRequest,
    requester=Depends(get_ticket_requester),
    db: AsyncSession = Depends(get_db),
):
    return ok(
        await svc.create_attachment_session(
            db,
            requester,
            file_name=body.file_name,
            size_bytes=body.size_bytes,
            declared_mime_type=body.declared_mime_type,
            sha256=body.sha256,
            upload_prefix="/tickets",
        )
    )


@router.put("/attachments/{upload_id}/content")
async def upload_attachment_content(
    upload_id: uuid.UUID,
    request: Request,
    requester=Depends(get_ticket_requester),
    db: AsyncSession = Depends(get_db),
):
    return ok(await _proxy_upload(db, requester, upload_id, request))


@router.post("/attachments/{upload_id}/complete")
async def complete_attachment(
    upload_id: uuid.UUID,
    requester=Depends(get_ticket_requester),
    db: AsyncSession = Depends(get_db),
):
    return ok(await svc.complete_attachment(db, requester, upload_id))


@router.get("/{ticket_id}/attachments/{attachment_id}/download")
async def download_attachment(
    ticket_id: uuid.UUID,
    attachment_id: uuid.UUID,
    requester=Depends(get_ticket_requester),
    db: AsyncSession = Depends(get_db),
):
    """Yetki kontrolunden sonra kisa omurlu adrese YONLENDIRIR.

    Adres yanit govdesinde dondurulup saklanmaz; 307 ile aninda kullanilir ve
    yanit onbelleklenmez.
    """
    url = await svc.attachment_download_url(db, requester, ticket_id, attachment_id)
    return RedirectResponse(
        url, status_code=307, headers={"Cache-Control": "private, no-store"}
    )


# ------------------------------------------------------ tedarikci portali
#
# Ayni fonksiyonlar, ayni servis; tek fark yol onekidir. Tedarikcinin
# gorunurlugu servis katmaninda `supplier_id` ile kisitlanir.


@supplier_router.get("/config")
async def supplier_ticket_config(requester=Depends(get_ticket_requester)):
    return ok(await _config_payload(requester))


@supplier_router.get("")
async def supplier_list_tickets(
    requester=Depends(get_ticket_requester),
    db: AsyncSession = Depends(get_db),
    status_group: str | None = None,
    category: str | None = None,
    search: str | None = None,
    limit: int = Query(default=50, le=100),
    offset: int = Query(default=0, ge=0),
):
    return await _list(db, requester, status_group, category, search, limit, offset)


@supplier_router.post("")
async def supplier_create_ticket(
    request: Request,
    body: TicketCreateRequest,
    requester=Depends(get_ticket_requester),
    db: AsyncSession = Depends(get_db),
):
    return await _create(request, db, requester, body)


@supplier_router.get("/{ticket_id}")
async def supplier_get_ticket(
    ticket_id: uuid.UUID,
    requester=Depends(get_ticket_requester),
    db: AsyncSession = Depends(get_db),
):
    ticket = await svc.get_ticket(db, requester, ticket_id)
    return ok(_ticket_detail(ticket, requester))


@supplier_router.post("/{ticket_id}/messages")
async def supplier_reply(
    ticket_id: uuid.UUID,
    body: TicketReplyRequest,
    requester=Depends(get_ticket_requester),
    db: AsyncSession = Depends(get_db),
):
    await svc.add_public_reply(
        db,
        requester,
        ticket_id,
        body.body,
        attachment_upload_ids=body.attachment_upload_ids,
    )
    ticket = await svc.get_ticket(db, requester, ticket_id)
    return ok(_ticket_detail(ticket, requester))


@supplier_router.post("/{ticket_id}/reopen")
async def supplier_reopen(
    ticket_id: uuid.UUID,
    body: TicketReopenRequest,
    requester=Depends(get_ticket_requester),
    db: AsyncSession = Depends(get_db),
):
    await svc.reopen_ticket(db, requester, ticket_id, body.reason)
    ticket = await svc.get_ticket(db, requester, ticket_id)
    return ok(_ticket_detail(ticket, requester))


@supplier_router.post("/{ticket_id}/confirm-close")
async def supplier_confirm_close(
    ticket_id: uuid.UUID,
    requester=Depends(get_ticket_requester),
    db: AsyncSession = Depends(get_db),
):
    await svc.confirm_close_ticket(db, requester, ticket_id)
    ticket = await svc.get_ticket(db, requester, ticket_id)
    return ok(_ticket_detail(ticket, requester))


@supplier_router.post("/{ticket_id}/cancel")
async def supplier_cancel(
    ticket_id: uuid.UUID,
    body: TicketCancelRequest,
    requester=Depends(get_ticket_requester),
    db: AsyncSession = Depends(get_db),
):
    await svc.cancel_ticket(db, requester, ticket_id, body.reason)
    ticket = await svc.get_ticket(db, requester, ticket_id)
    return ok(_ticket_detail(ticket, requester))


@supplier_router.post("/attachments/sessions")
async def supplier_attachment_session(
    body: AttachmentSessionRequest,
    requester=Depends(get_ticket_requester),
    db: AsyncSession = Depends(get_db),
):
    return ok(
        await svc.create_attachment_session(
            db,
            requester,
            file_name=body.file_name,
            size_bytes=body.size_bytes,
            declared_mime_type=body.declared_mime_type,
            sha256=body.sha256,
            upload_prefix="/supplier/tickets",
        )
    )


@supplier_router.put("/attachments/{upload_id}/content")
async def supplier_upload_attachment_content(
    upload_id: uuid.UUID,
    request: Request,
    requester=Depends(get_ticket_requester),
    db: AsyncSession = Depends(get_db),
):
    return ok(await _proxy_upload(db, requester, upload_id, request))


@supplier_router.post("/attachments/{upload_id}/complete")
async def supplier_complete_attachment(
    upload_id: uuid.UUID,
    requester=Depends(get_ticket_requester),
    db: AsyncSession = Depends(get_db),
):
    return ok(await svc.complete_attachment(db, requester, upload_id))


@supplier_router.get("/{ticket_id}/attachments/{attachment_id}/download")
async def supplier_download_attachment(
    ticket_id: uuid.UUID,
    attachment_id: uuid.UUID,
    requester=Depends(get_ticket_requester),
    db: AsyncSession = Depends(get_db),
):
    url = await svc.attachment_download_url(db, requester, ticket_id, attachment_id)
    return RedirectResponse(
        url, status_code=307, headers={"Cache-Control": "private, no-store"}
    )
