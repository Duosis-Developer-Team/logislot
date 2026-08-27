"""Kullanici ve rol yonetimi (Sprint 8 — tam CRUD).

Kararlar (raporda):
- E-posta GLOBAL unique'tir (tek login tablosu karari, Sprint 3 ile tutarli).
- Kullanici en az 1 role sahip olmali; rol ve rampalar ayni facility'ye ait olmali.
- SON YONETICI KORUMASI: tesiste user.manage yetkili son aktif uye
  pasiflestirilemez / yetkisi dusurulemez (409 LAST_ADMIN).
- System rollerde izin seti KILITLIDIR; yalnizca display_name/description
  duzenlenebilir. Custom roller tam duzenlenir. System rol pasiflestirilemez.
- platform.* izinleri tenant rollerine ASLA atanamaz (whitelist disi -> 422).
- DELETE = soft (is_active/status); pasif kullanici login+refresh edemez ve
  oturumlari dusurulur; parola reset oturumlari dusurur.
"""

import uuid

from fastapi import APIRouter, Depends
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.db import get_control_db, get_db
from app.core.enums import ActorType, UserStatus
from app.core.errors import ApiError, NotFoundError
from app.core.permissions import TenantPermission, expand_tenant_permissions
from app.core.responses import ok
from app.core.security import hash_password
from app.models import Dock, FacilityMembership, Role, TenantUser
from app.services.audit import record_audit
from app.services.auth_sessions import revoke_user_sessions
from app.services.config import ensure_unique_value, load_scoped_refs
from app.tenancy.deps import FacilityContext, require_facility_permissions
from app.tenancy.directory import claim_email

router = APIRouter(prefix="/facilities/{facility_id}", tags=["users"])

#: Demo gecici parolasi — production notu Sprint 3 ile ayni (rastgele + e-posta).
DEFAULT_TEMP_PASSWORD = "Demo123!"


# ---------- semalar ----------


class UserCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    email: EmailStr
    role_ids: list[uuid.UUID] = Field(min_length=1)
    assigned_dock_ids: list[uuid.UUID] | None = None
    is_active: bool = True
    temporary_password: str | None = Field(default=None, min_length=6)


class UserPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    role_ids: list[uuid.UUID] | None = Field(default=None, min_length=1)
    assigned_dock_ids: list[uuid.UUID] | None = None
    is_active: bool | None = None


class PasswordReset(BaseModel):
    new_password: str = Field(min_length=6)


class RoleCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    display_name: str | None = Field(default=None, max_length=150)
    description: str | None = None
    permission_codes: list[str] = Field(min_length=1)
    is_active: bool = True


class RolePatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    display_name: str | None = Field(default=None, max_length=150)
    description: str | None = None
    permission_codes: list[str] | None = Field(default=None, min_length=1)
    is_active: bool | None = None


# ---------- yardimcilar ----------


def _validate_permission_codes(codes: list[str]) -> None:
    """Whitelist: yalnizca tenant izinleri. platform.* kesinlikle reddedilir."""
    invalid = [c for c in codes if c not in TenantPermission.ALL]
    if invalid:
        raise ApiError(
            "INVALID_PERMISSION",
            f"Gecersiz veya tenant kapsamina ait olmayan izinler: {', '.join(sorted(invalid))}",
            422,
        )


async def _load_roles(
    db: AsyncSession, ctx: FacilityContext, role_ids: list[uuid.UUID]
) -> list[Role]:
    unique_ids = list(dict.fromkeys(role_ids))
    roles = list(
        (
            await db.execute(
                select(Role).where(
                    Role.id.in_(unique_ids),
                    Role.tenant_id == ctx.tenant_id,
                    or_(Role.facility_id == ctx.facility_id, Role.facility_id.is_(None)),
                    Role.is_active.is_(True),
                )
            )
        ).scalars()
    )
    if len(roles) != len(unique_ids):
        raise ApiError(
            "INVALID_REFERENCE",
            "Bir veya daha fazla rol bu tesiste bulunamadi ya da pasif",
            422,
        )
    return roles


async def _membership_of(
    db: AsyncSession, ctx: FacilityContext, user_id: uuid.UUID
) -> FacilityMembership:
    membership = (
        await db.execute(
            select(FacilityMembership)
            .options(
                selectinload(FacilityMembership.roles),
                selectinload(FacilityMembership.user),
            )
            .where(
                FacilityMembership.facility_id == ctx.facility_id,
                FacilityMembership.tenant_user_id == user_id,
            )
        )
    ).scalar_one_or_none()
    if membership is None:
        raise NotFoundError("Kullanici bu tesiste bulunamadi")
    return membership


