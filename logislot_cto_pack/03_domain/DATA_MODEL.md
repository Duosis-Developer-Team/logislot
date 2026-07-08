# Domain Data Model

Bu dosya uygulama entity modelinin CTO seviyesindeki sözleşmesidir. Claude Code migration ve modelleri bu sözleşmeye göre oluşturmalıdır.

## Core SaaS

### Tenant

- id: uuid
- commercial_name: string
- display_name: string
- status: enum trial/active/suspended/archived
- primary_contact fields
- billing_contact fields
- default_language
- default_timezone
- assigned_plan_id nullable
- notes nullable
- timestamps

### Facility

- id: uuid
- tenant_id
- name
- address nullable
- timezone
- status: active/inactive
- default_working_profile_json
- plan_override_id nullable
- branding_json nullable
- timestamps

### Plan

- id
- name
- scope: tenant/facility
- billing_unit_label
- measurable_dimensions_json
- rate_card_json
- valid_from/valid_until
- status: draft/active/retired

## Users and RBAC

### PlatformUser

- id
- name
- email
- password_hash
- status
- platform_role_ids
- timestamps

### PlatformRole

- id
- name
- permissions_json

### TenantUser

- id
- tenant_id
- name
- email
- username nullable
- password_hash
- status
- default_facility_id nullable
- timestamps

### FacilityMembership

- id
- tenant_user_id
- tenant_id
- facility_id
- role_ids
- assigned_dock_ids nullable/list

### Role

- id
- tenant_id
- facility_id nullable if tenant-wide template
- name
- permissions_json
- is_default
- is_system

## Catalogs

### ProductCategory

- id
- tenant_id
- facility_id
- name
- display_name
- description
- min_block_minutes
- default_vehicle_category_id nullable
- is_active
- timestamps

### VehicleCategory

- id
- tenant_id
- facility_id
- name
- display_name
- description
- physical_note nullable
- is_active
- timestamps

## Docks

### Dock

- id
- tenant_id
- facility_id
- name
- note nullable
- is_active
- working_hours_json
- responsible_user_ids optional
- timestamps

Relations:

- Dock accepted product categories: many-to-many
- Dock accepted vehicle categories: many-to-many. Empty list means all vehicle categories accepted for backward compatibility.

### DockOverride

- id
- tenant_id
- facility_id
- dock_id
- date
- type: closed / extra_hours
- start_time nullable
- end_time nullable
- reason nullable

### DockConflictGroup

- id
- tenant_id
- facility_id
- name
- relation_type: mutual_block / shared_capacity / conditional
- trigger_condition_json nullable, e.g. `{vehicle_category_ids: [...]}`
- is_active
- timestamps

### DockConflictGroupMember

- id
- group_id
- dock_id

## Suppliers

### Supplier

- id
- tenant_id
- facility_id
- company_name
- code
- category_label nullable
- contact_name/email/phone
- status: active/inactive
- auto_approval_enabled
- min_block_minutes nullable
- max_block_minutes nullable
- weekly_quota nullable
- monthly_quota nullable
- timestamps

Relations:

- Supplier allowed product categories: many-to-many
- Supplier users/accounts: one-to-many or user linked to supplier

## Appointments

### Appointment

- id
- tenant_id
- facility_id
- supplier_id
- dock_id nullable until assigned; normally set by rule engine on creation/approval
- product_category_id
- vehicle_category_id
- product_name
- quantity
- quantity_unit: pallet/piece/box/carton
- license_plate nullable
- driver_name nullable
- driver_phone nullable
- delivery_type: standard/cargo
- cargo_window: morning/afternoon/all_day nullable
- cargo_min_block_minutes nullable
- requested_start_at nullable for cargo rough flow depending implementation
- requested_end_at nullable
- scheduled_start_at
- scheduled_end_at
- duration_minutes
- status: pending/approved/revision_pending/rejected/completed/cancelled
- rejection_reason nullable
- revision_note nullable
- original_start_at nullable
- original_end_at nullable
- recurring_rule nullable
- created_by_type: supplier/tenant_user/platform/system
- created_by_id
- timestamps

### AppointmentRevision

- id
- appointment_id
- old_start_at
- old_end_at
- old_dock_id
- new_start_at
- new_end_at
- new_dock_id
- note
- revised_by_user_id
- created_at

### Notification

- id
- tenant_id
- facility_id
- recipient_user_id nullable
- recipient_supplier_id nullable
- type
- title
- body
- entity_type/entity_id
- read_at nullable
- created_at

## Reporting materialized views optional

- facility_daily_metrics
- dock_utilization_daily
- supplier_activity_monthly

Bunlar ilk sprintte zorunlu değildir; rapor endpointleri doğrudan query ile başlayabilir.
