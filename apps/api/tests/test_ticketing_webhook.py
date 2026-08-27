"""Hermes webhook girisi: imza guvenligi, siralama ve idempotency.

Bu dosyadaki her test bir GUVENLIK ya da VERI BUTUNLUGU kuralini korur;
"davranis degisti" diye gevsetilmemelidir.
"""

import hashlib
import hmac
import json
import time
import uuid

import pytest
import sqlalchemy as sa

from app.core.config import get_settings
from app.core.enums import TicketStatus, TicketWebhookStatus
from app.integrations import hermes_contract as contract
from app.models import (
    Notification,
    SupportTicketProjection,
    TicketRoutingConfig,
    TicketWebhookInbox,
)
from tests.conftest import auth_headers, login
from tests.hermes_stub import fixture

WEBHOOK_PATH = "/integrations/hermes-support/v1/events"
SECRET = "test-webhook-secret"
GROUP_ID = uuid.UUID("3f2b1c44-9d1e-4a58-9c77-2b7e5a0f1d33")


@pytest.fixture(autouse=True)
def _webhook_secret():
    """Sir yapilandirilmadan uc nokta FAIL-CLOSED calisir; testte aciyoruz."""
    settings = get_settings()
    previous = settings.hermes_support_webhook_secret
    settings.hermes_support_webhook_secret = SECRET
    yield
    settings.hermes_support_webhook_secret = previous


def sign(body: bytes, timestamp: str, secret: str = SECRET) -> str:
    return hmac.new(
        secret.encode(), timestamp.encode() + b"." + body, hashlib.sha256
    ).hexdigest()


def headers_for(body: bytes, *, timestamp: str | None = None, secret: str = SECRET) -> dict:
    ts = timestamp or str(int(time.time()))
    envelope = json.loads(body)
    return {
        contract.WEBHOOK_HEADER_TIMESTAMP: ts,
        contract.WEBHOOK_HEADER_SIGNATURE: sign(body, ts, secret),
        contract.WEBHOOK_HEADER_KEY_ID: "v1",
        contract.WEBHOOK_HEADER_EVENT_ID: str(envelope["event_id"]),
        "Content-Type": "application/json",
    }


def envelope_bytes(name: str, **overrides) -> bytes:
    payload = fixture(name)
    payload.update(overrides)
    return json.dumps(payload).encode()


async def _prepare_ticket(client, seeded, session_maker) -> tuple[str, dict]:
    """Route + yerel ticket olusturur ve olay zarfini o ticketa baglar."""
    async with session_maker() as db:
        db.add(
            TicketRoutingConfig(
                tenant_id=seeded["tenant"].id,
                application_code="logislot",
                hermes_group_id=GROUP_ID,
                hermes_group_name_snapshot="DevOps Team",
                route_version=3,
            )
        )
        await db.commit()

    token = await login(client, "/auth/login", "admin@cakesbakes.com")
    created = await client.post(
        "/tickets",
        json={
            "title": "Randevu kaydinda hata aliyorum",
            "description": "Kaydet butonundan sonra islem tamamlanmiyor ve sayfa donuyor.",
            "category": "bug",
            "impact": "multiple_users",
        },
        headers=auth_headers(token),
    )
    assert created.status_code == 200, created.text
    ticket_id = created.json()["data"]["id"]
    return ticket_id, {
        "source_tenant_id": str(seeded["tenant"].id),
        "source_ticket_id": ticket_id,
    }


# ------------------------------------------------------------ imza guvenligi


async def test_missing_signature_is_rejected(client, seeded):
    body = envelope_bytes("event_ticket_created")
    response = await client.post(
        WEBHOOK_PATH, content=body, headers={"Content-Type": "application/json"}
    )
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "invalid_signature"


async def test_wrong_signature_is_rejected(client, seeded):
    body = envelope_bytes("event_ticket_created")
    headers = headers_for(body, secret="baska-bir-sir")
    response = await client.post(WEBHOOK_PATH, content=body, headers=headers)
    assert response.status_code == 401


async def test_expired_timestamp_is_rejected(client, seeded):
    body = envelope_bytes("event_ticket_created")
    old = str(int(time.time()) - 3600)
    response = await client.post(
        WEBHOOK_PATH, content=body, headers=headers_for(body, timestamp=old)
    )
    assert response.status_code == 401


