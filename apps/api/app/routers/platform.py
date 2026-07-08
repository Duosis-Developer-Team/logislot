"""Platform (vendor) yonetim endpointleri.

ILKE: Platform katmani operasyonel/PII detay dondurmez; yalnizca agregat.
"""

import uuid
from datetime import date, datetime

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import Identity, require_platform_permissions
from app.core.config import get_settings
from app.core.db import get_db
from app.core.enums import (
    ActorType,
    AppointmentStatus,
    FacilityStatus,
    PlanScope,
    PlanStatus,
    SupplierStatus,
    TenantStatus,
)
from app.core.errors import ApiError, NotFoundError
from app.core.permissions import PlatformPermission
from app.core.responses import ok
from app.models import Appointment, Dock, Facility, Plan, Supplier, Tenant
from app.services.audit import record_audit
from app.services.onboarding import bootstrap_facility_defaults
from app.services.plan_warnings import evaluate_rate_card

router = APIRouter(prefix="/platform", tags=["platform"])


# ---------- semalar ----------


class TenantCreate(BaseModel):
    commercial_name: str = Field(min_length=1)
    display_name: str = Field(min_length=1)
    slug: str = Field(min_length=1, max_length=100)
    status: TenantStatus = TenantStatus.trial
    primary_contact_name: str | None = None
    primary_contact_email: str | None = None
    primary_contact_phone: str | None = None
    default_timezone: str = "Europe/Istanbul"
    notes: str | None = None


class TenantPatch(BaseModel):
    display_name: str | None = None
    status: TenantStatus | None = None
    primary_contact_name: str | None = None
    primary_contact_email: str | None = None
    primary_contact_phone: str | None = None
    assigned_plan_id: uuid.UUID | None = None
    notes: str | None = None


class InitialAdmin(BaseModel):
    """Tesisle birlikte acilan ilk tenant yoneticisi (Sprint 9)."""

    name: str = Field(min_length=1, max_length=255)
    email: EmailStr
    # Verilmezse guclu rastgele uretilir; yanit icinde BIR KEZ gosterilir.
    temporary_password: str | None = Field(default=None, min_length=6)
    must_change_password: bool = True


class FacilityCreate(BaseModel):
    name: str = Field(min_length=1)
    address: str | None = None
    timezone: str = "Europe/Istanbul"
    # Opsiyonel plan override (yalnizca aktif plan atanabilir).
    plan_override_id: uuid.UUID | None = None
    # MVP onboarding: temel konfigurasyonu (arac/urun kategorisi, Rampa 1,
    # 3 standart sistem rolu) otomatik kur.
    bootstrap_defaults: bool = False
    # Opsiyonel: ilk tesis yoneticisini ayni transaction'da olustur.
    initial_admin: InitialAdmin | None = None


class FacilityPatch(BaseModel):
    name: str | None = None
    address: str | None = None
    timezone: str | None = None
    status: FacilityStatus | None = None
    plan_override_id: uuid.UUID | None = None


class PlanCreate(BaseModel):
    name: str = Field(min_length=1)
    scope: PlanScope = PlanScope.tenant
    billing_unit_label: str = "fixed"
    measurable_dimensions_json: list | None = None
    rate_card_json: list | None = None
    status: PlanStatus = PlanStatus.draft


class PlanAssignment(BaseModel):
    plan_id: uuid.UUID
    tenant_id: uuid.UUID | None = None
    facility_id: uuid.UUID | None = None


def _tenant_out(t: Tenant) -> dict:
    return {
        "id": str(t.id),
        "commercial_name": t.commercial_name,
        "display_name": t.display_name,
        "slug": t.slug,
        "status": t.status.value,
        "primary_contact_name": t.primary_contact_name,
        "primary_contact_email": t.primary_contact_email,
        "default_timezone": t.default_timezone,
        "assigned_plan_id": str(t.assigned_plan_id) if t.assigned_plan_id else None,
        "created_at": t.created_at.isoformat(),
    }


def _facility_out(f: Facility) -> dict:
    return {
        "id": str(f.id),
        "tenant_id": str(f.tenant_id),
        "name": f.name,
        "address": f.address,
        "timezone": f.timezone,
        "status": f.status.value,
        "plan_override_id": str(f.plan_override_id) if f.plan_override_id else None,
        "created_at": f.created_at.isoformat(),
    }


def _plan_out(p: Plan) -> dict:
    return {
        "id": str(p.id),
        "name": p.name,
        "scope": p.scope.value,
        "billing_unit_label": p.billing_unit_label,
        "measurable_dimensions_json": p.measurable_dimensions_json,
        "rate_card_json": p.rate_card_json,
        "status": p.status.value,
    }


# ---------- tenants ----------


@router.get("/tenants")
async def list_tenants(
    identity: Identity = Depends(require_platform_permissions(PlatformPermission.TENANT_VIEW)),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Tenant).order_by(Tenant.display_name))
    return ok([_tenant_out(t) for t in result.scalars()])


