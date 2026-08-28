"""Outbox teslimati, retry/backoff, dead-letter ve reconciliation."""

import uuid
from datetime import UTC, datetime, timedelta

import httpx
import pytest
import sqlalchemy as sa

from app.core.enums import (
    TicketDeliveryStatus,
    TicketOutboxStatus,
    TicketStatus,
)
from app.integrations import hermes_contract as contract
from app.integrations.hermes_support_client import reset_client_factory
from app.maintenance.ticket_delivery import deliver_pending
from app.maintenance.ticket_reconciliation import reconcile, requeue_orphan_creates
from app.models import (
    SupportTicketMessageProjection,
    SupportTicketOutbox,
    SupportTicketProjection,
    TicketRoutingConfig,
)
from tests.conftest import auth_headers, login
from tests.hermes_stub import RecordingHermes, error_response, fixture, json_response

GROUP_ID = uuid.UUID("3f2b1c44-9d1e-4a58-9c77-2b7e5a0f1d33")


@pytest.fixture(autouse=True)
def _reset_hermes():
    yield
    reset_client_factory()


async def _route(session_maker, tenant_id, *, group_id=GROUP_ID, version=3):
    async with session_maker() as db:
        existing = (
            await db.execute(
                sa.select(TicketRoutingConfig).where(
                    TicketRoutingConfig.tenant_id == tenant_id
                )
            )
        ).scalar_one_or_none()
        if existing is None:
            db.add(
                TicketRoutingConfig(
                    tenant_id=tenant_id,
                    application_code="logislot",
                    hermes_group_id=group_id,
                    hermes_group_name_snapshot="DevOps Team",
                    route_version=version,
                    # Payload'a giden HERMES'IN surumudur; bizim sayacimiz degil.
                    hermes_route_version=version,
                )
            )
        else:
            existing.hermes_group_id = group_id
            existing.route_version = version
            existing.hermes_route_version = version
        await db.commit()


async def _create_ticket(client, session_maker, seeded) -> str:
    await _route(session_maker, seeded["tenant"].id)
    token = await login(client, "/auth/login", "admin@cakesbakes.com")
    response = await client.post(
        "/tickets",
        json={
            "title": "Randevu kaydinda hata aliyorum",
            "description": (
                "Kaydet butonundan sonra islem tamamlanmiyor ve sayfa bos donuyor."
            ),
            "category": "bug",
            "impact": "multiple_users",
        },
        headers=auth_headers(token),
    )
    assert response.status_code == 200, response.text
    return response.json()["data"]["id"]


async def _ticket(session_maker, ticket_id) -> SupportTicketProjection:
    async with session_maker() as db:
        return (
            await db.execute(
                sa.select(SupportTicketProjection).where(
                    SupportTicketProjection.id == uuid.UUID(ticket_id)
                )
            )
        ).scalar_one()


async def _outbox(session_maker) -> list[SupportTicketOutbox]:
    async with session_maker() as db:
        return list(
            (
                await db.execute(
                    sa.select(SupportTicketOutbox).order_by(SupportTicketOutbox.created_at)
                )
            ).scalars()
        )


# ------------------------------------------------------------------ mutluluk


async def test_create_delivery_stamps_canonical_identity(client, seeded, session_maker):
    ticket_id = await _create_ticket(client, session_maker, seeded)
    hermes = RecordingHermes()
    hermes.on("/support/tickets", json_response(201, fixture("ticket_create_response")))
    hermes.install()

    async with session_maker() as db:
        summary = await deliver_pending(db)
    assert summary["processed"] == 1

    ticket = await _ticket(session_maker, ticket_id)
    assert ticket.remote_ticket_number == "TKT-000123"
    assert ticket.delivery_status is TicketDeliveryStatus.synced
    assert ticket.aggregate_version == 1

    async with session_maker() as db:
        pending = (
            await db.execute(
                sa.select(sa.func.count(SupportTicketMessageProjection.id)).where(
                    SupportTicketMessageProjection.is_pending.is_(True)
                )
            )
        ).scalar_one()
    assert pending == 0

    commands = await _outbox(session_maker)
    assert commands[0].status is TicketOutboxStatus.sent
    # Sozlesme geregi Idempotency-Key gonderilmis olmali.
    assert hermes.last_header(contract.HEADER_IDEMPOTENCY) == str(commands[0].command_id)