async def test_tampered_body_invalidates_signature(client, seeded):
    body = envelope_bytes("event_ticket_created")
    headers = headers_for(body)
    tampered = body.replace(b'"open"', b'"closed"')
    response = await client.post(WEBHOOK_PATH, content=tampered, headers=headers)
    assert response.status_code == 401


async def test_signature_rejected_when_secret_not_configured(client, seeded):
    """Sir yoksa uc nokta imzasiz kabul ETMEZ (fail-closed)."""
    settings = get_settings()
    settings.hermes_support_webhook_secret = ""
    try:
        body = envelope_bytes("event_ticket_created")
        response = await client.post(WEBHOOK_PATH, content=body, headers=headers_for(body))
        assert response.status_code == 401
    finally:
        settings.hermes_support_webhook_secret = SECRET


async def test_previous_secret_accepted_during_rotation(client, seeded, session_maker):
    settings = get_settings()
    settings.hermes_support_webhook_secret = "yeni-sir"
    settings.hermes_support_webhook_secret_previous = SECRET
    try:
        ticket_id, ids = await _prepare_ticket(client, seeded, session_maker)
        body = envelope_bytes("event_ticket_created", **ids)
        response = await client.post(WEBHOOK_PATH, content=body, headers=headers_for(body))
        assert response.status_code == 200
    finally:
        settings.hermes_support_webhook_secret = SECRET
        settings.hermes_support_webhook_secret_previous = ""


async def test_wrong_application_code_is_rejected(client, seeded):
    body = envelope_bytes("event_ticket_created", application_code="hermes")
    response = await client.post(WEBHOOK_PATH, content=body, headers=headers_for(body))
    assert response.status_code == 403


async def test_header_event_id_must_match_body(client, seeded):
    body = envelope_bytes("event_ticket_created")
    headers = headers_for(body)
    headers[contract.WEBHOOK_HEADER_EVENT_ID] = str(uuid.uuid4())
    response = await client.post(WEBHOOK_PATH, content=body, headers=headers)
    assert response.status_code == 400


async def test_oversized_body_is_rejected(client, seeded):
    settings = get_settings()
    original = settings.hermes_support_webhook_max_body_bytes
    settings.hermes_support_webhook_max_body_bytes = 50
    try:
        body = envelope_bytes("event_ticket_created")
        response = await client.post(WEBHOOK_PATH, content=body, headers=headers_for(body))
        assert response.status_code == 413
    finally:
        settings.hermes_support_webhook_max_body_bytes = original


# --------------------------------------------------------------- projeksiyon


async def test_created_event_stamps_canonical_number_and_notifies(
    client, seeded, session_maker
):
    ticket_id, ids = await _prepare_ticket(client, seeded, session_maker)
    body = envelope_bytes("event_ticket_created", **ids)
    response = await client.post(WEBHOOK_PATH, content=body, headers=headers_for(body))
    assert response.status_code == 200
    assert response.json()["status"] == "applied"

    async with session_maker() as db:
        ticket = (
            await db.execute(
                sa.select(SupportTicketProjection).where(
                    SupportTicketProjection.id == uuid.UUID(ticket_id)
                )
            )
        ).scalar_one()
        assert ticket.remote_ticket_number == "TKT-000123"
        assert ticket.aggregate_version == 1
        assert ticket.delivery_status.value == "synced"

        notifications = list(
            (
                await db.execute(
                    sa.select(Notification).where(Notification.type == "ticket.received")
                )
            ).scalars()
        )
        assert len(notifications) == 1
        assert notifications[0].recipient_user_id == seeded["users"]["admin"].id


async def test_replayed_event_does_not_duplicate_notification(
    client, seeded, session_maker
):
    """Ayni olay iki kez gelirse ikinci bir bildirim/mesaj OLUSMAZ."""
    ticket_id, ids = await _prepare_ticket(client, seeded, session_maker)
    body = envelope_bytes("event_ticket_created", **ids)
    headers = headers_for(body)

    first = await client.post(WEBHOOK_PATH, content=body, headers=headers)
    second = await client.post(WEBHOOK_PATH, content=body, headers=headers)
    assert first.json()["status"] == "applied"
    assert second.json()["status"] == "duplicate"

    async with session_maker() as db:
        # Seed demo verisi de bildirim uretir; yalnizca TICKET bildirimlerini say.
        count = (
            await db.execute(
                sa.select(sa.func.count(Notification.id)).where(
                    Notification.type.like("ticket.%")
                )
            )
        ).scalar_one()
        inbox = (
            await db.execute(sa.select(sa.func.count(TicketWebhookInbox.id)))
        ).scalar_one()
    assert count == 1
    assert inbox == 1


