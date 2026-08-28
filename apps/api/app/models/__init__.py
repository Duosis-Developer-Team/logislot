"""Tum SQLAlchemy modelleri.

Alembic autogenerate ve testlerdeki create_all icin her model burada import edilir.
"""

from app.models.appointment import Appointment, AppointmentRevision
from app.models.appointment_series import AppointmentSeries
from app.models.audit import AuditLog
from app.models.auth_handoff import AuthHandoffCode
from app.models.auth_session import AuthSession
from app.models.base import CONTROL_SCHEMA, Base
from app.models.catalog import ProductCategory, VehicleCategory
from app.models.dock import (
    Dock,
    DockConflictGroup,
    DockConflictGroupMember,
    DockOverride,
    dock_product_categories,
    dock_vehicle_categories,
)
from app.models.email_log import EmailLog
from app.models.maintenance_run import MaintenanceRun
from app.models.notification import Notification
from app.models.platform_user import PlatformRole, PlatformUser, platform_user_roles
from app.models.supplier import Supplier, SupplierUser, supplier_product_categories
from app.models.tenancy import PrincipalDirectory, TenantDatastore
from app.models.tenant import Facility, Plan, Tenant
from app.models.tenant_user import (
    FacilityMembership,
    Role,
    TenantUser,
    facility_membership_roles,
)
from app.models.ticketing import (
    SupportTicketAttachmentProjection,
    SupportTicketMessageProjection,
    SupportTicketOutbox,
    SupportTicketProjection,
)
from app.models.ticketing_control import (
    HermesGroupCatalogCache,
    TicketRoutingConfig,
    TicketWebhookInbox,
)

__all__ = [
    "Base",
    "CONTROL_SCHEMA",
    "TenantDatastore",
    "PrincipalDirectory",
    "control_plane_tables",
    "tenant_plane_tables",
    "Tenant",
    "Facility",
    "Plan",
    "PlatformUser",
    "PlatformRole",
    "platform_user_roles",
    "TenantUser",
    "FacilityMembership",
    "Role",
    "facility_membership_roles",
    "ProductCategory",
    "VehicleCategory",
    "Dock",
    "DockOverride",
    "DockConflictGroup",
    "DockConflictGroupMember",
    "dock_product_categories",
    "dock_vehicle_categories",
    "Supplier",
    "SupplierUser",
    "supplier_product_categories",
    "Appointment",
    "AppointmentRevision",
    "Notification",
    "AuditLog",
    "EmailLog",
    "MaintenanceRun",
    "AuthHandoffCode",
    "AuthSession",
    "AppointmentSeries",
    "TicketRoutingConfig",
    "HermesGroupCatalogCache",
    "TicketWebhookInbox",
    "SupportTicketProjection",
    "SupportTicketMessageProjection",
    "SupportTicketAttachmentProjection",
    "SupportTicketOutbox",
]


def control_plane_tables() -> list:
    """Tum tenant'lar icin ORTAK tablolar — FK bagimlilik sirasinda."""
    return [t for t in Base.metadata.sorted_tables if t.schema == CONTROL_SCHEMA]


def tenant_plane_tables() -> list:
    """Her tenant'in KENDI semasinda cogaltilan tablolar — FK sirasinda.

    Duzlem, modelin sema isaretinden TURETILIR; elle tutulan bir liste
    olmadigi icin yeni bir model eklendiginde listeler kendiliginden dogru
    kalir (yanlis duzleme dusen tablo riski yok).
    """
    return [t for t in Base.metadata.sorted_tables if t.schema is None]