async def test_lost_response_replay_produces_single_ticket(client, seeded, session_maker):
    """Yanit kaybolursa AYNI idempotency anahtariyla tekrar denenir.

    Hermes idempotent oldugu icin ikinci cagri ayni canonical ticketi doner;
    yerelde de tek kayit kalir. Bu, "duplicate canonical ticket = 0" hedefinin
    testidir.
    """
    ticket_id = await _create_ticket(client, session_maker, seeded)
    seen_keys: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen_keys.append(request.headers[contract.HEADER_IDEMPOTENCY])
        if len(seen_keys) == 1:
            raise httpx.ReadTimeout("yanit alinamadi")
        return json_response(200, fixture("ticket_create_response"))

    from app.integrations.hermes_support_client import set_client_factory
    from tests.hermes_stub import make_client

    set_client_factory(lambda: make_client(handler))

    async with session_maker() as db:
        await deliver_pending(db)
    first = await _ticket(session_maker, ticket_id)
    assert first.remote_ticket_id is None
    assert first.delivery_status is TicketDeliveryStatus.retrying

    # Backoff zamanini geriye alip ikinci denemeyi tetikle.
    async with session_maker() as db:
        command = (await db.execute(sa.select(SupportTicketOutbox))).scalar_one()
        command.next_attempt_at = datetime.now(UTC) - timedelta(seconds=1)
        await db.commit()
    async with session_maker() as db:
        await deliver_pending(db)

    assert seen_keys[0] == seen_keys[1], "retry AYNI idempotency anahtarini kullanmali"
    second = await _ticket(session_maker, ticket_id)
    assert second.remote_ticket_number == "TKT-000123"

    async with session_maker() as db:
        total = (
            await db.execute(sa.select(sa.func.count(SupportTicketProjection.id)))
        ).scalar_one()
    assert total == 1


async def test_public_reply_delivery_clears_pending_badge(client, seeded, session_maker):
    ticket_id = await _create_ticket(client, session_maker, seeded)
    hermes = RecordingHermes()
    hermes.on("/support/tickets", json_response(201, fixture("ticket_create_response")))
    hermes.install()
    async with session_maker() as db:
        await deliver_pending(db)

    token = await login(client, "/auth/login", "admin@cakesbakes.com")
    await client.post(
        f"/tickets/{ticket_id}/messages",
        json={"body": "Ek bilgi gonderiyorum"},
        headers=auth_headers(token),
    )

    message_id = str(uuid.uuid4())
    hermes.on("/messages", json_response(201, {"message_id": message_id, "version": 2}))
    async with session_maker() as db:
        await deliver_pending(db)

    detail = await client.get(f"/tickets/{ticket_id}", headers=auth_headers(token))
    reply = detail.json()["data"]["messages"][-1]
    assert reply["body"] == "Ek bilgi gonderiyorum"
    assert reply["is_pending"] is False


# --------------------------------------------------------------- hata yollari


async def test_retryable_error_uses_backoff_and_keeps_content(client, seeded, session_maker):
    ticket_id = await _create_ticket(client, session_maker, seeded)
    hermes = RecordingHermes()
    hermes.on("/support/tickets", error_response(503, contract.ERROR_INTEGRATION_UNAVAILABLE))
    hermes.install()

    async with session_maker() as db:
        await deliver_pending(db)

    commands = await _outbox(session_maker)
    assert commands[0].status is TicketOutboxStatus.failed
    assert commands[0].attempts == 1
    # SQLite zaman damgalarini naive dondurur; karsilastirma normalize edilir.
    next_attempt = commands[0].next_attempt_at
    if next_attempt.tzinfo is None:
        next_attempt = next_attempt.replace(tzinfo=UTC)
    assert next_attempt > datetime.now(UTC)
    # Kullanicinin yazdigi icerik KAYBOLMAZ.
    assert commands[0].payload_json["title"] == "Randevu kaydinda hata aliyorum"

    ticket = await _ticket(session_maker, ticket_id)
    assert ticket.delivery_status is TicketDeliveryStatus.retrying
    assert ticket.last_sync_error_code == contract.ERROR_INTEGRATION_UNAVAILABLE


async def test_exhausted_attempts_go_to_dead_letter(client, seeded, session_maker):
    await _create_ticket(client, session_maker, seeded)
    hermes = RecordingHermes()
    hermes.on("/support/tickets", error_response(503, contract.ERROR_INTEGRATION_UNAVAILABLE))
    hermes.install()

    async with session_maker() as db:
        command = (await db.execute(sa.select(SupportTicketOutbox))).scalar_one()
        command.attempts = 9  # bir sonraki deneme onuncu ve son
        await db.commit()
    async with session_maker() as db:
        await deliver_pending(db)

    commands = await _outbox(session_maker)
    assert commands[0].status is TicketOutboxStatus.dead
    assert commands[0].dead_at is not None


