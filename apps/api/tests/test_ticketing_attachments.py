"""Ek dosya akisi: allowlist, boyut, sahiplik ve guvenli indirme."""

import uuid

import pytest
import sqlalchemy as sa

from app.core.config import get_settings
from app.integrations.hermes_support_client import reset_client_factory
from app.models import (
    SupportTicketAttachmentProjection,
    SupportTicketProjection,
    TicketRoutingConfig,
)
from tests.conftest import auth_headers, login
from tests.hermes_stub import RecordingHermes, fixture, json_response

GROUP_ID = uuid.UUID("3f2b1c44-9d1e-4a58-9c77-2b7e5a0f1d33")


@pytest.fixture(autouse=True)
def _reset_hermes():
    yield
    reset_client_factory()


async def _route(session_maker, tenant_id):
    async with session_maker() as db:
        db.add(
            TicketRoutingConfig(
                tenant_id=tenant_id,
                application_code="logislot",
                hermes_group_id=GROUP_ID,
                hermes_group_name_snapshot="DevOps Team",
                route_version=3,
            )
        )
        await db.commit()


def _hermes() -> RecordingHermes:
    hermes = RecordingHermes()
    hermes.on(
        "/support/attachments/sessions",
        json_response(201, fixture("attachment_session_response")),
    )
    hermes.on("/complete", json_response(200, fixture("attachment_complete_response")))
    hermes.on(
        "/support/tickets", json_response(201, fixture("ticket_create_response"))
    )
    hermes.install()
    return hermes


SESSION_BODY = {
    "file_name": "screen.png",
    "size_bytes": 123456,
    "declared_mime_type": "image/png",
}


async def test_upload_session_returns_short_lived_url_not_service_token(
    client, seeded, session_maker
):
    _route_task = await _route(session_maker, seeded["tenant"].id)
    assert _route_task is None
    _hermes()
    token = await login(client, "/auth/login", "admin@cakesbakes.com")

    response = await client.post(
        "/tickets/attachments/sessions", json=SESSION_BODY, headers=auth_headers(token)
    )
    assert response.status_code == 200, response.text
    data = response.json()["data"]
    # Yukleme adresi LogiSlot'un KENDI proxy ucudur. Hermes'in verdigi adres
    # tarayicidan kullanilamaz: servis token'i ister ve CORS izni vermez.
    assert data["upload_url"] == f"/tickets/attachments/{data['upload_id']}/content"
    assert data["expires_at"]
    # Hermes servis kimligi tarayiciya ASLA gitmez.
    assert "test-service-token" not in response.text
    assert "hermes.test" not in response.text
    assert data["required_headers"] == {}


async def test_disallowed_mime_type_is_refused_before_hermes(client, seeded, session_maker):
    await _route(session_maker, seeded["tenant"].id)
    hermes = _hermes()
    token = await login(client, "/auth/login", "admin@cakesbakes.com")

    for mime in ("image/svg+xml", "text/html", "application/zip", "application/x-msdownload"):
        response = await client.post(
            "/tickets/attachments/sessions",
            json={**SESSION_BODY, "declared_mime_type": mime},
            headers=auth_headers(token),
        )
        assert response.status_code == 400, mime
        assert response.json()["error"]["code"] == "TICKET_ATTACHMENT_TYPE"
    assert hermes.requests == []


async def test_oversized_file_is_refused(client, seeded, session_maker):
    await _route(session_maker, seeded["tenant"].id)
    _hermes()
    token = await login(client, "/auth/login", "admin@cakesbakes.com")
    limit = get_settings().ticket_attachment_max_file_size_bytes

    response = await client.post(
        "/tickets/attachments/sessions",
        json={**SESSION_BODY, "size_bytes": limit + 1},
        headers=auth_headers(token),
    )
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "TICKET_ATTACHMENT_TOO_LARGE"


async def test_file_name_is_normalized_against_path_traversal(
    client, seeded, session_maker
):
    await _route(session_maker, seeded["tenant"].id)
    _hermes()
    token = await login(client, "/auth/login", "admin@cakesbakes.com")

    await client.post(
        "/tickets/attachments/sessions",
        json={**SESSION_BODY, "file_name": "../../etc/passwd.png"},
        headers=auth_headers(token),
    )
    async with session_maker() as db:
        row = (
            await db.execute(sa.select(SupportTicketAttachmentProjection))
        ).scalar_one()
    assert row.file_name == "passwd.png"


