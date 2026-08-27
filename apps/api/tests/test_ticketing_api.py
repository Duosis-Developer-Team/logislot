"""Musteri ticket uclari: izinler, gorunurluk izolasyonu ve durum kurallari."""

import uuid

import pytest
import sqlalchemy as sa

from app.core.enums import TicketStatus
from app.integrations.hermes_support_client import reset_client_factory
from app.models import SupportTicketOutbox, SupportTicketProjection, TicketRoutingConfig
from tests.conftest import auth_headers, login

GROUP_ID = uuid.UUID("3f2b1c44-9d1e-4a58-9c77-2b7e5a0f1d33")
GROUP_NAME = "DevOps Team"


@pytest.fixture(autouse=True)
def _reset_hermes():
    yield
    reset_client_factory()


async def configure_route(session_maker, tenant_id, *, is_active: bool = True) -> None:
    async with session_maker() as db:
        db.add(
            TicketRoutingConfig(
                tenant_id=tenant_id,
                application_code="logislot",
                hermes_group_id=GROUP_ID,
                hermes_group_name_snapshot=GROUP_NAME,
                route_version=3,
                is_active=is_active,
            )
        )
        await db.commit()


def valid_ticket_body(**overrides) -> dict:
    body = {
        "title": "Randevu kaydinda hata aliyorum",
        "description": "Kaydet butonundan sonra islem tamamlanmiyor ve sayfa bos donuyor.",
        "category": "bug",
        "impact": "multiple_users",
    }
    body.update(overrides)
    return body


async def admin_token(client) -> str:
    return await login(client, "/auth/login", "admin@cakesbakes.com")


# ------------------------------------------------------------------ config


async def test_config_reports_route_not_ready_and_blocks_create(client, seeded, session_maker):
    token = await admin_token(client)

    config = await client.get("/tickets/config", headers=auth_headers(token))
    assert config.status_code == 200
    data = config.json()["data"]
    assert data["routing"]["ready"] is False
    assert data["routing"]["reason"] == "route_missing"
    assert data["can_create"] is False

    created = await client.post(
        "/tickets", json=valid_ticket_body(), headers=auth_headers(token)
    )
    assert created.status_code == 409
    assert created.json()["error"]["code"] == "TICKET_ROUTE_NOT_READY"


async def test_config_never_exposes_hermes_group_id(client, seeded, session_maker):
    """Musteri grup SECMEZ; tarayicinin grup kimligini bilmesi gerekmez."""
    await configure_route(session_maker, seeded["tenant"].id)
    token = await admin_token(client)

    response = await client.get("/tickets/config", headers=auth_headers(token))
    routing = response.json()["data"]["routing"]
    assert routing["ready"] is True
    assert routing["group_display_name"] == GROUP_NAME
    assert "group_id" not in routing
    assert str(GROUP_ID) not in response.text


async def test_disabled_route_blocks_create(client, seeded, session_maker):
    await configure_route(session_maker, seeded["tenant"].id, is_active=False)
    token = await admin_token(client)

    config = await client.get("/tickets/config", headers=auth_headers(token))
    assert config.json()["data"]["routing"]["reason"] == "route_disabled"

    created = await client.post(
        "/tickets", json=valid_ticket_body(), headers=auth_headers(token)
    )
    assert created.status_code == 409


# ----------------------------------------------------------------- create


async def test_create_writes_projection_message_and_outbox_together(
    client, seeded, session_maker
):
    await configure_route(session_maker, seeded["tenant"].id)
    token = await admin_token(client)

    response = await client.post(
        "/tickets",
        json=valid_ticket_body(
            reproduction_steps="1. Ac 2. Kaydet",
            error_code="LS-API-409",
            client_context={
                "page_path": "/appointments/new?token=SECRET#frag",
                "browser": "Chrome 140",
                "cookie": "session=abc",
                "authorization": "Bearer xyz",
            },
        ),
        headers=auth_headers(token),
    )
    assert response.status_code == 200, response.text
    data = response.json()["data"]
    assert data["status"] == "open"
    assert data["delivery_status"] == "pending"
    assert data["ticket_number"] is None  # canonical numara Hermes'ten gelir
    assert data["group_name"] == GROUP_NAME
    assert len(data["messages"]) == 1
    assert data["messages"][0]["is_pending"] is True

    # Tehlikeli baglam alanlari ALLOWLIST'te olmadigi icin dusmus olmali.
    assert data["client_context"] == {
        "page_path": "/appointments/new",
        "browser": "Chrome 140",
    }

    async with session_maker() as db:
        outbox = list((await db.execute(sa.select(SupportTicketOutbox))).scalars())
    assert len(outbox) == 1
    assert outbox[0].command_type.value == "create"
    assert outbox[0].payload_json["route"]["route_version"] == 3
    assert outbox[0].payload_json["source_ticket_id"] == data["id"]


