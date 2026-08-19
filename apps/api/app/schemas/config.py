"""Facility konfigurasyon CRUD sema/DTO'lari (Sprint 2).

Cift tarafli validasyonun backend ayagi: ayni kurallar frontend'de Zod ile
uygulanir. Cross-facility ID dogrulamasi router/servis katmanindadir
(DB erisimi gerektirir).
"""

import re
import uuid
from datetime import date as date_type
from datetime import time as time_type
from typing import Any

from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator

from app.core.enums import ConflictRelationType, DockOverrideType

#: Calisma saatlerinde dakika YALNIZCA ceyrek saat olabilir (00/15/30/45).
#: Serbest dakika girisi 01:19 gibi degerlere izin veriyordu; hem operasyonel
#: olarak anlamsiz hem de slot izgarasiyla hizasiz.
QUARTER_HOUR_MINUTES = ("00", "15", "30", "45")
_HHMM = re.compile(r"^([01]\d|2[0-3]):(00|15|30|45)$")
_DAY_KEYS = {"mon", "tue", "wed", "thu", "fri", "sat", "sun"}


def _validate_working_hours(value: dict[str, Any] | None) -> dict[str, Any] | None:
    if value is None:
        return None
    for key, day in value.items():
        if key not in _DAY_KEYS:
            raise ValueError(f"Gecersiz gun anahtari: {key}")
        if day is None:
            continue
        if not isinstance(day, dict) or "start" not in day or "end" not in day:
            raise ValueError(f"{key}: {{start, end}} bekleniyor veya null")
        if not (_HHMM.match(str(day["start"])) and _HHMM.match(str(day["end"]))):
            raise ValueError(
                f"{key}: saatler HH:MM olmali ve dakika 00/15/30/45 olmali"
            )
        if str(day["start"]) >= str(day["end"]):
            raise ValueError(f"{key}: bitis, baslangictan sonra olmali")
    return value


def _validate_block_limits(min_block: int | None, max_block: int | None) -> None:
    """Hem tedarikci hem urun kategorisi ayni min/max sozlesmesini kullanir."""
    if min_block is not None and max_block is not None and max_block < min_block:
        raise ValueError("max_block_minutes, min_block_minutes'ten kucuk olamaz")


# Blokaj sureleri icin makul ust sinir (24 saat). Motor rampa penceresini GUN
# bazinda hesapladigi icin bundan uzun bir randevu zaten planlanamaz; sinir ayni
# zamanda tamsayi tasmasinin 500'e donusmesini engeller.
MAX_BLOCK_MINUTES_CAP = 1440


# ---------- Product Category ----------


class ProductCategoryCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    display_name: str = Field(min_length=1, max_length=150)
    description: str | None = None
    min_block_minutes: int = Field(default=30, gt=0, le=MAX_BLOCK_MINUTES_CAP)
    # None = kategori bazli ust sinir yok (yalnizca tedarikci limitleri gecerli).
    max_block_minutes: int | None = Field(default=None, gt=0, le=MAX_BLOCK_MINUTES_CAP)
    default_vehicle_category_id: uuid.UUID | None = None
    is_active: bool = True

    @model_validator(mode="after")
    def check_limits(self) -> "ProductCategoryCreate":
        _validate_block_limits(self.min_block_minutes, self.max_block_minutes)
        return self


class ProductCategoryPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    display_name: str | None = Field(default=None, min_length=1, max_length=150)
    description: str | None = None
    min_block_minutes: int | None = Field(default=None, gt=0, le=MAX_BLOCK_MINUTES_CAP)
    # Patch'te None ANLAMLI bir degerdir (ust siniri kaldirir); tutarlilik
    # kontrolu bu yuzden router'da SONUC durumu uzerinden yapilir.
    max_block_minutes: int | None = Field(default=None, gt=0, le=MAX_BLOCK_MINUTES_CAP)
    default_vehicle_category_id: uuid.UUID | None = None
    is_active: bool | None = None


# ---------- Vehicle Category ----------


class VehicleCategoryCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    display_name: str = Field(min_length=1, max_length=150)
    description: str | None = None
    physical_note: str | None = None
    is_active: bool = True


class VehicleCategoryPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    display_name: str | None = Field(default=None, min_length=1, max_length=150)
    description: str | None = None
    physical_note: str | None = None
    is_active: bool | None = None


# ---------- Dock ----------


class DockCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    note: str | None = None
    is_active: bool = True
    working_hours_json: dict[str, Any] | None = None
    # BOS liste = tumu kabul (hem urun hem arac icin ayni kural; engine boyle uygular)
    accepted_product_category_ids: list[uuid.UUID] = []
    accepted_vehicle_category_ids: list[uuid.UUID] = []

    @field_validator("working_hours_json")
    @classmethod
    def check_hours(cls, v: dict[str, Any] | None) -> dict[str, Any] | None:
        return _validate_working_hours(v)


class DockPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    note: str | None = None
    is_active: bool | None = None
    working_hours_json: dict[str, Any] | None = None
    accepted_product_category_ids: list[uuid.UUID] | None = None
    accepted_vehicle_category_ids: list[uuid.UUID] | None = None

    @field_validator("working_hours_json")
    @classmethod
    def check_hours(cls, v: dict[str, Any] | None) -> dict[str, Any] | None:
        return _validate_working_hours(v)


# ---------- Dock Conflict Group ----------


def _validate_trigger(
    relation_type: ConflictRelationType, trigger: dict[str, Any] | None
) -> None:
    if relation_type == ConflictRelationType.conditional:
        vehicle_ids = (trigger or {}).get("vehicle_category_ids") or []
        if not vehicle_ids:
            raise ValueError(
                "conditional grup icin trigger_condition_json.vehicle_category_ids zorunlu"
            )