async def test_idempotency_conflict_is_dead_lettered_without_new_ticket(
    client, seeded, session_maker
):
    """Ayni anahtar farkli govde: tekrar denemek ayni sonucu verir, elle inceleme sart."""
    await _create_ticket(client, session_maker, seeded)
    hermes = RecordingHermes()
    hermes.on("/support/tickets", error_response(409, contract.ERROR_IDEMPOTENCY_CONFLICT))
    hermes.install()

    async with session_maker() as db:
        await deliver_pending(db)

    commands = await _outbox(session_maker)
    assert commands[0].status is TicketOutboxStatus.dead
    async with session_maker() as db:
        total = (
            await db.execute(sa.select(sa.func.count(SupportTicketProjection.id)))
        ).scalar_one()
    assert total == 1


async def test_route_stale_blocks_then_recovers_with_new_key_same_source_id(
    client, seeded, session_maker
):
    """`route_stale` kurtarma yolu: retry firtinasi degil, route tazeleme.

    Platform yoneticisi route'u guncelledikten sonra AYNI source_ticket_id,
    YENI bir idempotency anahtariyla gonderilir; Hermes'in kaynak tekilligi
    duplicate'i yine engeller.
    """
    ticket_id = await _create_ticket(client, session_maker, seeded)
    seen_keys: list[str] = []
    seen_routes: list[dict] = []

    def handler(request: httpx.Request) -> httpx.Response:
        import json

        seen_keys.append(request.headers[contract.HEADER_IDEMPOTENCY])
        body = json.loads(request.content)
        seen_routes.append(body["route"])
        if body["route"]["route_version"] == 3:
            return error_response(409, contract.ERROR_ROUTE_STALE)
        return json_response(201, fixture("ticket_create_response"))

    from app.integrations.hermes_support_client import set_client_factory
    from tests.hermes_stub import make_client

    set_client_factory(lambda: make_client(handler))

    async with session_maker() as db:
        summary = await deliver_pending(db)
    assert summary["metadata"]["route_blocked"] == 1

    ticket = await _ticket(session_maker, ticket_id)
    assert ticket.delivery_status is TicketDeliveryStatus.failed
    assert ticket.last_sync_error_code == contract.ERROR_ROUTE_STALE

    # Hata control-plane'e islenmis olmali (platform ekrani gorsun).
    async with session_maker() as db:
        config = (
            await db.execute(sa.select(TicketRoutingConfig))
        ).scalar_one()
        assert config.last_error_code == contract.ERROR_ROUTE_STALE

    # Platform yoneticisi route'u tazeler.
    new_group = uuid.UUID("8c4a6e20-51bd-4f3a-8f0d-7c9d2e4b6a11")
    await _route(session_maker, seeded["tenant"].id, group_id=new_group, version=4)
    async with session_maker() as db:
        command = (await db.execute(sa.select(SupportTicketOutbox))).scalar_one()
        command.next_attempt_at = datetime.now(UTC) - timedelta(seconds=1)
        await db.commit()

    async with session_maker() as db:
        await deliver_pending(db)

    assert seen_keys[0] != seen_keys[1], "route tazelendiginde YENI anahtar uretilmeli"
    assert seen_routes[1]["route_version"] == 4
    assert {r["group_id"] for r in seen_routes} == {str(GROUP_ID), str(new_group)}

    ticket = await _ticket(session_maker, ticket_id)
    assert ticket.remote_ticket_number == "TKT-000123"
    assert ticket.route_version == 4


async def test_delivery_skips_when_hermes_not_configured(client, seeded, session_maker):
    """Yapilandirma yoksa komut KAYBOLMAZ, yalnizca ertelenir."""
    await _create_ticket(client, session_maker, seeded)
    reset_client_factory()  # base_url bos -> configured False

    async with session_maker() as db:
        summary = await deliver_pending(db)
    assert summary["metadata"]["skipped"] == "hermes_not_configured"

    commands = await _outbox(session_maker)
    assert commands[0].status is TicketOutboxStatus.pending
    assert commands[0].last_error_code == contract.ERROR_INTEGRATION_UNAVAILABLE


