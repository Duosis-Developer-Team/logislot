"""Islem suresi kurallari ve politikasi (yonetim).

Musteri karari (2026-11 toplantisi): sure sevkiyat tipi, miktar, arac tipi ve
urun kategorisine gore sistemce hesaplansin; kurallar konfigure edilebilir.
Algoritma: services/duration_rules.py (orneklerle: docs/SURE_HESAPLAMA.md).

Yazma islemleri kategori yonetimi yetkisi ister (blokaj suresi zaten kategori
ayarinin parcasidir). Senaryo degerlendirme randevu goruntuleme yetkisiyle
calisir: yonetim adina olusturma ekrani da sureyi buradan hesaplar.
"""

import uuid
from decimal import Decimal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.enums import ActorType, DurationCalcType, DurationMode, QuantityUnit
from app.core.errors import ApiError, NotFoundError
from app.core.permissions import TenantPermission
from app.core.responses import ok
from app.models import DurationRule, Facility, ProductCategory, VehicleCategory
from app.services.audit import record_audit
from app.services.duration_rules import (
    MAX_RULE_MINUTES,
    ROUNDING_CHOICES,
    estimate_with_rules,
    load_rules,
    resolve_duration_policy,
    shadowed_rules,
    sort_by_specificity,
    specificity,
)
from app.tenancy.deps import FacilityContext, require_facility_permissions

router = APIRouter(prefix="/facilities/{facility_id}", tags=["duration-rules"])

#: Senaryo tablosunda tek istekte degerlendirilebilecek en fazla satir.
MAX_SCENARIOS = 200


class DurationPolicyPatch(BaseModel):
    mode: DurationMode | None = None
    rounding_minutes: int | None = None

    @model_validator(mode="after")
    def check_rounding(self) -> "DurationPolicyPatch":
        if self.rounding_minutes is not None and self.rounding_minutes not in ROUNDING_CHOICES:
            raise ValueError(f"Yuvarlama su degerlerden biri olmali: {ROUNDING_CHOICES}")
        return self


class DurationRuleIn(BaseModel):
    name: str | None = Field(default=None, max_length=120)
    is_active: bool = True
    vehicle_category_id: uuid.UUID | None = None
    product_category_id: uuid.UUID | None = None
    quantity_unit: QuantityUnit | None = None
    min_quantity: int | None = Field(default=None, ge=0, le=1_000_000)
    max_quantity: int | None = Field(default=None, ge=0, le=1_000_000)
    calc_type: DurationCalcType = DurationCalcType.fixed
    fixed_minutes: int | None = Field(default=None, gt=0, le=MAX_RULE_MINUTES)
    base_minutes: int | None = Field(default=None, ge=0, le=MAX_RULE_MINUTES)
    per_unit_minutes: Decimal | None = Field(default=None, ge=0, le=600, decimal_places=2)
    min_minutes: int | None = Field(default=None, gt=0, le=MAX_RULE_MINUTES)
    max_minutes: int | None = Field(default=None, gt=0, le=MAX_RULE_MINUTES)

    @model_validator(mode="after")
    def check_consistency(self) -> "DurationRuleIn":
        if self.calc_type == DurationCalcType.fixed and self.fixed_minutes is None:
            raise ValueError("Sabit sure kuralinda dakika zorunlu")
        if self.calc_type == DurationCalcType.per_unit and self.per_unit_minutes is None:
            raise ValueError("Birim basina kuralda birim basina dakika zorunlu")
        if (
            self.min_quantity is not None
            and self.max_quantity is not None
            and self.max_quantity < self.min_quantity
        ):
            raise ValueError("Miktar ust siniri alt sinirdan kucuk olamaz")
        if (
            self.min_minutes is not None
            and self.max_minutes is not None
            and self.max_minutes < self.min_minutes
        ):
            raise ValueError("Sure ust siniri alt sinirdan kucuk olamaz")
        return self


class RuleOrderPut(BaseModel):
    """Ya acik sira (`rule_ids`) ya da `by_specificity=true` (en ozel ustte)."""

    rule_ids: list[uuid.UUID] | None = None
    by_specificity: bool = False


class ScenarioIn(BaseModel):
    product_category_id: uuid.UUID
    vehicle_category_id: uuid.UUID | None = None
    quantity: int = Field(ge=1, le=1_000_000)
    quantity_unit: QuantityUnit = QuantityUnit.pallet


class EvaluateIn(BaseModel):
    scenarios: list[ScenarioIn] = Field(min_length=1, max_length=MAX_SCENARIOS)


def _policy_out(facility: Facility) -> dict:
    return {
        **resolve_duration_policy(facility),
        "is_customized": bool(facility.duration_policy_json),
        "rounding_choices": list(ROUNDING_CHOICES),
    }


