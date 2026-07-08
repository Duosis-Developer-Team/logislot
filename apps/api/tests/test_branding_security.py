"""Sprint 7: branding, guvenlik sertlestirme ve bildirim temizligi testleri."""

from datetime import UTC, datetime, timedelta

from tests.conftest import DEMO_PASSWORD, auth_headers, login
from tests.test_config_crud import admin
from tests.test_isolation import _create_other_tenant

# ---------- Branding ----------


async def test_branding_default_fallback(client, seeded):
    """Ozellestirme yokken LogiSlot varsayilani doner."""
    headers = await admin(client)
    fid = seeded["facility"].id
    response = await client.get(f"/facilities/{fid}/branding", headers=headers)
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["brand_name"] == "LogiSlot"
    assert data["primary_color"] == "#4F46E5"
    assert data["is_customized"] is False


async def test_branding_update_reset_and_audit(client, seeded, session_maker):
    headers = await admin(client)
    fid = seeded["facility"].id

    response = await client.patch(
        f"/facilities/{fid}/branding",
        headers=headers,
        json={
            "brand_name": "Cakes & Bakes",
            "primary_color": "#2563EB",
            "accent_color": "#F97316",
            "custom_footer_text": "Cakes & Bakes Mal Kabul Portalı",
        },
    )
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["brand_name"] == "Cakes & Bakes"
    assert data["primary_color"] == "#2563EB"
    assert data["is_customized"] is True
    # verilmeyen alan default kalir
    assert data["portal_header_style"] == "light"

    # tedarikci de OKUYABILIR (portal temasi)
    supplier = auth_headers(
        await login(client, "/auth/supplier-login", "tedarikci@anadoluun.com")
    )
    response = await client.get(f"/facilities/{fid}/branding", headers=supplier)
    assert response.json()["data"]["brand_name"] == "Cakes & Bakes"

    # reset -> default
    response = await client.delete(f"/facilities/{fid}/branding", headers=headers)
    assert response.json()["data"]["brand_name"] == "LogiSlot"
    assert response.json()["data"]["is_customized"] is False

    from sqlalchemy import select

    from app.models import AuditLog

    async with session_maker() as db:
        actions = [
            row[0]
            for row in await db.execute(
                select(AuditLog.action).where(AuditLog.action.like("branding.%"))
            )
        ]
    assert "branding.update" in actions and "branding.reset" in actions


async def test_branding_validation_and_permissions(client, seeded, session_maker):
    headers = await admin(client)
    fid = seeded["facility"].id

    # gecersiz hex -> 422
    response = await client.patch(
        f"/facilities/{fid}/branding", headers=headers, json={"primary_color": "mavi"}
    )
    assert response.status_code == 422

    # gecersiz header style -> 422
    response = await client.patch(
        f"/facilities/{fid}/branding", headers=headers,
        json={"portal_header_style": "neon"},
    )
    assert response.status_code == 422

    # izleyici (user.manage yok) guncelleyemez ama okuyabilir
    viewer = auth_headers(await login(client, "/auth/login", "izleyici@cakesbakes.com"))
    assert (
        await client.patch(
            f"/facilities/{fid}/branding", headers=viewer, json={"brand_name": "X"}
        )
    ).status_code == 403
    assert (
        await client.get(f"/facilities/{fid}/branding", headers=viewer)
    ).status_code == 200

    # yabanci tenant 403
    await _create_other_tenant(session_maker)
    other = auth_headers(await login(client, "/auth/login", "admin@rakip.com"))
    assert (
        await client.get(f"/facilities/{fid}/branding", headers=other)
    ).status_code == 403


async def test_branding_corrupt_data_falls_back(client, seeded, session_maker):
    """Bozuk branding_json sistemi bozmaz; default doner."""
    from sqlalchemy import update

    from app.models import Facility

    async with session_maker() as db:
        await db.execute(
            update(Facility)
            .where(Facility.id == seeded["facility"].id)
            .values(branding_json=["bozuk", "veri"])
        )
        await db.commit()

    headers = await admin(client)
    response = await client.get(
        f"/facilities/{seeded['facility'].id}/branding", headers=headers
    )
    assert response.status_code == 200
    assert response.json()["data"]["brand_name"] == "LogiSlot"


# ---------- Guvenlik: rate limit ----------


