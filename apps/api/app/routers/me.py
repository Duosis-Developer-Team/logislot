"""Tenant/facility context yardimci endpointleri."""

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import Identity, require_tenant_identity
from app.core.db import get_db
from app.core.errors import ForbiddenError
from app.core.responses import ok
from app.models import Facility, FacilityMembership
from app.schemas.auth import ActiveFacilityRequest, FacilitySummary

router = APIRouter(prefix="/me", tags=["me"])


@router.get("/facilities")
async def my_facilities(
    identity: Identity = Depends(require_tenant_identity),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(FacilityMembership.facility_id).where(
            FacilityMembership.tenant_user_id == identity.id
        )
    )
    facility_ids = [row[0] for row in result.all()]
    facilities = []
    if facility_ids:
        result = await db.execute(select(Facility).where(Facility.id.in_(facility_ids)))
        facilities = [
            FacilitySummary(
                id=f.id,
                tenant_id=f.tenant_id,
                name=f.name,
                timezone=f.timezone,
                status=f.status.value,
            ).model_dump(mode="json")
            for f in result.scalars()
        ]
    return ok(facilities)


@router.post("/active-facility")
async def set_active_facility(
    body: ActiveFacilityRequest,
    identity: Identity = Depends(require_tenant_identity),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(FacilityMembership).where(
            FacilityMembership.tenant_user_id == identity.id,
            FacilityMembership.facility_id == body.facility_id,
        )
    )
    if result.scalar_one_or_none() is None:
        raise ForbiddenError("Bu tesise uyeliginiz yok")
    identity.user.default_facility_id = body.facility_id  # type: ignore[union-attr]
    await db.commit()
    return ok({"active_facility_id": str(body.facility_id)})
