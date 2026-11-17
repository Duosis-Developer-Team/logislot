"""Self-servis sifremi unuttum / kullanici adimi unuttum."""

import re
from datetime import UTC, datetime, timedelta
from urllib.parse import unquote

from sqlalchemy import select

from app.models import AuditLog, AuthSession, EmailLog
from app.seed import DEMO_PASSWORD
from app.services import password_reset as svc
from tests.conftest import auth_headers, login

SUPPLIER_EMAIL = "tedarikci@anadoluun.com"
SUPPLIER_CONTACT = "tedarik@anadoluun.example.com"
ADMIN_EMAIL = "admin@cakesbakes.com"
PLATFORM_EMAIL = "admin@logislot.com"
NEW_PASSWORD = "YeniParola-2026!"


async def _logs(session_maker, template_key: str) -> list[EmailLog]:
    async with session_maker() as db:
        return list(
            (
                await db.execute(
                    select(EmailLog)
                    .where(EmailLog.template_key == template_key)
                    .order_by(EmailLog.created_at)
                )
            ).scalars()
        )


def _token_from(body: str) -> str:
    match = re.search(r"token=([^\s&]+)", body)
    assert match, body
    return unquote(match.group(1))


async def _request_reset(client, email: str, portal: str):
    return await client.post(
        "/auth/password-reset/request", json={"email": email, "portal": portal}
    )


async def test_unknown_email_gets_same_generic_response(client, seeded, session_maker):
    known = await _request_reset(client, SUPPLIER_EMAIL, "supplier")
    unknown = await _request_reset(client, "yok@ornek.com", "supplier")
    assert known.status_code == unknown.status_code == 200
    assert known.json() == unknown.json()
    assert "token" not in known.text
    logs = await _logs(session_maker, "password_reset")
    assert [entry.recipient_email for entry in logs] == [SUPPLIER_EMAIL]


async def test_platform_portal_is_not_accepted(client, seeded, session_maker):
    response = await _request_reset(client, PLATFORM_EMAIL, "platform")
    assert response.status_code == 422
    assert await _logs(session_maker, "password_reset") == []


async def test_account_of_other_portal_gets_no_mail(client, seeded, session_maker):
    # Yonetim hesabi tedarikci portalindan istenirse: genel yanit, e-posta yok.
    response = await _request_reset(client, ADMIN_EMAIL, "supplier")
    assert response.status_code == 200
    assert await _logs(session_maker, "password_reset") == []


async def test_token_works_once_and_revokes_sessions(client, seeded, session_maker):
    old_access = await login(client, "/auth/supplier-login", SUPPLIER_EMAIL)
    await _request_reset(client, SUPPLIER_EMAIL, "supplier")
    (entry,) = await _logs(session_maker, "password_reset")
    assert "/reset-password?portal=supplier&token=" in entry.body
    token = _token_from(entry.body)

    response = await client.post(
        "/auth/password-reset/confirm",
        json={"token": token, "new_password": NEW_PASSWORD, "portal": "supplier"},
    )
    assert response.status_code == 200, response.text

    # Ayni token ikinci kez kullanilamaz (parola hash'i degisti).
    again = await client.post(
        "/auth/password-reset/confirm",
        json={"token": token, "new_password": "BaskaParola-2026!", "portal": "supplier"},
    )
    assert again.status_code == 400
    assert again.json()["error"]["code"] == "INVALID_RESET_TOKEN"

    # Eski oturumlar dustu, eski parola gecmez, yeni parola gecer.
    async with session_maker() as db:
        open_sessions = (
            await db.execute(select(AuthSession).where(AuthSession.revoked_at.is_(None)))
        ).scalars().all()
        assert open_sessions == []
        audit = (
            await db.execute(select(AuditLog).where(AuditLog.action == "auth.password_reset"))
        ).scalars().all()
        assert len(audit) == 1
    old = await client.post(
        "/auth/supplier-login", json={"email": SUPPLIER_EMAIL, "password": DEMO_PASSWORD}
    )
    assert old.status_code == 401
    new = await client.post(
        "/auth/supplier-login", json={"email": SUPPLIER_EMAIL, "password": NEW_PASSWORD}
    )
    assert new.status_code == 200
    assert new.json()["data"]["must_change_password"] is False
    # Sifirlama token'i oturum token'i olarak da kullanilamaz.
    me = await client.get("/auth/me", headers=auth_headers(token))
    assert me.status_code == 401
    assert old_access  # eski access token kisa omurlu; refresh oturumu dusuruldu


