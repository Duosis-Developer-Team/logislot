"""Uretim icin GUVENLI ilk platform yoneticisi olusturucu.

`app.seed` DEMO verisidir: sabit `Demo123!` parolasi, sahte tenant, sahte
tedarikciler. Prod'da ASLA calistirilmamalidir. Bos bir prod veritabaninda ise
hicbir giris hesabi bulunmaz — bu modul o boslugu kapatir ve YALNIZCA tek bir
platform yoneticisi olusturur; baska hicbir veri yazmaz.

Calistirma: `python -m app.bootstrap_admin`
Girdi (ortam degiskeni; parola ASLA loglanmaz):
  LOGISLOT_BOOTSTRAP_ADMIN_EMAIL     (zorunlu)
  LOGISLOT_BOOTSTRAP_ADMIN_PASSWORD  (zorunlu, >= 12 karakter)
  LOGISLOT_BOOTSTRAP_ADMIN_NAME      (istege bagli)

Idempotent ve yetki yukseltmeye kapali: veritabaninda HERHANGI bir platform
kullanicisi varsa hicbir sey yapilmaz — parola sifirlanmaz, rol degistirilmez.
Bu sayede her deploy'da guvenle calistirilabilir ve calisan bir sistemde
yonetici ele gecirmek icin kullanilamaz.
"""

import asyncio
import os
import sys

from sqlalchemy import func, select

from app.core.db import SessionLocal
from app.core.permissions import PlatformPermission
from app.core.security import hash_password
from app.models import PlatformRole, PlatformUser

#: Demo parolasi prod'a sizmasin diye acikca reddedilir.
_REJECTED_PASSWORDS = {"demo123!", "changeme", "password", "admin", "logislot"}

_MIN_PASSWORD_LENGTH = 12

BOOTSTRAP_ROLE_NAME = "Platform Yoneticisi"


class BootstrapError(RuntimeError):
    pass


def _read_inputs() -> tuple[str, str, str]:
    email = (os.getenv("LOGISLOT_BOOTSTRAP_ADMIN_EMAIL") or "").strip()
    password = os.getenv("LOGISLOT_BOOTSTRAP_ADMIN_PASSWORD") or ""
    name = (os.getenv("LOGISLOT_BOOTSTRAP_ADMIN_NAME") or "").strip() or "Platform Yoneticisi"

    if not email or "@" not in email:
        raise BootstrapError(
            "LOGISLOT_BOOTSTRAP_ADMIN_EMAIL gecerli bir e-posta olmali"
        )
    if len(password) < _MIN_PASSWORD_LENGTH:
        raise BootstrapError(
            f"LOGISLOT_BOOTSTRAP_ADMIN_PASSWORD en az {_MIN_PASSWORD_LENGTH} karakter olmali"
        )
    if password.strip().lower() in _REJECTED_PASSWORDS:
        raise BootstrapError("Bilinen demo/zayif parola kabul edilmez")
    return email, password, name


async def bootstrap_platform_admin(db) -> str:
    """Platform yoneticisi yoksa olusturur. Donen deger: insan okunur sonuc."""
    existing = (
        await db.execute(select(func.count()).select_from(PlatformUser))
    ).scalar_one()
    if existing:
        # Sistem zaten kurulmus: dokunma. (Parola sifirlama YOK — bu akis bir
        # ele gecirme vektorune donusmemeli.)
        return f"Atlandi: {existing} platform kullanicisi zaten var."

    email, password, name = _read_inputs()

    role = (
        await db.execute(
            select(PlatformRole).where(PlatformRole.name == BOOTSTRAP_ROLE_NAME)
        )
    ).scalar_one_or_none()
    if role is None:
        role = PlatformRole(
            name=BOOTSTRAP_ROLE_NAME, permissions_json=PlatformPermission.ALL
        )
        db.add(role)
        await db.flush()

    db.add(
        PlatformUser(
            name=name,
            email=email,
            password_hash=hash_password(password),
            # Gecici parola akisi: ilk giriste degistirmek ZORUNLU.
            must_change_password=True,
            roles=[role],
        )
    )
    await db.commit()
    return f"Platform yoneticisi olusturuldu: {email} (ilk giriste parola degisimi zorunlu)"


async def main() -> None:
    try:
        async with SessionLocal() as db:
            print(await bootstrap_platform_admin(db))
    except BootstrapError as err:
        # Parola iceriği ASLA basilmaz; yalnizca kural ihlali bildirilir.
        print(f"Bootstrap yapilamadi: {err}", file=sys.stderr)
        raise SystemExit(1) from None


if __name__ == "__main__":
    asyncio.run(main())