def _rule_out(rule: DurationRule, shadowed: dict[uuid.UUID, uuid.UUID]) -> dict:
    return {
        "id": str(rule.id),
        "position": rule.position,
        "name": rule.name,
        "is_active": rule.is_active,
        "vehicle_category_id": str(rule.vehicle_category_id) if rule.vehicle_category_id else None,
        "product_category_id": str(rule.product_category_id) if rule.product_category_id else None,
        "quantity_unit": rule.quantity_unit,
        "min_quantity": rule.min_quantity,
        "max_quantity": rule.max_quantity,
        "calc_type": rule.calc_type.value,
        "fixed_minutes": rule.fixed_minutes,
        "base_minutes": rule.base_minutes,
        "per_unit_minutes": (
            float(rule.per_unit_minutes) if rule.per_unit_minutes is not None else None
        ),
        "min_minutes": rule.min_minutes,
        "max_minutes": rule.max_minutes,
        "specificity": specificity(rule),
        # Ust siradaki daha genel bir kural her durumda once esliyorsa bu kural
        # hic uygulanmaz; arayuz uyarir.
        "shadowed_by": str(shadowed[rule.id]) if rule.id in shadowed else None,
    }


async def _rules_out(db: AsyncSession, facility_id: uuid.UUID) -> list[dict]:
    rules = await load_rules(db, facility_id, active_only=False)
    shadowed = shadowed_rules(rules)
    return [_rule_out(r, shadowed) for r in rules]


def _audit(db: AsyncSession, ctx: FacilityContext, action: str, entity_id, before, after):
    record_audit(
        db,
        actor_type=ActorType.tenant_user,
        actor_id=ctx.identity.id,
        action=action,
        tenant_id=ctx.tenant_id,
        facility_id=ctx.facility_id,
        entity_type="duration_rule" if action.startswith("duration_rule") else "facility",
        entity_id=entity_id,
        before=before,
        after=after,
    )


async def _check_refs(db: AsyncSession, facility_id: uuid.UUID, body: DurationRuleIn) -> None:
    """Kosuldaki kategori/arac bu tesise ait olmali (baska tesisin kimligi reddedilir)."""
    for model, ref in (
        (ProductCategory, body.product_category_id),
        (VehicleCategory, body.vehicle_category_id),
    ):
        if ref is None:
            continue
        query = select(model.id).where(model.id == ref, model.facility_id == facility_id)
        found = (await db.execute(query)).scalar_one_or_none()
        if found is None:
            raise ApiError("INVALID_REFERENCE", "Secilen kayit bu tesise ait degil", 422)


def _snapshot(rule: DurationRule) -> dict:
    return _rule_out(rule, {})


async def _get_rule(db: AsyncSession, facility_id: uuid.UUID, rule_id: uuid.UUID) -> DurationRule:
    rule = (
        await db.execute(
            select(DurationRule).where(
                DurationRule.id == rule_id, DurationRule.facility_id == facility_id
            )
        )
    ).scalar_one_or_none()
    if rule is None:
        raise NotFoundError("Sure kurali bulunamadi")
    return rule


# ---------------------------------------------------------------- politika


@router.get("/duration-policy")
async def get_duration_policy(
    ctx: FacilityContext = Depends(require_facility_permissions(TenantPermission.APPT_VIEW)),
):
    return ok(_policy_out(ctx.facility))


@router.patch("/duration-policy")
async def patch_duration_policy(
    body: DurationPolicyPatch,
    ctx: FacilityContext = Depends(
        require_facility_permissions(TenantPermission.CATEGORY_MANAGE)
    ),
    db: AsyncSession = Depends(get_db),
):
    """Modu/yuvarlamayi gunceller. Yalnizca YENI randevulara uygulanir."""
    facility = await db.get(Facility, ctx.facility_id)
    assert facility is not None
    before = resolve_duration_policy(facility)
    current = {**before, **body.model_dump(exclude_unset=True, exclude_none=True, mode="json")}
    facility.duration_policy_json = current
    _audit(db, ctx, "duration_policy.update", ctx.facility_id, before, current)
    await db.commit()
    await db.refresh(facility)
    return ok(_policy_out(facility))


# ---------------------------------------------------------------- kurallar


@router.get("/duration-rules")
async def list_duration_rules(
    ctx: FacilityContext = Depends(
        require_facility_permissions(TenantPermission.CATEGORY_MANAGE)
    ),
    db: AsyncSession = Depends(get_db),
):
    return ok(await _rules_out(db, ctx.facility_id))