async def test_stuck_delivering_row_is_released(client, seeded, session_maker):
    await _create_ticket(client, session_maker, seeded)
    hermes = RecordingHermes()
    hermes.on("/support/tickets", json_response(201, fixture("ticket_create_response")))
    hermes.install()

    async with session_maker() as db:
        command = (await db.execute(sa.select(SupportTicketOutbox))).scalar_one()
        command.status = TicketOutboxStatus.delivering
        command.locked_at = datetime.now(UTC) - timedelta(hours=1)
        await db.commit()

    async with session_maker() as db:
        summary = await deliver_pending(db)
    assert summary["processed"] == 1


# ------------------------------------------------------------ reconciliation


async def test_reconciliation_repairs_missed_webhook(client, seeded, session_maker):
    """Webhook kaybolsa bile snapshot ile dogru duruma gelinir."""
    ticket_id = await _create_ticket(client, session_maker, seeded)
    hermes = RecordingHermes()
    hermes.on("/support/tickets", json_response(201, fixture("ticket_create_response")))
    hermes.install()
    async with session_maker() as db:
        await deliver_pending(db)

    # Bosluk isaretle (kacirilmis olay taklidi) ve snapshot dondur.
    async with session_maker() as db:
        ticket = (
            await db.execute(
                sa.select(SupportTicketProjection).where(
                    SupportTicketProjection.id == uuid.UUID(ticket_id)
                )
            )
        ).scalar_one()
        ticket.sync_gap = True
        await db.commit()

    hermes.on("by-source", json_response(200, fixture("ticket_snapshot_response")))
    async with session_maker() as db:
        summary = await reconcile(db)
    assert summary["processed"] == 1

    ticket = await _ticket(session_maker, ticket_id)
    assert ticket.sync_gap is False
    assert ticket.remote_status is TicketStatus.resolved
    assert ticket.aggregate_version == 8
    assert ticket.resolution_code == "fixed"

    token = await login(client, "/auth/login", "admin@cakesbakes.com")
    detail = await client.get(f"/tickets/{ticket_id}", headers=auth_headers(token))
    data = detail.json()["data"]
    assert data["resolution"]["summary"].startswith("Kaydet butonundaki")
    # Snapshot'taki musteri mesaji YANKISI ikinci bir satir acmamali: yerel
    # kayit BENIMSENIR ve kanonik metinle guncellenir.
    assert len(data["messages"]) == 2
    requester_message = next(m for m in data["messages"] if m["author_type"] == "requester")
    assert requester_message["body"].endswith("sayfa bos donuyor.")
    assert requester_message["is_pending"] is False
    assert len(data["attachments"]) == 1


async def test_reconciliation_failure_does_not_wipe_projection(client, seeded, session_maker):
    ticket_id = await _create_ticket(client, session_maker, seeded)
    hermes = RecordingHermes()
    hermes.on("/support/tickets", json_response(201, fixture("ticket_create_response")))
    hermes.install()
    async with session_maker() as db:
        await deliver_pending(db)

    async with session_maker() as db:
        ticket = (
            await db.execute(
                sa.select(SupportTicketProjection).where(
                    SupportTicketProjection.id == uuid.UUID(ticket_id)
                )
            )
        ).scalar_one()
        ticket.sync_gap = True
        await db.commit()

    hermes.on("by-source", error_response(503, contract.ERROR_INTEGRATION_UNAVAILABLE))
    async with session_maker() as db:
        summary = await reconcile(db)
    assert summary["metadata"]["failures"] == 1

    ticket = await _ticket(session_maker, ticket_id)
    assert ticket.remote_ticket_number == "TKT-000123"  # son bilinen durum korunur
    assert ticket.sync_gap is True


async def test_orphan_create_is_requeued(client, seeded, session_maker):
    ticket_id = await _create_ticket(client, session_maker, seeded)
    async with session_maker() as db:
        await db.execute(sa.delete(SupportTicketOutbox))
        await db.commit()

    async with session_maker() as db:
        created = await requeue_orphan_creates(db)
    assert created == 1

    commands = await _outbox(session_maker)
    assert commands[0].command_type.value == "create"
    assert commands[0].payload_json["source_ticket_id"] == ticket_id


