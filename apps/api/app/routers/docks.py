"""Rampa, cakisma grubu ve takvim istisnasi (override) endpointleri.

Bu konfigurasyonlar Availability/Rule Engine'i dogrudan besler.
DELETE = soft delete (is_active=False); gecmis randevu referanslari bozulmaz.
"""

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.db import get_db
from app.core.enums import ActorType, DockOverrideType
from app.core.errors import ApiError
from app.core.permissions import TenantPermission
from app.core.responses import ok
from app.models import (
    Dock,
    DockConflictGroup,
    DockConflictGroupMember,
    DockOverride,
    ProductCategory,
    VehicleCategory,
)
from app.schemas.catalog import ConflictGroupOut, DockOut, DockOverrideOut
from app.schemas.config import (
    ConflictGroupCreate,
    ConflictGroupPatch,
    DockCreate,
    DockPatch,
    OverrideCreate,
    OverridePatch,
    _validate_trigger,
)
from app.services.audit import record_audit
from app.services.config import (
    ensure_unique_name,
    get_scoped_or_404,
    load_scoped_refs,
    snapshot,
)
from app.tenancy.deps import FacilityContext, require_facility_permissions

router = APIRouter(prefix="/facilities/{facility_id}", tags=["docks"])

DOCK_AUDIT_FIELDS = ["name", "note", "is_active", "working_hours_json"]
GROUP_AUDIT_FIELDS = ["name", "relation_type", "trigger_condition_json", "is_active"]
OVERRIDE_AUDIT_FIELDS = ["dock_id", "date", "type", "start_time", "end_time", "reason", "is_active"]

_DOCK_RELATIONS = (
    selectinload(Dock.accepted_product_categories),
    selectinload(Dock.accepted_vehicle_categories),
)


def _audit(
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


# ---------- Docks ----------


def _dock_out(dock: Dock) -> dict:
    data = DockOut.model_validate(dock)
    data.accepted_product_category_ids = [c.id for c in dock.accepted_product_categories]
    data.accepted_vehicle_category_ids = [v.id for v in dock.accepted_vehicle_categories]
    return data.model_dump(mode="json")


def _dock_snapshot(dock: Dock) -> dict:
    data = snapshot(dock, DOCK_AUDIT_FIELDS)
    data["accepted_product_category_ids"] = [
        str(c.id) for c in dock.accepted_product_categories
    ]
    data["accepted_vehicle_category_ids"] = [
        str(v.id) for v in dock.accepted_vehicle_categories
    ]
    return data


@router.get("/docks")
async def list_docks(
    ctx: FacilityContext = Depends(require_facility_permissions(TenantPermission.APPT_VIEW)),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Dock)
        .options(*_DOCK_RELATIONS)
        .where(Dock.facility_id == ctx.facility_id)
        .order_by(Dock.name)
    )
    return ok([_dock_out(d) for d in result.scalars()])