@router.post("/tenants")
async def create_tenant(
    body: TenantCreate,
    identity: Identity = Depends(require_platform_permissions(PlatformPermission.TENANT_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    tenant = Tenant(**body.model_dump())
    db.add(tenant)
    await db.flush()
    record_audit(
        db,
        actor_type=ActorType.platform_user,
        actor_id=identity.id,
        action="tenant.create",
        tenant_id=tenant.id,
        entity_type="tenant",
        entity_id=tenant.id,
        after={"slug": tenant.slug},
    )
    await db.commit()
    await db.refresh(tenant)
    return ok(_tenant_out(tenant))


@router.get("/tenants/{tenant_id}")
async def get_tenant(
    tenant_id: uuid.UUID,
    identity: Identity = Depends(require_platform_permissions(PlatformPermission.TENANT_VIEW)),
    db: AsyncSession = Depends(get_db),
):
    tenant = (await db.execute(select(Tenant).where(Tenant.id == tenant_id))).scalar_one_or_none()
    if tenant is None:
        raise NotFoundError("Tenant bulunamadi")
    facilities = (
        await db.execute(select(Facility).where(Facility.tenant_id == tenant_id))
    ).scalars()
    data = _tenant_out(tenant)
    data["facilities"] = [_facility_out(f) for f in facilities]
    return ok(data)


@router.patch("/tenants/{tenant_id}")
async def patch_tenant(
    tenant_id: uuid.UUID,
    body: TenantPatch,
    identity: Identity = Depends(require_platform_permissions(PlatformPermission.TENANT_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    tenant = (await db.execute(select(Tenant).where(Tenant.id == tenant_id))).scalar_one_or_none()
    if tenant is None:
        raise NotFoundError("Tenant bulunamadi")
    changes = body.model_dump(exclude_unset=True)
    for key, value in changes.items():
        setattr(tenant, key, value)
    record_audit(
        db,
        actor_type=ActorType.platform_user,
        actor_id=identity.id,
        action="tenant.update",
        tenant_id=tenant.id,
        entity_type="tenant",
        entity_id=tenant.id,
        after={k: str(v) for k, v in changes.items()},
    )
    await db.commit()
    await db.refresh(tenant)
    return ok(_tenant_out(tenant))


# ---------- facilities ----------


@router.get("/facilities")
async def list_facilities(
    identity: Identity = Depends(require_platform_permissions(PlatformPermission.FACILITY_VIEW)),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Facility).order_by(Facility.name))
    return ok([_facility_out(f) for f in result.scalars()])


@router.post("/tenants/{tenant_id}/facilities")
async def create_facility(
    tenant_id: uuid.UUID,
    body: FacilityCreate,
    identity: Identity = Depends(require_platform_permissions(PlatformPermission.TENANT_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    tenant = (await db.execute(select(Tenant).where(Tenant.id == tenant_id))).scalar_one_or_none()
    if tenant is None:
        raise NotFoundError("Tenant bulunamadi")
    if tenant.status == TenantStatus.archived:
        raise ApiError(
            "TENANT_ARCHIVED", "Arsivlenmis tenant'a yeni tesis eklenemez", 409
        )
    if body.plan_override_id is not None:
        await _get_assignable_plan(db, body.plan_override_id)
    facility = Facility(
        tenant_id=tenant_id,
        name=body.name,
        address=body.address,
        timezone=body.timezone,
        plan_override_id=body.plan_override_id,
    )
    db.add(facility)
    await db.flush()
    bootstrap_summary = None
    if body.bootstrap_defaults:
        bootstrap_summary = await bootstrap_facility_defaults(db, facility)
    initial_admin_out = None
    if body.initial_admin is not None:
        initial_admin_out = await _create_initial_admin(
            db, facility, body.initial_admin, actor_id=identity.id
        )
    record_audit(
        db,
        actor_type=ActorType.platform_user,
        actor_id=identity.id,
        action="facility.create",
        tenant_id=tenant_id,
        facility_id=facility.id,
        entity_type="facility",
        entity_id=facility.id,
        after={"name": facility.name, "bootstrap": bootstrap_summary},
    )
    await db.commit()
    await db.refresh(facility)
    data = _facility_out(facility)
    data["bootstrap"] = bootstrap_summary
    # Gecici parola YALNIZCA bu yanitta gosterilir; sonradan okunamaz.
    data["initial_admin"] = initial_admin_out
    return ok(data)


async def _create_initial_admin(
    db: AsyncSession, facility: Facility, spec: InitialAdmin, *, actor_id: uuid.UUID
) -> dict:
    """Ilk tenant yoneticisi: user.manage yetkili sistem roluyle uyelik.

    Tesiste "Sistem Yoneticisi" rolu yoksa (bootstrap kapali senaryosu)
    burada olusturulur — kullanicinin kilitli dogmamasi garanti edilir.
    """
    from app.core.passwords import generate_temporary_password
    from app.core.security import hash_password
    from app.models import FacilityMembership, TenantUser
    from app.services.config import ensure_unique_value
    from app.services.onboarding import ensure_sysadmin_role

    await ensure_unique_value(
        db, TenantUser, "email", str(spec.email),
        code="DUPLICATE_EMAIL", message="Bu e-posta zaten bir kullaniciya ait",
    )
    role = await ensure_sysadmin_role(db, facility)
    temporary_password = spec.temporary_password or generate_temporary_password()
    user = TenantUser(
        tenant_id=facility.tenant_id,
        name=spec.name,
        email=str(spec.email),
        password_hash=hash_password(temporary_password),
        must_change_password=spec.must_change_password,
        default_facility_id=facility.id,
    )
    db.add(user)
    await db.flush()
    db.add(
        FacilityMembership(
            tenant_user_id=user.id,
            tenant_id=facility.tenant_id,
            facility_id=facility.id,
            roles=[role],
        )
    )
    for action in ("tenant_user.create", "facility_admin.bootstrap"):
        record_audit(
            db,
            actor_type=ActorType.platform_user,
            actor_id=actor_id,
            action=action,
            tenant_id=facility.tenant_id,
            facility_id=facility.id,
            entity_type="tenant_user",
            entity_id=user.id,
            after={"email": user.email, "role": role.name},
        )
    return {
        "id": str(user.id),
        "name": user.name,
        "email": user.email,
        "temporary_password": temporary_password,
        "must_change_password": user.must_change_password,
    }


@router.patch("/facilities/{facility_id}")
async def patch_facility(
    facility_id: uuid.UUID,
    body: FacilityPatch,
    identity: Identity = Depends(require_platform_permissions(PlatformPermission.TENANT_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    facility = (
        await db.execute(select(Facility).where(Facility.id == facility_id))
    ).scalar_one_or_none()
    if facility is None:
        raise NotFoundError("Tesis bulunamadi")
    changes = body.model_dump(exclude_unset=True)
    for key, value in changes.items():
        setattr(facility, key, value)
    record_audit(
        db,
        actor_type=ActorType.platform_user,
        actor_id=identity.id,
        action="facility.update",
        tenant_id=facility.tenant_id,
        facility_id=facility.id,
        entity_type="facility",
        entity_id=facility.id,
        after={k: str(v) for k, v in changes.items()},
    )
    await db.commit()
    await db.refresh(facility)
    return ok(_facility_out(facility))


# ---------- usage (yalnizca agregat; PII/operasyonel detay ASLA donmez) ----------


@router.get("/usage")
async def usage(
    identity: Identity = Depends(
        require_platform_permissions(PlatformPermission.ANALYTICS_VIEW)
    ),
    db: AsyncSession = Depends(get_db),
    date_from: date | None = None,
    date_to: date | None = None,
):
    """Tenant/facility kullanim & saglik metrikleri.

    Metrik sozlugu Plan measurable_dimensions ile aynidir:
    appointments_created/completed, active_docks/suppliers/users/facilities.
    Aralik randevunun created_at'ine gore hesaplanir (varsayilan son 30 gun).
    """
    from datetime import UTC, datetime, timedelta

    from app.core.timeutils import to_utc
    from app.models import AuditLog, FacilityMembership

    today = datetime.now(UTC).date()
    date_to = date_to or today
    date_from = date_from or (date_to - timedelta(days=29))
    range_start = datetime.combine(date_from, datetime.min.time(), UTC)
    range_end = datetime.combine(date_to + timedelta(days=1), datetime.min.time(), UTC)

    tenants = list((await db.execute(select(Tenant))).scalars())
    facilities = list((await db.execute(select(Facility))).scalars())
    plans = {p.id: p.name for p in (await db.execute(select(Plan))).scalars()}

    appointments = list(
        (
            await db.execute(
                select(
                    Appointment.id,
                    Appointment.facility_id,
                    Appointment.tenant_id,
                    Appointment.status,
                    Appointment.created_at,
                ).where(
                    Appointment.created_at >= range_start,
                    Appointment.created_at < range_end,
                )
            )
        ).all()
    )

    async def count_by_facility(query) -> dict:
        return dict((await db.execute(query)).all())

    docks_by_facility = await count_by_facility(
        select(Dock.facility_id, func.count(Dock.id))
        .where(Dock.is_active.is_(True))
        .group_by(Dock.facility_id)
    )
    suppliers_by_facility = await count_by_facility(
        select(Supplier.facility_id, func.count(Supplier.id))
        .where(Supplier.status == SupplierStatus.active)
        .group_by(Supplier.facility_id)
    )
    users_by_facility = await count_by_facility(
        select(FacilityMembership.facility_id, func.count(FacilityMembership.id))
        .group_by(FacilityMembership.facility_id)
    )

    # Karar suresi (SLA) — audit izlerinden, tenant bazinda ortalama
    audit_rows = list(
        (
            await db.execute(
                select(
                    AuditLog.tenant_id,
                    AuditLog.entity_id,
                    AuditLog.action,
                    AuditLog.occurred_at,
                ).where(
                    AuditLog.action.in_(
                        ["appointment.create", "appointment.approve", "appointment.reject"]
                    ),
                    AuditLog.occurred_at >= range_start,
                )
            )
        ).all()
    )
    created_map: dict = {}
    decided_map: dict = {}
    for tenant_id, entity_id, action, occurred_at in audit_rows:
        if action == "appointment.create":
            created_map[entity_id] = (tenant_id, to_utc(occurred_at))
        elif entity_id not in decided_map:
            decided_map[entity_id] = to_utc(occurred_at)
    sla_by_tenant: dict = {}
    for entity_id, decided_at in decided_map.items():
        if entity_id in created_map:
            tenant_id, created_at = created_map[entity_id]
            sla_by_tenant.setdefault(tenant_id, []).append(
                (decided_at - created_at).total_seconds() / 60
            )

    def facility_row(facility: Facility) -> dict:
        fac_appts = [a for a in appointments if a.facility_id == facility.id]
        plan_id = facility.plan_override_id or next(
            (t.assigned_plan_id for t in tenants if t.id == facility.tenant_id), None
        )
        last = max((to_utc(a.created_at) for a in fac_appts), default=None)
        return {
            "facility_id": str(facility.id),
            "tenant_id": str(facility.tenant_id),
            "tenant_name": next(
                (t.display_name for t in tenants if t.id == facility.tenant_id), None
            ),
            "facility_name": facility.name,
            "status": facility.status.value,
            "assigned_plan": plans.get(plan_id),
            "plan_is_override": facility.plan_override_id is not None,
            "appointments_created": len(fac_appts),
            "appointments_completed": sum(
                1 for a in fac_appts if a.status == AppointmentStatus.completed
            ),
            "active_docks": int(docks_by_facility.get(facility.id, 0)),
            "active_suppliers": int(suppliers_by_facility.get(facility.id, 0)),
            "active_users": int(users_by_facility.get(facility.id, 0)),
            "last_activity_at": last.isoformat() if last else None,
        }

    facility_usage = [facility_row(f) for f in facilities]

    def tenant_row(tenant: Tenant) -> dict:
        rows = [r for r in facility_usage if r["tenant_id"] == str(tenant.id)]
        sla_values = sla_by_tenant.get(tenant.id, [])
        last_values = [r["last_activity_at"] for r in rows if r["last_activity_at"]]
        return {
            "tenant_id": str(tenant.id),
            "tenant_name": tenant.display_name,
            "status": tenant.status.value,
            "assigned_plan": plans.get(tenant.assigned_plan_id),
            "facility_count": len(rows),
            "appointments_created": sum(r["appointments_created"] for r in rows),
            "appointments_completed": sum(r["appointments_completed"] for r in rows),
            "active_docks": sum(r["active_docks"] for r in rows),
            "active_suppliers": sum(r["active_suppliers"] for r in rows),
            "last_activity_at": max(last_values) if last_values else None,
            "approval_sla_avg_minutes": round(sum(sla_values) / len(sla_values))
            if sla_values
            else None,
        }

    record_audit(
        db,
        actor_type=ActorType.platform_user,
        actor_id=identity.id,
        action="platform.usage.view",
    )
    await db.commit()
    return ok(
        {
            "range": {
                "date_from": date_from.isoformat(),
                "date_to": date_to.isoformat(),
            },
            "totals": {
                "tenants": len(tenants),
                "facilities": len(facilities),
                "active_facilities": sum(
                    1 for f in facilities if f.status == FacilityStatus.active
                ),
                "appointments_created": len(appointments),
                "appointments_completed": sum(
                    1 for a in appointments if a.status == AppointmentStatus.completed
                ),
                "active_docks": sum(int(v) for v in docks_by_facility.values()),
                "active_suppliers": sum(int(v) for v in suppliers_by_facility.values()),
                "active_users": sum(int(v) for v in users_by_facility.values()),
            },
            "tenant_usage": [tenant_row(t) for t in tenants],
            "facility_usage": facility_usage,
        }
    )


# ---------- plans ----------


@router.get("/plans")
async def list_plans(
    identity: Identity = Depends(require_platform_permissions(PlatformPermission.PLAN_VIEW)),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Plan).order_by(Plan.name))
    return ok([_plan_out(p) for p in result.scalars()])


@router.post("/plans")
async def create_plan(
    body: PlanCreate,
    identity: Identity = Depends(require_platform_permissions(PlatformPermission.PLAN_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    plan = Plan(**body.model_dump())
    db.add(plan)
    await db.flush()
    record_audit(
        db,
        actor_type=ActorType.platform_user,
        actor_id=identity.id,
        action="plan.create",
        entity_type="plan",
        entity_id=plan.id,
        after={"name": plan.name, "status": plan.status.value},
    )
    await db.commit()
    await db.refresh(plan)
    return ok(_plan_out(plan))


@router.get("/plans/{plan_id}")
async def get_plan(
    plan_id: uuid.UUID,
    identity: Identity = Depends(require_platform_permissions(PlatformPermission.PLAN_VIEW)),
    db: AsyncSession = Depends(get_db),
):
    plan = (await db.execute(select(Plan).where(Plan.id == plan_id))).scalar_one_or_none()
    if plan is None:
        raise NotFoundError("Plan bulunamadi")
    return ok(_plan_out(plan))


class PlanPatch(BaseModel):
    name: str | None = None
    scope: PlanScope | None = None
    billing_unit_label: str | None = None
    measurable_dimensions_json: list | None = None
    rate_card_json: list | None = None
    status: PlanStatus | None = None


@router.patch("/plans/{plan_id}")
async def patch_plan(
    plan_id: uuid.UUID,
    body: PlanPatch,
    identity: Identity = Depends(require_platform_permissions(PlatformPermission.PLAN_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    plan = (await db.execute(select(Plan).where(Plan.id == plan_id))).scalar_one_or_none()
    if plan is None:
        raise NotFoundError("Plan bulunamadi")
    changes = body.model_dump(exclude_unset=True)
    before = {"name": plan.name, "status": plan.status.value}
    for key, value in changes.items():
        setattr(plan, key, value)
    record_audit(
        db,
        actor_type=ActorType.platform_user,
        actor_id=identity.id,
        action="plan.update",
        entity_type="plan",
        entity_id=plan.id,
        before=before,
        after={"name": plan.name, "status": plan.status.value},
    )
    await db.commit()
    await db.refresh(plan)
    return ok(_plan_out(plan))


@router.delete("/plans/{plan_id}")
async def retire_plan(
    plan_id: uuid.UUID,
    identity: Identity = Depends(require_platform_permissions(PlatformPermission.PLAN_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    """Soft delete: plan retired olur; mevcut atamalar bozulmaz, yenisi yapilamaz."""
    plan = (await db.execute(select(Plan).where(Plan.id == plan_id))).scalar_one_or_none()
    if plan is None:
        raise NotFoundError("Plan bulunamadi")
    plan.status = PlanStatus.retired
    record_audit(
        db,
        actor_type=ActorType.platform_user,
        actor_id=identity.id,
        action="plan.retire",
        entity_type="plan",
        entity_id=plan.id,
    )
    await db.commit()
    return ok(_plan_out(plan))


async def _get_assignable_plan(db: AsyncSession, plan_id: uuid.UUID) -> Plan:
    """Karar: yalnizca ACTIVE plan atanabilir (draft/retired reddedilir)."""
    plan = (await db.execute(select(Plan).where(Plan.id == plan_id))).scalar_one_or_none()
    if plan is None:
        raise NotFoundError("Plan bulunamadi")
    if plan.status != PlanStatus.active:
        raise ApiError(
            "PLAN_NOT_ASSIGNABLE",
            f"'{plan.status.value}' durumundaki plan atanamaz; yalnizca aktif planlar atanabilir",
            409,
        )
    return plan


class PlanAssignmentBody(BaseModel):
    plan_id: uuid.UUID


@router.post("/tenants/{tenant_id}/plan-assignment")
async def assign_tenant_plan(
    tenant_id: uuid.UUID,
    body: PlanAssignmentBody,
    identity: Identity = Depends(require_platform_permissions(PlatformPermission.PLAN_ASSIGN)),
    db: AsyncSession = Depends(get_db),
):
    tenant = (
        await db.execute(select(Tenant).where(Tenant.id == tenant_id))
    ).scalar_one_or_none()
    if tenant is None:
        raise NotFoundError("Tenant bulunamadi")
    plan = await _get_assignable_plan(db, body.plan_id)
    before = str(tenant.assigned_plan_id) if tenant.assigned_plan_id else None
    tenant.assigned_plan_id = plan.id
    record_audit(
        db,
        actor_type=ActorType.platform_user,
        actor_id=identity.id,
        action="plan.assign_tenant",
        tenant_id=tenant.id,
        entity_type="plan",
        entity_id=plan.id,
        before={"plan_id": before},
        after={"plan_id": str(plan.id), "plan_name": plan.name},
    )
    await db.commit()
    return ok({"assigned": True, "plan_name": plan.name})


@router.post("/facilities/{facility_id}/plan-assignment")
async def assign_facility_plan(
    facility_id: uuid.UUID,
    body: PlanAssignmentBody,
    identity: Identity = Depends(require_platform_permissions(PlatformPermission.PLAN_ASSIGN)),
    db: AsyncSession = Depends(get_db),
):
    """Facility override: tenant varsayilanindan farkli plan (havalimani senaryosu)."""
    facility = (
        await db.execute(select(Facility).where(Facility.id == facility_id))
    ).scalar_one_or_none()
    if facility is None:
        raise NotFoundError("Tesis bulunamadi")
    plan = await _get_assignable_plan(db, body.plan_id)
    before = str(facility.plan_override_id) if facility.plan_override_id else None
    facility.plan_override_id = plan.id
    record_audit(
        db,
        actor_type=ActorType.platform_user,
        actor_id=identity.id,
        action="plan.assign_facility_override",
        tenant_id=facility.tenant_id,
        facility_id=facility.id,
        entity_type="plan",
        entity_id=plan.id,
        before={"plan_id": before},
        after={"plan_id": str(plan.id), "plan_name": plan.name},
    )
    await db.commit()
    return ok({"assigned": True, "plan_name": plan.name})


# ---------- plan kullanim uyarilari (Sprint 10) ----------


@router.get("/usage/warnings")
async def usage_warnings(
    identity: Identity = Depends(
        require_platform_permissions(PlatformPermission.ANALYTICS_VIEW)
    ),
    db: AsyncSession = Depends(get_db),
    date_from: date | None = None,
    date_to: date | None = None,
):
    """Plan included_quota esik uyarilari (fatura DEGIL, yalnizca sinyal).

    Esikler: >=%80 info, >=%100 warning, >=%120 critical. Uyari randevu
    olusturmayi ASLA engellemez. PII icermez (yalnizca tenant/tesis/plan adi
    ve agregat sayilar).
    """
    from datetime import UTC, datetime, timedelta

    from app.models import FacilityMembership

    today = datetime.now(UTC).date()
    date_to = date_to or today
    date_from = date_from or (date_to - timedelta(days=29))
    range_start = datetime.combine(date_from, datetime.min.time(), UTC)
    range_end = datetime.combine(date_to + timedelta(days=1), datetime.min.time(), UTC)

    tenants = list((await db.execute(select(Tenant))).scalars())
    facilities = list((await db.execute(select(Facility))).scalars())
    plans = {p.id: p for p in (await db.execute(select(Plan))).scalars()}

    appt_rows = (
        await db.execute(
            select(
                Appointment.facility_id,
                Appointment.status,
                func.count(Appointment.id),
            )
            .where(
                Appointment.created_at >= range_start,
                Appointment.created_at < range_end,
            )
            .group_by(Appointment.facility_id, Appointment.status)
        )
    ).all()

    async def counts(query) -> dict:
        return dict((await db.execute(query)).all())

    docks = await counts(
        select(Dock.facility_id, func.count(Dock.id))
        .where(Dock.is_active.is_(True))
        .group_by(Dock.facility_id)
    )
    suppliers = await counts(
        select(Supplier.facility_id, func.count(Supplier.id))
        .where(Supplier.status == SupplierStatus.active)
        .group_by(Supplier.facility_id)
    )
    users = await counts(
        select(FacilityMembership.facility_id, func.count(FacilityMembership.id))
        .group_by(FacilityMembership.facility_id)
    )

    def facility_dimensions(facility_ids: list) -> dict[str, int]:
        created = sum(n for fid, _s, n in appt_rows if fid in facility_ids)
        completed = sum(
            n
            for fid, s, n in appt_rows
            if fid in facility_ids and s == AppointmentStatus.completed
        )
        return {
            "appointments_created": created,
            "appointments_completed": completed,
            "active_docks": sum(int(docks.get(f, 0)) for f in facility_ids),
            "active_suppliers": sum(int(suppliers.get(f, 0)) for f in facility_ids),
            "active_users": sum(int(users.get(f, 0)) for f in facility_ids),
            "active_facilities": len(facility_ids),
        }

    def evaluate(plan: Plan, dims: dict, *, tenant: Tenant, facility: Facility | None):
        scope = facility.name if facility else tenant.display_name
        return [
            {
                "tenant_id": str(tenant.id),
                "tenant_name": tenant.display_name,
                "facility_id": str(facility.id) if facility else None,
                "facility_name": facility.name if facility else None,
                "plan_name": plan.name,
                **w,
                "message": (
                    f"{plan.name} planında {scope} için {w['label']} %{w['percent']} "
                    "seviyesinde."
                ),
            }
            for w in evaluate_rate_card(plan, dims)
        ]

    warnings: list[dict] = []
    for tenant in tenants:
        tenant_facilities = [f for f in facilities if f.tenant_id == tenant.id]
        plan = plans.get(tenant.assigned_plan_id)
        if plan is not None:
            # Tenant plani: override'siz tesislerin toplami uzerinden
            covered = [f.id for f in tenant_facilities if f.plan_override_id is None]
            if covered:
                warnings.extend(
                    evaluate(plan, facility_dimensions(covered), tenant=tenant, facility=None)
                )
        for facility in tenant_facilities:
            override = plans.get(facility.plan_override_id)
            if override is not None:
                warnings.extend(
                    evaluate(
                        override,
                        facility_dimensions([facility.id]),
                        tenant=tenant,
                        facility=facility,
                    )
                )

    severity_order = {"critical": 0, "warning": 1, "info": 2}
    warnings.sort(key=lambda w: (severity_order[w["severity"]], -w["percent"]))
    return ok(
        {
            "range": {"date_from": date_from.isoformat(), "date_to": date_to.isoformat()},
            "warnings": warnings,
        }
    )


# ---------- CSV export + destek sagligi (Sprint 11) ----------


@router.get("/usage.csv")
async def usage_csv(
    identity: Identity = Depends(
        require_platform_permissions(PlatformPermission.ANALYTICS_VIEW)
    ),
    db: AsyncSession = Depends(get_db),
    date_from: date | None = None,
    date_to: date | None = None,
):
    """Platform kullanim CSV'si — PII ICERMEZ (yalnizca agregat)."""
    import csv
    import io

    from fastapi import Response

    envelope = await usage(identity=identity, db=db, date_from=date_from, date_to=date_to)
    data = envelope["data"]

    buffer = io.StringIO()
    writer = csv.writer(buffer, lineterminator="\n")
    writer.writerow(["LogiSlot Platform Kullanim"])
    writer.writerow(["Aralik", data["range"]["date_from"], data["range"]["date_to"]])
    writer.writerow([])
    writer.writerow(["TENANT KULLANIMI"])
    writer.writerow(
        ["tenant", "durum", "plan", "tesis", "olusturulan", "tamamlanan",
         "aktif_rampa", "aktif_tedarikci", "sla_dk"]
    )
    for row in data["tenant_usage"]:
        writer.writerow(
            [row["tenant_name"], row["status"], row["assigned_plan"] or "",
             row["facility_count"], row["appointments_created"],
             row["appointments_completed"], row["active_docks"],
             row["active_suppliers"], row["approval_sla_avg_minutes"] or ""]
        )
    writer.writerow([])
    writer.writerow(["TESIS KULLANIMI"])
    writer.writerow(
        ["tesis", "tenant", "durum", "plan", "override", "olusturulan",
         "tamamlanan", "aktif_rampa", "aktif_tedarikci", "aktif_kullanici"]
    )
    for row in data["facility_usage"]:
        writer.writerow(
            [row["facility_name"], row["tenant_name"] or "", row["status"],
             row["assigned_plan"] or "", "evet" if row["plan_is_override"] else "hayir",
             row["appointments_created"], row["appointments_completed"],
             row["active_docks"], row["active_suppliers"], row["active_users"]]
        )
    return Response(
        content="﻿" + buffer.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": (
                f'attachment; filename="logislot_usage_'
                f'{data["range"]["date_from"]}_{data["range"]["date_to"]}.csv"'
            )
        },
    )


@router.get("/support/health")
async def support_health(
    identity: Identity = Depends(
        require_platform_permissions(PlatformPermission.ANALYTICS_VIEW)
    ),
    db: AsyncSession = Depends(get_db),
):
    """Pilot destek paneli — aksiyon bekleyenlerin agregat ozeti (PII YOK)."""
    from datetime import UTC, datetime

    from app.models import EmailLog, Notification

    now = datetime.now(UTC)

    async def count(query) -> int:
        return int((await db.execute(query)).scalar_one())

    failed_emails = await count(
        select(func.count(EmailLog.id)).where(EmailLog.status == "failed")
    )
    due_retries = await count(
        select(func.count(EmailLog.id)).where(
            EmailLog.status.in_(["failed", "queued"]),
            EmailLog.retry_count < EmailLog.max_attempts,
            EmailLog.next_retry_at.is_not(None),
            EmailLog.next_retry_at <= now,
        )
    )
    unread_critical = await count(
        select(func.count(Notification.id)).where(
            Notification.read_at.is_(None), Notification.severity == "error"
        )
    )
    pending = await count(
        select(func.count(Appointment.id)).where(
            Appointment.status == AppointmentStatus.pending
        )
    )
    revision_pending = await count(
        select(func.count(Appointment.id)).where(
            Appointment.status == AppointmentStatus.revision_pending
        )
    )
    tenants_count = await count(select(func.count(Tenant.id)))
    active_facilities = await count(
        select(func.count(Facility.id)).where(Facility.status == FacilityStatus.active)
    )
    warnings_envelope = await usage_warnings(identity=identity, db=db)

    # Scheduler durumu: is basina SON kosum (kayit yoksa null -> "henuz kosmadi")
    from app.models import MaintenanceRun

    scheduler_status: dict[str, dict | None] = {}
    for job_name in ("email_retry", "notification_cleanup"):
        last = (
            await db.execute(
                select(MaintenanceRun)
                .where(MaintenanceRun.job_name == job_name)
                .order_by(MaintenanceRun.started_at.desc())
                .limit(1)
            )
        ).scalar_one_or_none()
        scheduler_status[job_name] = (
            {
                "last_status": last.status,
                "last_finished_at": (
                    last.finished_at.isoformat() if last.finished_at else None
                ),
                "processed_count": last.processed_count,
                "error_message": last.error_message,
            }
            if last
            else None
        )

    settings = get_settings()
    return ok(
        {
            "failed_email_count": failed_emails,
            "due_email_retry_count": due_retries,
            "unread_critical_notification_count": unread_critical,
            "pending_appointment_count": pending,
            "revision_pending_appointment_count": revision_pending,
            "tenant_count": tenants_count,
            "active_facility_count": active_facilities,
            "plan_warning_count": len(warnings_envelope["data"]["warnings"]),
            "scheduler": scheduler_status,
            # Pilot readiness icin PII'siz konfigurasyon gorunurlugu
            "config": {
                "environment": settings.environment,
                "email_provider": settings.email_provider,
                "docs_enabled": settings.enable_docs,
                "rate_limit_enabled": settings.rate_limit_enabled,
                "scheduler_enabled": settings.scheduler_enabled,
            },
        }
    )


# ---------- platform denetim izleri (Sprint 12) ----------


@router.get("/audit-logs")
async def platform_audit_logs(
    identity: Identity = Depends(
        require_platform_permissions(PlatformPermission.AUDIT_VIEW)
    ),
    db: AsyncSession = Depends(get_db),
    actor_id: uuid.UUID | None = None,
    action: str | None = None,
    entity_type: str | None = None,
    entity_id: uuid.UUID | None = None,
    tenant_id: uuid.UUID | None = None,
    facility_id: uuid.UUID | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    search: str | None = None,
    limit: int = Query(default=50, le=200),
    offset: int = Query(default=0, ge=0),
):
    """Platform seviyesindeki denetim izleri (tenant/tesis/plan islemleri).

    Kapsam karari (rapor): yalnizca PLATFORM ve SYSTEM aktorlerinin kayitlari
    gosterilir — tenant kullanicilarinin operasyonel audit'i (randevu onayi,
    tedarikci degisiklikleri vb.) FACILITY audit'inde kalir; boylece platform
    katmanina operasyonel/PII veri SIZMAZ (v2.0 izolasyon ilkesi).
    Maskeleme facility audit ile AYNI servis fonksiyonudur.
    """
    from sqlalchemy import or_

    from app.core.enums import ActorType
    from app.models import AuditLog, PlatformUser
    from app.services.audit_view import ACTION_LABELS, safe_snapshot

    query = select(AuditLog).where(
        AuditLog.actor_type.in_([ActorType.platform_user, ActorType.system])
    )
    if actor_id is not None:
        query = query.where(AuditLog.actor_id == actor_id)
    if action is not None:
        query = query.where(AuditLog.action == action)
    if entity_type is not None:
        query = query.where(AuditLog.entity_type == entity_type)
    if entity_id is not None:
        query = query.where(AuditLog.entity_id == entity_id)
    if tenant_id is not None:
        query = query.where(AuditLog.tenant_id == tenant_id)
    if facility_id is not None:
        query = query.where(AuditLog.facility_id == facility_id)
    if date_from is not None:
        query = query.where(AuditLog.occurred_at >= date_from)
    if date_to is not None:
        query = query.where(AuditLog.occurred_at < date_to)
    if search:
        query = query.where(
            or_(
                AuditLog.action.ilike(f"%{search}%"),
                AuditLog.entity_type.ilike(f"%{search}%"),
            )
        )

    total = (
        await db.execute(select(func.count()).select_from(query.subquery()))
    ).scalar_one()
    rows = list(
        (
            await db.execute(
                query.order_by(AuditLog.occurred_at.desc()).offset(offset).limit(limit)
            )
        ).scalars()
    )

    actor_ids = {r.actor_id for r in rows if r.actor_id is not None}
    actor_names = dict(
        (
            await db.execute(
                select(PlatformUser.id, PlatformUser.name).where(
                    PlatformUser.id.in_(actor_ids)
                )
            )
        ).all()
    ) if actor_ids else {}
    tenant_names = dict(
        (await db.execute(select(Tenant.id, Tenant.display_name))).all()
    )
    facility_names = dict((await db.execute(select(Facility.id, Facility.name))).all())

    items = [
        {
            "id": str(row.id),
            "created_at": row.occurred_at.isoformat(),
            "actor_type": row.actor_type.value,
            "actor_name": (
                actor_names.get(row.actor_id)
                if row.actor_id
                else ("Sistem" if row.actor_type == ActorType.system else None)
            ),
            "action": row.action,
            "summary": ACTION_LABELS.get(row.action, row.action),
            "entity_type": row.entity_type,
            "entity_id": str(row.entity_id) if row.entity_id else None,
            "tenant_name": tenant_names.get(row.tenant_id),
            "facility_name": facility_names.get(row.facility_id),
            "before": safe_snapshot(row.before_json),
            "after": safe_snapshot(row.after_json),
            "metadata": safe_snapshot(row.metadata_json),
        }
        for row in rows
    ]
    return ok({"items": items, "total": int(total), "limit": limit, "offset": offset})
