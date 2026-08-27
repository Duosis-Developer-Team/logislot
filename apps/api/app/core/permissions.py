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
    # Destek ticketlari (Hermes Ticket Hub entegrasyonu)
    TICKET_VIEW = "ticket.view"
    TICKET_CREATE = "ticket.create"
    TICKET_COMMENT = "ticket.comment"
    TICKET_VIEW_ALL = "ticket.view_all"

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
        TICKET_VIEW,
        TICKET_CREATE,
        TICKET_COMMENT,
        TICKET_VIEW_ALL,
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
    # Hermes ticket yonlendirmesi. Bu izinler ticket ICERIGINE erisim VERMEZ;
    # yalnizca "hangi tenant hangi Hermes ekibine gidiyor" konfigurasyonunu ve
    # entegrasyon sagligini yonetir (bkz. 02_LOGISLOT/02, bolum 3).
    TICKET_ROUTING_VIEW = "platform.ticket_routing.view"
    TICKET_ROUTING_MANAGE = "platform.ticket_routing.manage"
    TICKET_INTEGRATION_HEALTH_VIEW = "platform.ticket_integration_health.view"

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
        TICKET_ROUTING_VIEW,
        TICKET_ROUTING_MANAGE,
        TICKET_INTEGRATION_HEALTH_VIEW,
    ]


class SupplierPortalPermission:
    APPOINTMENT_CREATE = "supplier_portal.appointment.create"
    APPOINTMENT_VIEW_OWN = "supplier_portal.appointment.view_own"
    APPOINTMENT_CANCEL_OWN = "supplier_portal.appointment.cancel_own"
    PROFILE_VIEW = "supplier_portal.profile.view"
    # Destek ticketlari — tedarikci HER ZAMAN yalnizca kendi taleplerini gorur;
    # "view_all" karsiligi bilerek YOKTUR (bkz. 02_LOGISLOT/02, bolum 2).
    TICKET_VIEW_OWN = "supplier_portal.ticket.view_own"
    TICKET_CREATE = "supplier_portal.ticket.create"
    TICKET_COMMENT_OWN = "supplier_portal.ticket.comment_own"

    #: Tedarikci portalinin varsayilan izin seti. Supplier hesaplari icin ayri
    #: bir rol tablosu YOKTUR; portal hesabi acildiginda bu set gecerlidir.
    #: (Rol tabanli supplier yetkilendirmesi gelirse bu liste bootstrap
    #: varsayilani olarak kalir.)
    DEFAULT = [
        APPOINTMENT_CREATE,
        APPOINTMENT_VIEW_OWN,
        APPOINTMENT_CANCEL_OWN,
        PROFILE_VIEW,
        TICKET_VIEW_OWN,
        TICKET_CREATE,
        TICKET_COMMENT_OWN,
    ]


#: Bir izin verildiginde ZORUNLU olarak beraberinde gelen izinler.
#:
#: Ticket izinleri icin urun karari (02_LOGISLOT/02, bolum 1): create/comment/
#: view_all izinlerinin hicbiri tek basina anlamli degildir — hepsi listeyi
#: gorebilmeyi gerektirir. Backend rol dogrulamasi bu haritayi uygular, boylece
#: UI'dan eksik secilse bile rol tutarli kaydedilir.
TENANT_PERMISSION_DEPENDENCIES: dict[str, tuple[str, ...]] = {
    TenantPermission.TICKET_CREATE: (TenantPermission.TICKET_VIEW,),
    TenantPermission.TICKET_COMMENT: (TenantPermission.TICKET_VIEW,),
    TenantPermission.TICKET_VIEW_ALL: (TenantPermission.TICKET_VIEW,),
}

PLATFORM_PERMISSION_DEPENDENCIES: dict[str, tuple[str, ...]] = {
    PlatformPermission.TICKET_ROUTING_MANAGE: (PlatformPermission.TICKET_ROUTING_VIEW,),
}


def expand_tenant_permissions(codes: list[str] | set[str]) -> list[str]:
    """Bagimliliklari eklenmis, sirali ve tekilsiz izin listesi dondurur."""
    return _expand(codes, TENANT_PERMISSION_DEPENDENCIES)


def expand_platform_permissions(codes: list[str] | set[str]) -> list[str]:
    return _expand(codes, PLATFORM_PERMISSION_DEPENDENCIES)


def _expand(codes: list[str] | set[str], deps: dict[str, tuple[str, ...]]) -> list[str]:
    resolved = set(codes)
    # Tek gecis yeterli degil: bir bagimliligin kendi bagimliligi olabilir.
    while True:
        additions = {d for c in resolved for d in deps.get(c, ()) if d not in resolved}
        if not additions:
            break
        resolved |= additions
    return sorted(resolved)