async def _ensure_not_last_admin(
    db: AsyncSession, ctx: FacilityContext, user_id: uuid.UUID
) -> None:
    """user.manage yetkili SON aktif uyenin kilitlenmesini engeller."""
    memberships = list(
        (
            await db.execute(
                select(FacilityMembership)
                .options(
                    selectinload(FacilityMembership.roles),
                    selectinload(FacilityMembership.user),
                )
                .where(FacilityMembership.facility_id == ctx.facility_id)
            )
        ).scalars()
    )
    other_admins = [
        m for m in memberships
        if m.tenant_user_id != user_id
        and m.user.status == UserStatus.active
        and TenantPermission.USER_MANAGE in m.permissions
    ]
    if not other_admins:
        raise ApiError(
            "LAST_ADMIN",
            "Tesisteki son sistem yoneticisi pasiflestirilemez veya yetkisi dusurulemez",
            409,
        )


def _user_out(membership: FacilityMembership) -> dict:
    user = membership.user
    return {
        "id": str(user.id),
        "name": user.name,
        "email": user.email,
        "status": user.status.value,
        "is_active": user.status == UserStatus.active,
        "roles": [
            {"id": str(r.id), "name": r.name, "display_name": r.display_name or r.name}
            for r in membership.roles
        ],
        "assigned_dock_ids": membership.assigned_dock_ids or None,
    }


def _role_out(role: Role) -> dict:
    return {
        "id": str(role.id),
        "name": role.name,
        "display_name": role.display_name or role.name,
        "description": role.description,
        "permissions": sorted(role.permissions_json or []),
        "is_default": role.is_default,
        "is_system": role.is_system,
        "is_active": role.is_active,
    }


def _audit(db, ctx, *, action, entity_type, entity_id, before=None, after=None):
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


# ---------- kullanicilar ----------


