"""SaaS izolasyon testleri: tenant/facility/supplier/platform sinirlar."""

from app.core.permissions import TenantPermission
from app.core.security import hash_password
from app.models import Facility, FacilityMembership, Role, Tenant, TenantUser
from tests.conftest import auth_headers, login


async def _create_other_tenant(session_maker) -> Facility:
    """Ikinci bir tenant + facility + kullanici olusturur (izolasyon icin)."""
    async with session_maker() as db:
        tenant = Tenant(
            commercial_name="Rakip Gida", display_name="Rakip Gida", slug="rakip"
        )
        db.add(tenant)
        await db.flush()
        facility = Facility(tenant_id=tenant.id, name="Rakip Depo", timezone="Europe/Istanbul")
        db.add(facility)
        await db.flush()
        role = Role(
            tenant_id=tenant.id,
            facility_id=facility.id,
            name="Sistem Yoneticisi",
            permissions_json=TenantPermission.ALL,
        )
        db.add(role)
        await db.flush()
        user = TenantUser(
            tenant_id=tenant.id,
            name="Rakip Admin",
            email="admin@rakip.com",
            password_hash=hash_password("Demo123!"),
            default_facility_id=facility.id,
        )
        db.add(user)
        await db.flush()
        db.add(
            FacilityMembership(
                tenant_user_id=user.id,
                tenant_id=tenant.id,
                facility_id=facility.id,
                roles=[role],
            )
        )
        await db.commit()
        return facility


async def test_tenant_cannot_access_other_facility(client, seeded, session_maker):
    await _create_other_tenant(session_maker)
    other_token = await login(client, "/auth/login", "admin@rakip.com")
    bta_facility_id = seeded["facility"].id
    response = await client.get(
        f"/facilities/{bta_facility_id}/appointments", headers=auth_headers(other_token)
    )
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "FORBIDDEN"


async def test_supplier_sees_only_own_appointments(client, seeded):
    token = await login(client, "/auth/supplier-login", "tedarikci@anadoluun.com")
    response = await client.get("/supplier/appointments", headers=auth_headers(token))
    data = response.json()["data"]
    own_id = str(seeded["suppliers"]["un"].id)
    assert len(data) == 9  # 4 guncel + 5 tarihsel (rapor seed'i)
    assert all(a["supplier_id"] == own_id for a in data)


async def test_supplier_cannot_read_other_suppliers_appointment(client, seeded, session_maker):
    from sqlalchemy import select

    from app.models import Appointment

    async with session_maker() as db:
        result = await db.execute(
            select(Appointment).where(
                Appointment.supplier_id == seeded["suppliers"]["soguk"].id
            )
        )
        other_appointment = result.scalars().first()

    token = await login(client, "/auth/supplier-login", "tedarikci@anadoluun.com")
    response = await client.get(
        f"/supplier/appointments/{other_appointment.id}", headers=auth_headers(token)
    )
    assert response.status_code == 404


async def test_platform_user_cannot_access_operational_data(client, seeded):
    token = await login(client, "/auth/platform-login", "admin@logislot.com")
    facility_id = seeded["facility"].id
    response = await client.get(
        f"/facilities/{facility_id}/appointments", headers=auth_headers(token)
    )
    assert response.status_code == 403


async def test_tenant_user_cannot_access_platform_endpoints(client, seeded):
    token = await login(client, "/auth/login", "admin@cakesbakes.com")
    response = await client.get("/platform/tenants", headers=auth_headers(token))
    assert response.status_code == 403


async def test_viewer_cannot_approve(client, seeded, session_maker):
    from sqlalchemy import select

    from app.core.enums import AppointmentStatus
    from app.models import Appointment

    async with session_maker() as db:
        result = await db.execute(
            select(Appointment).where(Appointment.status == AppointmentStatus.pending)
        )
        pending = result.scalars().first()

    token = await login(client, "/auth/login", "izleyici@cakesbakes.com")
    facility_id = seeded["facility"].id
    response = await client.post(
        f"/facilities/{facility_id}/appointments/{pending.id}/approve",
        headers=auth_headers(token),
    )
    assert response.status_code == 403
    assert "appt.approve" in response.json()["error"]["message"]


async def test_viewer_can_view(client, seeded):
    token = await login(client, "/auth/login", "izleyici@cakesbakes.com")
    facility_id = seeded["facility"].id
    response = await client.get(
        f"/facilities/{facility_id}/appointments", headers=auth_headers(token)
    )
    assert response.status_code == 200
    assert len(response.json()["data"]) == 17