@router.post("/duration-rules")
async def create_duration_rule(
    body: DurationRuleIn,
    ctx: FacilityContext = Depends(
        require_facility_permissions(TenantPermission.CATEGORY_MANAGE)
    ),
    db: AsyncSession = Depends(get_db),
):
    await _check_refs(db, ctx.facility_id, body)
    last = (
        await db.execute(
            select(func.max(DurationRule.position)).where(
                DurationRule.facility_id == ctx.facility_id
            )
        )
    ).scalar_one_or_none()
    rule = DurationRule(
        tenant_id=ctx.tenant_id,
        facility_id=ctx.facility_id,
        position=(last + 1) if last is not None else 0,
        **body.model_dump(),
    )
    db.add(rule)
    await db.flush()
    _audit(db, ctx, "duration_rule.create", rule.id, None, _snapshot(rule))
    await db.commit()
    return ok(await _rules_out(db, ctx.facility_id))


@router.patch("/duration-rules/{rule_id}")
async def update_duration_rule(
    rule_id: uuid.UUID,
    body: DurationRuleIn,
    ctx: FacilityContext = Depends(
        require_facility_permissions(TenantPermission.CATEGORY_MANAGE)
    ),
    db: AsyncSession = Depends(get_db),
):
    """Kuralin TAMAMINI degistirir (form tum alanlari gonderir)."""
    rule = await _get_rule(db, ctx.facility_id, rule_id)
    await _check_refs(db, ctx.facility_id, body)
    before = _snapshot(rule)
    for key, value in body.model_dump().items():
        setattr(rule, key, value)
    await db.flush()
    _audit(db, ctx, "duration_rule.update", rule.id, before, _snapshot(rule))
    await db.commit()
    return ok(await _rules_out(db, ctx.facility_id))


@router.delete("/duration-rules/{rule_id}")
async def delete_duration_rule(
    rule_id: uuid.UUID,
    ctx: FacilityContext = Depends(
        require_facility_permissions(TenantPermission.CATEGORY_MANAGE)
    ),
    db: AsyncSession = Depends(get_db),
):
    rule = await _get_rule(db, ctx.facility_id, rule_id)
    before = _snapshot(rule)
    await db.delete(rule)
    _audit(db, ctx, "duration_rule.delete", rule_id, before, None)
    await db.commit()
    return ok(await _rules_out(db, ctx.facility_id))


@router.put("/duration-rules/order")
async def order_duration_rules(
    body: RuleOrderPut,
    ctx: FacilityContext = Depends(
        require_facility_permissions(TenantPermission.CATEGORY_MANAGE)
    ),
    db: AsyncSession = Depends(get_db),
):
    """Kural sirasini yazar: acik liste ya da "en ozel kural ustte"."""
    rules = await load_rules(db, ctx.facility_id, active_only=False)
    by_id = {r.id: r for r in rules}
    if body.by_specificity:
        ordered = sort_by_specificity(rules)
    else:
        ids = body.rule_ids or []
        if len(ids) != len(set(ids)) or set(ids) != set(by_id):
            raise ApiError(
                "VALIDATION_ERROR", "Sira listesi tesisin tum kurallarini bir kez icermeli", 422
            )
        ordered = [by_id[i] for i in ids]
    before = [str(r.id) for r in rules]
    for position, rule in enumerate(ordered):
        rule.position = position
    _audit(
        db, ctx, "duration_rule.reorder", ctx.facility_id,
        {"order": before}, {"order": [str(r.id) for r in ordered]},
    )
    await db.commit()
    return ok(await _rules_out(db, ctx.facility_id))


@router.post("/duration-rules/evaluate")
async def evaluate_duration_rules(
    body: EvaluateIn,
    ctx: FacilityContext = Depends(require_facility_permissions(TenantPermission.APPT_VIEW)),
    db: AsyncSession = Depends(get_db),
):
    """Senaryolarin surelerini hesaplar (deneme kutusu, senaryo tablosu, yonetim
    adina olusturma). Kayit degistirmez."""
    rules = await load_rules(db, ctx.facility_id)
    policy = resolve_duration_policy(ctx.facility)
    category_ids = {s.product_category_id for s in body.scenarios}
    categories = {
        c.id: c
        for c in (
            await db.execute(
                select(ProductCategory).where(
                    ProductCategory.id.in_(category_ids),
                    ProductCategory.facility_id == ctx.facility_id,
                )
            )
        ).scalars()
    }
    if set(categories) != category_ids:
        raise ApiError("INVALID_REFERENCE", "Secilen kategori bu tesise ait degil", 422)
    results = []
    for scenario in body.scenarios:
        estimate = estimate_with_rules(
            rules,
            policy,
            product_category=categories[scenario.product_category_id],
            vehicle_category_id=scenario.vehicle_category_id,
            quantity=scenario.quantity,
            quantity_unit=scenario.quantity_unit.value,
        )
        results.append(estimate.as_dict())
    return ok({"mode": policy["mode"], "results": results})
