"""Urun/arac kategorisi endpointleri: liste + CRUD (Sprint 2).

Rampa/override/cakisma grubu endpointleri routers/docks.py icindedir.
DELETE fiziksel silme yapmaz: gecmis randevu referanslarini korumak icin
is_active=False (soft delete) uygulanir.
"""

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.enums import ActorType
from app.core.permissions import TenantPermission
from app.core.responses import ok
from app.models import ProductCategory, VehicleCategory
from app.schemas.catalog import ProductCategoryOut, VehicleCategoryOut
from app.schemas.config import (
    ProductCategoryCreate,
    ProductCategoryPatch,
    VehicleCategoryCreate,
    VehicleCategoryPatch,
)
from app.services.audit import record_audit
from app.services.config import (
    ensure_unique_name,
    get_scoped_or_404,
    load_scoped_refs,
    snapshot,
)
from app.tenancy.deps import FacilityContext, get_facility_context, require_facility_permissions

router = APIRouter(prefix="/facilities/{facility_id}", tags=["catalogs"])

PC_AUDIT_FIELDS = [
    "name",
    "display_name",
    "description",
    "min_block_minutes",
    "default_vehicle_category_id",
    "is_active",
]
VC_AUDIT_FIELDS = ["name", "display_name", "description", "physical_note", "is_active"]


def _pc_out(obj: ProductCategory) -> dict:
    return ProductCategoryOut.model_validate(obj).model_dump(mode="json")


def _vc_out(obj: VehicleCategory) -> dict:
    return VehicleCategoryOut.model_validate(obj).model_dump(mode="json")


def _audit_config(
    db: AsyncSession,
    ctx: FacilityContext,
    *,
    action: str,
    entity_type: str,
    entity_id: uuid.UUID,
    before: dict | None = None,
    after: dict | None = None,
) -> None:
    record_audit(
        db,
        actor_type=ActorType.tenant_user,
        actor_id=ctx.identity.id,
        action=action,
        tenant_id=ctx.tenant_id,
        facility_id=ctx.facility_id,
        entity_type=entity_type,
        entity_id=entity_id,
        before=before,
        after=after,
    )


async def _check_default_vehicle(
    db: AsyncSession, ctx: FacilityContext, vehicle_id: uuid.UUID | None
) -> None:
    if vehicle_id is not None:
        await load_scoped_refs(
            db, VehicleCategory, [vehicle_id], ctx.facility_id, "default_vehicle_category"
        )


# ---------- Product Categories ----------


@router.get("/categories")
async def list_categories(
    ctx: FacilityContext = Depends(get_facility_context),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ProductCategory)
        .where(ProductCategory.facility_id == ctx.facility_id)
        .order_by(ProductCategory.name)
    )
    categories = list(result.scalars())
    if ctx.supplier is not None:
        # Tedarikci yalnizca kendisine izinli AKTIF kategorileri gorur.
        allowed = {c.id for c in ctx.supplier.allowed_product_categories}
        categories = [c for c in categories if c.id in allowed and c.is_active]
    return ok([_pc_out(c) for c in categories])


@router.post("/categories")
async def create_category(
    body: ProductCategoryCreate,
    ctx: FacilityContext = Depends(
        require_facility_permissions(TenantPermission.CATEGORY_MANAGE)
    ),
    db: AsyncSession = Depends(get_db),
):
    await ensure_unique_name(db, ProductCategory, ctx.facility_id, body.name)
    await _check_default_vehicle(db, ctx, body.default_vehicle_category_id)
    obj = ProductCategory(
        tenant_id=ctx.tenant_id, facility_id=ctx.facility_id, **body.model_dump()
    )
    db.add(obj)
    await db.flush()
    _audit_config(
        db, ctx,
        action="product_category.create", entity_type="product_category",
        entity_id=obj.id, after=snapshot(obj, PC_AUDIT_FIELDS),
    )
    await db.commit()
    await db.refresh(obj)
    return ok(_pc_out(obj))


@router.get("/categories/{category_id}")
async def get_category(
    category_id: uuid.UUID,
    ctx: FacilityContext = Depends(
        require_facility_permissions(TenantPermission.CATEGORY_MANAGE)
    ),
    db: AsyncSession = Depends(get_db),
):
    obj = await get_scoped_or_404(db, ProductCategory, category_id, ctx.facility_id)
    return ok(_pc_out(obj))


@router.patch("/categories/{category_id}")
async def patch_category(
    category_id: uuid.UUID,
    body: ProductCategoryPatch,
    ctx: FacilityContext = Depends(
        require_facility_permissions(TenantPermission.CATEGORY_MANAGE)
    ),
    db: AsyncSession = Depends(get_db),
):
    obj = await get_scoped_or_404(db, ProductCategory, category_id, ctx.facility_id)
    changes = body.model_dump(exclude_unset=True)
    if "name" in changes and changes["name"] != obj.name:
        await ensure_unique_name(
            db, ProductCategory, ctx.facility_id, changes["name"], exclude_id=obj.id
        )
    if "default_vehicle_category_id" in changes:
        await _check_default_vehicle(db, ctx, changes["default_vehicle_category_id"])
    before = snapshot(obj, PC_AUDIT_FIELDS)
    for key, value in changes.items():
        setattr(obj, key, value)
    _audit_config(
        db, ctx,
        action="product_category.update", entity_type="product_category",
        entity_id=obj.id, before=before, after=snapshot(obj, PC_AUDIT_FIELDS),
    )
    await db.commit()
    await db.refresh(obj)
    return ok(_pc_out(obj))


