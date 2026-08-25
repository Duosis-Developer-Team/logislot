"""Platform ticket yonlendirmesi: izinler, uzak dogrulama, audit, saglik."""

import uuid

import pytest
import sqlalchemy as sa

from app.core.permissions import PlatformPermission, expand_platform_permissions
from app.integrations import hermes_contract as contract
from app.integrations.hermes_support_client import reset_client_factory
from app.models import AuditLog, HermesGroupCatalogCache, PlatformRole, TicketRoutingConfig
from tests.conftest import auth_headers, login
from tests.hermes_stub import RecordingHermes, error_response, fixture, json_response

GROUP_ID = "3f2b1c44-9d1e-4a58-9c77-2b7e5a0f1d33"
OTHER_GROUP_ID = "8c4a6e20-51bd-4f3a-8f0d-7c9d2e4b6a11"


@pytest.fixture(autouse=True)
def _reset_hermes():
    yield
    reset_client_factory()


def hermes_with_catalog() -> RecordingHermes:
    hermes = RecordingHermes()
    hermes.on("/support/routing-groups", json_response(200, fixture("routing_groups_response")))
    hermes.on("/support/routes/validate", json_response(200, fixture("route_validate_response")))
    hermes.install()
    return hermes


async def platform_token(client) -> str:
    return await login(client, "/auth/platform-login", "admin@logislot.com")


# ------------------------------------------------------------------ izinler


def test_manage_permission_implies_view():
    resolved = expand_platform_permissions([PlatformPermission.TICKET_ROUTING_MANAGE])
    assert PlatformPermission.TICKET_ROUTING_VIEW in resolved


async def test_tenant_user_cannot_reach_platform_routing(client, seeded):
    token = await login(client, "/auth/login", "admin@cakesbakes.com")
    response = await client.get("/platform/ticket-routing", headers=auth_headers(token))
    assert response.status_code == 403


async def test_platform_role_without_ticket_permission_is_refused(
    client, seeded, session_maker
):
    async with session_maker() as db:
        role = (
            await db.execute(
                sa.select(PlatformRole).where(PlatformRole.name == "Platform Yoneticisi")
            )
        ).scalar_one()
        role.permissions_json = [
            p for p in role.permissions_json if not p.startswith("platform.ticket")
        ]
        await db.commit()

    token = await platform_token(client)
    response = await client.get("/platform/ticket-routing", headers=auth_headers(token))
    assert response.status_code == 403


# ------------------------------------------------------------------ katalog


async def test_group_catalog_is_fetched_through_backend_and_cached(
    client, seeded, session_maker
):
    hermes = hermes_with_catalog()
    token = await platform_token(client)

    response = await client.get(
        "/platform/ticket-routing/groups", headers=auth_headers(token)
    )
    assert response.status_code == 200
    items = response.json()["data"]["items"]
    assert {i["name"] for i in items} == {"DevOps Team", "Application Support"}
    # Uye kimligi/e-postasi katalogda BULUNMAZ.
    assert "email" not in response.text

    async with session_maker() as db:
        cached = list((await db.execute(sa.select(HermesGroupCatalogCache))).scalars())
    assert len(cached) == 2

    # Ikinci cagri onbellekten gelir; Hermes'e tekrar gidilmez.
    before = len(hermes.requests)
    await client.get("/platform/ticket-routing/groups", headers=auth_headers(token))
    assert len(hermes.requests) == before


async def test_catalog_failure_keeps_last_known_list_with_error_code(
    client, seeded, session_maker
):
    hermes_with_catalog()
    token = await platform_token(client)
    await client.get("/platform/ticket-routing/groups", headers=auth_headers(token))

    # Onbellegi bayatlat ve Hermes'i dusur.
    async with session_maker() as db:
        await db.execute(
            sa.update(HermesGroupCatalogCache).values(
                fetched_at=sa.text("'2020-01-01 00:00:00'")
            )
        )
        await db.commit()

    broken = RecordingHermes()
    broken.on(
        "/support/routing-groups",
        error_response(503, contract.ERROR_INTEGRATION_UNAVAILABLE),
    )
    broken.install()

    response = await client.get(
        "/platform/ticket-routing/groups", headers=auth_headers(token)
    )
    data = response.json()["data"]
    assert len(data["items"]) == 2  # son bilinen liste kaybolmaz
    assert data["stale"] is True
    assert data["error_code"] == contract.ERROR_INTEGRATION_UNAVAILABLE