@router.get("/users")
async def list_users(
    ctx: FacilityContext = Depends(require_facility_permissions(TenantPermission.USER_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(FacilityMembership)
        .options(
            selectinload(FacilityMembership.roles),
            selectinload(FacilityMembership.user),
        )
        .where(FacilityMembership.facility_id == ctx.facility_id)
    )
    rows = [_user_out(m) for m in result.scalars()]
    return ok(sorted(rows, key=lambda u: u["name"]))


@router.post("/users")
async def create_user(
    body: UserCreate,
    ctx: FacilityContext = Depends(require_facility_permissions(TenantPermission.USER_MANAGE)),
    db: AsyncSession = Depends(get_db),
    control_db: AsyncSession = Depends(get_control_db),
):
    await ensure_unique_value(
        db, TenantUser, "email", str(body.email),
        code="DUPLICATE_EMAIL", message="Bu e-posta zaten bir kullaniciya ait",
    )
    roles = await _load_roles(db, ctx, body.role_ids)
    if body.assigned_dock_ids:
        await load_scoped_refs(
            db, Dock, body.assigned_dock_ids, ctx.facility_id, "assigned_dock_ids"
        )

    # id ONCE uretilir: dizin kaydi kullanicidan once alinir ve ikisinin
    # ayni kimligi tasimasi gerekir (bkz. tenancy/directory.py).
    user_id = uuid.uuid4()
    user = TenantUser(
        id=user_id,
        tenant_id=ctx.tenant_id,
        name=body.name,
        email=str(body.email),
        password_hash=hash_password(body.temporary_password or DEFAULT_TEMP_PASSWORD),
        # Gecici parola: ilk giriste degistirme zorunlu (Sprint 9)
        must_change_password=True,
        status=UserStatus.active if body.is_active else UserStatus.inactive,
        default_facility_id=ctx.facility_id,
    )
    async with claim_email(
        control_db,
        principal_id=user_id,
        user_type="tenant",
        email=str(body.email),
        tenant_id=ctx.tenant_id,
    ) as claim:
        db.add(user)
        await db.flush()
        membership = FacilityMembership(
            tenant_user_id=user.id,
            tenant_id=ctx.tenant_id,
            facility_id=ctx.facility_id,
            roles=roles,
            assigned_dock_ids=(
                [str(d) for d in body.assigned_dock_ids] if body.assigned_dock_ids else None
            ),
        )
        db.add(membership)
        await db.flush()
        _audit(
            db, ctx,
            action="user.create", entity_type="tenant_user", entity_id=user.id,
            after={
                "email": user.email,
                "roles": [r.name for r in roles],
                "assigned_dock_ids": membership.assigned_dock_ids,
            },
        )
        await db.commit()
        claim.confirm()
    membership = await _membership_of(db, ctx, user.id)
    return ok(_user_out(membership))


@router.get("/users/{user_id}")
async def get_user(
    user_id: uuid.UUID,
    ctx: FacilityContext = Depends(require_facility_permissions(TenantPermission.USER_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    membership = await _membership_of(db, ctx, user_id)
    return ok(_user_out(membership))


@router.patch("/users/{user_id}")
async def patch_user(
    user_id: uuid.UUID,
    body: UserPatch,
    ctx: FacilityContext = Depends(require_facility_permissions(TenantPermission.USER_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    membership = await _membership_of(db, ctx, user_id)
    user = membership.user
    changes = body.model_dump(exclude_unset=True)
    before = _user_out(membership)

    # Son yonetici korumasi: pasiflestirme ya da user.manage kaybi
    if changes.get("is_active") is False:
        await _ensure_not_last_admin(db, ctx, user_id)
    if "role_ids" in changes:
        new_roles = await _load_roles(db, ctx, changes["role_ids"])
        new_perms = {p for r in new_roles for p in (r.permissions_json or [])}
        had_admin = TenantPermission.USER_MANAGE in membership.permissions
        if had_admin and TenantPermission.USER_MANAGE not in new_perms:
            await _ensure_not_last_admin(db, ctx, user_id)
        membership.roles = new_roles
    if "assigned_dock_ids" in changes:
        dock_ids = changes["assigned_dock_ids"]
        if dock_ids:
            await load_scoped_refs(db, Dock, dock_ids, ctx.facility_id, "assigned_dock_ids")
            membership.assigned_dock_ids = [str(d) for d in dock_ids]
        else:
            membership.assigned_dock_ids = None
    if "name" in changes:
        user.name = changes["name"]
    if "is_active" in changes:
        user.status = UserStatus.active if changes["is_active"] else UserStatus.inactive
        if not changes["is_active"]:
            await revoke_user_sessions(db, user_type="tenant", user_id=user.id)

    await db.flush()
    membership = await _membership_of(db, ctx, user_id)
    _audit(
        db, ctx,
        action="user.update", entity_type="tenant_user", entity_id=user.id,
        before=before, after=_user_out(membership),
    )
    await db.commit()
    membership = await _membership_of(db, ctx, user_id)
    return ok(_user_out(membership))


@router.delete("/users/{user_id}")
async def deactivate_user(
    user_id: uuid.UUID,
    ctx: FacilityContext = Depends(require_facility_permissions(TenantPermission.USER_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    membership = await _membership_of(db, ctx, user_id)
    await _ensure_not_last_admin(db, ctx, user_id)
    before = _user_out(membership)
    membership.user.status = UserStatus.inactive
    await revoke_user_sessions(db, user_type="tenant", user_id=user_id)
    _audit(
        db, ctx,
        action="user.deactivate", entity_type="tenant_user", entity_id=user_id,
        before=before, after={"status": "inactive"},
    )
    await db.commit()
    membership = await _membership_of(db, ctx, user_id)
    return ok(_user_out(membership))


@router.post("/users/{user_id}/reset-password")
async def reset_user_password(
    user_id: uuid.UUID,
    body: PasswordReset,
    ctx: FacilityContext = Depends(require_facility_permissions(TenantPermission.USER_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    membership = await _membership_of(db, ctx, user_id)
    membership.user.password_hash = hash_password(body.new_password)
    membership.user.must_change_password = True  # reset = gecici parola
    await revoke_user_sessions(db, user_type="tenant", user_id=user_id)
    _audit(
        db, ctx,
        action="user.reset_password", entity_type="tenant_user", entity_id=user_id,
        after={"email": membership.user.email},
    )
    await db.commit()
    return ok({"reset": True})


# ---------- roller ----------


@router.get("/roles")
async def list_roles(
    ctx: FacilityContext = Depends(require_facility_permissions(TenantPermission.USER_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Role)
        .where(
            Role.tenant_id == ctx.tenant_id,
            or_(Role.facility_id == ctx.facility_id, Role.facility_id.is_(None)),
        )
        .order_by(Role.name)
    )
    return ok([_role_out(r) for r in result.scalars()])


@router.post("/roles")
async def create_role(
    body: RoleCreate,
    ctx: FacilityContext = Depends(require_facility_permissions(TenantPermission.USER_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    _validate_permission_codes(body.permission_codes)
    existing = (
        await db.execute(
            select(Role.id).where(
                Role.tenant_id == ctx.tenant_id,
                Role.facility_id == ctx.facility_id,
                Role.name == body.name,
            )
        )
    ).first()
    if existing:
        raise ApiError("DUPLICATE_NAME", "Bu rol adi zaten kullaniliyor", 409)

    role = Role(
        tenant_id=ctx.tenant_id,
        facility_id=ctx.facility_id,
        name=body.name,
        display_name=body.display_name,
        description=body.description,
        # Bagimliliklar backend'de tamamlanir: UI'dan 'ticket.create' tek
        # basina gelse bile rol 'ticket.view' olmadan kaydedilmez.
        permissions_json=expand_tenant_permissions(body.permission_codes),
        is_active=body.is_active,
    )
    db.add(role)
    await db.flush()
    _audit(
        db, ctx,
        action="role.create", entity_type="role", entity_id=role.id,
        after=_role_out(role),
    )
    await db.commit()
    await db.refresh(role)
    return ok(_role_out(role))


@router.get("/roles/{role_id}")
async def get_role(
    role_id: uuid.UUID,
    ctx: FacilityContext = Depends(require_facility_permissions(TenantPermission.USER_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    role = await _get_role(db, ctx, role_id)
    return ok(_role_out(role))


async def _get_role(db: AsyncSession, ctx: FacilityContext, role_id: uuid.UUID) -> Role:
    role = (
        await db.execute(
            select(Role).where(
                Role.id == role_id,
                Role.tenant_id == ctx.tenant_id,
                or_(Role.facility_id == ctx.facility_id, Role.facility_id.is_(None)),
            )
        )
    ).scalar_one_or_none()
    if role is None:
        raise NotFoundError("Rol bulunamadi")
    return role


@router.patch("/roles/{role_id}")
async def patch_role(
    role_id: uuid.UUID,
    body: RolePatch,
    ctx: FacilityContext = Depends(require_facility_permissions(TenantPermission.USER_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    role = await _get_role(db, ctx, role_id)
    changes = body.model_dump(exclude_unset=True)
    before = _role_out(role)

    if role.is_system:
        # System rollerde izin seti ve aktiflik KILITLI (karar).
        locked = set(changes) & {"permission_codes", "is_active", "name"}
        if locked:
            raise ApiError(
                "SYSTEM_ROLE_LOCKED",
                "Sistem rolunde ad/izin/aktiflik degistirilemez; "
                "yalnizca gorunen ad ve aciklama duzenlenebilir",
                409,
            )
    if "permission_codes" in changes:
        _validate_permission_codes(changes["permission_codes"])
        role.permissions_json = expand_tenant_permissions(changes.pop("permission_codes"))
    for key in ("name", "display_name", "description", "is_active"):
        if key in changes:
            setattr(role, key, changes[key])

    _audit(
        db, ctx,
        action="role.update", entity_type="role", entity_id=role.id,
        before=before, after=_role_out(role),
    )
    await db.commit()
    await db.refresh(role)
    return ok(_role_out(role))


@router.delete("/roles/{role_id}")
async def deactivate_role(
    role_id: uuid.UUID,
    ctx: FacilityContext = Depends(require_facility_permissions(TenantPermission.USER_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    role = await _get_role(db, ctx, role_id)
    if role.is_system:
        raise ApiError("SYSTEM_ROLE_LOCKED", "Sistem rolleri silinemez/pasiflestirilemez", 409)
    before = _role_out(role)
    role.is_active = False
    _audit(
        db, ctx,
        action="role.deactivate", entity_type="role", entity_id=role.id,
        before=before, after=_role_out(role),
    )
    await db.commit()
    return ok(_role_out(role))


@router.get("/permission-catalog")
async def permission_catalog(
    ctx: FacilityContext = Depends(require_facility_permissions(TenantPermission.USER_MANAGE)),
):
    """Rol editorunun izin sozlugu — yalnizca tenant izinleri (platform.* asla)."""
    return ok({"permissions": TenantPermission.ALL})
