"""Rule engine giris/cikis sozlesmeleri.

SERT KURALLAR engeller (HardRuleResult). TAVSIYE KURALLARI hicbir seyi
engellemez; yalnizca sinyal uretir (WarningRuleResult). Bu ayrim v2.0'in
temel mimari fikridir.
"""

import uuid
from dataclasses import dataclass, field
from datetime import date as date_type
from datetime import datetime

from app.core.enums import CargoWindow, DeliveryType
from app.models import (
    Appointment,
    Dock,
    DockConflictGroup,
    DockOverride,
    Facility,
    ProductCategory,
    Supplier,
)


class HardRuleCode:
    SUPPLIER_CATEGORY_NOT_ALLOWED = "SUPPLIER_CATEGORY_NOT_ALLOWED"
    SUPPLIER_QUOTA_EXCEEDED = "SUPPLIER_QUOTA_EXCEEDED"
    DURATION_BELOW_CATEGORY_MINIMUM = "DURATION_BELOW_CATEGORY_MINIMUM"
    DURATION_ABOVE_CATEGORY_MAXIMUM = "DURATION_ABOVE_CATEGORY_MAXIMUM"
    DURATION_OUTSIDE_SUPPLIER_LIMITS = "DURATION_OUTSIDE_SUPPLIER_LIMITS"
    NO_COMPATIBLE_DOCK = "NO_COMPATIBLE_DOCK"
    DOCK_OUTSIDE_WORKING_HOURS = "DOCK_OUTSIDE_WORKING_HOURS"
    DOCK_CLOSED_BY_OVERRIDE = "DOCK_CLOSED_BY_OVERRIDE"
    DOCK_TIME_CONFLICT = "DOCK_TIME_CONFLICT"
    DOCK_CONFLICT_GROUP_BLOCKED = "DOCK_CONFLICT_GROUP_BLOCKED"


class WarningCode:
    CARGO_DAY_WARNING = "CARGO_DAY_WARNING"
    CARGO_WINDOW_OVERLAP = "CARGO_WINDOW_OVERLAP"
    HIGH_DOCK_UTILIZATION = "HIGH_DOCK_UTILIZATION"


HARD_RULE_MESSAGES = {
    HardRuleCode.SUPPLIER_CATEGORY_NOT_ALLOWED: "Tedarikci bu kategoride randevu olusturamaz",
    HardRuleCode.SUPPLIER_QUOTA_EXCEEDED: "Tedarikci rezervasyon kotasi asildi",
    HardRuleCode.DURATION_BELOW_CATEGORY_MINIMUM: "Sure, kategori minimum blokaj suresinin altinda",
    HardRuleCode.DURATION_ABOVE_CATEGORY_MAXIMUM: "Sure, kategori maksimum blokaj suresini asiyor",
    HardRuleCode.DURATION_OUTSIDE_SUPPLIER_LIMITS: "Sure, tedarikci min/maks limitleri disinda",
    HardRuleCode.NO_COMPATIBLE_DOCK: "Uygun rampa bulunamadi",
    HardRuleCode.DOCK_OUTSIDE_WORKING_HOURS: "Secilen aralik rampa calisma saatleri disinda",
    HardRuleCode.DOCK_CLOSED_BY_OVERRIDE: "Rampa bu gun icin kapatilmis",
    HardRuleCode.DOCK_TIME_CONFLICT: "Secilen aralikta rampa dolu",
    HardRuleCode.DOCK_CONFLICT_GROUP_BLOCKED: "Rampa, cakisma grubu nedeniyle bloke",
}


@dataclass
class HardRuleResult:
    ok: bool
    code: str | None = None
    message: str | None = None

    @classmethod
    def passed(cls) -> "HardRuleResult":
        return cls(ok=True)

    @classmethod
    def failed(cls, code: str) -> "HardRuleResult":
        return cls(ok=False, code=code, message=HARD_RULE_MESSAGES.get(code, code))


@dataclass
class WarningRuleResult:
    """Tavsiye sinyali — blocking HER ZAMAN False'tur; hicbir seyi engellemez."""

    code: str
    message: str
    dock_id: uuid.UUID | None = None
    appointment_id: uuid.UUID | None = None
    window: str | None = None
    severity: str = "warning"
    blocking: bool = False


@dataclass
class SlotEvaluation:
    start: datetime
    end: datetime
    status: str  # available | partial | full
    candidate_dock_ids: list[uuid.UUID] = field(default_factory=list)
    blocking_reasons: list[str] = field(default_factory=list)
    advisory_warnings: list[WarningRuleResult] = field(default_factory=list)


@dataclass
class RuleEvaluationContext:
    """Tek degerlendirme girisi: tum tesis konfigurasyonu yuklu halde gelir.

    Rule engine DB'ye erismez; framework bagimsizdir. Verinin yuklenmesi
    servis katmaninin (repository) sorumlulugundadir.
    """

    facility: Facility
    supplier: Supplier
    product_category: ProductCategory
    vehicle_category_id: uuid.UUID | None
    delivery_type: DeliveryType
    target_date: date_type
    duration_minutes: int
    cargo_window: CargoWindow | None = None

    # Onceden yuklenmis tesis konfigurasyonu
    docks: list[Dock] = field(default_factory=list)
    conflict_groups: list[DockConflictGroup] = field(default_factory=list)
    overrides: list[DockOverride] = field(default_factory=list)
    # Hedef gunun mevcut randevulari (BLOCKING statulerde, kargo dahil)
    existing_appointments: list[Appointment] = field(default_factory=list)
    # Kota kontrolu icin sayimlar (iptal/red haric)
    supplier_week_count: int = 0
    supplier_month_count: int = 0
