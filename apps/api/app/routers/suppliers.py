"""Tedarikci CRUD + portal hesabi yonetimi.

Kurallar:
- code facility icinde unique (409 DUPLICATE_CODE)
- portal hesabi e-postasi global unique (409 DUPLICATE_EMAIL — login e-postasi)
- izinli kategoriler ayni facility'nin AKTIF urun kategorileri olmali
- DELETE = soft delete (status=inactive); pasif tedarikci login olamaz ve
  randevu olusturamaz (auth katmaninda da dogrulanir)
"""

import uuid

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.db import get_control_db, get_db
from app.core.enums import ActorType, SupplierStatus, UserStatus
from app.core.errors import ApiError
from app.core.permissions import TenantPermission
from app.core.ratelimit import enforce_rate_limit
from app.core.responses import ok
from app.core.security import hash_password
from app.models import Facility, ProductCategory, Supplier, SupplierUser
from app.schemas.catalog import SupplierOut
from app.schemas.config import (
    SupplierAccountCreate,
    SupplierCreate,
    SupplierPasswordReset,
    SupplierPatch,
    SupplierUserStatus,
)
from app.services.audit import record_audit
from app.services.auth_sessions import revoke_user_sessions
from app.services.config import (
    ensure_unique_value,
    get_scoped_or_404,
    load_scoped_refs,
    snapshot,
)
from app.services.notification_preferences import (
    SUPPLIER_EMAIL_EVENT_KEYS,
    resolve_supplier_policy,
)
from app.tenancy.deps import FacilityContext, require_facility_permissions
from app.tenancy.directory import claim_email_once

router = APIRouter(prefix="/facilities/{facility_id}", tags=["suppliers"])

SUPPLIER_AUDIT_FIELDS = [
    "company_name",
    "code",
    "contact_name",
    "contact_email",
    "contact_phone",
    "status",
    "auto_approval_enabled",
    "cargo_enabled",
    "min_block_minutes",
    "max_block_minutes",
    "weekly_quota",
    "monthly_quota",
    "notes",
]

_SUPPLIER_RELATIONS = (
    selectinload(Supplier.allowed_product_categories),
    selectinload(Supplier.users),
)

#: Demo ortami varsayilan parolasi. PRODUCTION NOTU: gercek ortamda rastgele
#: gecici parola uretilip e-posta ile iletilmeli; sabit varsayilan KULLANILMAMALI.
DEFAULT_ACCOUNT_PASSWORD = "Demo123!"


class SupplierNotificationPolicyPatch(BaseModel):
    in_app_enabled: bool | None = None
    email_enabled: bool | None = None
    email_events: dict[str, bool] | None = None


def _policy_out(facility: Facility) -> dict:
    """Cozulmus politika; is_customized=false ise varsayilan (hepsi acik) gecerlidir."""
    return {
        **resolve_supplier_policy(facility),
        "is_customized": bool(facility.supplier_notification_policy_json),
    }


def _supplier_out(supplier: Supplier) -> dict:
    data = SupplierOut.model_validate(supplier)
    data.is_active = supplier.status == SupplierStatus.active
    data.allowed_product_category_ids = [c.id for c in supplier.allowed_product_categories]
    account = supplier.users[0] if supplier.users else None
    data.account_email = account.email if account else None
    data.account_active = (account.status == UserStatus.active) if account else None
    return data.model_dump(mode="json")


def _supplier_snapshot(supplier: Supplier) -> dict:
    data = snapshot(supplier, SUPPLIER_AUDIT_FIELDS)
    data["allowed_product_category_ids"] = [
        str(c.id) for c in supplier.allowed_product_categories
    ]
    return data


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


async def _load_supplier(
    db: AsyncSession, ctx: FacilityContext, supplier_id: uuid.UUID
) -> Supplier:
    return await get_scoped_or_404(
        db, Supplier, supplier_id, ctx.facility_id, options=_SUPPLIER_RELATIONS
    )


