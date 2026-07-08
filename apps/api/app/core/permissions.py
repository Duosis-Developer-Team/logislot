"""Izin sabitleri.

IKI AYRI IZIN UZAYI vardir ve asla birlesmez:
- TenantPermission: tenant/facility kapsamindaki kullanicilar icin.
- PlatformPermission: SaaS saglayici personeli (PlatformUser) icin.
"""


class TenantPermission:
    APPT_VIEW = "appt.view"
    APPT_CREATE = "appt.create"
    APPT_APPROVE = "appt.approve"
    APPT_REJECT = "appt.reject"
    APPT_REVISE = "appt.revise"
    APPT_COMPLETE = "appt.complete"
    APPT_CANCEL = "appt.cancel"
    CATEGORY_MANAGE = "category.manage"
    VEHICLE_CATEGORY_MANAGE = "vehicle_category.manage"
    DOCK_MANAGE = "dock.manage"
    DOCK_CONFLICT_GROUP_MANAGE = "dock_conflict_group.manage"
    SUPPLIER_MANAGE = "supplier.manage"
    USER_MANAGE = "user.manage"
    ROLE_MANAGE = "role.manage"
    REPORT_VIEW = "report.view"
    CALENDAR_VIEW = "calendar.view"
    CALENDAR_OVERRIDE = "calendar.override"
    AUDIT_VIEW = "audit.view"  # Sprint 11: denetim izleri (guvenlik hassas)

    ALL = [
        APPT_VIEW,
        APPT_CREATE,
        APPT_APPROVE,
        APPT_REJECT,
        APPT_REVISE,
        APPT_COMPLETE,
        APPT_CANCEL,
        CATEGORY_MANAGE,
        VEHICLE_CATEGORY_MANAGE,
        DOCK_MANAGE,
        DOCK_CONFLICT_GROUP_MANAGE,
        SUPPLIER_MANAGE,
        USER_MANAGE,
        ROLE_MANAGE,
        REPORT_VIEW,
        CALENDAR_VIEW,
        CALENDAR_OVERRIDE,
        AUDIT_VIEW,
    ]


class PlatformPermission:
    TENANT_VIEW = "platform.tenant.view"
    TENANT_MANAGE = "platform.tenant.manage"
    FACILITY_VIEW = "platform.facility.view"
    PLAN_VIEW = "platform.plan.view"
    PLAN_MANAGE = "platform.plan.manage"
    PLAN_ASSIGN = "platform.plan.assign"
    ANALYTICS_VIEW = "platform.analytics.view"
    AUDIT_VIEW = "platform.audit.view"  # Sprint 12: platform denetim izleri
    IMPERSONATE = "platform.impersonate"

    ALL = [
        TENANT_VIEW,
        TENANT_MANAGE,
        FACILITY_VIEW,
        PLAN_VIEW,
        PLAN_MANAGE,
        PLAN_ASSIGN,
        ANALYTICS_VIEW,
        AUDIT_VIEW,
        IMPERSONATE,
    ]


class SupplierPortalPermission:
    APPOINTMENT_CREATE = "supplier_portal.appointment.create"
    APPOINTMENT_VIEW_OWN = "supplier_portal.appointment.view_own"
    APPOINTMENT_CANCEL_OWN = "supplier_portal.appointment.cancel_own"
    PROFILE_VIEW = "supplier_portal.profile.view"
