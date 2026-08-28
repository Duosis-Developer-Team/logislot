"""Platform (vendor) yonetim endpointleri.

ILKE: Platform katmani operasyonel/PII detay dondurmez; yalnizca agregat.
"""

import re
import uuid
from datetime import date, datetime

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, EmailStr, Field, field_validator
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import Identity, require_platform_permissions
from app.core.config import get_settings
from app.core.csvutils import csv_response
from app.core.db import get_db, location_for_tenant, session_scope
from app.core.enums import (
    ActorType,
    AppointmentStatus,
    FacilityStatus,
    PlanScope,
    PlanStatus,
    TenantStatus,
)
from app.core.errors import ApiError, NotFoundError
from app.core.permissions import PlatformPermission
from app.core.plan_limits import (
    PLAN_LIMIT_DIMENSIONS,
    limit_of,
    normalize_limits,
)
from app.core.responses import ok
from app.models import Appointment, Facility, Plan, Tenant
from app.services.audit import record_audit
from app.services.onboarding import bootstrap_facility_defaults
from app.services.plan_warnings import evaluate_rate_card
from app.tenancy.directory import claim_email_once, tenant_for_email
from app.tenancy.fanout import (
    facilities_by_tenant,
    facility_of,
    gather_by_tenant,
    locate_facility,
    usage_snapshot,
)
from app.tenancy.provisioning import (
    deprovision_tenant,
    location_of,
    provision_tenant,
)

router = APIRouter(prefix="/platform", tags=["platform"])

#: PATCH'te "alan gonderilmedi" ile "null gonderildi"yi ayirmak icin sentinel.
_UNSET = object()


# ---------- semalar ----------


#: Markali alan adi icin kabul edilen bicim: yalnizca hostname.
#: Yanlis girilen bir deger kullaniciyi olmayan bir adrese yonlendirir, bu
#: yuzden sema/port/yol temizlenir ve bicim dogrulanir.
_HOST_RE = re.compile(r"^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$")


def _normalize_host(value: str | None) -> str | None:
    if value is None:
        return None
    host = value.strip().lower()
    if not host:
        return None  # bos birakmak "markali alan adi yok" demektir
    host = host.split("://", 1)[-1].split("/", 1)[0].split(":", 1)[0]
    if not _HOST_RE.match(host):
        raise ValueError(
            "Gecerli bir alan adi girin (orn. cknb.logislot.io); sema, port ve yol yazmayin"
        )
    return host


class TenantCreate(BaseModel):
    """Musteri hesabi = tenant + (otomatik) tesis.

    Urun karari: 1 tenant = 1 tesis. Tesis ayri bir adim degildir; bu
    istekle birlikte ayni transaction'da acilir (istege bagli bootstrap
    konfigurasyonu ve ilk yonetici hesabiyla).
    """

    commercial_name: str = Field(min_length=1)
    display_name: str = Field(min_length=1)
    slug: str = Field(min_length=1, max_length=100)
    status: TenantStatus = TenantStatus.trial
    primary_contact_name: str | None = None
    primary_contact_email: str | None = None
    primary_contact_phone: str | None = None
    default_timezone: str = "Europe/Istanbul"
    notes: str | None = None
    #: Tenant'a ozel markali alan adlari. BOS BIRAKILABILIR; doluysa kullanici
    #: genel alan adindan giris yaptiginda buraya devredilir. Kayit tek basina
    #: yetmez: alan adinin DNS'i ve ingress girdisi de acilmis olmalidir.
    admin_host: str | None = Field(default=None, max_length=255)
    supplier_host: str | None = Field(default=None, max_length=255)
    # --- operasyonel kapsam (tesis) ---
    address: str | None = None
    #: Varsayilan konfigurasyonu (arac/urun kategorisi, Rampa 1, sistem
    #: rolleri) otomatik kur.
    bootstrap_defaults: bool = True
    #: Ayni istekte ilk yonetici hesabi; gecici parola yanitta BIR kez doner.
    initial_admin: "InitialAdmin | None" = None
    plan_override_id: uuid.UUID | None = None

    @field_validator("admin_host", "supplier_host")
    @classmethod
    def _hosts(cls, value: str | None) -> str | None:
        return _normalize_host(value)