async def test_reprocessing_same_event_is_noop(client, seeded, session_maker):
    """Projeksiyon commit edildikten SONRA cokme senaryosu: olay yeniden islenir.

    Inbox kaydi `received`e cekilerek crash taklit edilir; ikinci isleme
    version kontrolu sayesinde no-op olmali ve ikinci bildirim URETMEMELI.
    """
    ticket_id, ids = await _prepare_ticket(client, seeded, session_maker)
    body = envelope_bytes("event_ticket_created", **ids)
    await client.post(WEBHOOK_PATH, content=body, headers=headers_for(body))

    from app.maintenance.ticket_inbox import process_inbox_row

    async with session_maker() as db:
        row = (await db.execute(sa.select(TicketWebhookInbox))).scalar_one()
        row.status = TicketWebhookStatus.received
        row.processed_at = None
        await db.commit()
        outcome = await process_inbox_row(db, row)
        assert outcome == "noop"

        count = (
            await db.execute(
                sa.select(sa.func.count(Notification.id)).where(
                    Notification.type.like("ticket.%")
                )
            )
        ).scalar_one()
    assert count == 1


async def test_public_message_event_appends_and_notifies(client, seeded, session_maker):
    ticket_id, ids = await _prepare_ticket(client, seeded, session_maker)
    for name in ("event_ticket_created", "event_ticket_status_changed"):
        body = envelope_bytes(name, **ids)
        await client.post(WEBHOOK_PATH, content=body, headers=headers_for(body))

    body = envelope_bytes("event_ticket_public_message_added", **ids)
    response = await client.post(WEBHOOK_PATH, content=body, headers=headers_for(body))
    assert response.json()["status"] == "applied"

    token = await login(client, "/auth/login", "admin@cakesbakes.com")
    detail = await client.get(f"/tickets/{ticket_id}", headers=auth_headers(token))
    messages = detail.json()["data"]["messages"]
    # Zaman cizelgesi `created_at`e gore siralanir; fixture'in sabit damgasi
    # testin kosma anindan once oldugu icin burada SIRA degil ICERIK aranir.
    assert {m["author_type"] for m in messages} == {"requester", "agent"}
    agent_message = next(m for m in messages if m["author_type"] == "agent")
    assert agent_message["body"] == "Ekran goruntusu icin tesekkurler, inceliyoruz."
    assert agent_message["is_pending"] is False


async def test_out_of_order_event_marks_gap_and_does_not_apply(
    client, seeded, session_maker
):
    """Atlanmis olay KORLEMESINE uygulanmaz; bosluk isaretlenir."""
    ticket_id, ids = await _prepare_ticket(client, seeded, session_maker)
    body = envelope_bytes("event_ticket_created", **ids)
    await client.post(WEBHOOK_PATH, content=body, headers=headers_for(body))

    # version 5 geldi ama 2..4 gelmedi.
    body = envelope_bytes("event_ticket_resolved", **ids)
    response = await client.post(WEBHOOK_PATH, content=body, headers=headers_for(body))
    assert response.json()["status"] == "gap"

    async with session_maker() as db:
        ticket = (
            await db.execute(
                sa.select(SupportTicketProjection).where(
                    SupportTicketProjection.id == uuid.UUID(ticket_id)
                )
            )
        ).scalar_one()
    assert ticket.sync_gap is True
    assert ticket.remote_status is TicketStatus.open  # yanlis durum GOSTERILMEZ
    assert ticket.resolution_summary is None


async def test_older_event_is_ignored(client, seeded, session_maker):
    ticket_id, ids = await _prepare_ticket(client, seeded, session_maker)
    for name in ("event_ticket_created", "event_ticket_status_changed"):
        body = envelope_bytes(name, **ids)
        await client.post(WEBHOOK_PATH, content=body, headers=headers_for(body))

    stale = envelope_bytes(
        "event_ticket_created", **ids, event_id=str(uuid.uuid4()), aggregate_version=1
    )
    response = await client.post(WEBHOOK_PATH, content=stale, headers=headers_for(stale))
    assert response.json()["status"] == "noop"

    async with session_maker() as db:
        ticket = (
            await db.execute(
                sa.select(SupportTicketProjection).where(
                    SupportTicketProjection.id == uuid.UUID(ticket_id)
                )
            )
        ).scalar_one()
    assert ticket.remote_status is TicketStatus.waiting_customer
    assert ticket.aggregate_version == 2