async def test_another_users_upload_cannot_be_attached(client, seeded, session_maker):
    """Baska kullanicinin upload oturumu iliskilendirilemez (yatay yetki)."""
    await _route(session_maker, seeded["tenant"].id)
    _hermes()
    admin = await login(client, "/auth/login", "admin@cakesbakes.com")
    session = await client.post(
        "/tickets/attachments/sessions", json=SESSION_BODY, headers=auth_headers(admin)
    )
    upload_id = session.json()["data"]["upload_id"]

    dock = await login(client, "/auth/login", "rampa@cakesbakes.com")
    response = await client.post(
        "/tickets",
        json={
            "title": "Ek dosya ile talep aciyorum",
            "description": "Ekran goruntusunu ekleyerek sorunu bildiriyorum lutfen bakin.",
            "category": "bug",
            "impact": "single_user",
            "attachment_upload_ids": [upload_id],
        },
        headers=auth_headers(dock),
    )
    assert response.status_code == 403


async def test_complete_records_scan_status(client, seeded, session_maker):
    await _route(session_maker, seeded["tenant"].id)
    _hermes()
    token = await login(client, "/auth/login", "admin@cakesbakes.com")
    session = await client.post(
        "/tickets/attachments/sessions", json=SESSION_BODY, headers=auth_headers(token)
    )
    upload_id = session.json()["data"]["upload_id"]

    response = await client.post(
        f"/tickets/attachments/{upload_id}/complete", headers=auth_headers(token)
    )
    assert response.json()["data"]["scan_status"] == "scanning"


async def test_download_refused_while_scanning(client, seeded, session_maker):
    """Taranmamis dosya indirilemez — fail-closed."""
    await _route(session_maker, seeded["tenant"].id)
    _hermes()
    token = await login(client, "/auth/login", "admin@cakesbakes.com")
    session = await client.post(
        "/tickets/attachments/sessions", json=SESSION_BODY, headers=auth_headers(token)
    )
    upload_id = session.json()["data"]["upload_id"]
    await client.post(
        f"/tickets/attachments/{upload_id}/complete", headers=auth_headers(token)
    )

    created = await client.post(
        "/tickets",
        json={
            "title": "Ek dosya ile talep aciyorum",
            "description": "Ekran goruntusunu ekleyerek sorunu bildiriyorum lutfen bakin.",
            "category": "bug",
            "impact": "single_user",
            "attachment_upload_ids": [upload_id],
        },
        headers=auth_headers(token),
    )
    ticket = created.json()["data"]
    attachment_id = ticket["attachments"][0]["id"]
    assert ticket["attachments"][0]["downloadable"] is False

    response = await client.get(
        f"/tickets/{ticket['id']}/attachments/{attachment_id}/download",
        headers=auth_headers(token),
    )
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "TICKET_ATTACHMENT_NOT_READY"


async def test_clean_attachment_redirects_without_storing_url(
    client, seeded, session_maker
):
    await _route(session_maker, seeded["tenant"].id)
    hermes = _hermes()
    token = await login(client, "/auth/login", "admin@cakesbakes.com")
    session = await client.post(
        "/tickets/attachments/sessions", json=SESSION_BODY, headers=auth_headers(token)
    )
    upload_id = session.json()["data"]["upload_id"]
    created = await client.post(
        "/tickets",
        json={
            "title": "Ek dosya ile talep aciyorum",
            "description": "Ekran goruntusunu ekleyerek sorunu bildiriyorum lutfen bakin.",
            "category": "bug",
            "impact": "single_user",
            "attachment_upload_ids": [upload_id],
        },
        headers=auth_headers(token),
    )
    ticket_id = created.json()["data"]["id"]

    signed = "https://storage.example.invalid/objects/abc?X-Amz-Signature=short-lived"
    async with session_maker() as db:
        row = (
            await db.execute(sa.select(SupportTicketAttachmentProjection))
        ).scalar_one()
        row.scan_status = "clean"
        row.remote_attachment_id = uuid.uuid4()
        ticket = (
            await db.execute(
                sa.select(SupportTicketProjection).where(
                    SupportTicketProjection.id == uuid.UUID(ticket_id)
                )
            )
        ).scalar_one()
        ticket.remote_ticket_id = uuid.uuid4()
        ticket.remote_ticket_number = "TKT-000123"
        await db.commit()
        attachment_id = row.id

    hermes.on("/download", json_response(200, {"download_url": signed}))
    response = await client.get(
        f"/tickets/{ticket_id}/attachments/{attachment_id}/download",
        headers=auth_headers(token),
        follow_redirects=False,
    )
    assert response.status_code == 307
    assert response.headers["location"] == signed
    assert response.headers["cache-control"] == "private, no-store"

    # Imzali adres veritabanina YAZILMAZ.
    async with session_maker() as db:
        stored = (
            await db.execute(sa.select(SupportTicketAttachmentProjection))
        ).scalar_one()
    assert signed not in str(stored.__dict__)