@router.delete("/categories/{category_id}")
async def deactivate_category(
    category_id: uuid.UUID,
    ctx: FacilityContext = Depends(
        require_facility_permissions(TenantPermission.CATEGORY_MANAGE)
    ),
    db: AsyncSession = Depends(get_db),
):
    obj = await get_scoped_or_404(db, ProductCategory, category_id, ctx.facility_id)
    before = snapshot(obj, PC_AUDIT_FIELDS)
    obj.is_active = False
    _audit_config(
        db, ctx,
        action="product_category.deactivate", entity_type="product_category",
        entity_id=obj.id, before=before, after=snapshot(obj, PC_AUDIT_FIELDS),
    )
    await db.commit()
    await db.refresh(obj)
    return ok(_pc_out(obj))


# ---------- Vehicle Categories ----------


@router.get("/vehicle-categories")
async def list_vehicle_categories(
    ctx: FacilityContext = Depends(get_facility_context),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(VehicleCategory)
        .where(VehicleCategory.facility_id == ctx.facility_id)
        .order_by(VehicleCategory.name)
    )
    categories = list(result.scalars())
    if ctx.supplier is not None:
        categories = [c for c in categories if c.is_active]
    return ok([_vc_out(v) for v in categories])


@router.post("/vehicle-categories")
async def create_vehicle_category(
    body: VehicleCategoryCreate,
    ctx: FacilityContext = Depends(
        require_facility_permissions(TenantPermission.VEHICLE_CATEGORY_MANAGE)
    ),
    db: AsyncSession = Depends(get_db),
):
    await ensure_unique_name(db, VehicleCategory, ctx.facility_id, body.name)
    obj = VehicleCategory(
        tenant_id=ctx.tenant_id, facility_id=ctx.facility_id, **body.model_dump()
    )
    db.add(obj)
    await db.flush()
    _audit_config(
        db, ctx,
        action="vehicle_category.create", entity_type="vehicle_category",
        entity_id=obj.id, after=snapshot(obj, VC_AUDIT_FIELDS),
    )
    await db.commit()
    await db.refresh(obj)
    return ok(_vc_out(obj))


@router.get("/vehicle-categories/{vehicle_category_id}")
async def get_vehicle_category(
    vehicle_category_id: uuid.UUID,
    ctx: FacilityContext = Depends(
        require_facility_permissions(TenantPermission.VEHICLE_CATEGORY_MANAGE)
    ),
    db: AsyncSession = Depends(get_db),
):
    obj = await get_scoped_or_404(db, VehicleCategory, vehicle_category_id, ctx.facility_id)
    return ok(_vc_out(obj))


@router.patch("/vehicle-categories/{vehicle_category_id}")
async def patch_vehicle_category(
    vehicle_category_id: uuid.UUID,
    body: VehicleCategoryPatch,
    ctx: FacilityContext = Depends(
        require_facility_permissions(TenantPermission.VEHICLE_CATEGORY_MANAGE)
    ),
    db: AsyncSession = Depends(get_db),
):
    obj = await get_scoped_or_404(db, VehicleCategory, vehicle_category_id, ctx.facility_id)
    changes = body.model_dump(exclude_unset=True)
    if "name" in changes and changes["name"] != obj.name:
        await ensure_unique_name(
            db, VehicleCategory, ctx.facility_id, changes["name"], exclude_id=obj.id
        )
    before = snapshot(obj, VC_AUDIT_FIELDS)
    for key, value in changes.items():
        setattr(obj, key, value)
    _audit_config(
        db, ctx,
        action="vehicle_category.update", entity_type="vehicle_category",
        entity_id=obj.id, before=before, after=snapshot(obj, VC_AUDIT_FIELDS),
    )
    await db.commit()
    await db.refresh(obj)
    return ok(_vc_out(obj))


@router.delete("/vehicle-categories/{vehicle_category_id}")
async def deactivate_vehicle_category(
    vehicle_category_id: uuid.UUID,
    ctx: FacilityContext = Depends(
        require_facility_permissions(TenantPermission.VEHICLE_CATEGORY_MANAGE)
    ),
    db: AsyncSession = Depends(get_db),
):
    obj = await get_scoped_or_404(db, VehicleCategory, vehicle_category_id, ctx.facility_id)
    before = snapshot(obj, VC_AUDIT_FIELDS)
    obj.is_active = False
    _audit_config(
        db, ctx,
        action="vehicle_category.deactivate", entity_type="vehicle_category",
        entity_id=obj.id, before=before, after=snapshot(obj, VC_AUDIT_FIELDS),
    )
    await db.commit()
    await db.refresh(obj)
    return ok(_vc_out(obj))


# Supplier CRUD'u routers/suppliers.py icindedir.