async def test_resolution_flow_reaches_customer_detail(client, seeded, session_maker):
    ticket_id, ids = await _prepare_ticket(client, seeded, session_maker)
    for version, name in enumerate(
        (
            "event_ticket_created",
            "event_ticket_status_changed",
            "event_ticket_public_message_added",
            "event_ticket_assignment_changed",
            "event_ticket_resolved",
        ),
        start=1,
    ):
        body = envelope_bytes(name, **ids)
        response = await client.post(WEBHOOK_PATH, content=body, headers=headers_for(body))
        assert response.status_code == 200, (name, response.text)
        assert response.json()["status"] == "applied", (name, version)

    token = await login(client, "/auth/login", "admin@cakesbakes.com")
    detail = await client.get(f"/tickets/{ticket_id}", headers=auth_headers(token))
    data = detail.json()["data"]
    assert data["status"] == "resolved"
    assert data["resolution"]["code"] == "fixed"
    assert data["resolution"]["fix_version"] == "2026.8.4"
    assert data["group_name"] == "Application Support"


async def test_internal_content_event_is_rejected(client, seeded, session_maker):
    """Ic not tasiyan bir olay UYGULANMAZ ve dead-letter'a alinir."""
    ticket_id, ids = await _prepare_ticket(client, seeded, session_maker)
    payload = fixture("event_ticket_public_message_added")
    payload.update(ids)
    payload["aggregate_version"] = 1
    payload["data"]["message"]["internal_note"] = "Musteri gormemeli"
    body = json.dumps(payload).encode()

    response = await client.post(WEBHOOK_PATH, content=body, headers=headers_for(body))
    assert response.status_code == 202

    async with session_maker() as db:
        row = (await db.execute(sa.select(TicketWebhookInbox))).scalar_one()
        assert row.status is TicketWebhookStatus.dead
        assert row.last_error_code == "internal_content_rejected"

    token = await login(client, "/auth/login", "admin@cakesbakes.com")
    detail = await client.get(f"/tickets/{ticket_id}", headers=auth_headers(token))
    assert "Musteri gormemeli" not in detail.text
    assert len(detail.json()["data"]["messages"]) == 1


async def test_internal_visibility_message_is_rejected(client, seeded, session_maker):
    ticket_id, ids = await _prepare_ticket(client, seeded, session_maker)
    payload = fixture("event_ticket_public_message_added")
    payload.update(ids)
    payload["aggregate_version"] = 1
    payload["data"]["message"]["visibility"] = "internal"
    body = json.dumps(payload).encode()

    response = await client.post(WEBHOOK_PATH, content=body, headers=headers_for(body))
    assert response.status_code == 202

    token = await login(client, "/auth/login", "admin@cakesbakes.com")
    detail = await client.get(f"/tickets/{ticket_id}", headers=auth_headers(token))
    assert len(detail.json()["data"]["messages"]) == 1


async def test_unknown_tenant_event_is_recorded_but_not_applied(client, seeded):
    body = envelope_bytes("event_ticket_created", source_tenant_id=str(uuid.uuid4()))
    response = await client.post(WEBHOOK_PATH, content=body, headers=headers_for(body))
    # Kayit alindi (2xx) ama hicbir tenant projeksiyonu degismedi.
    assert response.status_code in (200, 202)


async def test_unknown_event_type_is_acked_not_failed(client, seeded, session_maker):
    """Sozlesme additive: bilinmeyen olay tipi kuyrugu tikamamali."""
    _, ids = await _prepare_ticket(client, seeded, session_maker)
    body = envelope_bytes(
        "event_ticket_created",
        **ids,
        event_type="ticket.something_new.v1",
        event_id=str(uuid.uuid4()),
    )
    response = await client.post(WEBHOOK_PATH, content=body, headers=headers_for(body))
    assert response.status_code == 200
    assert response.json()["status"] == "unknown_event"
