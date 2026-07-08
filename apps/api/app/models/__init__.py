"""Tum SQLAlchemy modelleri.

Alembic autogenerate ve testlerdeki create_all icin her model burada import edilir.
"""

from app.models.appointment import Appointment, AppointmentRevision
from app.models.appointment_series import AppointmentSeries
from app.models.audit import AuditLog
from app.models.auth_session import AuthSession
from app.models.base import Base
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
from app.models.tenant import Facility, Plan, Tenant
from app.models.tenant_user import (
    FacilityMembership,
    Role,
    TenantUser,
    facility_membership_roles,
)

__all__ = [
    "Base",
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
    "AuthSession",
    "AppointmentSeries",
]
