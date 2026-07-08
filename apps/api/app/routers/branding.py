"""White-label branding endpointleri (Sprint 7 MVP).

Karar: branding FACILITY seviyesinde tutulur (facility.branding_json);
cozunurluk sirasi facility -> LogiSlot varsayilani. (Tenant-level fallback
mimarisi haziradir: cozumleme tek fonksiyondadir; tenant alani eklendiginde
araya girer.) Bozuk/eksik branding sistemi bozmaz — her zaman default'a duser.
Statu ve kargo anlam renkleri branding kapsami DISINDADIR.
"""

import re

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.enums import ActorType
from app.core.permissions import TenantPermission
from app.core.responses import ok
from app.models import Facility
from app.services.audit import record_audit
from app.tenancy.deps import FacilityContext, get_facility_context, require_facility_permissions

router = APIRouter(prefix="/facilities/{facility_id}", tags=["branding"])

_HEX = re.compile(r"^#[0-9a-fA-F]{6}$")

#: LogiSlot varsayilan markasi — fallback her zaman budur.
DEFAULT_BRANDING: dict = {
    "brand_name": "LogiSlot",
    "logo_url": None,
    "primary_color": "#4F46E5",
    "accent_color": "#F97316",
    "sidebar_color": None,  # None = tema varsayilani (card rengi)
    "portal_header_style": "light",
    "custom_footer_text": None,
}


class BrandingPatch(BaseModel):
    brand_name: str | None = Field(default=None, max_length=100)
    logo_url: str | None = Field(default=None, max_length=500)
    primary_color: str | None = None
    accent_color: str | None = None
    sidebar_color: str | None = None
    portal_header_style: str | None = None
    custom_footer_text: str | None = Field(default=None, max_length=200)

    @field_validator("primary_color", "accent_color", "sidebar_color")
    @classmethod
    def check_hex(cls, value: str | None) -> str | None:
        if value is not None and not _HEX.match(value):
            raise ValueError("Renk #RRGGBB hex formatinda olmali (orn. #2563EB)")
        return value

    @field_validator("portal_header_style")
    @classmethod
    def check_header_style(cls, value: str | None) -> str | None:
        if value is not None and value not in ("light", "dark"):
            raise ValueError("portal_header_style 'light' veya 'dark' olmali")
        return value

    @field_validator("logo_url")
    @classmethod
    def check_logo_url(cls, value: str | None) -> str | None:
        if value and not value.startswith(("http://", "https://", "data:image/")):
            raise ValueError("logo_url http(s) URL veya data URI olmali")
        return value


def effective_branding(facility: Facility) -> dict:
    """Facility branding + LogiSlot varsayilani birlesimi (bozuk veri guvenli)."""
    stored = facility.branding_json if isinstance(facility.branding_json, dict) else {}
    merged = {**DEFAULT_BRANDING}
    for key in DEFAULT_BRANDING:
        value = stored.get(key)
        if value is not None:
            merged[key] = value
    merged["is_customized"] = bool(stored)
    return merged


@router.get("/branding")
async def get_branding(
    # Okuma: tenant uyesi VEYA bu tesisin tedarikcisi (portal temasi icin)
    ctx: FacilityContext = Depends(get_facility_context),
):
    return ok(effective_branding(ctx.facility))


@router.patch("/branding")
async def update_branding(
    body: BrandingPatch,
    ctx: FacilityContext = Depends(require_facility_permissions(TenantPermission.USER_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    facility = await db.get(Facility, ctx.facility_id)
    assert facility is not None
    before = effective_branding(facility)
    stored = dict(facility.branding_json or {})
    stored.update(body.model_dump(exclude_unset=True))
    facility.branding_json = stored
    record_audit(
        db,
        actor_type=ActorType.tenant_user,
        actor_id=ctx.identity.id,
        action="branding.update",
        tenant_id=ctx.tenant_id,
        facility_id=ctx.facility_id,
        entity_type="facility",
        entity_id=ctx.facility_id,
        before=before,
        after=effective_branding(facility),
    )
    await db.commit()
    await db.refresh(facility)
    return ok(effective_branding(facility))


@router.delete("/branding")
async def reset_branding(
    ctx: FacilityContext = Depends(require_facility_permissions(TenantPermission.USER_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    """Markayi LogiSlot varsayilanina sifirlar."""
    facility = await db.get(Facility, ctx.facility_id)
    assert facility is not None
    before = effective_branding(facility)
    facility.branding_json = None
    record_audit(
        db,
        actor_type=ActorType.tenant_user,
        actor_id=ctx.identity.id,
        action="branding.reset",
        tenant_id=ctx.tenant_id,
        facility_id=ctx.facility_id,
        entity_type="facility",
        entity_id=ctx.facility_id,
        before=before,
        after=DEFAULT_BRANDING,
    )
    await db.commit()
    return ok({**DEFAULT_BRANDING, "is_customized": False})
