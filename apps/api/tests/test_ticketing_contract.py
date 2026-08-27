"""Hermes destek sozlesmesi v1 — tuketici tarafi sozlesme testleri.

Bu testler "stil" degil SOZLESME dogrulamasidir. Kirilirlarsa dogru tepki
testi guncellemek DEGIL, once ortak karar gunlugune bakip iki repoyu ayni
noktaya getirmektir (bkz. tests/contracts/hermes_support_v1/README.md).
"""

import hashlib
import json
import pathlib
import uuid

import httpx
import pytest

from app.integrations import hermes_contract as contract
from app.integrations.hermes_support_client import (
    HermesApiError,
    HermesNotConfiguredError,
    HermesSupportClient,
    redact,
)
from tests.hermes_stub import (
    FIXTURES,
    RecordingHermes,
    error_response,
    fixture,
    json_response,
    make_client,
)


def test_fixture_manifest_matches_files():
    """Fixture'lar degistiyse manifest de degismeli — sessiz drift olmasin."""
    manifest = json.loads((FIXTURES / "MANIFEST.json").read_text(encoding="utf-8"))
    on_disk = {
        f.name: hashlib.sha256(f.read_bytes()).hexdigest()
        for f in sorted(pathlib.Path(FIXTURES).glob("*.json"))
        if f.name != "MANIFEST.json"
    }
    assert manifest["files"] == on_disk
    assert manifest["version"] == contract.CONTRACT_VERSION


def test_no_fixture_carries_internal_content():
    """Ic not/gizli icerik hicbir musteri payload'inda BULUNMAMALI."""
    forbidden = ("internal_note", "internal_root_cause", "agent_notes")
    for path in pathlib.Path(FIXTURES).glob("*.json"):
        raw = path.read_text(encoding="utf-8")
        for token in forbidden:
            assert token not in raw, f"{path.name} icinde {token} var"
        assert '"visibility": "internal"' not in raw


def test_event_type_catalog_matches_fixtures():
    """Sozlesmedeki olay tipleri ile fixture'lar birebir ortusmeli."""
    from_fixtures = {
        fixture(path.stem)["event_type"]
        for path in pathlib.Path(FIXTURES).glob("event_*.json")
    }
    assert from_fixtures == set(contract.KNOWN_EVENT_TYPES)


def test_create_payload_shape_matches_contract():
    """Istemcinin urettigi create govdesi sozlesme fixture'i ile ayni ANAHTARLARI tasir."""
    from app.core.enums import (
        TicketCategory,
        TicketImpact,
        TicketRequesterType,
        TicketStatus,
    )
    from app.models import SupportTicketProjection
    from app.services.ticket_service import RouteSnapshot, build_create_payload

    expected = fixture("ticket_create_request")
    ticket = SupportTicketProjection(
        id=uuid.UUID(expected["source_ticket_id"]),
        tenant_id=uuid.UUID(expected["source_tenant"]["id"]),
        facility_id=uuid.uuid4(),
        requester_type=TicketRequesterType.tenant_user,
        requester_id=uuid.UUID(expected["requester"]["id"]),
        requester_name=expected["requester"]["display_name"],
        requester_email=expected["requester"]["email"],
        title=expected["title"],
        description=expected["description"],
        category=TicketCategory(expected["category"]),
        impact=TicketImpact(expected["impact"]),
        reproduction_steps=expected["reproduction_steps"],
        expected_result=expected["expected_result"],
        actual_result=expected["actual_result"],
        error_code=expected["error_code"],
        correlation_id=uuid.UUID(expected["correlation_id"]),
        client_context_json=expected["client_context"],
        remote_status=TicketStatus.open,
    )
    payload = build_create_payload(
        ticket,
        route=RouteSnapshot(
            ready=True,
            group_id=uuid.UUID(expected["route"]["group_id"]),
            group_name="DevOps Team",
            route_version=expected["route"]["route_version"],
        ),
        tenant_slug=expected["source_tenant"]["slug"],
        tenant_display_name=expected["source_tenant"]["display_name"],
        attachment_upload_ids=[uuid.UUID(expected["attachment_upload_ids"][0])],
    )
    assert set(payload) == set(expected)
    assert payload["contract_version"] == contract.CONTRACT_VERSION
    assert payload["route"] == expected["route"]
    assert payload["client_context"] == expected["client_context"]
    assert payload["attachment_upload_ids"] == expected["attachment_upload_ids"]


async def test_client_sends_auth_idempotency_and_correlation_headers():
    hermes = RecordingHermes()
    hermes.on("/support/tickets", json_response(201, fixture("ticket_create_response")))
    client = hermes.client()

    key = uuid.uuid4()
    correlation = uuid.uuid4()
    await client.create_ticket(
        fixture("ticket_create_request"), idempotency_key=key, correlation_id=correlation
    )

    request = hermes.requests[-1]
    assert request.headers["Authorization"] == "Bearer test-service-token"
    assert request.headers[contract.HEADER_IDEMPOTENCY] == str(key)
    assert request.headers[contract.HEADER_CORRELATION] == str(correlation)


