"""Markali alt alana yonlendirme ve alan adlari arasi oturum devri.

Neden devir kodu gerekiyor: oturum `localStorage`'da ve ORIGIN'e bagli.
`yonetim.logislot.io` uzerinde acilan oturumu `cknb.logislot.io` okuyamaz, yani
markali alt alana duz bir yonlendirme kullaniciyi login ekranina geri dusurur.
Token'i URL'e koymak yerine kisa omurlu, tek kullanimlik bir kod devredilir.
"""

import uuid
from datetime import UTC, datetime, timedelta

import sqlalchemy as sa

from app.models import AuthHandoffCode, Tenant
from app.services import auth_handoff
from tests.conftest import DEMO_PASSWORD, auth_headers, login

BRANDED_ADMIN = "cknb.logislot.io"
BRANDED_SUPPLIER = "cknbtedarik.logislot.io"
ADMIN_EMAIL = "admin@cakesbakes.com"


async def _set_hosts(session_maker, tenant_id, admin=BRANDED_ADMIN, supplier=BRANDED_SUPPLIER):
    async with session_maker() as db:
        tenant = (
            await db.execute(sa.select(Tenant).where(Tenant.id == tenant_id))
        ).scalar_one()
        tenant.admin_host = admin
        tenant.supplier_host = supplier
        await db.commit()


async def _login(client, email=ADMIN_EMAIL, endpoint="/auth/login"):
    return await client.post(
        endpoint, json={"email": email, "password": DEMO_PASSWORD}
    )


# ---------------------------------------------------------------- yonlendirme


async def test_login_reports_branded_host_when_configured(client, seeded, session_maker):
    await _set_hosts(session_maker, seeded["tenant"].id)
    response = await _login(client)
    assert response.status_code == 200, response.text
    assert response.json()["data"]["branded_host"] == BRANDED_ADMIN


async def test_login_reports_no_host_when_tenant_has_none(client, seeded):
    """Alan adi tanimsizken davranis DEGISMEZ — mevcut tenant'lar etkilenmez."""
    response = await _login(client)
    assert response.status_code == 200
    assert response.json()["data"]["branded_host"] is None


async def test_supplier_login_reports_supplier_host(client, seeded, session_maker):
    await _set_hosts(session_maker, seeded["tenant"].id)
    response = await _login(
        client, "tedarikci@anadoluun.com", "/auth/supplier-login"
    )
    assert response.status_code == 200, response.text
    assert response.json()["data"]["branded_host"] == BRANDED_SUPPLIER


async def test_platform_user_never_gets_branded_host(client, seeded, session_maker):
    """Platform kullanicisinin tenant'i yoktur; markali alan adi da yoktur."""
    await _set_hosts(session_maker, seeded["tenant"].id)
    response = await client.post(
        "/auth/platform-login",
        json={"email": "admin@logislot.com", "password": DEMO_PASSWORD},
    )
    assert response.status_code == 200
    assert response.json()["data"].get("branded_host") is None


# ---------------------------------------------------------------------- devir


async def test_handoff_round_trip_gives_working_session(client, seeded, session_maker):
    await _set_hosts(session_maker, seeded["tenant"].id)
    token = await login(client, "/auth/login", ADMIN_EMAIL)

    issued = await client.post("/auth/handoff/issue", headers=auth_headers(token))
    assert issued.status_code == 200, issued.text
    data = issued.json()["data"]
    assert data["host"] == BRANDED_ADMIN
    assert data["expires_in"] == auth_handoff.CODE_TTL_SECONDS

    consumed = await client.post(
        "/auth/handoff/consume",
        json={"code": data["code"]},
        headers={"Origin": f"https://{BRANDED_ADMIN}"},
    )
    assert consumed.status_code == 200, consumed.text
    new_token = consumed.json()["data"]["access_token"]

    # Devredilen oturum GERCEKTEN calisiyor.
    me = await client.get("/auth/me", headers=auth_headers(new_token))
    assert me.status_code == 200
    assert me.json()["data"]["email"] == ADMIN_EMAIL


async def test_code_is_single_use(client, seeded, session_maker):
    """Ikinci kullanim REDDEDILIR — kod URL'e dusse bile tekrar edilemez."""
    await _set_hosts(session_maker, seeded["tenant"].id)
    token = await login(client, "/auth/login", ADMIN_EMAIL)
    code = (
        await client.post("/auth/handoff/issue", headers=auth_headers(token))
    ).json()["data"]["code"]
    headers = {"Origin": f"https://{BRANDED_ADMIN}"}

    first = await client.post("/auth/handoff/consume", json={"code": code}, headers=headers)
    assert first.status_code == 200
    second = await client.post("/auth/handoff/consume", json={"code": code}, headers=headers)
    assert second.status_code == 401


async def test_code_is_bound_to_target_origin(client, seeded, session_maker):
    """Calinan kod BASKA bir origin'den kullanilamaz."""
    await _set_hosts(session_maker, seeded["tenant"].id)
    token = await login(client, "/auth/login", ADMIN_EMAIL)
    code = (
        await client.post("/auth/handoff/issue", headers=auth_headers(token))
    ).json()["data"]["code"]

    stolen = await client.post(
        "/auth/handoff/consume",
        json={"code": code},
        headers={"Origin": "https://saldirgan.example.com"},
    )
    assert stolen.status_code == 401

    # Reddedilen deneme kodu TUKETMEZ; mesru origin hala kullanabilir.
    ok_response = await client.post(
        "/auth/handoff/consume",
        json={"code": code},
        headers={"Origin": f"https://{BRANDED_ADMIN}"},
    )
    assert ok_response.status_code == 200