async def test_create_requires_ticket_create_permission(client, seeded, session_maker):
    await configure_route(session_maker, seeded["tenant"].id)
    token = await login(client, "/auth/login", "izleyici@cakesbakes.com")

    # Izleyici rolunde ticket izni YOK: liste bile acilmaz.
    listed = await client.get("/tickets", headers=auth_headers(token))
    assert listed.status_code == 403


async def test_short_title_is_rejected_before_reaching_hermes(client, seeded, session_maker):
    await configure_route(session_maker, seeded["tenant"].id)
    token = await admin_token(client)
    response = await client.post(
        "/tickets", json=valid_ticket_body(title="kisa"), headers=auth_headers(token)
    )
    assert response.status_code == 422


async def test_group_id_in_body_is_rejected(client, seeded, session_maker):
    """Musteri govdesi ile grup dayatilamaz (extra=forbid)."""
    await configure_route(session_maker, seeded["tenant"].id)
    token = await admin_token(client)
    response = await client.post(
        "/tickets",
        json=valid_ticket_body(hermes_group_id=str(uuid.uuid4())),
        headers=auth_headers(token),
    )
    assert response.status_code == 422


# ------------------------------------------------------------- gorunurluk


async def test_default_user_sees_only_own_tickets(client, seeded, session_maker):
    await configure_route(session_maker, seeded["tenant"].id)
    dock_token = await login(client, "/auth/login", "rampa@cakesbakes.com")
    await client.post("/tickets", json=valid_ticket_body(), headers=auth_headers(dock_token))

    admin = await admin_token(client)
    await client.post(
        "/tickets",
        json=valid_ticket_body(title="Yonetici tarafindan acilan talep"),
        headers=auth_headers(admin),
    )

    # Rampa yoneticisinde `ticket.view_all` YOK -> yalnizca kendi kaydi.
    own = await client.get("/tickets", headers=auth_headers(dock_token))
    assert [t["title"] for t in own.json()["data"]] == [valid_ticket_body()["title"]]

    # Sistem yoneticisinde view_all VAR -> iki kayit da gorunur.
    everything = await client.get("/tickets", headers=auth_headers(admin))
    assert len(everything.json()["data"]) == 2


async def test_detail_of_other_users_ticket_returns_404(client, seeded, session_maker):
    """Yetkisiz erisim VARLIK SIZDIRMAZ: 403 degil 404."""
    await configure_route(session_maker, seeded["tenant"].id)
    admin = await admin_token(client)
    created = await client.post(
        "/tickets", json=valid_ticket_body(), headers=auth_headers(admin)
    )
    ticket_id = created.json()["data"]["id"]

    dock_token = await login(client, "/auth/login", "rampa@cakesbakes.com")
    response = await client.get(f"/tickets/{ticket_id}", headers=auth_headers(dock_token))
    assert response.status_code == 404


async def test_supplier_sees_only_own_tickets_and_not_tenant_ones(
    client, seeded, session_maker
):
    await configure_route(session_maker, seeded["tenant"].id)
    admin = await admin_token(client)
    tenant_ticket = await client.post(
        "/tickets", json=valid_ticket_body(), headers=auth_headers(admin)
    )
    tenant_ticket_id = tenant_ticket.json()["data"]["id"]

    supplier = await login(client, "/auth/supplier-login", "tedarikci@anadoluun.com")
    created = await client.post(
        "/supplier/tickets",
        json=valid_ticket_body(title="Tedarikci portalinda hata var"),
        headers=auth_headers(supplier),
    )
    assert created.status_code == 200, created.text

    listed = await client.get("/supplier/tickets", headers=auth_headers(supplier))
    rows = listed.json()["data"]
    assert len(rows) == 1
    assert rows[0]["requester_type"] == "supplier_user"
    assert rows[0]["supplier_name"] == "Anadolu Un A.S."

    leaked = await client.get(
        f"/supplier/tickets/{tenant_ticket_id}", headers=auth_headers(supplier)
    )
    assert leaked.status_code == 404


async def test_supplier_cannot_use_management_ticket_routes(client, seeded, session_maker):
    """Yol onegi farkli olsa da yetki servis katmanindan gelir."""
    await configure_route(session_maker, seeded["tenant"].id)
    supplier = await login(client, "/auth/supplier-login", "tedarikci@anadoluun.com")
    admin = await admin_token(client)
    created = await client.post(
        "/tickets", json=valid_ticket_body(), headers=auth_headers(admin)
    )
    ticket_id = created.json()["data"]["id"]

    response = await client.get(f"/tickets/{ticket_id}", headers=auth_headers(supplier))
    assert response.status_code == 404


async def test_platform_user_cannot_reach_ticket_routes(client, seeded):
    token = await login(client, "/auth/platform-login", "admin@logislot.com")
    response = await client.get("/tickets", headers=auth_headers(token))
    assert response.status_code == 403


# ------------------------------------------------------------ durum kurallari