class TenantPatch(BaseModel):
    display_name: str | None = None
    status: TenantStatus | None = None
    primary_contact_name: str | None = None
    primary_contact_email: str | None = None
    primary_contact_phone: str | None = None
    assigned_plan_id: uuid.UUID | None = None
    notes: str | None = None
    #: Tenant'a ozel markali alan adlari. BOS BIRAKILABILIR; doluysa kullanici
    #: genel alan adindan giris yaptiginda buraya devredilir. Kayit tek basina
    #: yetmez: alan adinin DNS'i ve ingress girdisi de acilmis olmalidir.
    admin_host: str | None = Field(default=None, max_length=255)
    supplier_host: str | None = Field(default=None, max_length=255)
    # Tesis alanlari — tenant=tesis oldugu icin ayni formdan guncellenir.
    address: str | None = None
    default_timezone: str | None = None

    @field_validator("admin_host", "supplier_host")
    @classmethod
    def _hosts(cls, value: str | None) -> str | None:
        return _normalize_host(value)


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
    #: Dinamik kotalar (bkz. app/core/plan_limits.py). Deger yok = sinirsiz.
    limits_json: dict | None = None
    status: PlanStatus = PlanStatus.draft


class PlanAssignment(BaseModel):
    plan_id: uuid.UUID
    tenant_id: uuid.UUID | None = None
    facility_id: uuid.UUID | None = None


def _tenant_out(t: Tenant, facility: "Facility | None" = None) -> dict:
    """Musteri hesabi ciktisi; tenant=tesis oldugu icin tesis ozeti gomulur."""
    return {
        "id": str(t.id),
        "commercial_name": t.commercial_name,
        "display_name": t.display_name,
        "slug": t.slug,
        "status": t.status.value,
        "primary_contact_name": t.primary_contact_name,
        "primary_contact_email": t.primary_contact_email,
        "default_timezone": t.default_timezone,
        "admin_host": t.admin_host,
        "supplier_host": t.supplier_host,
        "assigned_plan_id": str(t.assigned_plan_id) if t.assigned_plan_id else None,
        "created_at": t.created_at.isoformat(),
        # Operasyonel kapsam (1-1). Eski kayitlarda tesis yoksa None kalir.
        "facility_id": str(facility.id) if facility else None,
        "address": facility.address if facility else None,
        "facility_status": facility.status.value if facility else None,
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
        "limits_json": normalize_limits(p.limits_json),
        "status": p.status.value,
    }


# ---------- tenants ----------


@router.get("/tenants")
async def list_tenants(
    identity: Identity = Depends(require_platform_permissions(PlatformPermission.TENANT_VIEW)),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Tenant).order_by(Tenant.display_name))
    tenants = list(result.scalars())
    by_tenant = await facilities_by_tenant([t.id for t in tenants])
    return ok([_tenant_out(t, by_tenant.get(t.id)) for t in tenants])


