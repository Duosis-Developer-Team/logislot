"""Domain enum'lari. Magic string kullanilmaz; tum sabitler burada yasar.

Appointment statuleri v2.0 sozlesmesiyle birebir aynidir ve degistirilemez.
Kargo bir statu DEGILDIR; DeliveryType uzerinden modellenir.
"""

from enum import StrEnum


class TenantStatus(StrEnum):
    trial = "trial"
    active = "active"
    suspended = "suspended"
    archived = "archived"


class FacilityStatus(StrEnum):
    active = "active"
    inactive = "inactive"


class PlanScope(StrEnum):
    tenant = "tenant"
    facility = "facility"


class PlanStatus(StrEnum):
    draft = "draft"
    active = "active"
    retired = "retired"


class UserStatus(StrEnum):
    active = "active"
    inactive = "inactive"


class SupplierStatus(StrEnum):
    active = "active"
    inactive = "inactive"


class AppointmentStatus(StrEnum):
    pending = "pending"  # Bekliyor
    approved = "approved"  # Onaylandi
    revision_pending = "revision_pending"  # Revize Bekliyor
    rejected = "rejected"  # Reddedildi
    completed = "completed"  # Tamamlandi
    cancelled = "cancelled"  # Iptal


#: Bir rampanin zamanini fiilen isgal eden statuler (musaitlik hesabinda kullanilir).
BLOCKING_APPOINTMENT_STATUSES = (
    AppointmentStatus.pending,
    AppointmentStatus.approved,
    AppointmentStatus.revision_pending,
)


class DeliveryType(StrEnum):
    standard = "standard"
    cargo = "cargo"


class CargoWindow(StrEnum):
    morning = "morning"
    afternoon = "afternoon"
    all_day = "all_day"


class QuantityUnit(StrEnum):
    pallet = "pallet"
    piece = "piece"
    box = "box"
    carton = "carton"


class DockOverrideType(StrEnum):
    closed = "closed"
    extra_hours = "extra_hours"


class ConflictRelationType(StrEnum):
    mutual_block = "mutual_block"
    shared_capacity = "shared_capacity"
    conditional = "conditional"


class ActorType(StrEnum):
    platform_user = "platform_user"
    tenant_user = "tenant_user"
    supplier_user = "supplier_user"
    system = "system"


class CreatedByType(StrEnum):
    supplier = "supplier"
    tenant_user = "tenant_user"
    platform = "platform"
    system = "system"


class RecurringRule(StrEnum):
    weekly = "weekly"
    biweekly = "biweekly"
    monthly = "monthly"