async def test_login_rate_limit(client, seeded):
    """Limit asiminda 429 RATE_LIMITED; diger anahtarlar etkilenmez."""
    from app.core.config import get_settings
    from app.core.ratelimit import limiter

    settings = get_settings()
    original = settings.rate_limit_enabled
    settings.rate_limit_enabled = True
    limiter.reset()
    try:
        for _ in range(settings.login_rate_limit_attempts):
            response = await client.post(
                "/auth/login",
                json={"email": "limit-test@ornek.com", "password": "yanlis"},
            )
            assert response.status_code == 401  # limit degil, kimlik hatasi

        response = await client.post(
            "/auth/login", json={"email": "limit-test@ornek.com", "password": "yanlis"}
        )
        assert response.status_code == 429
        assert response.json()["error"]["code"] == "RATE_LIMITED"

        # farkli email ayni IP'de etkilenmez (anahtar: ip+email)
        response = await client.post(
            "/auth/login",
            json={"email": "admin@cakesbakes.com", "password": DEMO_PASSWORD},
        )
        assert response.status_code == 200
    finally:
        settings.rate_limit_enabled = original
        limiter.reset()


# ---------- Guvenlik: refresh rotation ----------


async def get_pair(client, email=None, endpoint="/auth/login"):
    response = await client.post(
        endpoint, json={"email": email or "admin@cakesbakes.com", "password": DEMO_PASSWORD}
    )
    assert response.status_code == 200
    return response.json()["data"]


async def test_refresh_rotation_old_token_rejected(client, seeded):
    pair = await get_pair(client)

    # ilk refresh calisir ve YENI cift doner
    response = await client.post("/auth/refresh", json={"refresh_token": pair["refresh_token"]})
    assert response.status_code == 200
    new_pair = response.json()["data"]
    assert new_pair["refresh_token"] != pair["refresh_token"]

    # eski refresh TEKRAR kullanilamaz (rotation)
    response = await client.post("/auth/refresh", json={"refresh_token": pair["refresh_token"]})
    assert response.status_code == 401

    # yeni refresh calisir
    response = await client.post(
        "/auth/refresh", json={"refresh_token": new_pair["refresh_token"]}
    )
    assert response.status_code == 200


async def test_logout_revokes_refresh(client, seeded):
    pair = await get_pair(client)
    response = await client.post(
        "/auth/logout", headers=auth_headers(pair["access_token"])
    )
    assert response.status_code == 200
    assert response.json()["data"]["revoked_sessions"] >= 1

    response = await client.post("/auth/refresh", json={"refresh_token": pair["refresh_token"]})
    assert response.status_code == 401


async def test_inactive_supplier_cannot_refresh(client, seeded):
    pair = await get_pair(
        client, email="tedarikci@marmarasoguk.com", endpoint="/auth/supplier-login"
    )
    # firmayi pasiflestir
    headers = await admin(client)
    await client.delete(
        f"/facilities/{seeded['facility'].id}/suppliers/{seeded['suppliers']['soguk'].id}",
        headers=headers,
    )
    response = await client.post("/auth/refresh", json={"refresh_token": pair["refresh_token"]})
    assert response.status_code == 401


async def test_security_headers_present(client):
    response = await client.get("/health")
    assert response.headers.get("x-content-type-options") == "nosniff"
    assert response.headers.get("x-frame-options") == "DENY"
    assert response.headers.get("referrer-policy") == "same-origin"


# ---------- Bildirim temizligi ----------


async def test_notification_cleanup_rules(client, seeded, session_maker):
    from app.maintenance.cleanup_notifications import cleanup_notifications
    from app.models import Notification

    now = datetime.now(UTC)
    async with session_maker() as db:
        def notif(title, *, read_at, created_at):
            return Notification(
                tenant_id=seeded["tenant"].id,
                facility_id=seeded["facility"].id,
                recipient_user_id=seeded["users"]["admin"].id,
                type="system", severity="info", title=title,
                read_at=read_at, created_at=created_at,
            )

        db.add_all(
            [
                notif("eski-okunmus", read_at=now, created_at=now - timedelta(days=120)),
                notif("eski-okunmamis", read_at=None, created_at=now - timedelta(days=120)),
                notif("yeni-okunmus", read_at=now, created_at=now - timedelta(days=5)),
            ]
        )
        await db.commit()

        # dry-run silmez
        count = await cleanup_notifications(db, days=90, dry_run=True)
        assert count == 1

        count = await cleanup_notifications(db, days=90)
        assert count == 1

        from sqlalchemy import select

        titles = {
            row[0]
            for row in await db.execute(
                select(Notification.title).where(Notification.type == "system")
            )
        }
    assert titles == {"eski-okunmamis", "yeni-okunmus"}  # okunmamis + yeni korunur