async def test_supplier_cannot_download_tenant_attachment(client, seeded, session_maker):
    await _route(session_maker, seeded["tenant"].id)
    hermes = _hermes()
    token = await login(client, "/auth/login", "admin@cakesbakes.com")
    session = await client.post(
        "/tickets/attachments/sessions", json=SESSION_BODY, headers=auth_headers(token)
    )
    upload_id = session.json()["data"]["upload_id"]
    created = await client.post(
        "/tickets",
        json={
            "title": "Ek dosya ile talep aciyorum",
            "description": "Ekran goruntusunu ekleyerek sorunu bildiriyorum lutfen bakin.",
            "category": "bug",
            "impact": "single_user",
            "attachment_upload_ids": [upload_id],
        },
        headers=auth_headers(token),
    )
    ticket_id = created.json()["data"]["id"]
    async with session_maker() as db:
        row = (
            await db.execute(sa.select(SupportTicketAttachmentProjection))
        ).scalar_one()
        row.scan_status = "clean"
        row.remote_attachment_id = uuid.uuid4()
        ticket = (
            await db.execute(
                sa.select(SupportTicketProjection).where(
                    SupportTicketProjection.id == uuid.UUID(ticket_id)
                )
            )
        ).scalar_one()
        ticket.remote_ticket_id = uuid.uuid4()
        ticket.remote_ticket_number = "TKT-000123"
        await db.commit()
        attachment_id = row.id

    hermes.on("/download", json_response(200, {"download_url": "https://x.invalid/f"}))
    supplier = await login(client, "/auth/supplier-login", "tedarikci@anadoluun.com")
    response = await client.get(
        f"/supplier/tickets/{ticket_id}/attachments/{attachment_id}/download",
        headers=auth_headers(supplier),
        follow_redirects=False,
    )
    assert response.status_code == 404


async def test_total_attachment_size_limit_is_enforced_server_side(
    client, seeded, session_maker
):
    """`/tickets/config` ile ilan edilen TOPLAM sinir sunucuda da zorlanir.

    Dosya basina sinir tek basina yeterli degildir: 4 x 15 MB = 60 MB, ilan
    edilen 50 MB'lik toplamin uzerindedir. Yalnizca istemcide zorlanan bir
    sinir sinir DEGILDIR.
    """
    await _route(session_maker, seeded["tenant"].id)
    _hermes()
    token = await login(client, "/auth/login", "admin@cakesbakes.com")
    me = await client.get("/auth/me", headers=auth_headers(token))
    requester_id = uuid.UUID(me.json()["data"]["id"])

    # Yukleme oturumlari dogrudan yazilir: sahte Hermes her cagride ayni
    # upload_id dondugu icin uc noktayi dort kez cagirmak gercekci degil.
    upload_ids = [uuid.uuid4() for _ in range(4)]
    async with session_maker() as db:
        for index, upload_id in enumerate(upload_ids):
            db.add(
                SupportTicketAttachmentProjection(
                    upload_id=upload_id,
                    file_name=f"buyuk-{index}.png",
                    mime_type="image/png",
                    size_bytes=15_000_000,
                    uploaded_by_id=requester_id,
                )
            )
        await db.commit()

    response = await client.post(
        "/tickets",
        json={
            "title": "Cok sayida buyuk ek iceren talep",
            "description": "Toplam boyut sinirinin sunucuda zorlandigini dogruluyoruz.",
            "category": "bug",
            "impact": "single_user",
            "attachment_upload_ids": [str(u) for u in upload_ids],
        },
        headers=auth_headers(token),
    )
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "TICKET_ATTACHMENT_TOTAL_LIMIT"


