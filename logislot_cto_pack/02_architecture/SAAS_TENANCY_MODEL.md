# SaaS Tenancy Model

## Hiyerarşi

```text
Tenant
  └── Facility
        ├── Product Categories
        ├── Vehicle Categories
        ├── Docks
        ├── Dock Conflict Groups
        ├── Suppliers
        ├── Users / Roles / Permissions
        └── Appointments
```

## Tenant

Tenant, ana müşteri hesabıdır. Operasyonel veri tutmaz; kimlik, faturalama, plan ve üst düzey müşteri bilgilerini taşır.

Alanlar:

- id
- commercial_name
- display_name
- status: trial / active / suspended / archived
- primary_contact_name/email/phone
- billing_contact_name/email/phone
- default_language
- default_timezone
- assigned_plan_id
- notes
- created_at, updated_at

## Facility

Facility, fiziksel mal kabul lokasyonudur. Tüm operasyonel konfigürasyonun kapsamıdır.

Alanlar:

- id
- tenant_id
- name
- address
- location metadata
- timezone
- status: active / inactive
- default_working_profile
- optional plan_override_id
- branding settings reference
- created_at, updated_at

## Plan / Pricing Profile

Plan bir faturalama motoru değildir; politika kabıdır.

Alanlar:

- id
- name
- scope: tenant / facility
- billing_unit_label: fixed / per_appointment / per_active_dock / per_facility / hybrid / custom
- measurable_dimensions: created_appointments, completed_appointments, active_docks, active_suppliers, active_users
- rate_card: JSON list `{dimension, unit_price, included_quota, overage_rule}`
- valid_from
- valid_until
- status: draft / active / retired

## Facility scope zorunlulukları

Aşağıdaki tüm varlıklar facility scope'ludur:

- ProductCategory
- VehicleCategory
- Dock
- DockWorkingHours
- DockOverride
- DockConflictGroup
- Supplier
- Appointment
- TenantUser facility memberships
- Roles/permissions assignment scope
- Branding override

## Migration kararı

Mevcut BTA kurulumunun hedef sonucu:

- Tenant: BTA / Cakes & Bakes
- Facility: Cakes & Bakes Üretim Tesisi
- Tüm mevcut kategori/rampa/tedarikçi/kullanıcı/randevular bu facility'ye bağlanır.

Bu migration yapısı, ileride yeni müşteriler ve aynı müşterinin yeni tesisleri eklendiğinde aynı modeli kullanır.