async def test_consume_without_origin_is_refused(client, seeded, session_maker):
    """Origin basligi olmayan istemci (curl ile denenen calinmis kod) gecemez."""
    await _set_hosts(session_maker, seeded["tenant"].id)
    token = await login(client, "/auth/login", ADMIN_EMAIL)
    code = (
        await client.post("/auth/handoff/issue", headers=auth_headers(token))
    ).json()["data"]["code"]

    response = await client.post("/auth/handoff/consume", json={"code": code})
    assert response.status_code == 401


async def test_expired_code_is_refused(client, seeded, session_maker):
    await _set_hosts(session_maker, seeded["tenant"].id)
    token = await login(client, "/auth/login", ADMIN_EMAIL)
    code = (
        await client.post("/auth/handoff/issue", headers=auth_headers(token))
    ).json()["data"]["code"]

    async with session_maker() as db:
        row = (await db.execute(sa.select(AuthHandoffCode))).scalar_one()
        row.expires_at = datetime.now(UTC) - timedelta(seconds=1)
        await db.commit()

    response = await client.post(
        "/auth/handoff/consume",
        json={"code": code},
        headers={"Origin": f"https://{BRANDED_ADMIN}"},
    )
    assert response.status_code == 401


async def test_raw_code_is_never_stored(client, seeded, session_maker):
    """Veritabanini okuyan biri gecerli bir kod URETEMEZ — yalnizca ozet durur."""
    await _set_hosts(session_maker, seeded["tenant"].id)
    token = await login(client, "/auth/login", ADMIN_EMAIL)
    code = (
        await client.post("/auth/handoff/issue", headers=auth_headers(token))
    ).json()["data"]["code"]

    async with session_maker() as db:
        row = (await db.execute(sa.select(AuthHandoffCode))).scalar_one()
    assert row.code_hash != code
    assert code not in row.code_hash
    assert len(row.code_hash) == 64


async def test_issue_refused_when_tenant_has_no_branded_host(client, seeded):
    token = await login(client, "/auth/login", ADMIN_EMAIL)
    response = await client.post("/auth/handoff/issue", headers=auth_headers(token))
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "NO_BRANDED_HOST"


async def test_deactivated_user_cannot_complete_handoff(client, seeded, session_maker):
    """Kod uretildikten SONRA hesap kapatildiysa devir tamamlanmaz."""
    from app.core.enums import UserStatus
    from app.models import TenantUser

    await _set_hosts(session_maker, seeded["tenant"].id)
    token = await login(client, "/auth/login", ADMIN_EMAIL)
    code = (
        await client.post("/auth/handoff/issue", headers=auth_headers(token))
    ).json()["data"]["code"]

    async with session_maker() as db:
        user = (
            await db.execute(sa.select(TenantUser).where(TenantUser.email == ADMIN_EMAIL))
        ).scalar_one()
        user.status = UserStatus.inactive
        await db.commit()

    response = await client.post(
        "/auth/handoff/consume",
        json={"code": code},
        headers={"Origin": f"https://{BRANDED_ADMIN}"},
    )
    assert response.status_code == 401


# ------------------------------------------------------------- platform ucu


async def test_platform_can_set_and_clear_branded_hosts(client, seeded):
    token = await login(client, "/auth/platform-login", "admin@logislot.com")
    base = f"/platform/tenants/{seeded['tenant'].id}"

    # Sema/port/yol temizlenir, kucuk harfe cevrilir.
    response = await client.patch(
        base,
        headers=auth_headers(token),
        json={"admin_host": "HTTPS://CKNB.LogiSlot.io/panel"},
    )
    assert response.status_code == 200, response.text
    assert response.json()["data"]["admin_host"] == BRANDED_ADMIN

    # Bozuk deger REDDEDILIR: kullaniciyi olmayan bir adrese yollamak yerine.
    bad = await client.patch(
        base, headers=auth_headers(token), json={"admin_host": "bu bir host degil"}
    )
    assert bad.status_code == 422

    # Bos birakmak = markali alan adi yok.
    cleared = await client.patch(base, headers=auth_headers(token), json={"admin_host": ""})
    assert cleared.status_code == 200
    assert cleared.json()["data"]["admin_host"] is None


async def test_purge_removes_used_and_expired_codes(client, seeded, session_maker):
    await _set_hosts(session_maker, seeded["tenant"].id)
    async with session_maker() as db:
        db.add(
            AuthHandoffCode(
                code_hash="a" * 64,
                user_type="tenant",
                user_id=uuid.uuid4(),
                tenant_id=seeded["tenant"].id,
                target_host=BRANDED_ADMIN,
                expires_at=datetime.now(UTC) - timedelta(hours=2),
            )
        )
        await db.commit()
        removed = await auth_handoff.purge_expired(db)
        assert removed == 1
        remaining = (await db.execute(sa.select(AuthHandoffCode))).scalars().all()
        assert remaining == []