@router.post("/tenants")
async def create_tenant(
    body: TenantCreate,
    identity: Identity = Depends(require_platform_permissions(PlatformPermission.TENANT_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    """Musteri hesabi + KENDI VERI ALANI + tesis acar.

    Adimlar ayri transaction'lardadir cunku aradaki provisioning bir DDL
    islemidir ve geri alinamaz:
        1. control-plane: Tenant satiri
        2. provisioning:  tenant'in semasi + tablolari
        3. tenant semasi: Facility, varsayilanlar, ilk yonetici
    Herhangi bir adim patlarsa tenant 'failed' veri alaniyla gorunur kalir
    ve platform panelinden yeniden provision edilebilir; sessizce ORTAK
    tablolara yazilmaz.
    """
    payload = body.model_dump()
    # Tesis alanlari tenant kolonlari degil; ayirip Facility'ye gecirilir.
    address = payload.pop("address", None)
    bootstrap_defaults = payload.pop("bootstrap_defaults", True)
    initial_admin_spec = payload.pop("initial_admin", None)
    plan_override_id = payload.pop("plan_override_id", None)
    if plan_override_id is not None:
        await _get_assignable_plan(db, plan_override_id)

    # Ucuz on kontrol: ilk yonetici e-postasi zaten kullanimdaysa hicbir sey
    # yaratmadan 409 don (telafi yolunu bos yere calistirmamak icin).
    if initial_admin_spec is not None:
        taken = await tenant_for_email(db, "tenant", str(initial_admin_spec["email"]))
        if taken is not None:
            raise ApiError("DUPLICATE_EMAIL", "Bu e-posta zaten bir kullaniciya ait", 409)

    # 1) Control-plane: tenant kimligi
    tenant = Tenant(**payload)
    db.add(tenant)
    await db.commit()
    await db.refresh(tenant)

    try:
        return await _finish_tenant_creation(
            db, tenant, identity,
            address=address,
            bootstrap_defaults=bootstrap_defaults,
            initial_admin_spec=initial_admin_spec,
            plan_override_id=plan_override_id,
        )
    except BaseException:
        # ALL-OR-NOTHING: provisioning DDL oldugu icin tek transaction
        # mumkun degil; bunun yerine yaratilan her sey geri alinir.
        await deprovision_tenant(db, tenant.id)
        raise


async def _finish_tenant_creation(
    db: AsyncSession,
    tenant: Tenant,
    identity: Identity,
    *,
    address,
    bootstrap_defaults,
    initial_admin_spec,
    plan_override_id,
):
    # 2) Tenant'in kendi veri alani (sema + tablolar + alembic damgasi)
    datastore = await provision_tenant(db, tenant.id)

    # 3) Operasyonel veri artik tenant'in KENDI semasina yazilir
    async with session_scope(location_of(datastore)) as tdb:
        facility = Facility(
            tenant_id=tenant.id,
            name=tenant.display_name,
            address=address,
            timezone=tenant.default_timezone,
            plan_override_id=plan_override_id,
        )
        tdb.add(facility)
        await tdb.flush()

        bootstrap_summary = None
        if bootstrap_defaults:
            bootstrap_summary = await bootstrap_facility_defaults(tdb, facility)
        initial_admin_out = None
        if initial_admin_spec is not None:
            initial_admin_out = await _create_initial_admin(
                tdb, facility, InitialAdmin(**initial_admin_spec),
                actor_id=identity.id, control_db=db,
            )

        record_audit(
            tdb,
            actor_type=ActorType.platform_user,
            actor_id=identity.id,
            action="tenant.create",
            tenant_id=tenant.id,
            facility_id=facility.id,
            entity_type="tenant",
            entity_id=tenant.id,
            after={
                "slug": tenant.slug,
                "bootstrap": bootstrap_summary,
                "schema": datastore.schema_name,
            },
        )
        await tdb.commit()
        await tdb.refresh(facility)
        data = _tenant_out(tenant, facility)

    data["bootstrap"] = bootstrap_summary
    data["datastore"] = {"schema": datastore.schema_name, "status": datastore.status}
    # Gecici parola YALNIZCA bu yanitta gosterilir; sonradan okunamaz.
    data["initial_admin"] = initial_admin_out
    return ok(data)


@router.post("/tenants/{tenant_id}/reprovision")
async def reprovision_tenant(
    tenant_id: uuid.UUID,
    identity: Identity = Depends(require_platform_permissions(PlatformPermission.TENANT_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    """Yarida kalmis/basarisiz bir veri alanini yeniden acar (idempotent)."""
    tenant = (
        await db.execute(select(Tenant).where(Tenant.id == tenant_id))
    ).scalar_one_or_none()
    if tenant is None:
        raise NotFoundError("Musteri bulunamadi")
    datastore = await provision_tenant(db, tenant_id)
    return ok({"schema": datastore.schema_name, "status": datastore.status})


@router.get("/tenants/{tenant_id}")
async def get_tenant(
    tenant_id: uuid.UUID,
    identity: Identity = Depends(require_platform_permissions(PlatformPermission.TENANT_VIEW)),
    db: AsyncSession = Depends(get_db),
):
    tenant = (await db.execute(select(Tenant).where(Tenant.id == tenant_id))).scalar_one_or_none()
    if tenant is None:
        raise NotFoundError("Tenant bulunamadi")
    facility = await facility_of(tenant_id)
    data = _tenant_out(tenant, facility)
    # Geriye uyumluluk: eski istemciler `facilities` listesini bekliyor olabilir.
    data["facilities"] = [_facility_out(facility)] if facility else []
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
    address = changes.pop("address", None) if "address" in changes else _UNSET

    # Plan bu uctan da degistirilebiliyor; ozel atama ucuyla AYNI kurallardan
    # gecmeli. Aksi halde hem "yalnizca aktif plan atanir" hem de max_tenants
    # kotasi PATCH ile sessizce asilir.
    if changes.get("assigned_plan_id") is not None:
        plan = await _get_assignable_plan(db, changes["assigned_plan_id"])
        await _assert_tenant_quota(db, plan, tenant_id)

    for key, value in changes.items():
        setattr(tenant, key, value)

    # tenant=tesis: ad/saat dilimi/durum ve adres tek kayitmis gibi senkronlanir.
    # Tesis tenant'in KENDI semasinda oldugundan ayri bir oturumda guncellenir.
    facility = None
    location = await location_for_tenant(tenant_id)
    async with session_scope(location) as tdb:
        facility = (
            await tdb.execute(select(Facility).where(Facility.tenant_id == tenant_id))
        ).scalar_one_or_none()
        if facility is not None:
            if "display_name" in changes:
                facility.name = tenant.display_name
            if "default_timezone" in changes:
                facility.timezone = tenant.default_timezone
            if address is not _UNSET:
                facility.address = address
            if "status" in changes:
                facility.status = (
                    FacilityStatus.inactive
                    if tenant.status in (TenantStatus.suspended, TenantStatus.archived)
                    else FacilityStatus.active
                )
            await tdb.commit()
            await tdb.refresh(facility)

    record_audit(
        db,
        actor_type=ActorType.platform_user,
        actor_id=identity.id,
        action="tenant.update",
        tenant_id=tenant.id,
        facility_id=facility.id if facility else None,
        entity_type="tenant",
        entity_id=tenant.id,
        after={k: str(v) for k, v in changes.items()},
    )
    await db.commit()
    await db.refresh(tenant)
    # facility ARTIK tenant oturumuna ait; control oturumuyla refresh edilemez
    # (zaten kendi oturumunda tazelendi).
    return ok(_tenant_out(tenant, facility))


# ---------- facilities ----------


@router.get("/facilities")
async def list_facilities(
    identity: Identity = Depends(require_platform_permissions(PlatformPermission.FACILITY_VIEW)),
    db: AsyncSession = Depends(get_db),
):
    tenant_ids = list((await db.execute(select(Tenant.id))).scalars())
    by_tenant = await facilities_by_tenant(tenant_ids)
    rows = sorted(by_tenant.values(), key=lambda f: f.name)
    return ok([_facility_out(f) for f in rows])


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
    # Urun karari: 1 tenant = 1 tesis. Tesis artik tenant ile birlikte acilir;
    # bu uc yalnizca tesisi olmayan ESKI kayitlar icin telafi yolu olarak kalir.
    existing = await facility_of(tenant_id)
    if existing is not None:
        raise ApiError(
            "TENANT_FACILITY_EXISTS",
            "Bir musteri hesabinin tek operasyonel kapsami olur; mevcut kaydi guncelleyin",
            409,
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
    db: AsyncSession,
    facility: Facility,
    spec: InitialAdmin,
    *,
    actor_id: uuid.UUID,
    control_db: AsyncSession,
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
    # Dizin kaydi kullanicidan ONCE alinir: global e-posta benzersizligini
    # o saglar ve login yonlendirmesi ona bakar.
    user_id = uuid.uuid4()
    await claim_email_once(
        control_db,
        principal_id=user_id,
        user_type="tenant",
        email=str(spec.email),
        tenant_id=facility.tenant_id,
    )
    user = TenantUser(
        id=user_id,
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
    found = await locate_facility(facility_id)
    if found is None:
        raise NotFoundError("Tesis bulunamadi")
    tenant_id, _ = found
    changes = body.model_dump(exclude_unset=True)
    # Yazma, tesisin yasadigi tenant semasinda yapilir.
    async with session_scope(await location_for_tenant(tenant_id)) as tdb:
        facility = (
            await tdb.execute(select(Facility).where(Facility.id == facility_id))
        ).scalar_one_or_none()
        if facility is None:
            raise NotFoundError("Tesis bulunamadi")
        for key, value in changes.items():
            setattr(facility, key, value)
        record_audit(
            tdb,
            actor_type=ActorType.platform_user,
            actor_id=identity.id,
            action="facility.update",
            tenant_id=facility.tenant_id,
            facility_id=facility.id,
            entity_type="facility",
            entity_id=facility.id,
            after={k: str(v) for k, v in changes.items()},
        )
        await tdb.commit()
        await tdb.refresh(facility)
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

    today = datetime.now(UTC).date()
    date_to = date_to or today
    date_from = date_from or (date_to - timedelta(days=29))
    range_start = datetime.combine(date_from, datetime.min.time(), UTC)
    range_end = datetime.combine(date_to + timedelta(days=1), datetime.min.time(), UTC)

    tenants = list((await db.execute(select(Tenant))).scalars())
    plans = {p.id: p.name for p in (await db.execute(select(Plan))).scalars()}

    # Operasyonel veri her tenant'in kendi semasinda; tek SELECT yerine
    # tenant'lar arasi toplama yapilir (ciktilarin sekli aynidir).
    snapshot = await usage_snapshot(
        [t.id for t in tenants], range_start=range_start, range_end=range_end
    )
    facilities = snapshot["facilities"]
    appointments = snapshot["appointments"]
    docks_by_facility = snapshot["docks_by_facility"]
    suppliers_by_facility = snapshot["suppliers_by_facility"]
    users_by_facility = snapshot["users_by_facility"]
    # Karar suresi (SLA) — audit izlerinden, tenant bazinda ortalama
    audit_rows = snapshot["audit_rows"]
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
    payload = body.model_dump()
    payload["limits_json"] = normalize_limits(payload.get("limits_json"))
    plan = Plan(**payload)
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
    limits_json: dict | None = None
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
    if "limits_json" in changes:
        changes["limits_json"] = normalize_limits(changes["limits_json"])
    before = {
        "name": plan.name,
        "status": plan.status.value,
        "limits": normalize_limits(plan.limits_json),
    }
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
        after={
            "name": plan.name,
            "status": plan.status.value,
            "limits": normalize_limits(plan.limits_json),
        },
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


@router.get("/plan-limit-dimensions")
async def plan_limit_dimensions(
    identity: Identity = Depends(require_platform_permissions(PlatformPermission.PLAN_VIEW)),
):
    """Platform UI'in limit editorunu dinamik kurmasi icin boyut katalogu."""
    return ok({"dimensions": PLAN_LIMIT_DIMENSIONS})


async def _assert_tenant_quota(db: AsyncSession, plan: Plan, tenant_id: uuid.UUID) -> None:
    """max_tenants limiti: plana atanabilecek musteri hesabi sayisi.

    Zaten bu plana atanmis bir tenant tekrar atanirsa sayim artmaz.
    """
    max_tenants = limit_of(plan.limits_json, "max_tenants")
    if max_tenants is None:
        return
    current = (
        await db.execute(
            select(func.count())
            .select_from(Tenant)
            .where(Tenant.assigned_plan_id == plan.id, Tenant.id != tenant_id)
        )
    ).scalar_one()
    if current >= max_tenants:
        raise ApiError(
            "PLAN_TENANT_LIMIT_REACHED",
            f"'{plan.name}' plani en fazla {max_tenants} musteri hesabi destekler "
            f"(su an {current}). Limiti yukseltin veya baska plan secin.",
            409,
        )


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
    await _assert_tenant_quota(db, plan, tenant_id)
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
    found = await locate_facility(facility_id)
    if found is None:
        raise NotFoundError("Tesis bulunamadi")
    tenant_id, _ = found
    plan = await _get_assignable_plan(db, body.plan_id)
    async with session_scope(await location_for_tenant(tenant_id)) as tdb:
        facility = (
            await tdb.execute(select(Facility).where(Facility.id == facility_id))
        ).scalar_one_or_none()
        if facility is None:
            raise NotFoundError("Tesis bulunamadi")
        before = str(facility.plan_override_id) if facility.plan_override_id else None
        facility.plan_override_id = plan.id
        record_audit(
            tdb,
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
        await tdb.commit()
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


    today = datetime.now(UTC).date()
    date_to = date_to or today
    date_from = date_from or (date_to - timedelta(days=29))
    range_start = datetime.combine(date_from, datetime.min.time(), UTC)
    range_end = datetime.combine(date_to + timedelta(days=1), datetime.min.time(), UTC)

    tenants = list((await db.execute(select(Tenant))).scalars())
    plans = {p.id: p for p in (await db.execute(select(Plan))).scalars()}

    snapshot = await usage_snapshot(
        [t.id for t in tenants], range_start=range_start, range_end=range_end
    )
    facilities = snapshot["facilities"]
    docks = snapshot["docks_by_facility"]
    suppliers = snapshot["suppliers_by_facility"]
    users = snapshot["users_by_facility"]
    # (facility_id, status, adet) — snapshot ham randevulardan turetilir
    _counter: dict = {}
    for _id, fid, _tid, status, _created in snapshot["appointments"]:
        _counter[(fid, status)] = _counter.get((fid, status), 0) + 1
    appt_rows = [(fid, status, n) for (fid, status), n in _counter.items()]

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
    envelope = await usage(identity=identity, db=db, date_from=date_from, date_to=date_to)
    data = envelope["data"]

    rows: list[list] = [
        ["LogiSlot Platform Kullanim"],
        ["Aralik", data["range"]["date_from"], data["range"]["date_to"]],
        [],
        ["TENANT KULLANIMI"],
        ["tenant", "durum", "plan", "tesis", "olusturulan", "tamamlanan",
         "aktif_rampa", "aktif_tedarikci", "sla_dk"],
        *[
            [row["tenant_name"], row["status"], row["assigned_plan"] or "",
             row["facility_count"], row["appointments_created"],
             row["appointments_completed"], row["active_docks"],
             row["active_suppliers"], row["approval_sla_avg_minutes"] or ""]
            for row in data["tenant_usage"]
        ],
        [],
        ["TESIS KULLANIMI"],
        ["tesis", "tenant", "durum", "plan", "override", "olusturulan",
         "tamamlanan", "aktif_rampa", "aktif_tedarikci", "aktif_kullanici"],
        *[
            [row["facility_name"], row["tenant_name"] or "", row["status"],
             row["assigned_plan"] or "", "evet" if row["plan_is_override"] else "hayir",
             row["appointments_created"], row["appointments_completed"],
             row["active_docks"], row["active_suppliers"], row["active_users"]]
            for row in data["facility_usage"]
        ],
    ]
    return csv_response(
        f'logislot_usage_{data["range"]["date_from"]}_{data["range"]["date_to"]}.csv',
        rows,
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

    # Bu sayimlarin hepsi TENANT-PLANE tablolarindan gelir; her tenant'in
    # kendi semasinda sayilip toplanir.
    tenant_ids = list((await db.execute(select(Tenant.id))).scalars())

    async def health_counts(tdb: AsyncSession, _tid) -> dict:
        async def n(query) -> int:
            return int((await tdb.execute(query)).scalar_one())

        return {
            "failed_emails": await n(
                select(func.count(EmailLog.id)).where(EmailLog.status == "failed")
            ),
            "due_retries": await n(
                select(func.count(EmailLog.id)).where(
                    EmailLog.status.in_(["failed", "queued"]),
                    EmailLog.retry_count < EmailLog.max_attempts,
                    EmailLog.next_retry_at.is_not(None),
                    EmailLog.next_retry_at <= now,
                )
            ),
            "unread_critical": await n(
                select(func.count(Notification.id)).where(
                    Notification.read_at.is_(None), Notification.severity == "error"
                )
            ),
            "pending": await n(
                select(func.count(Appointment.id)).where(
                    Appointment.status == AppointmentStatus.pending
                )
            ),
            "revision_pending": await n(
                select(func.count(Appointment.id)).where(
                    Appointment.status == AppointmentStatus.revision_pending
                )
            ),
            "active_facilities": await n(
                select(func.count(Facility.id)).where(
                    Facility.status == FacilityStatus.active
                )
            ),
        }

    parts = (await gather_by_tenant(tenant_ids, health_counts)).values()

    def total(key: str) -> int:
        return sum(int(p.get(key, 0)) for p in parts)

    failed_emails = total("failed_emails")
    due_retries = total("due_retries")
    unread_critical = total("unread_critical")
    pending = total("pending")
    revision_pending = total("revision_pending")
    tenants_count = len(tenant_ids)
    active_facilities = total("active_facilities")
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