async def test_admin_portal_reset(client, seeded, session_maker):
    await _request_reset(client, ADMIN_EMAIL, "admin")
    (entry,) = await _logs(session_maker, "password_reset")
    token = _token_from(entry.body)
    response = await client.post(
        "/auth/password-reset/confirm",
        json={"token": token, "new_password": NEW_PASSWORD, "portal": "admin"},
    )
    assert response.status_code == 200, response.text
    ok = await client.post(
        "/auth/login", json={"email": ADMIN_EMAIL, "password": NEW_PASSWORD}
    )
    assert ok.status_code == 200


async def test_wrong_portal_token_rejected(client, seeded, session_maker):
    await _request_reset(client, SUPPLIER_EMAIL, "supplier")
    (entry,) = await _logs(session_maker, "password_reset")
    token = _token_from(entry.body)
    response = await client.post(
        "/auth/password-reset/confirm",
        json={"token": token, "new_password": NEW_PASSWORD, "portal": "admin"},
    )
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "INVALID_RESET_TOKEN"


async def test_expired_and_tampered_tokens_rejected(client, seeded, session_maker):
    await _request_reset(client, SUPPLIER_EMAIL, "supplier")
    (entry,) = await _logs(session_maker, "password_reset")
    token = _token_from(entry.body)
    claims = svc.decode_reset_token(token, "supplier")

    async with session_maker() as db:
        from app.models import SupplierUser

        user = (
            await db.execute(select(SupplierUser).where(SupplierUser.email == SUPPLIER_EMAIL))
        ).scalar_one()
    expired = svc.create_reset_token(
        portal="supplier",
        user_id=user.id,
        tenant_id=claims["tid"],
        password_hash=user.password_hash,
        now=datetime.now(UTC) - timedelta(minutes=svc.TOKEN_TTL_MINUTES + 1),
    )
    head, payload, signature = token.split(".")
    tampered = f"{head}.{payload}.{signature[:-4]}AAAA"
    # Uygulama sirriyla (oturum anahtariyla) imzalanmis sahte token da gecmez.
    import jwt

    from app.core.config import get_settings

    forged = jwt.encode(
        {**claims, "sub": str(claims["sub"]), "tid": str(claims["tid"]),
         "exp": datetime.now(UTC) + timedelta(minutes=5)},
        get_settings().secret_key,
        algorithm="HS256",
    )
    for bad in (expired, tampered, forged, "x" * 40):
        response = await client.post(
            "/auth/password-reset/confirm",
            json={"token": bad, "new_password": NEW_PASSWORD, "portal": "supplier"},
        )
        assert response.status_code == 400, bad
        assert response.json()["error"]["code"] == "INVALID_RESET_TOKEN"


async def test_weak_password_rejected_and_token_still_usable(client, seeded, session_maker):
    await _request_reset(client, SUPPLIER_EMAIL, "supplier")
    (entry,) = await _logs(session_maker, "password_reset")
    token = _token_from(entry.body)
    weak = await client.post(
        "/auth/password-reset/confirm",
        json={"token": token, "new_password": "kisa", "portal": "supplier"},
    )
    assert weak.status_code == 422
    assert weak.json()["error"]["code"] == "WEAK_PASSWORD"
    good = await client.post(
        "/auth/password-reset/confirm",
        json={"token": token, "new_password": NEW_PASSWORD, "portal": "supplier"},
    )
    assert good.status_code == 200


async def test_username_reminder_only_to_known_company_address(
    client, seeded, session_maker
):
    unknown = await client.post(
        "/auth/username-reminder/request", json={"email": "yabanci@ornek.com"}
    )
    known = await client.post(
        "/auth/username-reminder/request", json={"email": SUPPLIER_CONTACT.upper()}
    )
    assert unknown.status_code == known.status_code == 200
    assert unknown.json() == known.json()

    logs = await _logs(session_maker, "username_reminder")
    assert len(logs) == 1
    assert logs[0].recipient_email.lower() == SUPPLIER_CONTACT
    assert SUPPLIER_EMAIL in logs[0].body
    # Baska firmalarin hesaplari sizmaz.
    assert "marmarasoguk" not in logs[0].body
    assert "token=" not in logs[0].body


async def test_username_reminder_via_additional_email(client, seeded, session_maker):
    async with session_maker() as db:
        supplier = seeded["suppliers"]["soguk"]
        from app.models import Supplier

        row = (
            await db.execute(select(Supplier).where(Supplier.id == supplier.id))
        ).scalar_one()
        row.additional_emails = ["lojistik@marmarasoguk.example.com"]
        await db.commit()

    await client.post(
        "/auth/username-reminder/request",
        json={"email": "lojistik@marmarasoguk.example.com"},
    )
    logs = await _logs(session_maker, "username_reminder")
    assert len(logs) == 1
    assert logs[0].recipient_email == "lojistik@marmarasoguk.example.com"
    assert "tedarikci@marmarasoguk.com" in logs[0].body
    assert SUPPLIER_EMAIL not in logs[0].body
