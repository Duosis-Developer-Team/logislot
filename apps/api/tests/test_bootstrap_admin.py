"""Ilk platform yoneticisi bootstrap'i (uretim kurulumu).

Kritik davranislar: demo verisi URETMEZ, zayif/demo parolayi reddeder ve
sistemde zaten platform kullanicisi varsa HICBIR SEY yapmaz (yoneticiyi ele
gecirme vektorune donusmemeli).
"""

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.bootstrap_admin import BootstrapError, bootstrap_platform_admin
from app.core.permissions import PlatformPermission
from app.core.security import verify_password
from app.models import PlatformUser, Tenant

STRONG_PASSWORD = "Uz4nB1r-Parola!2026"


def _env(monkeypatch, email="ops@logislot.com", password=STRONG_PASSWORD, name=None):
    monkeypatch.setenv("LOGISLOT_BOOTSTRAP_ADMIN_EMAIL", email)
    monkeypatch.setenv("LOGISLOT_BOOTSTRAP_ADMIN_PASSWORD", password)
    if name is None:
        monkeypatch.delenv("LOGISLOT_BOOTSTRAP_ADMIN_NAME", raising=False)
    else:
        monkeypatch.setenv("LOGISLOT_BOOTSTRAP_ADMIN_NAME", name)


async def test_creates_single_admin_and_no_demo_data(session_maker, monkeypatch):
    _env(monkeypatch, name="Operasyon")
    async with session_maker() as db:
        result = await bootstrap_platform_admin(db)
        assert "olusturuldu" in result

        user = (
            await db.execute(
                select(PlatformUser)
                .options(selectinload(PlatformUser.roles))
                .where(PlatformUser.email == "ops@logislot.com")
            )
        ).scalar_one()
        assert user.name == "Operasyon"
        assert user.must_change_password is True  # gecici parola akisi
        assert verify_password(STRONG_PASSWORD, user.password_hash)
        assert set(user.permissions) == set(PlatformPermission.ALL)

        # Demo seed'in aksine hicbir tenant/tesis verisi uretilmemeli
        assert (await db.execute(select(func.count()).select_from(Tenant))).scalar_one() == 0


async def test_is_idempotent_and_never_resets_existing_admin(session_maker, monkeypatch):
    _env(monkeypatch)
    async with session_maker() as db:
        await bootstrap_platform_admin(db)
        before = (
            await db.execute(select(PlatformUser).where(PlatformUser.email == "ops@logislot.com"))
        ).scalar_one()
        original_hash = before.password_hash

    # Ikinci kez, BASKA bir e-posta/parola ile: yeni kullanici acilmamali ve
    # mevcut yoneticinin parolasi degismemeli.
    _env(monkeypatch, email="saldirgan@example.com", password="BaskaUzunParola!9")
    async with session_maker() as db:
        result = await bootstrap_platform_admin(db)
        assert "Atlandi" in result
        assert (
            await db.execute(select(func.count()).select_from(PlatformUser))
        ).scalar_one() == 1
        still = (
            await db.execute(select(PlatformUser).where(PlatformUser.email == "ops@logislot.com"))
        ).scalar_one()
        assert still.password_hash == original_hash


@pytest.mark.parametrize(
    "password",
    ["Demo123!", "kisa", "", "changeme", "password"],
)
async def test_rejects_weak_or_demo_passwords(session_maker, monkeypatch, password):
    _env(monkeypatch, password=password)
    async with session_maker() as db:
        with pytest.raises(BootstrapError):
            await bootstrap_platform_admin(db)
        assert (
            await db.execute(select(func.count()).select_from(PlatformUser))
        ).scalar_one() == 0


@pytest.mark.parametrize("email", ["", "duz-metin", "   "])
async def test_rejects_invalid_email(session_maker, monkeypatch, email):
    _env(monkeypatch, email=email)
    async with session_maker() as db:
        with pytest.raises(BootstrapError):
            await bootstrap_platform_admin(db)