async def _create_account(
    db: AsyncSession,
    ctx: FacilityContext,
    supplier: Supplier,
    email: str,
    password: str,
    control_db: AsyncSession,
) -> SupplierUser:
    await ensure_unique_value(
        db, SupplierUser, "email", email,
        code="DUPLICATE_EMAIL",
        message="Bu e-posta baska bir portal hesabinda kullaniliyor",
    )
    account_id = uuid.uuid4()
    await claim_email_once(
        control_db,
        principal_id=account_id,
        user_type="supplier",
        email=email,
        tenant_id=ctx.tenant_id,
    )
    account = SupplierUser(
        id=account_id,
        supplier_id=supplier.id,
        name=f"{supplier.company_name} Portal",
        email=email,
        password_hash=hash_password(password),
        # Gecici parola: ilk giriste degistirme zorunlu (Sprint 9)
        must_change_password=True,
    )
    db.add(account)
    await db.flush()
    _audit(
        db, ctx,
        action="supplier_user.create", entity_type="supplier_user",
        entity_id=account.id, after={"email": email, "supplier_id": str(supplier.id)},
    )
    return account


@router.get("/suppliers")
async def list_suppliers(
    ctx: FacilityContext = Depends(
        require_facility_permissions(TenantPermission.SUPPLIER_MANAGE)
    ),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Supplier)
        .options(*_SUPPLIER_RELATIONS)
        .where(Supplier.facility_id == ctx.facility_id)
        .order_by(Supplier.company_name)
    )
    return ok([_supplier_out(s) for s in result.scalars()])


@router.post("/suppliers")
async def create_supplier(
    body: SupplierCreate,
    ctx: FacilityContext = Depends(
        require_facility_permissions(TenantPermission.SUPPLIER_MANAGE)
    ),
    db: AsyncSession = Depends(get_db),
    control_db: AsyncSession = Depends(get_control_db),
):
    await ensure_unique_value(
        db, Supplier, "code", body.code,
        facility_id=ctx.facility_id,
        code="DUPLICATE_CODE",
        message="Bu tedarikci kodu ayni tesiste zaten kullaniliyor",
    )
    categories = await load_scoped_refs(
        db, ProductCategory, body.allowed_product_category_ids, ctx.facility_id,
        "allowed_product_categories",
    )
    supplier = Supplier(
        tenant_id=ctx.tenant_id,
        facility_id=ctx.facility_id,
        company_name=body.company_name,
        code=body.code,
        category_label=body.category_label,
        contact_name=body.contact_name,
        contact_email=body.contact_email,
        contact_phone=body.contact_phone,
        status=SupplierStatus.active if body.is_active else SupplierStatus.inactive,
        auto_approval_enabled=body.auto_approval_enabled,
        cargo_enabled=body.cargo_enabled,
        min_block_minutes=body.min_block_minutes,
        max_block_minutes=body.max_block_minutes,
        weekly_quota=body.weekly_quota,
        monthly_quota=body.monthly_quota,
        notes=body.notes,
        allowed_product_categories=categories,
    )
    db.add(supplier)
    await db.flush()

    if body.create_account:
        account_email = body.account_email or body.contact_email
        if account_email is None:
            raise ApiError(
                "VALIDATION_ERROR",
                "Portal hesabi icin account_email veya contact_email gerekli",
                422,
            )
        await _create_account(
            db, ctx, supplier, str(account_email),
            body.account_password or DEFAULT_ACCOUNT_PASSWORD,
            control_db,
        )

    _audit(
        db, ctx,
        action="supplier.create", entity_type="supplier",
        entity_id=supplier.id, after=_supplier_snapshot(supplier),
    )
    await db.commit()
    supplier = await _load_supplier(db, ctx, supplier.id)
    return ok(_supplier_out(supplier))


@router.get("/suppliers/{supplier_id}")
async def get_supplier(
    supplier_id: uuid.UUID,
    ctx: FacilityContext = Depends(
        require_facility_permissions(TenantPermission.SUPPLIER_MANAGE)
    ),
    db: AsyncSession = Depends(get_db),
):
    supplier = await _load_supplier(db, ctx, supplier_id)
    return ok(_supplier_out(supplier))