async def test_snapshot_never_overwrites_original_description(
    client, seeded, session_maker
):
    """Eslesmeyen bir requester mesaji talebin OZGUN metnini EZMEZ.

    Ilk aciklama satiri uzak kimlik almadigi icin daima "baglanmamis" gorunur.
    Onu korlemesine benimsemek, agent'in musteri adina yazdigi (ya da metni
    normalize edilmis) her mesajin orijinal talebi silmesi demek olurdu.
    """
    ticket_id = await _create_ticket(client, session_maker, seeded)
    hermes = RecordingHermes()
    hermes.on("/support/tickets", json_response(201, fixture("ticket_create_response")))
    hermes.install()
    async with session_maker() as db:
        await deliver_pending(db)

    snapshot = fixture("ticket_snapshot_response")
    snapshot["messages"][0]["body"] = "Musteri adina agent tarafindan girilmis metin"
    async with session_maker() as db:
        ticket = (
            await db.execute(
                sa.select(SupportTicketProjection).where(
                    SupportTicketProjection.id == uuid.UUID(ticket_id)
                )
            )
        ).scalar_one()
        ticket.sync_gap = True
        await db.commit()

    hermes.on("by-source", json_response(200, snapshot))
    async with session_maker() as db:
        await reconcile(db)

    token = await login(client, "/auth/login", "admin@cakesbakes.com")
    detail = await client.get(f"/tickets/{ticket_id}", headers=auth_headers(token))
    bodies = [m["body"] for m in detail.json()["data"]["messages"]]
    # Ozgun aciklama YERINDE; yeni metin AYRI bir satir olarak eklendi.
    assert any(b.endswith("sayfa bos donuyor.") for b in bodies)
    assert "Musteri adina agent tarafindan girilmis metin" in bodies


async def test_route_stale_refreshes_hermes_version_without_human_action(
    client, seeded, session_maker
):
    """`route_stale` sonrasi Hermes surumu KENDILIGINDEN tazelenir.

    Hermes kendi route surumunu tutar. Bizim sayacimizi gondermek her teslimatta
    `route_stale` uretiyordu (canli: bizde 1, Hermes'te 5). Surum yalnizca
    Platform ekranindaki "Test" ile tazelenseydi teslimat insan aksiyonuna
    kilitli kalirdi; burada dogrulama ucundan otomatik okunur.
    """
    import json

    from app.integrations.hermes_support_client import set_client_factory
    from tests.hermes_stub import make_client

    await _create_ticket(client, session_maker, seeded)

    def handler(request: httpx.Request) -> httpx.Response:
        url = str(request.url)
        if url.endswith("/routes/validate"):
            # Hermes surumu ILERLEMIS durumda.
            return json_response(200, {"valid": True, "group_active": True,
                                       "group_name": "DevOps Team", "route_version": 9})
        body = json.loads(request.content)
        if body["route"].get("route_version") != 9:
            return error_response(409, contract.ERROR_ROUTE_STALE)
        return json_response(201, fixture("ticket_create_response"))

    set_client_factory(lambda: make_client(handler))

    async with session_maker() as db:
        summary = await deliver_pending(db)
    assert summary["metadata"]["route_blocked"] == 1

    # Insan hicbir sey yapmadan surum tazelenmis olmali.
    async with session_maker() as db:
        config = (await db.execute(sa.select(TicketRoutingConfig))).scalar_one()
    assert config.hermes_route_version == 9
    # Bizim sayacimiz DEGISMEZ: o platform ekranindaki iyimser kilit icindir.
    assert config.route_version == 3

    async with session_maker() as db:
        command = (await db.execute(sa.select(SupportTicketOutbox))).scalar_one()
        command.next_attempt_at = datetime.now(UTC) - timedelta(seconds=1)
        await db.commit()
    async with session_maker() as db:
        await deliver_pending(db)

    ticket = (await _outbox(session_maker))[0]
    assert ticket.status is TicketOutboxStatus.sent


async def test_payload_omits_route_version_when_hermes_version_unknown(
    client, seeded, session_maker
):
    """Surum bilinmiyorken alan HIC gonderilmez — null gondermek 422 uretirdi."""
    from app.core.enums import TicketCategory, TicketImpact, TicketRequesterType
    from app.services.ticket_service import RouteSnapshot, build_create_payload

    payload = build_create_payload(
        SupportTicketProjection(
            id=uuid.uuid4(),
            tenant_id=seeded["tenant"].id,
            facility_id=uuid.uuid4(),
            requester_type=TicketRequesterType.tenant_user,
            requester_id=uuid.uuid4(),
            requester_name="X",
            requester_email="x@example.com",
            title="Randevu kaydinda hata aliyorum",
            description="Kaydet butonundan sonra islem tamamlanmiyor ve sayfa donuyor.",
            category=TicketCategory.bug,
            impact=TicketImpact.multiple_users,
        ),
        route=RouteSnapshot(ready=True, group_id=GROUP_ID, route_version=None),
        tenant_slug="bta",
        tenant_display_name="BTA",
        attachment_upload_ids=[],
    )
    assert "route_version" not in payload["route"]
    assert payload["route"]["group_id"] == str(GROUP_ID)
