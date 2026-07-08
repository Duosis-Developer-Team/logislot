"""Facility konfigurasyon CRUD ortak yardimcilari.

Kritik ilke: cross-facility ID asla kabul edilmez — referans dogrulamasi
her zaman aktif facility scope'unda yapilir.
"""

import uuid
from typing import Any

from fastapi import status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ApiError, NotFoundError


class DuplicateNameError(ApiError):
    def __init__(
        self,
        message: str = "Bu ad ayni tesiste zaten kullaniliyor",
        code: str = "DUPLICATE_NAME",
    ) -> None:
        super().__init__(code, message, status.HTTP_409_CONFLICT)


class InvalidReferenceError(ApiError):
    """Baska tesise ait ya da pasif bir kayda referans verildi."""

    def __init__(self, message: str) -> None:
        super().__init__(
            "INVALID_REFERENCE", message, 422
        )


async def ensure_unique_name(
    db: AsyncSession,
    model: type,
    facility_id: uuid.UUID,
    name: str,
    exclude_id: uuid.UUID | None = None,
) -> None:
    await ensure_unique_value(
        db, model, "name", name, facility_id=facility_id, exclude_id=exclude_id
    )


async def ensure_unique_value(
    db: AsyncSession,
    model: type,
    field: str,
    value: str,
    *,
    facility_id: uuid.UUID | None = None,
    exclude_id: uuid.UUID | None = None,
    code: str = "DUPLICATE_NAME",
    message: str | None = None,
) -> None:
    """Alan benzersizligini dogrular; facility_id verilirse o scope'ta bakar."""
    query = select(model.id).where(getattr(model, field) == value)
    if facility_id is not None:
        query = query.where(model.facility_id == facility_id)
    if exclude_id is not None:
        query = query.where(model.id != exclude_id)
    if (await db.execute(query)).first() is not None:
        raise DuplicateNameError(
            message or "Bu deger zaten kullaniliyor", code=code
        )


async def get_scoped_or_404(
    db: AsyncSession, model: type, obj_id: uuid.UUID, facility_id: uuid.UUID, *, options=()
):
    query = select(model).where(model.id == obj_id, model.facility_id == facility_id)
    for opt in options:
        query = query.options(opt)
    obj = (await db.execute(query)).scalar_one_or_none()
    if obj is None:
        raise NotFoundError()
    return obj


async def load_scoped_refs(
    db: AsyncSession,
    model: type,
    ids: list[uuid.UUID],
    facility_id: uuid.UUID,
    label: str,
    *,
    active_only: bool = True,
) -> list:
    """ID listesini ayni facility icinde dogrular; eksik varsa INVALID_REFERENCE."""
    unique_ids = list(dict.fromkeys(ids))
    if not unique_ids:
        return []
    query = select(model).where(model.id.in_(unique_ids), model.facility_id == facility_id)
    if active_only and hasattr(model, "is_active"):
        query = query.where(model.is_active.is_(True))
    found = list((await db.execute(query)).scalars())
    if len(found) != len(unique_ids):
        raise InvalidReferenceError(
            f"{label}: bir veya daha fazla kayit bu tesiste bulunamadi ya da pasif"
        )
    return found


def snapshot(obj: Any, fields: list[str]) -> dict[str, Any]:
    """Audit before/after icin duz JSON snapshot."""
    result: dict[str, Any] = {}
    for field in fields:
        value = getattr(obj, field, None)
        if isinstance(value, uuid.UUID):
            value = str(value)
        elif hasattr(value, "value"):  # Enum
            value = value.value
        elif hasattr(value, "isoformat"):
            value = value.isoformat()
        result[field] = value
    return result