@router.patch("/suppliers/{supplier_id}")
async def patch_supplier(
    supplier_id: uuid.UUID,
    body: SupplierPatch,
    ctx: FacilityContext = Depends(
        require_facility_permissions(TenantPermission.SUPPLIER_MANAGE)
    ),
    db: AsyncSession = Depends(get_db),
):
    supplier = await _load_supplier(db, ctx, supplier_id)
    changes = body.model_dump(exclude_unset=True)

    if "code" in changes and changes["code"] != supplier.code:
        await ensure_unique_value(
            db, Supplier, "code", changes["code"],
            facility_id=ctx.facility_id, exclude_id=supplier.id,
            code="DUPLICATE_CODE",
            message="Bu tedarikci kodu ayni tesiste zaten kullaniliyor",
        )

    # min/max tutarliligi sonuc durum uzerinden dogrulanir
    final_min = changes.get("min_block_minutes", supplier.min_block_minutes)
    final_max = changes.get("max_block_minutes", supplier.max_block_minutes)
    if final_min is not None and final_max is not None and final_max < final_min:
        raise ApiError(
            "VALIDATION_ERROR", "max_block_minutes, min_block_minutes'ten kucuk olamaz", 422
        )

    before = _supplier_snapshot(supplier)
    if "allowed_product_category_ids" in changes:
        supplier.allowed_product_categories = await load_scoped_refs(
            db, ProductCategory, changes.pop("allowed_product_category_ids"),
            ctx.facility_id, "allowed_product_categories",
        )
    if "is_active" in changes:
        supplier.status = (
            SupplierStatus.active if changes.pop("is_active") else SupplierStatus.inactive
        )
    for key, value in changes.items():
        setattr(supplier, key, value)

    _audit(
        db, ctx,
        action="supplier.update", entity_type="supplier",
        entity_id=supplier.id, before=before, after=_supplier_snapshot(supplier),
    )
    await db.commit()
    supplier = await _load_supplier(db, ctx, supplier_id)
    return ok(_supplier_out(supplier))


@router.delete("/suppliers/{supplier_id}")
async def deactivate_supplier(
    supplier_id: uuid.UUID,
    ctx: FacilityContext = Depends(
        require_facility_permissions(TenantPermission.SUPPLIER_MANAGE)
    ),
    db: AsyncSession = Depends(get_db),
):
    supplier = await _load_supplier(db, ctx, supplier_id)
    before = _supplier_snapshot(supplier)
    supplier.status = SupplierStatus.inactive
    # Firma pasiflesince bagli portal hesabinin oturumlari da dusurulur
    for account in supplier.users:
        await revoke_user_sessions(db, user_type="supplier", user_id=account.id)
    _audit(
        db, ctx,
        action="supplier.deactivate", entity_type="supplier",
        entity_id=supplier.id, before=before, after=_supplier_snapshot(supplier),
    )
    await db.commit()
    supplier = await _load_supplier(db, ctx, supplier_id)
    return ok(_supplier_out(supplier))


# ---------- Portal hesabi yonetimi ----------


@router.post("/suppliers/{supplier_id}/users")
async def create_supplier_account(
    supplier_id: uuid.UUID,
    body: SupplierAccountCreate,
    ctx: FacilityContext = Depends(
        require_facility_permissions(TenantPermission.SUPPLIER_MANAGE)
    ),
    db: AsyncSession = Depends(get_db),
    control_db: AsyncSession = Depends(get_control_db),
):
    supplier = await _load_supplier(db, ctx, supplier_id)
    if supplier.users:
        raise ApiError("ACCOUNT_EXISTS", "Bu tedarikcinin zaten bir portal hesabi var", 409)
    await _create_account(db, ctx, supplier, str(body.email), body.password, control_db)
    await db.commit()
    supplier = await _load_supplier(db, ctx, supplier_id)
    return ok(_supplier_out(supplier))


