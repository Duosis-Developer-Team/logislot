"""E-posta -> tenant yonlendirme dizini.

Kullanici kayitlari tenant semalarina dagildiktan sonra "bu e-posta hangi
tenant'a ait" sorusu tek tablodan cevaplanamaz hale gelir. Bu dizin o
soruyu control-plane'de yanitlar ve ayni zamanda, once
`tenant_users.email UNIQUE` tarafindan saglanan GLOBAL e-posta
benzersizligini surdurur.

Tutarlilik: kullanici tenant semasinda, dizin kaydi control-plane'de yasar;
ikisi ayri transaction'dadir. Bu yuzden ONCE dizin kaydi alinir (claim),
kullanici yazimi basarisiz olursa kayit geri birakilir. Ters sirada calisan
bir tasarim, "kullanici var ama giris yapamiyor" gibi daha kotu bir hataya
yol acardi.
"""

import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from dataclasses import dataclass

import sqlalchemy as sa
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ApiError
from app.models import PrincipalDirectory

#: Dizine giren kimlik tipleri. Platform kullanicilari control-plane'de
#: yasadigi icin yonlendirmeye ihtiyac duymaz ve dizine GIRMEZ.
DIRECTORY_USER_TYPES = ("tenant", "supplier")


async def tenant_for_email(
    control_db: AsyncSession, user_type: str, email: str
) -> tuple[uuid.UUID, uuid.UUID] | None:
    """(tenant_id, principal_id) dondurur; kayit yoksa None."""
    row = (
        await control_db.execute(
            sa.select(PrincipalDirectory.tenant_id, PrincipalDirectory.principal_id).where(
                PrincipalDirectory.user_type == user_type,
                # TAM esleme: login sorgusu da (TenantUser.email == ...) tam
                # eslemedir. Burada kucuk/buyuk harf duyarsiz arama yapmak,
                # yalnizca harf durumuyla ayrisan iki hesabin YANLIS semaya
                # yonlendirilmesine yol acardi.
                PrincipalDirectory.email == email,
            )
        )
    ).first()
    return (row[0], row[1]) if row else None


async def release(control_db: AsyncSession, principal_id: uuid.UUID) -> None:
    await control_db.execute(
        sa.delete(PrincipalDirectory).where(PrincipalDirectory.principal_id == principal_id)
    )
    await control_db.commit()


@dataclass
class _Claim:
    principal_id: uuid.UUID
    confirmed: bool = False

    def confirm(self) -> None:
        self.confirmed = True


@asynccontextmanager
async def claim_email(
    control_db: AsyncSession,
    *,
    principal_id: uuid.UUID,
    user_type: str,
    email: str,
    tenant_id: uuid.UUID,
) -> AsyncIterator[_Claim]:
    """E-postayi dizinde rezerve eder; blok `confirm()` cagirmadan biterse geri alir.

    Kullanim:
        async with claim_email(control_db, ...) as claim:
            db.add(TenantUser(...)); await db.commit()
            claim.confirm()
    """
    if user_type not in DIRECTORY_USER_TYPES:
        raise ValueError(f"Dizine girmeyen kimlik tipi: {user_type}")

    control_db.add(
        PrincipalDirectory(
            principal_id=principal_id,
            user_type=user_type,
            email=email,
            tenant_id=tenant_id,
        )
    )
    try:
        await control_db.commit()
    except IntegrityError as exc:
        await control_db.rollback()
        raise ApiError(
            "DUPLICATE_EMAIL", "Bu e-posta zaten bir kullaniciya ait", 409
        ) from exc

    claim = _Claim(principal_id=principal_id)
    try:
        yield claim
    except BaseException:
        await release(control_db, principal_id)
        raise
    if not claim.confirmed:
        await release(control_db, principal_id)


async def claim_email_once(
    control_db: AsyncSession,
    *,
    principal_id: uuid.UUID,
    user_type: str,
    email: str,
    tenant_id: uuid.UUID,
) -> None:
    """Baglam yoneticisi olmadan dizin kaydi alir (cagiran daha sonra commit eder).

    Cagiranin transaction'i sonradan basarisiz olursa ARTIK bir yonlendirme
    satiri kalabilir. Zararsizdir (login tenant'a yonlenir, kullanici
    bulunamaz, genel 401 doner) ve `reconcile_directory` ile temizlenir.
    Tam telafi gereken yerlerde `claim_email` baglam yoneticisi kullanilir.
    """
    control_db.add(
        PrincipalDirectory(
            principal_id=principal_id,
            user_type=user_type,
            email=email,
            tenant_id=tenant_id,
        )
    )
    try:
        await control_db.commit()
    except IntegrityError as exc:
        await control_db.rollback()
        raise ApiError(
            "DUPLICATE_EMAIL", "Bu e-posta zaten bir kullaniciya ait", 409
        ) from exc


async def ensure_registered(
    control_db: AsyncSession,
    *,
    principal_id: uuid.UUID,
    user_type: str,
    email: str,
    tenant_id: uuid.UUID,
) -> None:
    """Idempotent kayit — backfill/seed icin (varsa gunceller, yoksa ekler)."""
    existing = (
        await control_db.execute(
            sa.select(PrincipalDirectory).where(
                PrincipalDirectory.principal_id == principal_id
            )
        )
    ).scalar_one_or_none()
    if existing is None:
        control_db.add(
            PrincipalDirectory(
                principal_id=principal_id,
                user_type=user_type,
                email=email,
                tenant_id=tenant_id,
            )
        )
    else:
        existing.email = email
        existing.tenant_id = tenant_id
        existing.user_type = user_type
