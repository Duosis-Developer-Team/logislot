import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.core.enums import CargoWindow, DeliveryType, QuantityUnit, RecurringRule


class RecurringRequest(BaseModel):
    """Tekrarlayan seri istegi. Limitler (rapor karari):
    weekly/biweekly <= 12 occurrence, monthly <= 6 (~6 ay ufku)."""

    enabled: bool = True
    frequency: Literal["weekly", "biweekly", "monthly"]
    occurrence_count: int = Field(ge=2, le=12)

    @model_validator(mode="after")
    def check_monthly_limit(self) -> "RecurringRequest":
        if self.frequency == "monthly" and self.occurrence_count > 6:
            raise ValueError("Aylik tekrarda en fazla 6 randevu olusturulabilir")
        return self


class AppointmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    facility_id: uuid.UUID
    supplier_id: uuid.UUID
    dock_id: uuid.UUID | None = None
    product_category_id: uuid.UUID
    vehicle_category_id: uuid.UUID | None = None
    product_name: str
    quantity: int
    quantity_unit: str
    license_plate: str | None = None
    driver_name: str | None = None
    driver_phone: str | None = None
    delivery_type: str
    cargo_window: str | None = None
    cargo_min_block_minutes: int | None = None
    scheduled_start_at: datetime
    scheduled_end_at: datetime
    duration_minutes: int
    status: str
    rejection_reason: str | None = None
    cancellation_reason: str | None = None
    completion_note: str | None = None
    revision_note: str | None = None
    original_start_at: datetime | None = None
    original_end_at: datetime | None = None
    recurring_rule: str | None = None
    series_id: uuid.UUID | None = None
    occurrence_index: int | None = None
    created_at: datetime


class RevisionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    old_start_at: datetime
    old_end_at: datetime
    old_dock_id: uuid.UUID | None = None
    new_start_at: datetime
    new_end_at: datetime
    new_dock_id: uuid.UUID | None = None
    note: str | None = None
    created_at: datetime


class SupplierAppointmentCreate(BaseModel):
    """Tedarikci sihirbazi v2.0: urun -> arac/teslimat -> zaman."""

    # Adim 1 — urun
    product_category_id: uuid.UUID
    product_name: str = Field(min_length=1, max_length=255)
    quantity: int = Field(ge=1)
    quantity_unit: QuantityUnit = QuantityUnit.pallet
    # Adim 2 — arac ve teslimat (arac kategorisi bos ise kategori varsayilani)
    vehicle_category_id: uuid.UUID | None = None
    license_plate: str | None = Field(default=None, max_length=30)
    driver_name: str | None = None
    driver_phone: str | None = None
    delivery_type: DeliveryType = DeliveryType.standard
    # Adim 3 — zaman (standart: start_at zorunlu; kargo: cargo_window zorunlu)
    target_date: date
    start_at: datetime | None = None
    duration_minutes: int | None = None
    cargo_window: CargoWindow | None = None
    recurring_rule: RecurringRule | None = None
    # Tekrarlayan seri (yalnizca standart teslimat; kargo ile birlesmez)
    recurring: RecurringRequest | None = None
    # Kullanicinin onaylayarak gectigi tavsiye uyarilari (audit'e islenir;
    # create'i ETKILEMEZ — advisory hicbir zaman hard block degildir).
    acknowledged_warning_codes: list[str] = []


class AdminAppointmentCreate(SupplierAppointmentCreate):
    supplier_id: uuid.UUID
    # Rampa: True ise engine en az dolu uyumlu rampayi secer; False ise dock_id zorunlu.
    auto_assign_dock: bool = True
    dock_id: uuid.UUID | None = None
    # Operasyon notu (randevuya yazilmaz; audit metadata'sina islenir — MVP karari).
    note: str | None = None


class RejectRequest(BaseModel):
    reason: str = Field(min_length=1)


class ReviseRequest(BaseModel):
    new_start_at: datetime
    new_duration_minutes: int | None = Field(default=None, gt=0)
    new_dock_id: uuid.UUID | None = None
    # True ise hedef aralik icin en az dolu uygun rampayi engine secer.
    auto_assign_dock: bool = False
    note: str | None = None
    acknowledged_warning_codes: list[str] = []


class CompleteRequest(BaseModel):
    note: str | None = None


class CancelRequest(BaseModel):
    reason: str | None = None


class AvailabilityRequest(BaseModel):
    product_category_id: uuid.UUID
    vehicle_category_id: uuid.UUID | None = None
    delivery_type: DeliveryType = DeliveryType.standard
    target_date: date
    duration_minutes: int | None = None
    cargo_window: CargoWindow | None = None
    # Yonetim panelinden cagrildiginda zorunlu; supplier portalda context'ten gelir.
    supplier_id: uuid.UUID | None = None


class SlotOut(BaseModel):
    start: datetime
    end: datetime
    status: str
    candidate_dock_ids: list[uuid.UUID]
    blocking_reasons: list[str]
    advisory_warnings: list[dict]


class SeriesCancelRequest(BaseModel):
    """Seri toplu iptali — MVP'de yalnizca future_only scope."""

    scope: Literal["future_only"] = "future_only"
    reason: str | None = None


class SeriesReviseRequest(BaseModel):
    """Seri toplu revizesi (Sprint 10): gelecekteki randevular ayni saate kayar."""

    scope: Literal["future_only"] = "future_only"
    new_time: str = Field(pattern=r"^\d{2}:\d{2}$")  # tesis saat diliminde "HH:MM"
    duration_minutes: int | None = Field(default=None, gt=0)
    dock_id: uuid.UUID | None = None
    auto_assign_dock: bool = True
    note: str | None = None


class SeriesApproveRequest(BaseModel):
    """Seri toplu onayi (Sprint 11): gelecekteki revize bekleyen randevular."""

    scope: Literal["revision_pending_future_only"] = "revision_pending_future_only"
    note: str | None = None