async def _create_ticket(client, token, **overrides) -> str:
    response = await client.post(
        "/tickets", json=valid_ticket_body(**overrides), headers=auth_headers(token)
    )
    assert response.status_code == 200, response.text
    return response.json()["data"]["id"]


async def test_reply_before_delivery_is_refused(client, seeded, session_maker):
    """Merkeze ulasmamis ticketa yanit gonderilemez — komut sirasi korunur."""
    await configure_route(session_maker, seeded["tenant"].id)
    token = await admin_token(client)
    ticket_id = await _create_ticket(client, token)

    response = await client.post(
        f"/tickets/{ticket_id}/messages",
        json={"body": "Ek bilgi ekliyorum"},
        headers=auth_headers(token),
    )
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "TICKET_STATE_INVALID"


async def _mark_synced(session_maker, ticket_id, status=TicketStatus.open, version=1):
    async with session_maker() as db:
        ticket = (
            await db.execute(
                sa.select(SupportTicketProjection).where(
                    SupportTicketProjection.id == uuid.UUID(ticket_id)
                )
            )
        ).scalar_one()
        ticket.remote_ticket_id = uuid.uuid4()
        ticket.remote_ticket_number = "TKT-000123"
        ticket.remote_status = status
        ticket.aggregate_version = version
        await db.commit()


async def test_reply_writes_pending_message_and_outbox(client, seeded, session_maker):
    await configure_route(session_maker, seeded["tenant"].id)
    token = await admin_token(client)
    ticket_id = await _create_ticket(client, token)
    await _mark_synced(session_maker, ticket_id)

    response = await client.post(
        f"/tickets/{ticket_id}/messages",
        json={"body": "Ekran goruntusu ekledim"},
        headers=auth_headers(token),
    )
    assert response.status_code == 200
    messages = response.json()["data"]["messages"]
    assert messages[-1]["body"] == "Ekran goruntusu ekledim"
    assert messages[-1]["is_pending"] is True

    async with session_maker() as db:
        commands = list(
            (
                await db.execute(
                    sa.select(SupportTicketOutbox).where(
                        SupportTicketOutbox.command_type == "public_reply"
                    )
                )
            ).scalars()
        )
    assert len(commands) == 1
    assert commands[0].payload_json["visibility"] == "public"


async def test_reopen_only_from_resolved(client, seeded, session_maker):
    await configure_route(session_maker, seeded["tenant"].id)
    token = await admin_token(client)
    ticket_id = await _create_ticket(client, token)
    await _mark_synced(session_maker, ticket_id, status=TicketStatus.in_progress)

    early = await client.post(
        f"/tickets/{ticket_id}/reopen",
        json={"reason": "Sorun devam ediyor"},
        headers=auth_headers(token),
    )
    assert early.status_code == 409

    await _mark_synced(session_maker, ticket_id, status=TicketStatus.resolved)
    allowed = await client.post(
        f"/tickets/{ticket_id}/reopen",
        json={"reason": "Sorun devam ediyor"},
        headers=auth_headers(token),
    )
    assert allowed.status_code == 200


async def test_closed_ticket_rejects_reply(client, seeded, session_maker):
    await configure_route(session_maker, seeded["tenant"].id)
    token = await admin_token(client)
    ticket_id = await _create_ticket(client, token)
    await _mark_synced(session_maker, ticket_id, status=TicketStatus.closed)

    response = await client.post(
        f"/tickets/{ticket_id}/messages",
        json={"body": "Tekrar merhaba"},
        headers=auth_headers(token),
    )
    assert response.status_code == 409


async def test_cancel_only_while_open(client, seeded, session_maker):
    await configure_route(session_maker, seeded["tenant"].id)
    token = await admin_token(client)
    ticket_id = await _create_ticket(client, token)
    await _mark_synced(session_maker, ticket_id, status=TicketStatus.in_progress)

    late = await client.post(
        f"/tickets/{ticket_id}/cancel", json={}, headers=auth_headers(token)
    )
    assert late.status_code == 409

    await _mark_synced(session_maker, ticket_id, status=TicketStatus.open)
    early = await client.post(
        f"/tickets/{ticket_id}/cancel",
        json={"reason": "Yanlislikla acildi"},
        headers=auth_headers(token),
    )
    assert early.status_code == 200


async def test_status_group_tabs_filter_correctly(client, seeded, session_maker):
    await configure_route(session_maker, seeded["tenant"].id)
    token = await admin_token(client)
    open_id = await _create_ticket(client, token)
    waiting_id = await _create_ticket(client, token, title="Bilgi bekleyen talebimiz")
    await _mark_synced(session_maker, waiting_id, status=TicketStatus.waiting_customer)

    waiting = await client.get(
        "/tickets?status_group=waiting_customer", headers=auth_headers(token)
    )
    ids = [t["id"] for t in waiting.json()["data"]]
    assert ids == [waiting_id]

    open_tab = await client.get("/tickets?status_group=open", headers=auth_headers(token))
    assert [t["id"] for t in open_tab.json()["data"]] == [open_id]