# -------------------------------------------------------------- route kaydi


async def test_save_route_validates_remotely_and_versions(client, seeded, session_maker):
    hermes = hermes_with_catalog()
    token = await platform_token(client)
    tenant_id = seeded["tenant"].id

    response = await client.put(
        f"/platform/ticket-routing/{tenant_id}",
        json={"hermes_group_id": GROUP_ID, "is_active": True},
        headers=auth_headers(token),
    )
    assert response.status_code == 200, response.text
    data = response.json()["data"]
    assert data["status"] == "ready"
    assert data["route_version"] == 1
    assert data["hermes_group_name"] == "DevOps Team"

    assert any("/support/routes/validate" in str(r.url) for r in hermes.requests)

    # Ikinci kayit surumu artirir.
    second = await client.put(
        f"/platform/ticket-routing/{tenant_id}",
        json={
            "hermes_group_id": OTHER_GROUP_ID,
            "is_active": True,
            "expected_route_version": 1,
        },
        headers=auth_headers(token),
    )
    assert second.json()["data"]["route_version"] == 2


async def test_stale_expected_version_conflicts(client, seeded, session_maker):
    hermes_with_catalog()
    token = await platform_token(client)
    tenant_id = seeded["tenant"].id
    await client.put(
        f"/platform/ticket-routing/{tenant_id}",
        json={"hermes_group_id": GROUP_ID},
        headers=auth_headers(token),
    )

    conflict = await client.put(
        f"/platform/ticket-routing/{tenant_id}",
        json={"hermes_group_id": OTHER_GROUP_ID, "expected_route_version": 0},
        headers=auth_headers(token),
    )
    assert conflict.status_code == 409
    assert conflict.json()["error"]["code"] == "ROUTE_VERSION_CONFLICT"


async def test_remote_rejection_does_not_persist_route(client, seeded, session_maker):
    """Uzak dogrulama basarisizsa YARIM kayit kalmamali."""
    hermes = RecordingHermes()
    hermes.on("/support/routing-groups", json_response(200, fixture("routing_groups_response")))
    hermes.on(
        "/support/routes/validate", error_response(422, contract.ERROR_GROUP_INACTIVE)
    )
    hermes.install()

    token = await platform_token(client)
    tenant_id = seeded["tenant"].id
    response = await client.put(
        f"/platform/ticket-routing/{tenant_id}",
        json={"hermes_group_id": GROUP_ID},
        headers=auth_headers(token),
    )
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "GROUP_INACTIVE"

    async with session_maker() as db:
        rows = list((await db.execute(sa.select(TicketRoutingConfig))).scalars())
    assert rows == []


async def test_inactive_cached_group_cannot_be_saved(client, seeded, session_maker):
    hermes_with_catalog()
    token = await platform_token(client)
    await client.get("/platform/ticket-routing/groups", headers=auth_headers(token))

    async with session_maker() as db:
        await db.execute(
            sa.update(HermesGroupCatalogCache)
            .where(HermesGroupCatalogCache.group_id == uuid.UUID(GROUP_ID))
            .values(is_active=False)
        )
        await db.commit()

    response = await client.put(
        f"/platform/ticket-routing/{seeded['tenant'].id}",
        json={"hermes_group_id": GROUP_ID},
        headers=auth_headers(token),
    )
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "GROUP_INACTIVE"


