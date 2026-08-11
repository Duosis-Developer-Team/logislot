"use client";

/** Raporlar + e-posta loglari hook'lari. */

import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api/client";

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
  daily_trend: {
    date: string;
    total: number;
    completed: number;
    pending: number;
    cancelled: number;
    cargo: number;
  }[];
}

export function useReportsSummary(
  facilityId: string | null,
  dateFrom: string,
  dateTo: string,
) {
  return useQuery({
    queryKey: ["reports", facilityId ?? "none", dateFrom, dateTo],
    queryFn: () =>
      apiRequest<ReportsSummaryDto>(
        `/facilities/${facilityId}/reports/summary?date_from=${dateFrom}&date_to=${dateTo}`,
      ),
    enabled: facilityId !== null,
  });
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

export function useEmailLogs(facilityId: string | null, appointmentId: string | null) {
  return useQuery({
    queryKey: ["email-logs", facilityId ?? "none", appointmentId ?? "all"],
    queryFn: async () => {
      const data = await apiRequest<EmailLogListDto>(
        `/facilities/${facilityId}/email-logs${
          appointmentId ? `?appointment_id=${appointmentId}` : ""
        }`,
      );
      return data.items;
    },
    enabled: facilityId !== null && appointmentId !== null,
  });
}

export interface EmailLogFilters {
  status?: string;
  provider?: string;
  template_key?: string;
  recipient_email?: string;
  date_from?: string;
  date_to?: string;
  has_error?: boolean;
  limit?: number;
  offset?: number;
}

export function useEmailLogsPage(facilityId: string | null, filters: EmailLogFilters) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== null && value !== "") {
      params.set(key, String(value));
    }
  }
  return useQuery({
    queryKey: ["email-logs", facilityId ?? "none", "page", params.toString()],
    queryFn: () =>
      apiRequest<EmailLogListDto>(
        `/facilities/${facilityId}/email-logs?${params.toString()}`,
      ),
    enabled: facilityId !== null,
  });
}

export interface BulkResendResultDto {
  results: { id: string; result: string; reason?: string; error?: string }[];
  sent: number;
  requested: number;
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

/** Tesisin kendi plan kullanim uyarilari (bilgilendirme; engel degil). */
export function useFacilityPlanWarnings(facilityId: string | null) {
  return useQuery({
    queryKey: ["plan-warnings", facilityId ?? "none"],
    queryFn: () =>
      apiRequest<FacilityPlanWarningsDto>(`/facilities/${facilityId}/plan/warnings`),
    enabled: facilityId !== null,
    staleTime: 300_000,
  });
}