@router.post("/suppliers/{supplier_id}/reset-password")
async def reset_supplier_password(
    supplier_id: uuid.UUID,
    body: SupplierPasswordReset,
    request: Request,
    ctx: FacilityContext = Depends(
        require_facility_permissions(TenantPermission.SUPPLIER_MANAGE)
    ),
    db: AsyncSession = Depends(get_db),
):
    enforce_rate_limit(request, "pw_reset", str(supplier_id), times=5, per_seconds=300)
    supplier = await _load_supplier(db, ctx, supplier_id)
    if not supplier.users:
        raise ApiError("ACCOUNT_NOT_FOUND", "Bu tedarikcinin portal hesabi yok", 404)
    account = supplier.users[0]
    account.password_hash = hash_password(body.new_password)
    account.must_change_password = True  # reset = gecici parola
    # Parola degisince mevcut refresh oturumlari dusurulur
    await revoke_user_sessions(db, user_type="supplier", user_id=account.id)
    _audit(
        db, ctx,
        action="supplier_user.reset_password", entity_type="supplier_user",
        entity_id=account.id, after={"email": account.email},
    )
    await db.commit()
    return ok({"reset": True, "email": account.email})


@router.patch("/suppliers/{supplier_id}/user-status")
async def set_supplier_account_status(
    supplier_id: uuid.UUID,
    body: SupplierUserStatus,
    ctx: FacilityContext = Depends(
        require_facility_permissions(TenantPermission.SUPPLIER_MANAGE)
    ),
    db: AsyncSession = Depends(get_db),
):
    supplier = await _load_supplier(db, ctx, supplier_id)
    if not supplier.users:
        raise ApiError("ACCOUNT_NOT_FOUND", "Bu tedarikcinin portal hesabi yok", 404)
    account = supplier.users[0]
    before = {"status": account.status.value}
    account.status = UserStatus.active if body.is_active else UserStatus.inactive
    if not body.is_active:
        await revoke_user_sessions(db, user_type="supplier", user_id=account.id)
    _audit(
        db, ctx,
        action="supplier_user.status", entity_type="supplier_user",
        entity_id=account.id, before=before, after={"status": account.status.value},
    )
    await db.commit()
    supplier = await _load_supplier(db, ctx, supplier_id)
    return ok(_supplier_out(supplier))


# ------------------------------------------------- tedarikci bildirim politikasi


@router.get("/supplier-notification-policy")
async def get_supplier_notification_policy(
    ctx: FacilityContext = Depends(
        require_facility_permissions(TenantPermission.SUPPLIER_MANAGE)
    ),
):
    """Tedarikcilere gidecek bildirim/e-posta politikasi (tesis geneli).

    Yalnizca yonetim gorur ve degistirir; tedarikcinin kendi panelinde bu
    tercihler YOKTUR (require_facility_permissions tenant kullanicisi zorunlu
    kildigi icin tedarikci bu uca hic ulasamaz).
    """
    return ok(_policy_out(ctx.facility))


@router.patch("/supplier-notification-policy")
async def patch_supplier_notification_policy(
    body: SupplierNotificationPolicyPatch,
    ctx: FacilityContext = Depends(
        require_facility_permissions(TenantPermission.SUPPLIER_MANAGE)
    ),
    db: AsyncSession = Depends(get_db),
):
    """Politikayi gunceller. Yalnizca bilinen anahtarlar saklanir.

    Kritik istisna: `appointment_revised` ve `appointment_dock_changed` PANEL
    bildirimleri politikadan bagimsiz olarak her zaman uretilir (servis
    katmaninda zorlanir) — saat/rampa degisikligi tedarikciden gizlenemez.
    """
    facility = await db.get(Facility, ctx.facility_id)
    assert facility is not None
    before = resolve_supplier_policy(facility)
    current = resolve_supplier_policy(facility)
    changes = body.model_dump(exclude_unset=True)
    if "in_app_enabled" in changes:
        current["in_app_enabled"] = changes["in_app_enabled"]
    if "email_enabled" in changes:
        current["email_enabled"] = changes["email_enabled"]
    if changes.get("email_events"):
        unknown = set(changes["email_events"]) - set(SUPPLIER_EMAIL_EVENT_KEYS)
        if unknown:
            raise ApiError(
                "INVALID_PREFERENCE_EVENT",
                f"Bilinmeyen event anahtarlari: {', '.join(sorted(unknown))}",
                422,
            )
        current["email_events"].update(changes["email_events"])
    facility.supplier_notification_policy_json = current
    _audit(
        db, ctx,
        action="supplier_notification_policy.update", entity_type="facility",
        entity_id=ctx.facility_id, before=before, after=current,
    )
    await db.commit()
    await db.refresh(facility)
    return ok(_policy_out(facility))