async def test_reply_cannot_steal_attachment_from_another_ticket(
    client, seeded, session_maker
):
    """Yanit yolu, baska bir talebe bagli eki KENDINE TASIYAMAZ."""
    await _route(session_maker, seeded["tenant"].id)
    _hermes()
    token = await login(client, "/auth/login", "admin@cakesbakes.com")

    session = await client.post(
        "/tickets/attachments/sessions", json=SESSION_BODY, headers=auth_headers(token)
    )
    upload_id = session.json()["data"]["upload_id"]

    first = await client.post(
        "/tickets",
        json={
            "title": "Ek dosyali ilk talep",
            "description": "Ek dosyanin sahibi bu taleptir ve baskasina gecmemelidir.",
            "category": "bug",
            "impact": "single_user",
            "attachment_upload_ids": [upload_id],
        },
        headers=auth_headers(token),
    )
    assert first.status_code == 200

    second = await client.post(
        "/tickets",
        json={
            "title": "Ikinci talep ek dosyasiz",
            "description": "Bu talep baska bir talebin ekini kendine baglamaya calisacak.",
            "category": "question",
            "impact": "single_user",
        },
        headers=auth_headers(token),
    )
    second_id = second.json()["data"]["id"]
    async with session_maker() as db:
        ticket = (
            await db.execute(
                sa.select(SupportTicketProjection).where(
                    SupportTicketProjection.id == uuid.UUID(second_id)
                )
            )
        ).scalar_one()
        ticket.remote_ticket_id = uuid.uuid4()
        ticket.remote_ticket_number = "TKT-000999"
        await db.commit()

    response = await client.post(
        f"/tickets/{second_id}/messages",
        json={
            "body": "Ek dosyayi buraya baglamaya calisiyorum",
            "attachment_upload_ids": [upload_id],
        },
        headers=auth_headers(token),
    )
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "TICKET_ATTACHMENT_IN_USE"


async def test_peer_with_attachments_off_gets_clear_message_and_hides_field(
    client, seeded, session_maker
):
    """Hermes ek yuklemeyi kapattiysa: anlasilir mesaj + formda alan gizlenir.

    Hermes `support_not_configured` (503) donuyor. Bu kod SOZLESMEDE YOK, bu
    yuzden eskiden isimsiz fallback'e dusuyor ve kullaniciya "Destek merkezi
    istegi tamamlayamadi." deniyordu — ne oldugunu, ne yapacagini anlatmayan
    bir metin. Ustelik form ek alanini gostermeye devam ediyordu.

    Yetenek Hermes'in KENDI cevabindan ogrenilir ve kisa sure hatirlanir; elle
    cevrilecek bir bayrak yok, karsi taraf acinca kendiliginden geri gelir.
    """
    from app.integrations.hermes_support_client import PEER_SUPPORT_NOT_CONFIGURED
    from app.services import ticket_service as svc
    from tests.hermes_stub import error_response

    await _route(session_maker, seeded["tenant"].id)
    hermes = RecordingHermes()
    hermes.on(
        "/support/attachments/sessions",
        error_response(503, PEER_SUPPORT_NOT_CONFIGURED, retryable=True),
    )
    hermes.install()
    token = await login(client, "/auth/login", "admin@cakesbakes.com")

    # Once: yetenek bilinmiyor, alan aciktir.
    config = await client.get("/tickets/config", headers=auth_headers(token))
    assert config.json()["data"]["attachments"]["enabled"] is True

    response = await client.post(
        "/tickets/attachments/sessions", json=SESSION_BODY, headers=auth_headers(token)
    )
    assert response.status_code == 503
    message = response.json()["error"]["message"]
    assert "dosya eki kabul etmiyor" in message
    assert "ek olmadan" in message.lower()

    # Sonra: ayni cevap bir daha alinmasin diye alan gizlenir.
    config = await client.get("/tickets/config", headers=auth_headers(token))
    assert config.json()["data"]["attachments"]["enabled"] is False

    # Kayit SURELIDIR: suresi dolunca yetenek yeniden denenir.
    svc._attachments_unavailable_until = 0.0
    config = await client.get("/tickets/config", headers=auth_headers(token))
    assert config.json()["data"]["attachments"]["enabled"] is True


