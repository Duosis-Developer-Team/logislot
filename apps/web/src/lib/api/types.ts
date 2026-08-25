/** Backend Out semalariyla birebir esleyen DTO tipleri. */

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
  /** null = kategori bazli ust sinir yok; yalnizca tedarikci limiti gecerli. */
  max_block_minutes: number | null;
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
  /** Kargo teslimat tipi bu tedarikci icin acik mi (varsayilan kapali). */
  cargo_enabled: boolean;
  min_block_minutes: number | null;
  max_block_minutes: number | null;
  weekly_quota: number | null;
  monthly_quota: number | null;
  notes: string | null;
  allowed_product_category_ids: string[];
  account_email: string | null;
  account_active: boolean | null;
}

export interface SupplierProfileDto extends SupplierDto {
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
    cargo_enabled: boolean;
  };
  /** Yalnizca tedarikciye ACIK tipler; kargo kapaliysa sadece "standard". */
  delivery_types: string[];
  cargo_windows: string[];
  cargo_default_min_block_minutes: number;
  quantity_units: { value: string; label: string }[];
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
  // Isim zenginlestirme (liste/detay endpointlerinden)
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

export interface SeriesSummaryDto {
  id: string;
  frequency: "weekly" | "biweekly" | "monthly";
  occurrence_count: number;
  occurrence_index: number | null;
}

export interface SeriesCreateResultDto {
  series_id: string;
  frequency: "weekly" | "biweekly" | "monthly";
  occurrence_count: number;
  appointments: AppointmentDto[];
}

export interface AllowedActions {
  approve: boolean;
  reject: boolean;
  revise: boolean;
  complete: boolean;
  cancel: boolean;
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

export interface SlotDto {
  start: string;
  end: string;
  status: "available" | "partial" | "full";
  candidate_dock_ids: string[];
  blocking_reasons: string[];
  advisory_warnings: { code: string; message: string; dock_id: string }[];
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

// --- Destek ticketlari ---
//
// Backend `app/routers/tickets.py` cikti sekliyle birebir. Bu dosya
// `logislot-mobile/src/api/types.ts` ile SENKRON tutulur (parite kurali).

export interface TicketMessageDto {
  id: string;
  author_type: "requester" | "agent" | "system" | "integration";
  author_display_name: string | null;
  body: string;
  body_format: string;
  created_at: string | null;
  /** Yerel kayit henuz destek merkezine ulasmadi. */
  is_pending: boolean;
}

export interface TicketAttachmentDto {
  id: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  scan_status: "pending_scan" | "scanning" | "clean" | "rejected" | "scan_failed";
  message_id: string | null;
  downloadable: boolean;
}

export interface TicketResolutionDto {
  summary: string | null;
  code: string | null;
  fix_version: string | null;
  resolved_at: string | null;
  resolved_by_group_name: string | null;
}

export interface TicketRowDto {
  id: string;
  /** Kanonik numara (TKT-…). Hermes'ten gelene kadar null. */
  ticket_number: string | null;
  title: string;
  category: string;
  impact: string;
  status: string;
  delivery_status: string;
  requester_name: string | null;
  requester_type: "tenant_user" | "supplier_user";
  supplier_name: string | null;
  group_name: string | null;
  created_at: string | null;
  updated_at: string | null;
  resolved_at: string | null;
  sync_gap: boolean;
  last_sync_error_code: string | null;
}

export interface TicketDetailDto extends TicketRowDto {
  description: string;
  reproduction_steps: string | null;
  expected_result: string | null;
  actual_result: string | null;
  error_code: string | null;
  correlation_id: string | null;
  occurred_at: string | null;
  client_context: Record<string, string>;
  resolution: TicketResolutionDto | null;
  messages: TicketMessageDto[];
  attachments: TicketAttachmentDto[];
  last_sync_at: string | null;
  permissions: { can_reply: boolean; can_reopen: boolean; can_cancel: boolean };
}

export interface TicketConfigDto {
  enabled: boolean;
  can_create: boolean;
  can_comment: boolean;
  can_view_all: boolean;
  routing: {
    ready: boolean;
    /** Yalnizca GOSTERIM adi; grup kimligi tarayiciya hic gonderilmez. */
    group_display_name: string | null;
    verified_at: string | null;
    reason: string | null;
  };
  attachments: {
    max_files: number;
    max_file_size_bytes: number;
    max_total_bytes: number;
    allowed_mime_types: string[];
  };
}

export interface TicketUploadSessionDto {
  upload_id: string;
  upload_url: string;
  required_headers: Record<string, string>;
  expires_at: string | null;
  max_size_bytes: number | null;
}

// --- Platform: ticket yonlendirmesi ---

export interface HermesGroupDto {
  id: string;
  name: string;
  description: string | null;
  member_count: number | null;
  is_active: boolean;
  fetched_at: string | null;
}

export type TicketRouteStatus =
  | "unconfigured"
  | "disabled"
  | "needs_verification"
  | "error"
  | "ready";

export interface TicketRouteRowDto {
  tenant_id: string;
  tenant_name: string;
  tenant_slug: string;
  tenant_status: string;
  configured: boolean;
  status: TicketRouteStatus;
  hermes_group_id: string | null;
  hermes_group_name: string | null;
  route_version: number;
  is_active: boolean;
  last_verified_at: string | null;
  last_error_code: string | null;
  last_error_at: string | null;
  /** Icerik ICERMEZ; yalnizca adet. */
  delivery: { pending: number; failed: number; dead: number };
}

export interface TicketRouteDetailDto extends Omit<TicketRouteRowDto, "delivery"> {
  groups: HermesGroupDto[];
  catalog_stale: boolean;
  catalog_error_code: string | null;
  delivery: { pending: number; failed: number; dead: number };
}

export interface TicketIntegrationHealthDto {
  enabled: boolean;
  hermes_configured: boolean;
  webhook_secret_configured: boolean;
  tenant_count: number;
  configured_tenant_count: number;
  unconfigured_tenant_count: number;
  route_error_count: number;
  catalog_group_count: number;
  catalog_last_fetched_at: string | null;
  catalog_stale: boolean;
  outgoing: { pending: number; failed: number; dead: number };
  webhook_inbox: Record<string, number>;
  jobs: Record<
    string,
    {
      last_status: string;
      last_finished_at: string | null;
      processed_count: number;
      error_message: string | null;
    } | null
  >;
  checked_at: string;
}