class ConflictGroupCreate(BaseModel):
    name: str = Field(min_length=1, max_length=150)
    relation_type: ConflictRelationType
    member_dock_ids: list[uuid.UUID] = Field(min_length=2)
    trigger_condition_json: dict[str, Any] | None = None
    is_active: bool = True

    @model_validator(mode="after")
    def check_trigger(self) -> "ConflictGroupCreate":
        _validate_trigger(self.relation_type, self.trigger_condition_json)
        if len(set(self.member_dock_ids)) < 2:
            raise ValueError("Cakisma grubu en az 2 FARKLI rampa icermeli")
        return self


class ConflictGroupPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=150)
    relation_type: ConflictRelationType | None = None
    member_dock_ids: list[uuid.UUID] | None = Field(default=None, min_length=2)
    trigger_condition_json: dict[str, Any] | None = None
    is_active: bool | None = None


# ---------- Dock Override ----------


class OverrideCreate(BaseModel):
    """Ayni istisna tek istekte birden fazla rampaya yazilabilir (dock_ids).

    Tekil `dock_id` alani geriye uyumluluk icin korunur; iki alan da
    gonderilirse birlestirilip tekillestirilir.
    """

    dock_id: uuid.UUID | None = None
    # max_length: tek istekte sinirsiz rampa yazilmasin (tesis rampa sayisinin
    # cok uzerinde bir tavan; normal kullanimda asilmaz).
    dock_ids: list[uuid.UUID] = Field(default_factory=list, max_length=200)
    date: date_type
    type: DockOverrideType
    start_time: time_type | None = None
    end_time: time_type | None = None
    reason: str | None = Field(default=None, max_length=1000)
    is_active: bool = True

    @property
    def target_dock_ids(self) -> list[uuid.UUID]:
        ids = [*([self.dock_id] if self.dock_id else []), *self.dock_ids]
        return list(dict.fromkeys(ids))

    @model_validator(mode="after")
    def check_times(self) -> "OverrideCreate":
        if not self.target_dock_ids:
            raise ValueError("En az bir rampa secilmeli")
        if self.type == DockOverrideType.extra_hours:
            if self.start_time is None or self.end_time is None:
                raise ValueError("extra_hours icin start_time ve end_time zorunlu")
        for label, value in (("start_time", self.start_time), ("end_time", self.end_time)):
            # Calisma saatleriyle ayni kural: dakika ceyrek saat olmali.
            if value is not None and (value.minute % 15 or value.second or value.microsecond):
                raise ValueError(f"{label}: dakika 00/15/30/45 olmali")
        if self.start_time is not None and self.end_time is not None:
            if self.end_time <= self.start_time:
                raise ValueError("end_time, start_time'dan sonra olmali")
        return self


class OverridePatch(BaseModel):
    date: date_type | None = None
    type: DockOverrideType | None = None
    start_time: time_type | None = None
    end_time: time_type | None = None
    reason: str | None = Field(default=None, max_length=1000)
    is_active: bool | None = None


# ---------- Supplier ----------


class SupplierCreate(BaseModel):
    company_name: str = Field(min_length=1, max_length=255)
    code: str = Field(min_length=1, max_length=50)
    category_label: str | None = None
    contact_name: str | None = None
    contact_email: EmailStr | None = None
    contact_phone: str | None = None
    allowed_product_category_ids: list[uuid.UUID] = []
    min_block_minutes: int | None = Field(default=None, gt=0, le=MAX_BLOCK_MINUTES_CAP)
    max_block_minutes: int | None = Field(default=None, gt=0, le=MAX_BLOCK_MINUTES_CAP)
    weekly_quota: int | None = Field(default=None, ge=0)
    monthly_quota: int | None = Field(default=None, ge=0)
    auto_approval_enabled: bool = False
    # Kargo teslimat tipi yalnizca acikca izin verilirse kullanilabilir.
    cargo_enabled: bool = False
    is_active: bool = True
    notes: str | None = None
    # Hesap yonetimi: varsayilan olarak contact_email ile portal hesabi acilir.
    create_account: bool = True
    account_email: EmailStr | None = None
    account_password: str | None = Field(default=None, min_length=6)

    @model_validator(mode="after")
    def check_limits(self) -> "SupplierCreate":
        _validate_block_limits(self.min_block_minutes, self.max_block_minutes)
        return self


class SupplierPatch(BaseModel):
    company_name: str | None = Field(default=None, min_length=1, max_length=255)
    code: str | None = Field(default=None, min_length=1, max_length=50)
    category_label: str | None = None
    contact_name: str | None = None
    contact_email: EmailStr | None = None
    contact_phone: str | None = None
    allowed_product_category_ids: list[uuid.UUID] | None = None
    min_block_minutes: int | None = Field(default=None, gt=0, le=MAX_BLOCK_MINUTES_CAP)
    max_block_minutes: int | None = Field(default=None, gt=0, le=MAX_BLOCK_MINUTES_CAP)
    weekly_quota: int | None = Field(default=None, ge=0)
    monthly_quota: int | None = Field(default=None, ge=0)
    auto_approval_enabled: bool | None = None
    cargo_enabled: bool | None = None
    is_active: bool | None = None
    notes: str | None = None


class SupplierAccountCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)


class SupplierPasswordReset(BaseModel):
    new_password: str = Field(min_length=6)


class SupplierUserStatus(BaseModel):
    is_active: bool