# ------------------------------------------------------- yukleme proxy'si


def _hermes_with_content() -> RecordingHermes:
    hermes = RecordingHermes()
    hermes.on(
        "/support/attachments/sessions",
        json_response(201, fixture("attachment_session_response")),
    )
    hermes.on("/content", json_response(200, {"upload_id": "x", "status": "scanning"}))
    hermes.install()
    return hermes


async def _session(client, token):
    return (
        await client.post(
            "/tickets/attachments/sessions", json=SESSION_BODY, headers=auth_headers(token)
        )
    ).json()["data"]


async def test_upload_is_proxied_to_hermes_with_service_token(
    client, seeded, session_maker
):
    """Baytlar LogiSlot uzerinden gecer; token istege TARAYICIDA degil BURADA eklenir.

    Hermes'in yukleme ucu `Authorization: Bearer <servis token>` istiyor ve
    preflight'ta `Access-Control-Allow-Origin` dondurmuyor — ikisi de tarayici
    uploadini imkansiz kiliyor. Sozlesme (bolum 5) burada presigned bir URL
    tarif ediyor; Hermes onu vermiyor.
    """
    await _route(session_maker, seeded["tenant"].id)
    hermes = _hermes_with_content()
    token = await login(client, "/auth/login", "admin@cakesbakes.com")
    session = await _session(client, token)

    response = await client.put(
        session["upload_url"],
        content=b"sahte-png-baytlari",
        headers={**auth_headers(token), "Content-Type": "image/png"},
    )
    assert response.status_code == 200, response.text

    sent = [r for r in hermes.requests if str(r.url).endswith("/content")]
    assert len(sent) == 1
    assert sent[0].headers["authorization"] == "Bearer test-service-token"
    assert sent[0].content == b"sahte-png-baytlari"


async def test_upload_requires_own_session(client, seeded, session_maker):
    """Baskasinin yukleme oturumuna dosya YAZILAMAZ."""
    await _route(session_maker, seeded["tenant"].id)
    _hermes_with_content()
    owner = await login(client, "/auth/login", "admin@cakesbakes.com")
    session = await _session(client, owner)

    other = await login(client, "/auth/supplier-login", "tedarikci@anadoluun.com")
    response = await client.put(
        session["upload_url"],
        content=b"x",
        headers={**auth_headers(other), "Content-Type": "image/png"},
    )
    assert response.status_code in (403, 404)


async def test_upload_without_session_is_refused(client, seeded, session_maker):
    await _route(session_maker, seeded["tenant"].id)
    _hermes_with_content()
    token = await login(client, "/auth/login", "admin@cakesbakes.com")
    response = await client.put(
        f"/tickets/attachments/{uuid.uuid4()}/content",
        content=b"x",
        headers={**auth_headers(token), "Content-Type": "image/png"},
    )
    assert response.status_code == 404


async def test_oversized_body_is_cut_off_even_if_declared_small(
    client, seeded, session_maker
):
    """`size_bytes` ISTEMCI BEYANIDIR; gercek govde sinira gore kesilir.

    Beyana guvenilseydi 1 KB bildirip 1 GB gonderilebilir, bellek tuketimi
    istemcinin eline gecerdi.
    """
    await _route(session_maker, seeded["tenant"].id)
    hermes = _hermes_with_content()
    token = await login(client, "/auth/login", "admin@cakesbakes.com")
    session = await _session(client, token)

    limit = get_settings().ticket_attachment_max_file_size_bytes
    response = await client.put(
        session["upload_url"],
        content=b"a" * (limit + 1),
        headers={**auth_headers(token), "Content-Type": "image/png"},
    )
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "TICKET_ATTACHMENT_TOO_LARGE"
    # Sinir asildiginda Hermes'e HIC gidilmez.
    assert not [r for r in hermes.requests if str(r.url).endswith("/content")]


async def test_anonymous_upload_is_refused(client, seeded, session_maker):
    await _route(session_maker, seeded["tenant"].id)
    _hermes_with_content()
    token = await login(client, "/auth/login", "admin@cakesbakes.com")
    session = await _session(client, token)

    response = await client.put(
        session["upload_url"], content=b"x", headers={"Content-Type": "image/png"}
    )
    assert response.status_code == 401