async def test_client_maps_contract_error_codes():
    """4xx govdesindeki `code` aynen tasinir; HTTP durumu tek basina yorumlanmaz."""
    for status, code, retryable in (
        (409, contract.ERROR_ROUTE_STALE, False),
        (409, contract.ERROR_IDEMPOTENCY_CONFLICT, False),
        (422, contract.ERROR_GROUP_INACTIVE, False),
        (404, contract.ERROR_SOURCE_TENANT_UNKNOWN, False),
        (429, contract.ERROR_RATE_LIMITED, True),
        (503, contract.ERROR_INTEGRATION_UNAVAILABLE, True),
    ):
        client = make_client(lambda _req, s=status, c=code: error_response(s, c))
        with pytest.raises(HermesApiError) as excinfo:
            await client.create_ticket({}, idempotency_key=uuid.uuid4())
        assert excinfo.value.code == code
        assert excinfo.value.retryable is retryable


async def test_server_retryable_flag_wins_over_status_class():
    """Sunucu `retryable` bildirdiyse HTTP sinifina bakilmaz."""
    client = make_client(
        lambda _req: error_response(500, contract.ERROR_FORBIDDEN, retryable=False)
    )
    with pytest.raises(HermesApiError) as excinfo:
        await client.create_ticket({}, idempotency_key=uuid.uuid4())
    assert excinfo.value.retryable is False


async def test_network_failure_is_retryable_integration_unavailable():
    def boom(_request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("baglanti kurulamadi")

    client = make_client(boom)
    with pytest.raises(HermesApiError) as excinfo:
        await client.get_ticket_by_source(source_ticket_id=uuid.uuid4())
    assert excinfo.value.code == contract.ERROR_INTEGRATION_UNAVAILABLE
    assert excinfo.value.retryable is True


async def test_unconfigured_client_fails_closed():
    client = HermesSupportClient(base_url="", token="")
    assert client.configured is False
    with pytest.raises(HermesNotConfiguredError):
        await client.list_routing_groups()


async def test_group_catalog_uses_etag_and_handles_304():
    calls: list[str | None] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request.headers.get("If-None-Match"))
        if request.headers.get("If-None-Match"):
            return httpx.Response(304, headers={"ETag": 'W/"v2"'})
        return json_response(
            200, fixture("routing_groups_response"), headers={"ETag": 'W/"v2"'}
        )

    client = make_client(handler)
    first = await client.list_routing_groups()
    assert len(first.items) == 2
    assert first.etag == 'W/"v2"'

    second = await client.list_routing_groups(etag=first.etag)
    assert second.not_modified is True
    assert calls == [None, 'W/"v2"']


def test_token_and_signature_values_are_redacted():
    dirty = 'Authorization: Bearer abc.def.ghi  {"secret": "s3cr3t", "signature":"deadbeef"}'
    cleaned = redact(dirty)
    assert "abc.def.ghi" not in cleaned
    assert "s3cr3t" not in cleaned
    assert "deadbeef" not in cleaned
    assert "[REDACTED]" in cleaned


def test_error_from_hermes_never_leaks_token_into_message():
    error = HermesApiError(
        contract.ERROR_FORBIDDEN, "Bearer super-secret-token reddedildi"
    )
    assert "super-secret-token" not in str(error)
    assert "super-secret-token" not in error.message


async def test_hermes_failure_returns_standard_error_envelope(client, seeded, session_maker):
    """Hermes arizasi HAM 500 degil, standart zarfla donmeli.

    Bu kritik cunku "Hermes yapilandirilmadi" DEV/COMPOSE VARSAYILANIDIR:
    handler olmasa ek dosya ve katalog uclari kutudan cikar cikmaz 500 verirdi
    ve istemci hatanin gecici mi kalici mi oldugunu ayirt edemezdi.
    """
    from app.integrations.hermes_support_client import reset_client_factory
    from app.models import TicketRoutingConfig
    from tests.conftest import auth_headers, login

    reset_client_factory()  # base_url bos -> HermesNotConfiguredError
    async with session_maker() as db:
        db.add(
            TicketRoutingConfig(
                tenant_id=seeded["tenant"].id,
                application_code="logislot",
                hermes_group_id=uuid.uuid4(),
                hermes_group_name_snapshot="DevOps Team",
                route_version=1,
            )
        )
        await db.commit()

    token = await login(client, "/auth/login", "admin@cakesbakes.com")
    response = await client.post(
        "/tickets/attachments/sessions",
        json={
            "file_name": "screen.png",
            "size_bytes": 1024,
            "declared_mime_type": "image/png",
        },
        headers=auth_headers(token),
    )
    assert response.status_code == 503
    body = response.json()
    assert body["success"] is False
    assert body["error"]["code"] == "HERMES_INTEGRATION_UNAVAILABLE"
    # Mesaj kullaniciya gosterilebilir olmali; teknik/secret ayrinti tasimamali.
    assert "Bearer" not in body["error"]["message"]

    # Yerel ticket olusturma HERMES OLMADAN da calisir (outbox'ta bekler).
    created = await client.post(
        "/tickets",
        json={
            "title": "Hermes kapaliyken de talep acilabilmeli",
            "description": "Entegrasyon yapilandirilmamisken kayit yerelde tutulur.",
            "category": "bug",
            "impact": "single_user",
        },
        headers=auth_headers(token),
    )
    assert created.status_code == 200
    assert created.json()["data"]["delivery_status"] == "pending"