@router.post("/docks")
async def create_dock(
    body: DockCreate,
    ctx: FacilityContext = Depends(require_facility_permissions(TenantPermission.DOCK_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    await ensure_unique_name(db, Dock, ctx.facility_id, body.name)
    products = await load_scoped_refs(
        db, ProductCategory, body.accepted_product_category_ids, ctx.facility_id,
        "accepted_product_categories",
    )
    vehicles = await load_scoped_refs(
        db, VehicleCategory, body.accepted_vehicle_category_ids, ctx.facility_id,
        "accepted_vehicle_categories",
    )
    dock = Dock(
        tenant_id=ctx.tenant_id,
        facility_id=ctx.facility_id,
        name=body.name,
        note=body.note,
        is_active=body.is_active,
        working_hours_json=body.working_hours_json,
        accepted_product_categories=products,
        accepted_vehicle_categories=vehicles,
    )
    db.add(dock)
    await db.flush()
    _audit(
        db, ctx,
        action="dock.create", entity_type="dock", entity_id=dock.id,
        after=_dock_snapshot(dock),
    )
    await db.commit()
    dock = await get_scoped_or_404(db, Dock, dock.id, ctx.facility_id, options=_DOCK_RELATIONS)
    return ok(_dock_out(dock))


@router.get("/docks/{dock_id}")
async def get_dock(
    dock_id: uuid.UUID,
    ctx: FacilityContext = Depends(require_facility_permissions(TenantPermission.APPT_VIEW)),
    db: AsyncSession = Depends(get_db),
):
    dock = await get_scoped_or_404(db, Dock, dock_id, ctx.facility_id, options=_DOCK_RELATIONS)
    return ok(_dock_out(dock))


@router.patch("/docks/{dock_id}")
async def patch_dock(
    dock_id: uuid.UUID,
    body: DockPatch,
    ctx: FacilityContext = Depends(require_facility_permissions(TenantPermission.DOCK_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    dock = await get_scoped_or_404(db, Dock, dock_id, ctx.facility_id, options=_DOCK_RELATIONS)
    changes = body.model_dump(exclude_unset=True)
    if "name" in changes and changes["name"] != dock.name:
        await ensure_unique_name(db, Dock, ctx.facility_id, changes["name"], exclude_id=dock.id)

    before = _dock_snapshot(dock)
    if "accepted_product_category_ids" in changes:
        dock.accepted_product_categories = await load_scoped_refs(
            db, ProductCategory, changes.pop("accepted_product_category_ids"),
            ctx.facility_id, "accepted_product_categories",
        )
    if "accepted_vehicle_category_ids" in changes:
        dock.accepted_vehicle_categories = await load_scoped_refs(
            db, VehicleCategory, changes.pop("accepted_vehicle_category_ids"),
            ctx.facility_id, "accepted_vehicle_categories",
        )
    for key, value in changes.items():
        setattr(dock, key, value)
    _audit(
        db, ctx,
        action="dock.update", entity_type="dock", entity_id=dock.id,
        before=before, after=_dock_snapshot(dock),
    )
    await db.commit()
    dock = await get_scoped_or_404(db, Dock, dock_id, ctx.facility_id, options=_DOCK_RELATIONS)
    return ok(_dock_out(dock))


@router.delete("/docks/{dock_id}")
async def deactivate_dock(
    dock_id: uuid.UUID,
    ctx: FacilityContext = Depends(require_facility_permissions(TenantPermission.DOCK_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    dock = await get_scoped_or_404(db, Dock, dock_id, ctx.facility_id, options=_DOCK_RELATIONS)
    before = _dock_snapshot(dock)
    dock.is_active = False
    _audit(
        db, ctx,
        action="dock.deactivate", entity_type="dock", entity_id=dock.id,
        before=before, after=_dock_snapshot(dock),
    )
    await db.commit()
    dock = await get_scoped_or_404(db, Dock, dock_id, ctx.facility_id, options=_DOCK_RELATIONS)
    return ok(_dock_out(dock))


# ---------- Dock Conflict Groups ----------


def _group_out(group: DockConflictGroup) -> dict:
    data = ConflictGroupOut.model_validate(group)
    data.member_dock_ids = [m.dock_id for m in group.members]
    return data.model_dump(mode="json")


def _group_snapshot(group: DockConflictGroup) -> dict:
    data = snapshot(group, GROUP_AUDIT_FIELDS)
    data["member_dock_ids"] = [str(m.dock_id) for m in group.members]
    return data


async def _validate_trigger_vehicles(
    db: AsyncSession, ctx: FacilityContext, trigger: dict | None
) -> None:
    vehicle_ids = (trigger or {}).get("vehicle_category_ids") or []
    if vehicle_ids:
        await load_scoped_refs(
            db,
            VehicleCategory,
            [uuid.UUID(str(v)) for v in vehicle_ids],
            ctx.facility_id,
            "trigger_condition.vehicle_category_ids",
        )


_GROUP_MEMBERS = (selectinload(DockConflictGroup.members),)


@router.get("/dock-conflict-groups")
async def list_conflict_groups(
    ctx: FacilityContext = Depends(require_facility_permissions(TenantPermission.APPT_VIEW)),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(DockConflictGroup)
        .options(*_GROUP_MEMBERS)
        .where(DockConflictGroup.facility_id == ctx.facility_id)
        .order_by(DockConflictGroup.name)
    )
    return ok([_group_out(g) for g in result.scalars()])


@router.post("/dock-conflict-groups")
async def create_conflict_group(
    body: ConflictGroupCreate,
    ctx: FacilityContext = Depends(
        require_facility_permissions(TenantPermission.DOCK_CONFLICT_GROUP_MANAGE)
    ),
    db: AsyncSession = Depends(get_db),
):
    await ensure_unique_name(db, DockConflictGroup, ctx.facility_id, body.name)
    member_ids = list(dict.fromkeys(body.member_dock_ids))
    await load_scoped_refs(db, Dock, member_ids, ctx.facility_id, "member_dock_ids")
    await _validate_trigger_vehicles(db, ctx, body.trigger_condition_json)

    group = DockConflictGroup(
        tenant_id=ctx.tenant_id,
        facility_id=ctx.facility_id,
        name=body.name,
        relation_type=body.relation_type,
        trigger_condition_json=body.trigger_condition_json,
        is_active=body.is_active,
        members=[DockConflictGroupMember(dock_id=d) for d in member_ids],
    )
    db.add(group)
    await db.flush()
    _audit(
        db, ctx,
        action="dock_conflict_group.create", entity_type="dock_conflict_group",
        entity_id=group.id, after=_group_snapshot(group),
    )
    await db.commit()
    group = await get_scoped_or_404(
        db, DockConflictGroup, group.id, ctx.facility_id, options=_GROUP_MEMBERS
    )
    return ok(_group_out(group))


@router.get("/dock-conflict-groups/{group_id}")
async def get_conflict_group(
    group_id: uuid.UUID,
    ctx: FacilityContext = Depends(require_facility_permissions(TenantPermission.APPT_VIEW)),
    db: AsyncSession = Depends(get_db),
):
    group = await get_scoped_or_404(
        db, DockConflictGroup, group_id, ctx.facility_id, options=_GROUP_MEMBERS
    )
    return ok(_group_out(group))


@router.patch("/dock-conflict-groups/{group_id}")
async def patch_conflict_group(
    group_id: uuid.UUID,
    body: ConflictGroupPatch,
    ctx: FacilityContext = Depends(
        require_facility_permissions(TenantPermission.DOCK_CONFLICT_GROUP_MANAGE)
    ),
    db: AsyncSession = Depends(get_db),
):
    group = await get_scoped_or_404(
        db, DockConflictGroup, group_id, ctx.facility_id, options=_GROUP_MEMBERS
    )
    changes = body.model_dump(exclude_unset=True)
    if "name" in changes and changes["name"] != group.name:
        await ensure_unique_name(
            db, DockConflictGroup, ctx.facility_id, changes["name"], exclude_id=group.id
        )

    # Sonuc durumu (mevcut + degisiklik) uzerinden dogrula
    final_type = changes.get("relation_type", group.relation_type)
    final_trigger = changes.get("trigger_condition_json", group.trigger_condition_json)
    try:
        _validate_trigger(final_type, final_trigger)
    except ValueError as exc:
        raise ApiError("VALIDATION_ERROR", str(exc), 422) from exc
    if "trigger_condition_json" in changes:
        await _validate_trigger_vehicles(db, ctx, changes["trigger_condition_json"])

    before = _group_snapshot(group)
    if "member_dock_ids" in changes:
        member_ids = list(dict.fromkeys(changes.pop("member_dock_ids")))
        if len(member_ids) < 2:
            raise ApiError("VALIDATION_ERROR", "Cakisma grubu en az 2 farkli rampa icermeli", 422)
        await load_scoped_refs(db, Dock, member_ids, ctx.facility_id, "member_dock_ids")
        group.members = [DockConflictGroupMember(dock_id=d) for d in member_ids]
    for key, value in changes.items():
        setattr(group, key, value)
    _audit(
        db, ctx,
        action="dock_conflict_group.update", entity_type="dock_conflict_group",
        entity_id=group.id, before=before, after=_group_snapshot(group),
    )
    await db.commit()
    group = await get_scoped_or_404(
        db, DockConflictGroup, group_id, ctx.facility_id, options=_GROUP_MEMBERS
    )
    return ok(_group_out(group))


@router.delete("/dock-conflict-groups/{group_id}")
async def deactivate_conflict_group(
    group_id: uuid.UUID,
    ctx: FacilityContext = Depends(
        require_facility_permissions(TenantPermission.DOCK_CONFLICT_GROUP_MANAGE)
    ),
    db: AsyncSession = Depends(get_db),
):
    group = await get_scoped_or_404(
        db, DockConflictGroup, group_id, ctx.facility_id, options=_GROUP_MEMBERS
    )
    before = _group_snapshot(group)
    group.is_active = False
    _audit(
        db, ctx,
        action="dock_conflict_group.deactivate", entity_type="dock_conflict_group",
        entity_id=group.id, before=before, after=_group_snapshot(group),
    )
    await db.commit()
    return ok(_group_out(group))


# ---------- Dock Overrides (Calendar Overrides) ----------


def _override_out(obj: DockOverride) -> dict:
    return DockOverrideOut.model_validate(obj).model_dump(mode="json")


def _ensure_dock_scope(ctx: FacilityContext, dock_ids: list[uuid.UUID]) -> None:
    """Rampa scope'lu uyelik (assigned_dock_ids) kendi rampalari disina yazamaz.

    Takvim gorunumu zaten bu scope'a gore filtrelenir; istisna yazma da ayni
    sinirda kalmali (scope'suz uyelikte davranis degismez).
    """
    if any(not ctx.can_act_on_dock(dock_id) for dock_id in dock_ids):
        raise ApiError("FORBIDDEN", "Bu rampada islem yetkiniz yok", 403)


@router.get("/dock-overrides")
async def list_overrides(
    ctx: FacilityContext = Depends(require_facility_permissions(TenantPermission.APPT_VIEW)),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(DockOverride)
        .where(DockOverride.facility_id == ctx.facility_id)
        .order_by(DockOverride.date.desc())
    )
    return ok([_override_out(o) for o in result.scalars()])


@router.post("/dock-overrides")
async def create_override(
    body: OverrideCreate,
    ctx: FacilityContext = Depends(
        require_facility_permissions(TenantPermission.CALENDAR_OVERRIDE)
    ),
    db: AsyncSession = Depends(get_db),
):
    """Secilen her rampa icin ayni istisnayi yazar; her zaman LISTE doner.

    Musaitlik/takvim/rapor hesabi rampa+gun basina TEK aktif istisna varsayar
    (bkz. services/overrides.pick_override), bu yuzden ayni gun icin ikinci bir
    aktif istisna 422 ile reddedilir.
    """
    dock_ids = body.target_dock_ids
    _ensure_dock_scope(ctx, dock_ids)
    docks = await load_scoped_refs(db, Dock, dock_ids, ctx.facility_id, "dock_ids")
    clashing = list(
        (
            await db.execute(
                select(DockOverride).where(
                    DockOverride.facility_id == ctx.facility_id,
                    DockOverride.date == body.date,
                    DockOverride.dock_id.in_(dock_ids),
                    DockOverride.is_active.is_(True),
                )
            )
        ).scalars()
    )
    if clashing:
        names = {d.id: d.name for d in docks}
        busy = ", ".join(sorted(names.get(o.dock_id, "?") for o in clashing))
        raise ApiError(
            "VALIDATION_ERROR",
            f"Bu tarihte zaten aktif istisnasi olan rampalar: {busy}. "
            "Mevcut istisnayi duzenleyin ya da bu rampalari secimden cikarin.",
            422,
        )

    payload = body.model_dump(exclude={"dock_id", "dock_ids"})
    objs = [
        DockOverride(
            tenant_id=ctx.tenant_id, facility_id=ctx.facility_id, dock_id=dock_id, **payload
        )
        for dock_id in dock_ids
    ]
    db.add_all(objs)
    await db.flush()
    for obj in objs:
        _audit(
            db, ctx,
            action="dock_override.create", entity_type="dock_override",
            entity_id=obj.id, after=snapshot(obj, OVERRIDE_AUDIT_FIELDS),
        )
    await db.commit()
    for obj in objs:
        await db.refresh(obj)
    return ok([_override_out(o) for o in objs])


@router.get("/dock-overrides/{override_id}")
async def get_override(
    override_id: uuid.UUID,
    ctx: FacilityContext = Depends(require_facility_permissions(TenantPermission.APPT_VIEW)),
    db: AsyncSession = Depends(get_db),
):
    obj = await get_scoped_or_404(db, DockOverride, override_id, ctx.facility_id)
    return ok(_override_out(obj))


@router.patch("/dock-overrides/{override_id}")
async def patch_override(
    override_id: uuid.UUID,
    body: OverridePatch,
    ctx: FacilityContext = Depends(
        require_facility_permissions(TenantPermission.CALENDAR_OVERRIDE)
    ),
    db: AsyncSession = Depends(get_db),
):
    obj = await get_scoped_or_404(db, DockOverride, override_id, ctx.facility_id)
    _ensure_dock_scope(ctx, [obj.dock_id])
    changes = body.model_dump(exclude_unset=True)

    # Sonuc durumunu dogrula (extra_hours saat zorunlulugu, end > start)
    final_type = changes.get("type", obj.type)
    final_start = changes.get("start_time", obj.start_time)
    final_end = changes.get("end_time", obj.end_time)
    if final_type == DockOverrideType.extra_hours and (final_start is None or final_end is None):
        raise ApiError("VALIDATION_ERROR", "extra_hours icin start_time ve end_time zorunlu", 422)
    if final_start is not None and final_end is not None and final_end <= final_start:
        raise ApiError("VALIDATION_ERROR", "end_time, start_time'dan sonra olmali", 422)

    # Tarih/aktiflik degisimi ayni rampa+gunde ikinci aktif istisna dogurmasin.
    # Yalnizca bu iki alan degisiyorsa bakilir: eski kayitlarda (kural oncesi)
    # olusmus cift istisnalarin sebep/saat duzenlemesi kilitlenmesin.
    final_date = changes.get("date", obj.date)
    final_active = changes.get("is_active", obj.is_active)
    if final_active and ("date" in changes or "is_active" in changes):
        clash = await db.execute(
            select(DockOverride.id).where(
                DockOverride.facility_id == ctx.facility_id,
                DockOverride.dock_id == obj.dock_id,
                DockOverride.date == final_date,
                DockOverride.is_active.is_(True),
                DockOverride.id != obj.id,
            )
        )
        if clash.first() is not None:
            raise ApiError(
                "VALIDATION_ERROR",
                "Bu rampada bu tarih icin zaten aktif bir istisna var.",
                422,
            )

    before = snapshot(obj, OVERRIDE_AUDIT_FIELDS)
    for key, value in changes.items():
        setattr(obj, key, value)
    _audit(
        db, ctx,
        action="dock_override.update", entity_type="dock_override",
        entity_id=obj.id, before=before, after=snapshot(obj, OVERRIDE_AUDIT_FIELDS),
    )
    await db.commit()
    await db.refresh(obj)
    return ok(_override_out(obj))


@router.delete("/dock-overrides/{override_id}")
async def deactivate_override(
    override_id: uuid.UUID,
    ctx: FacilityContext = Depends(
        require_facility_permissions(TenantPermission.CALENDAR_OVERRIDE)
    ),
    db: AsyncSession = Depends(get_db),
):
    obj = await get_scoped_or_404(db, DockOverride, override_id, ctx.facility_id)
    _ensure_dock_scope(ctx, [obj.dock_id])
    before = snapshot(obj, OVERRIDE_AUDIT_FIELDS)
    obj.is_active = False
    _audit(
        db, ctx,
        action="dock_override.deactivate", entity_type="dock_override",
        entity_id=obj.id, before=before, after=snapshot(obj, OVERRIDE_AUDIT_FIELDS),
    )
    await db.commit()
    await db.refresh(obj)
    return ok(_override_out(obj))
