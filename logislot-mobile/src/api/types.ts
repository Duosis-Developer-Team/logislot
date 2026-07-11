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

export type WorkingHours = Record<string, { start: string; end: string } | null>;

export interface DockDto {
  id: string;
  name: string;
  note: string | null;
  is_active: boolean;
  working_hours_json: WorkingHours | null;
  accepted_product_category_ids: string[];
  accepted_vehicle_category_ids: string[];
}

export type ConflictRelationType = "mutual_block" | "shared_capacity" | "conditional";

export interface ConflictGroupDto {
  id: string;
  name: string;
  relation_type: ConflictRelationType;
  trigger_condition_json: { vehicle_category_ids?: string[] } | null;
  is_active: boolean;
  member_dock_ids: string[];
}

export type OverrideType = "closed" | "extra_hours";

export interface OverrideDto {
  id: string;
  dock_id: string;
  date: string;
  type: OverrideType;
  start_time: string | null;
  end_time: string | null;
  reason: string | null;
  is_active: boolean;
}

export interface SupplierDto {
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
  notes: string | null;
  allowed_product_category_ids: string[];
  account_email: string | null;
  account_active: boolean | null;
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

export interface SeriesCreateResultDto {
  series_id: string;
  frequency: "weekly" | "biweekly" | "monthly";
  occurrence_count: number;
  appointments: AppointmentDto[];
}

export interface CalendarWeekDayDto {
  date: string;
  total: number;
  pending: number;
  approved: number;
  revision_pending: number;
  completed: number;
  cancelled: number;
  cargo: number;
  dock_count: number;
  active_dock_count: number;
  utilization_percent: number;
  has_closed_override: boolean;
  has_extra_hours: boolean;
  top_docks: { dock_id: string; dock_name: string | null; appointments: number; cargo: number }[];
}

export interface CalendarWeekDto {
  week_start: string;
  week_end: string;
  timezone: string;
  days: CalendarWeekDayDto[];
}

export interface NotificationDto {
  id: string;
  type: string;
  severity: "info" | "success" | "warning" | "error";
  title: string;
  body: string | null;
  entity_type: string | null;
  entity_id: string | null;
  metadata_json: {
    appointment_id?: string;
    route_hint?: string;
    status?: string;
    dock_id?: string | null;
    supplier_id?: string;
    reason?: string | null;
    old_start_at?: string | null;
    new_start_at?: string | null;
    window?: string | null;
  } | null;
  read_at: string | null;
  created_at: string;
  is_read: boolean;
}

export interface NotificationPreferencesDto {
  in_app_enabled: boolean;
  email_enabled: boolean;
  email_events: Record<string, boolean>;
}

export interface FacilityUserDto {
  id: string;
  name: string;
  email: string;
  status: string;
  is_active: boolean;
  roles: { id: string; name: string; display_name: string }[];
  assigned_dock_ids: string[] | null;
}

export interface RoleDto {
  id: string;
  name: string;
  display_name: string;
  description: string | null;
  permissions: string[];
  is_default: boolean;
  is_system: boolean;
  is_active: boolean;
}

// ------------------------------------------------------------ raporlar & loglar

export interface BreakdownRow {
  key: string;
  label: string | null;
  count: number;
  completed: number;
  cargo: number;
  cancelled: number;
  rejected: number;
  percentage: number;
}

export interface ReportsSummaryDto {
  range: { date_from: string; date_to: string; timezone: string };
  scope: { restricted: boolean };
  totals: {
    appointments: number;
    pending: number;
    approved: number;
    revision_pending: number;
    completed: number;
    rejected: number;
    cancelled: number;
    cargo: number;
    auto_approved: number;
    manual_approval: number;
  };
  rates: {
    completion_rate: number;
    rejection_rate: number;
    cancellation_rate: number;
    cargo_rate: number;
  };
  approval_sla: {
    average_minutes_to_decision: number | null;
    median_minutes_to_decision: number | null;
    pending_over_2h: number;
    pending_over_24h: number;
  };
  by_status: { key: string; label: string; count: number; percentage: number }[];
  by_category: BreakdownRow[];
  by_dock: {
    dock_id: string;
    dock_name: string;
    appointment_count: number;
    blocked_minutes: number;
    utilization_percent: number;
  }[];
  by_supplier: {
    supplier_id: string;
    supplier_name: string | null;
    appointment_count: number;
    completed: number;
    cancelled: number;
    rejected: number;
    cargo: number;
  }[];
  daily_trend: { date: string; total: number; completed: number; pending: number; cargo: number }[];
}

export interface EmailLogDto {
  id: string;
  recipient_email: string;
  recipient_name: string | null;
  subject: string;
  template_key: string;
  status: string;
  provider: string;
  appointment_id: string | null;
  created_at: string;
  sent_at: string | null;
  error_message: string | null;
  retry_count: number;
  max_attempts: number;
  next_retry_at: string | null;
  last_attempt_at: string | null;
}

export interface EmailLogListDto {
  items: EmailLogDto[];
  total: number;
  limit: number;
  offset: number;
  summary: { sent: number; failed: number; queued: number; skipped: number };
}

export interface AuditEntryDto {
  id: string;
  created_at: string;
  actor_type: string;
  actor_name: string | null;
  action: string;
  summary: string;
  entity_type: string | null;
  entity_id: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
}

export interface AuditListDto {
  items: AuditEntryDto[];
  total: number;
  limit: number;
  offset: number;
}

export interface FacilityPlanWarningsDto {
  effective_plan: { id: string; name: string; is_override: boolean } | null;
  warnings: {
    dimension: string;
    label: string;
    used: number;
    included_quota: number;
    percent: number;
    severity: "info" | "warning" | "critical";
    message: string;
  }[];
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
  bootstrap?: {
    vehicle_categories: number;
    product_categories: number;
    docks: number;
    roles: number;
  } | null;
  // Yalnızca create yanıtında dolu; geçici parola BİR kez gösterilir.
  initial_admin?: {
    id: string;
    name: string;
    email: string;
    temporary_password: string;
    must_change_password: boolean;
  } | null;
}

export interface PlanDto {
  id: string;
  name: string;
  scope: string;
  billing_unit_label: string;
  measurable_dimensions_json: string[] | null;
  rate_card_json: unknown[] | null;
  status: string;
}

export interface PlanUsageWarningDto {
  tenant_id: string;
  tenant_name: string;
  facility_id: string | null;
  facility_name: string | null;
  plan_name: string;
  dimension: string;
  used: number;
  included_quota: number;
  percent: number;
  severity: "info" | "warning" | "critical";
  message: string;
}

export interface SchedulerJobStatus {
  last_status: string;
  last_finished_at: string | null;
  processed_count: number;
  error_message: string | null;
}

export interface SupportHealthDto {
  failed_email_count: number;
  due_email_retry_count: number;
  unread_critical_notification_count: number;
  pending_appointment_count: number;
  revision_pending_appointment_count: number;
  tenant_count: number;
  active_facility_count: number;
  plan_warning_count: number;
  scheduler: Record<string, SchedulerJobStatus | null>;
  config: {
    environment: string;
    email_provider: string;
    docs_enabled: boolean;
    rate_limit_enabled: boolean;
    scheduler_enabled: boolean;
  };
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
