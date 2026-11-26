import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    computed_field,
    field_validator,
    model_validator,
)

from app.core.enums import CargoWindow, DeliveryType, QuantityUnit, RecurringRule


class RecurrenceRuleIn(BaseModel):
    """Outlook tarzi tekrar deseni (bkz. services/recurrence.py).

    Baslangic = randevunun start_at tarihi. Gunler 0=Pzt .. 6=Paz.
    """

    type: Literal["daily", "weekly", "monthly"]
    interval: int = Field(default=1, ge=1, le=99)
    # Gunluk: True -> her is gunu (Pzt-Cum); interval yok sayilir.
    weekdays_only: bool = False
    # Haftalik: secili gunler; bossa baslangic gunu.
    weekdays: list[int] = Field(default_factory=list, max_length=7)
    # Aylik: "ayin X. gunu" ya da "ayin [1-4/son] [gun]"
    monthly_mode: Literal["day_of_month", "nth_weekday"] = "day_of_month"
    day_of_month: int | None = Field(default=None, ge=1, le=31)
    week_of_month: Literal[1, 2, 3, 4, -1] | None = None
    weekday: int | None = Field(default=None, ge=0, le=6)
    # Aralik
    end_type: Literal["count", "until"] = "count"
    count: int | None = Field(default=None, ge=2, le=52)
    until: date | None = None

    @field_validator("weekdays")
    @classmethod
    def check_weekdays(cls, value: list[int]) -> list[int]:
        if any(d < 0 or d > 6 for d in value):
            raise ValueError("Gecersiz hafta gunu")
        return sorted(set(value))

    @model_validator(mode="after")
    def check_end(self) -> "RecurrenceRuleIn":
        if self.end_type == "count" and self.count is None:
            raise ValueError("Tekrar sayisi zorunlu")
        if self.end_type == "until" and self.until is None:
            raise ValueError("Bitis tarihi zorunlu")
        return self


class RecurringRequest(BaseModel):
    """Tekrarlayan seri istegi.

    Iki bicim (geriye uyumlu):
    - Eski: frequency + occurrence_count. Limitler (rapor karari):
      weekly/biweekly <= 12 occurrence, monthly <= 6 (~6 ay ufku).
    - Yeni: recurrence (Outlook tarzi desen); en fazla 52 occurrence.
    recurrence verilirse frequency/occurrence_count yok sayilir.
    """

    enabled: bool = True
    frequency: Literal["weekly", "biweekly", "monthly"] | None = None
    occurrence_count: int | None = Field(default=None, ge=2, le=12)
    recurrence: RecurrenceRuleIn | None = None

    @model_validator(mode="after")
    def check_monthly_limit(self) -> "RecurringRequest":
        if self.recurrence is not None:
            return self
        if self.frequency is None or self.occurrence_count is None:
            raise ValueError("frequency ve occurrence_count ya da recurrence zorunlu")
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
    order_numbers: list[str] = []
    description: str | None = None
    # Surucu kimligi YALNIZCA maskeli (son 4 hane). Acik deger ayri, izinli ve
    # denetlenen bir uctan alinir; sifreli deger/ozet ASLA serilestirilmez.
    driver_id_type: str | None = None
    driver_id_last4: str | None = Field(default=None, exclude=True)
    driver_id_purged_at: datetime | None = None
    delivery_type: str
    cargo_window: str | None = None
    cargo_min_block_minutes: int | None = None
    scheduled_start_at: datetime
    scheduled_end_at: datetime
    duration_minutes: int
    duration_source: str | None = None
    status: str
    rejection_reason: str | None = None
    cancellation_reason: str | None = None
    cancellation_reason_id: uuid.UUID | None = None
    cancellation_reason_label: str | None = None
    is_makeup: bool = False
    makeup_of_id: uuid.UUID | None = None
    makeup_appointment_id: uuid.UUID | None = None
    completion_note: str | None = None
    revision_note: str | None = None
    original_start_at: datetime | None = None
    original_end_at: datetime | None = None
    recurring_rule: str | None = None
    series_id: uuid.UUID | None = None
    occurrence_index: int | None = None
    created_at: datetime

    @field_validator("order_numbers", mode="before")
    @classmethod
    def _order_numbers_list(cls, value):
        # Kolon NULL olabilir (alan gizliyken); API her zaman liste dondurur.
        return value or []

    @computed_field  # type: ignore[prop-decorator]
    @property
    def driver_id_masked(self) -> str | None:
        if not self.driver_id_last4:
            return None
        return "•" * (7 if self.driver_id_type == "tckn" else 4) + self.driver_id_last4


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
    # Siparis numaralari; zorunlulugu tesis formu ayari belirler. Ham liste
    # serviste kirpilir/bolunur/tekillestirilir (bkz. services/appointment_form).
    order_numbers: list[str] = Field(default_factory=list, max_length=50)
    # Surucu kimlik no (TCKN/pasaport); gorunurlugu tesis formu ayari belirler.
    # Sifreli saklanir, yanitta yalnizca maskeli doner.
    driver_id_number: str | None = Field(default=None, max_length=32)
    # Serbest metin aciklama; gorunurlugu tesis formu ayari belirler. Uzunluk
    # (1000) kirpildiktan sonra serviste kontrol edilir; burasi yalnizca tavan.
    description: str | None = Field(default=None, max_length=4000)
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


class DockChangeRequest(BaseModel):
    """Saat/sure AYNI kalarak yalnizca rampa degisimi.

    `dock_id=None` => otomatik: uyumlu ve o aralikta bos rampalar arasindan
    gun ici en az dolu olani secilir. Revize DEGILDIR: randevu durumu korunur.
    """

    dock_id: uuid.UUID | None = None
    note: str | None = None


class CompleteRequest(BaseModel):
    note: str | None = None


class CancelRequest(BaseModel):
    reason: str | None = None


class MakeupSlotRequest(BaseModel):
    """Telafi randevusunun zamani. Standart teslimatta `start_at` zorunlu,
    kargoda `cargo_window` (verilmezse iptal edilenin penceresi) kullanilir."""

    target_date: date
    start_at: datetime | None = None
    cargo_window: CargoWindow | None = None


class SupplierCancelRequest(BaseModel):
    """Tedarikci iptali. Hangi alanin zorunlu oldugunu TESIS POLITIKASI
    belirler (services/cancellation_policy.py); burada yalnizca bicim
    dogrulanir. `reason` serbest aciklamadir (sebep bazinda zorunlu olabilir)."""

    reason_id: uuid.UUID | None = None
    reason: str | None = Field(default=None, max_length=500)
    makeup: MakeupSlotRequest | None = None


class AvailabilityRequest(BaseModel):
    product_category_id: uuid.UUID
    vehicle_category_id: uuid.UUID | None = None
    delivery_type: DeliveryType = DeliveryType.standard
    target_date: date
    duration_minutes: int | None = None
    cargo_window: CargoWindow | None = None
    # Yonetim panelinden cagrildiginda zorunlu; supplier portalda context'ten gelir.
    supplier_id: uuid.UUID | None = None
    # Sure kurallari icin (tesis "sistem hesaplar" modundaysa portalda sure
    # bunlardan SUNUCUDA hesaplanir; istemcinin suresi kullanilmaz).
    quantity: int | None = Field(default=None, ge=1)
    quantity_unit: QuantityUnit | None = None


class DurationEstimateRequest(BaseModel):
    product_category_id: uuid.UUID
    vehicle_category_id: uuid.UUID | None = None
    quantity: int = Field(ge=1, le=1_000_000)
    quantity_unit: QuantityUnit = QuantityUnit.pallet


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
