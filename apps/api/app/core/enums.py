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


class DatastoreStatus(StrEnum):
    """Bir tenant'in kendi veri alaninin yasam dongusu."""

    #: Kayit acildi, sema/veritabani henuz olusturulmadi.
    pending = "pending"
    #: Sema olusturuluyor veya veri tasiniyor — istekler HENUZ yonlendirilmez.
    provisioning = "provisioning"
    #: Kullanima hazir; tenant istekleri buraya yonlendirilir.
    ready = "ready"
    #: Provision/tasima basarisiz — istekler yonlendirilmez, uyari uretilir.
    failed = "failed"


# --- Destek ticketlari (Hermes canonical Ticket Hub ile ortak sozlesme) ---
#
# DIKKAT: asagidaki degerler Hermes ile PAYLASILAN sozlesmedir
# (hermes-logislot-ticketing-cto-pack 00_SHARED_PLATFORM/04). Tek tarafli
# degistirilemez; yeni deger eklemek additive'dir ve bilinmeyen degerler UI'da
# "unknown" fallback ile gosterilir.


class TicketCategory(StrEnum):
    bug = "bug"
    incident = "incident"
    improvement = "improvement"
    question = "question"
    data_correction = "data_correction"


class TicketImpact(StrEnum):
    single_user = "single_user"
    multiple_users = "multiple_users"
    tenant_blocked = "tenant_blocked"
    security_or_data_risk = "security_or_data_risk"


class TicketStatus(StrEnum):
    open = "open"
    in_progress = "in_progress"
    waiting_customer = "waiting_customer"
    resolved = "resolved"
    closed = "closed"
    reopened = "reopened"
    cancelled = "cancelled"


class TicketResolutionCode(StrEnum):
    fixed = "fixed"
    workaround = "workaround"
    configuration = "configuration"
    not_reproducible = "not_reproducible"
    duplicate = "duplicate"
    wont_fix = "wont_fix"
    answered = "answered"


class TicketDeliveryStatus(StrEnum):
    """Yerel projeksiyonun Hermes ile senkron durumu (LogiSlot'a ozel)."""

    draft = "draft"
    pending = "pending"
    delivering = "delivering"
    synced = "synced"
    retrying = "retrying"
    failed = "failed"


class TicketOutboxStatus(StrEnum):
    pending = "pending"
    delivering = "delivering"
    sent = "sent"
    failed = "failed"
    dead = "dead"


class TicketCommandType(StrEnum):
    create = "create"
    public_reply = "public_reply"
    reopen = "reopen"
    confirm_close = "confirm_close"
    cancel = "cancel"


class TicketWebhookStatus(StrEnum):
    received = "received"
    processing = "processing"
    processed = "processed"
    failed = "failed"
    dead = "dead"


class TicketAttachmentScanStatus(StrEnum):
    pending_scan = "pending_scan"
    scanning = "scanning"
    clean = "clean"
    rejected = "rejected"
    scan_failed = "scan_failed"


class TicketMessageAuthorType(StrEnum):
    requester = "requester"
    agent = "agent"
    system = "system"
    integration = "integration"


class TicketRequesterType(StrEnum):
    """Yerel talep sahibinin tipi — supplier portal ile yonetim ayrisir."""

    tenant_user = "tenant_user"
    supplier_user = "supplier_user"


#: Musterinin yanit yazabildigi statuler. `closed` ve `cancelled` disaridadir:
#: kapali ticket duzenlenmez, yeni ticket veya yetkili reopen gerekir.
TICKET_REPLYABLE_STATUSES = (
    TicketStatus.open,
    TicketStatus.in_progress,
    TicketStatus.waiting_customer,
    TicketStatus.resolved,
    TicketStatus.reopened,
)

#: Musterinin iptal edebilecegi statuler (agent henuz calismaya baslamamis).
TICKET_CANCELLABLE_STATUSES = (TicketStatus.open,)

#: "Acik" kabul edilen statuler — reconciliation ve liste sekmeleri kullanir.
TICKET_ACTIVE_STATUSES = (
    TicketStatus.open,
    TicketStatus.in_progress,
    TicketStatus.waiting_customer,
    TicketStatus.reopened,
)
