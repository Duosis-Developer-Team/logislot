import os

# Testler deterministik olsun: rate limiter varsayilan KAPALI
# (rate-limit testleri ayarlari gecici olarak acar). App import'undan ONCE.
os.environ.setdefault("LOGISLOT_RATE_LIMIT_ENABLED", "false")

import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.core.db import get_control_db, get_db
from app.core.tenancy_runtime import translate_map
from app.main import app
from app.models import Base
from app.seed import DEMO_PASSWORD, seed_data

#: SQLite'in Postgres anlaminda semasi yoktur; test paketi tek bir
#: veritabaninda calisir ve her iki duzlem de oraya cevrilir. GERCEK sema
#: izolasyonu Postgres'e ozgudur ve scripts/verify_tenant_isolation.py ile
#: ayrica dogrulanir.
SQLITE_TRANSLATE = translate_map(None, dialect_name="sqlite")


@pytest_asyncio.fixture
async def db_engine():
    engine = create_async_engine(
        "sqlite+aiosqlite://",
        poolclass=StaticPool,
        connect_args={"check_same_thread": False},
    ).execution_options(schema_translate_map=SQLITE_TRANSLATE)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    await engine.dispose()


@pytest_asyncio.fixture
async def session_maker(db_engine):
    maker = async_sessionmaker(db_engine, expire_on_commit=False)
    # Login/refresh gibi akislar oturumu DI'dan degil, adrese gore
    # `sessionmaker_for()` uzerinden acar. Testlerde her adres tek bir
    # SQLite motoruna baglanir; boylece o kod yollari da kapsanir.
    import app.core.db as core_db

    original = core_db.sessionmaker_for
    original_engine = core_db.engine
    core_db.sessionmaker_for = lambda location: maker
    # Provisioning DDL'i de test motoruna yonlensin (SQLite'ta sema
    # olusturma atlanir, create_all zaten checkfirst ile no-op olur).
    core_db.engine = db_engine
    try:
        yield maker
    finally:
        core_db.sessionmaker_for = original
        core_db.engine = original_engine


@pytest_asyncio.fixture
async def seeded(session_maker):
    async with session_maker() as db:
        refs = await seed_data(db)
        # Test sozlesmesi: mevcut testler tarihsel olarak "otomatik onayli
        # tedarikci = Anadolu Un" varsayimiyla yazildi. Urun demo seed'i ana
        # demo hesabini MANUEL onaya cevirdi (talepler yonetim onayina duser);
        # test niyetlerini degistirmemek icin bayraklar test ortaminda eski
        # sozlesmeye sabitlenir. (Auto ve manuel akislarin ikisi de boylece
        # kapsanmaya devam eder.)
        refs["suppliers"]["un"].auto_approval_enabled = True
        refs["suppliers"]["soguk"].auto_approval_enabled = False
        await db.commit()
    return refs


@pytest_asyncio.fixture
async def client(session_maker):
    async def override_get_db():
        async with session_maker() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_control_db] = override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()


async def login(client: AsyncClient, endpoint: str, email: str) -> str:
    response = await client.post(endpoint, json={"email": email, "password": DEMO_PASSWORD})
    assert response.status_code == 200, response.text
    return response.json()["data"]["access_token"]


def auth_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}