async def test_route_change_is_audited_with_before_after(client, seeded, session_maker):
    hermes_with_catalog()
    token = await platform_token(client)
    tenant_id = seeded["tenant"].id
    await client.put(
        f"/platform/ticket-routing/{tenant_id}",
        json={"hermes_group_id": GROUP_ID},
        headers=auth_headers(token),
    )
    await client.put(
        f"/platform/ticket-routing/{tenant_id}",
        json={"hermes_group_id": OTHER_GROUP_ID, "expected_route_version": 1},
        headers=auth_headers(token),
    )

    async with session_maker() as db:
        entries = list(
            (
                await db.execute(
                    sa.select(AuditLog)
                    .where(AuditLog.action.like("ticket_routing.%"))
                    .order_by(AuditLog.occurred_at)
                )
            ).scalars()
        )
    actions = [e.action for e in entries]
    assert "ticket_routing.create" in actions
    assert "ticket_routing.update" in actions
    update = next(e for e in entries if e.action == "ticket_routing.update")
    assert update.before_json["hermes_group_id"] == GROUP_ID
    assert update.after_json["hermes_group_id"] == OTHER_GROUP_ID
    # Audit'te secret/token BULUNMAZ.
    assert "token" not in str(update.after_json).lower()


async def test_connection_test_does_not_create_ticket(client, seeded, session_maker):
    hermes = hermes_with_catalog()
    token = await platform_token(client)
    tenant_id = seeded["tenant"].id
    await client.put(
        f"/platform/ticket-routing/{tenant_id}",
        json={"hermes_group_id": GROUP_ID},
        headers=auth_headers(token),
    )

    response = await client.post(
        f"/platform/ticket-routing/{tenant_id}/test",
        json={},
        headers=auth_headers(token),
    )
    assert response.status_code == 200
    assert response.json()["data"]["ok"] is True
    assert not any(
        str(r.url).endswith("/support/tickets") and r.method == "POST"
        for r in hermes.requests
    )


async def test_failing_test_records_error_code_on_config(client, seeded, session_maker):
    hermes_with_catalog()
    token = await platform_token(client)
    tenant_id = seeded["tenant"].id
    await client.put(
        f"/platform/ticket-routing/{tenant_id}",
        json={"hermes_group_id": GROUP_ID},
        headers=auth_headers(token),
    )

    broken = RecordingHermes()
    broken.on(
        "/support/routes/validate",
        error_response(503, contract.ERROR_INTEGRATION_UNAVAILABLE),
    )
    broken.install()

    response = await client.post(
        f"/platform/ticket-routing/{tenant_id}/test", json={}, headers=auth_headers(token)
    )
    assert response.json()["data"]["ok"] is False

    async with session_maker() as db:
        config = (await db.execute(sa.select(TicketRoutingConfig))).scalar_one()
    assert config.last_error_code == contract.ERROR_INTEGRATION_UNAVAILABLE


# ------------------------------------------------------------------- liste


async def test_route_list_shows_status_without_ticket_content(client, seeded, session_maker):
    hermes_with_catalog()
    token = await platform_token(client)
    response = await client.get("/platform/ticket-routing", headers=auth_headers(token))
    rows = response.json()["data"]
    assert len(rows) == 1
    row = rows[0]
    assert row["status"] == "unconfigured"
    assert row["delivery"] == {"pending": 0, "failed": 0, "dead": 0}
    # Platform yuzeyine ticket icerigi SIZMAZ.
    for forbidden in ("title", "description", "requester", "message"):
        assert forbidden not in row


async def test_health_summary_is_content_free(client, seeded, session_maker):
    hermes_with_catalog()
    token = await platform_token(client)
    await client.put(
        f"/platform/ticket-routing/{seeded['tenant'].id}",
        json={"hermes_group_id": GROUP_ID},
        headers=auth_headers(token),
    )

    response = await client.get(
        "/platform/ticket-routing/health/summary", headers=auth_headers(token)
    )
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["configured_tenant_count"] == 1
    assert data["unconfigured_tenant_count"] == 0
    assert data["outgoing"] == {"pending": 0, "failed": 0, "dead": 0}
    assert set(data["webhook_inbox"]) == {
        "received",
        "processing",
        "processed",
        "failed",
        "dead",
    }
    assert "ticket_number" not in response.text
