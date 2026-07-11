/**
 * Backend Out şemalarıyla birebir eşleşen DTO tipleri.
 * KAYNAK CONTRACT: apps/web/src/lib/api/types.ts ile aynı — web/mobile parity
 * için iki dosya senkron tutulur (bkz. docs/WEB_MOBILE_PARITY.md).
 */

export interface FacilitySummaryDto {
  id: string;
  tenant_id: string;
  name: string;
  timezone: string;
  status: string;
}

export interface MeDto {
  id: string;
  user_type: "platform" | "tenant" | "supplier";
  name: string;
  email: string;
  tenant_id: string | null;
  supplier_id: string | null;
  default_facility_id: string | null;
  permissions: string[];
  facility_permissions: Record<string, string[]>;
  facilities: FacilitySummaryDto[];
}

export interface ProductCategoryDto {
  id: string;
  name: string;
  display_name: string;
  description: string | null;
  min_block_minutes: number;
  default_vehicle_category_id: string | null;
  is_active: boolean;
}

export interface VehicleCategoryDto {
  id: string;
  name: string;
  display_name: string;
  description: string | null;
  physical_note: string | null;
  is_active: boolean;
}

export interface SupplierProfileDto {
  id: string;
  company_name: string;
  code: string;
  category_label: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  status: string;
  is_active: boolean;
  auto_approval_enabled: boolean;
  min_block_minutes: number | null;
  max_block_minutes: number | null;
  weekly_quota: number | null;
  monthly_quota: number | null;
  facility: { id: string; name: string; timezone: string };
}

export interface SupplierCatalogDto {
  product_categories: ProductCategoryDto[];
  vehicle_categories: VehicleCategoryDto[];
  limits: {
    min_block_minutes: number | null;
    max_block_minutes: number | null;
    weekly_quota: number | null;
    monthly_quota: number | null;
    auto_approval_enabled: boolean;
  };
  delivery_types: string[];
  cargo_windows: string[];
  cargo_default_min_block_minutes: number;
  quantity_units: { value: string; label: string }[];
}

export interface AllowedActions {
  approve: boolean;
  reject: boolean;
  revise: boolean;
  complete: boolean;
  cancel: boolean;
}

export interface SeriesSummaryDto {
  id: string;
  frequency: "weekly" | "biweekly" | "monthly";
  occurrence_count: number;
  occurrence_index: number | null;
}

export interface AppointmentDto {
  id: string;
  supplier_id: string;
  dock_id: string | null;
  product_category_id: string;
  vehicle_category_id: string | null;
  product_name: string;
  quantity: number;
  quantity_unit: string;
  license_plate: string | null;
  driver_name: string | null;
  driver_phone: string | null;
  delivery_type: "standard" | "cargo";
  cargo_window: string | null;
  scheduled_start_at: string;
  scheduled_end_at: string;
  duration_minutes: number;
  status: string;
  rejection_reason: string | null;
  cancellation_reason?: string | null;
  completion_note?: string | null;
  revision_note: string | null;
  original_start_at: string | null;
  original_end_at: string | null;
  series_id?: string | null;
  occurrence_index?: number | null;
  series?: SeriesSummaryDto | null;
  created_at: string;
  supplier_name?: string | null;
  dock_name?: string | null;
  product_category_name?: string | null;
  vehicle_category_name?: string | null;
  has_cargo_warning?: boolean;
  allowed_actions?: AllowedActions;
  supplier_contact?: { name: string | null; email: string | null; phone: string | null } | null;
  revisions?: {
    id: string;
    old_start_at: string;
    old_end_at: string;
    new_start_at: string;
    new_end_at: string;
    note: string | null;
    created_at: string;
  }[];
}

export interface DashboardSummaryDto {
  today_appointments: number;
  pending_approvals: number;
  approved_today: number;
  completed_today: number;
  week_total: number;
  active_suppliers: number;
  active_docks: number;
  cargo_warned: number;
  upcoming: AppointmentDto[];
  pending_list: AppointmentDto[];
}

export interface SlotDto {
  start: string;
  end: string;
  status: "available" | "partial" | "full";
  candidate_dock_ids: string[];
  blocking_reasons: string[];
  advisory_warnings: { code: string; message: string; dock_id: string }[];
}

export interface CalendarDayDto {
  date: string;
  facility: { id: string; name: string; timezone: string };
  working_window: { start: string; end: string; slot_minutes: number };
  docks: {
    id: string;
    name: string;
    note: string | null;
    active: boolean;
    day_window: { start: string; end: string } | null;
    has_cargo_warning: boolean;
  }[];
  appointments: AppointmentDto[];
  cargo_advisories: {
    dock_id: string;
    dock_name: string | null;
    window: string;
    appointment_id: string;
    message: string;
  }[];
  blocked_slots: {
    dock_id: string;
    start: string;
    end: string;
    reason: string;
    note: string | null;
  }[];
}

export interface SupplierSeriesRowDto {
  id: string;
  frequency: "weekly" | "biweekly" | "monthly";
  occurrence_count: number;
  status: string;
  status_counts: Record<string, number>;
  next_appointment_at: string | null;
  product_name: string | null;
  can_cancel_series: boolean;
  future_cancellable_count: number;
}

// ------------------------------------------------------------------ platform

export interface PlatformTenantDto {
  id: string;
  commercial_name: string;
  display_name: string;
  slug: string;
  status: string;
  primary_contact_name: string | null;
  primary_contact_email: string | null;
  default_timezone: string;
  assigned_plan_id: string | null;
  created_at: string;
}

export interface PlatformFacilityDto {
  id: string;
  tenant_id: string;
  name: string;
  address: string | null;
  timezone: string;
  status: string;
  plan_override_id: string | null;
  created_at: string;
}

export interface PlatformUsageDto {
  range: { date_from: string; date_to: string };
  totals: {
    tenants: number;
    facilities: number;
    active_facilities: number;
    appointments_created: number;
    appointments_completed: number;
    active_docks: number;
    active_suppliers: number;
    active_users: number;
  };
  tenant_usage: {
    tenant_id: string;
    tenant_name: string;
    status: string;
    assigned_plan: string | null;
    facility_count: number;
    appointments_created: number;
    appointments_completed: number;
    active_docks: number;
    active_suppliers: number;
    last_activity_at: string | null;
    approval_sla_avg_minutes: number | null;
  }[];
  facility_usage: {
    facility_id: string;
    tenant_id: string;
    tenant_name: string | null;
    facility_name: string;
    status: string;
    assigned_plan: string | null;
    plan_is_override: boolean;
    appointments_created: number;
    appointments_completed: number;
    active_docks: number;
    active_suppliers: number;
    active_users: number;
    last_activity_at: string | null;
  }[];
}
