/** Yönetim paneli hook'ları — web apps/web/src/lib/api/appointments.ts ile aynı contract. */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "./client";
import type {
  AppointmentDto,
  AuditListDto,
  CalendarDayDto,
  CalendarWeekDto,
  DashboardSummaryDto,
  SeriesCreateResultDto,
  SlotDto,
} from "./types";

export function useAppointments(facilityId: string | null, status?: string) {
  const query = status && status !== "all" ? `?status=${status}` : "";
  return useQuery({
    queryKey: ["appointments", facilityId ?? "none", status ?? "all"],
    queryFn: () =>
      apiRequest<AppointmentDto[]>(`/facilities/${facilityId}/appointments${query}`),
    enabled: facilityId !== null,
  });
}

export function useAppointmentDetail(facilityId: string | null, id: string | null) {
  return useQuery({
    queryKey: ["appointment", facilityId ?? "none", id ?? "none"],
    queryFn: () =>
      apiRequest<AppointmentDto>(`/facilities/${facilityId}/appointments/${id}`),
    enabled: facilityId !== null && id !== null,
  });
}

export function useDashboardSummary(facilityId: string | null) {
  return useQuery({
    queryKey: ["dashboard", facilityId ?? "none"],
    queryFn: () =>
      apiRequest<DashboardSummaryDto>(`/facilities/${facilityId}/dashboard-summary`),
    enabled: facilityId !== null,
  });
}

export function useCalendarDay(facilityId: string | null, date: string) {
  return useQuery({
    queryKey: ["calendar", facilityId ?? "none", date],
    queryFn: () =>
      apiRequest<CalendarDayDto>(`/facilities/${facilityId}/calendar/day?date=${date}`),
    enabled: facilityId !== null,
  });
}

function post(facilityId: string | null, id: string, action: string, body?: unknown) {
  return apiRequest<AppointmentDto>(
    `/facilities/${facilityId}/appointments/${id}/${action}`,
    { method: "POST", body: body ?? {} },
  );
}

export interface ReviseInput {
  id: string;
  new_start_at: string;
  new_duration_minutes?: number | null;
  new_dock_id?: string | null;
  auto_assign_dock?: boolean;
  note?: string | null;
  acknowledged_warning_codes?: string[];
}

/** Mutasyon sonrası randevu/takvim/dashboard/detay hepsi tazelenir. */
export function useAppointmentActions(facilityId: string | null) {
  const queryClient = useQueryClient();
  const invalidate = () => {
    const fid = facilityId ?? "none";
    for (const prefix of ["appointments", "appointment", "calendar", "dashboard"]) {
      queryClient.invalidateQueries({ queryKey: [prefix, fid] });
    }
  };

  const approve = useMutation({
    mutationFn: ({ id }: { id: string }) => post(facilityId, id, "approve"),
    onSuccess: invalidate,
  });
  const reject = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      post(facilityId, id, "reject", { reason }),
    onSuccess: invalidate,
  });
  const complete = useMutation({
    mutationFn: ({ id, note }: { id: string; note?: string | null }) =>
      post(facilityId, id, "complete", { note: note || null }),
    onSuccess: invalidate,
  });
  const cancel = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string | null }) =>
      post(facilityId, id, "cancel", { reason: reason || null }),
    onSuccess: invalidate,
  });
  const revise = useMutation({
    mutationFn: ({ id, ...body }: ReviseInput) => post(facilityId, id, "revise", body),
    onSuccess: invalidate,
  });
  return { approve, reject, complete, cancel, revise };
}

export function useCalendarWeek(facilityId: string | null, weekStart: string) {
  return useQuery({
    queryKey: ["calendar", facilityId ?? "none", "week", weekStart],
    queryFn: () =>
      apiRequest<CalendarWeekDto>(
        `/facilities/${facilityId}/calendar/week?week_start=${weekStart}`,
      ),
    enabled: facilityId !== null,
  });
}

export interface AdminAvailabilityParams {
  supplier_id: string;
  product_category_id: string;
  vehicle_category_id: string | null;
  target_date: string;
  duration_minutes: number;
}

/** Revize/oluşturma formunda advisory önizlemesi için admin availability sorgusu. */
export function useAdminAvailability(
  facilityId: string | null,
  params: AdminAvailabilityParams | null,
) {
  return useQuery({
    queryKey: ["availability", facilityId ?? "none", params],
    queryFn: () =>
      apiRequest<SlotDto[]>(`/facilities/${facilityId}/availability/evaluate`, {
        method: "POST",
        body: params,
      }),
    enabled: facilityId !== null && params !== null,
    staleTime: 15_000,
  });
}

// ---------------------------------------------------------------- seriler

export interface SeriesListRowDto {
  id: string;
  supplier_id: string;
  supplier_name: string | null;
  frequency: "weekly" | "biweekly" | "monthly";
  occurrence_count: number;
  status: string;
  created_at: string | null;
  status_counts: Record<string, number>;
}

export interface SeriesDetailDto extends Omit<SeriesListRowDto, "status_counts"> {
  appointments: AppointmentDto[];
}

export function useAppointmentSeries(facilityId: string | null) {
  return useQuery({
    queryKey: ["series", facilityId ?? "none"],
    queryFn: () =>
      apiRequest<SeriesListRowDto[]>(`/facilities/${facilityId}/appointment-series`),
    enabled: facilityId !== null,
  });
}

export function useSeriesDetail(facilityId: string | null, seriesId: string | null) {
  return useQuery({
    queryKey: ["series", facilityId ?? "none", seriesId ?? "none"],
    queryFn: () =>
      apiRequest<SeriesDetailDto>(
        `/facilities/${facilityId}/appointment-series/${seriesId}`,
      ),
    enabled: facilityId !== null && seriesId !== null,
  });
}

function invalidateSeriesScope(
  queryClient: ReturnType<typeof useQueryClient>,
  facilityId: string | null,
) {
  const fid = facilityId ?? "none";
  for (const prefix of ["series", "appointments", "appointment", "calendar", "dashboard"]) {
    queryClient.invalidateQueries({ queryKey: [prefix, fid] });
  }
}

export interface SeriesCancelResultDto {
  series_id: string;
  status: string;
  scope: string;
  affected_count: number;
  cancelled_appointment_ids: string[];
}

/** Seri toplu iptali (future_only). Başarıda takvim/liste/dashboard tazelenir. */
export function useSeriesCancel(facilityId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ seriesId, reason }: { seriesId: string; reason?: string | null }) =>
      apiRequest<SeriesCancelResultDto>(
        `/facilities/${facilityId}/appointment-series/${seriesId}/cancel`,
        { method: "POST", body: { scope: "future_only", reason: reason || null } },
      ),
    onSuccess: () => invalidateSeriesScope(queryClient, facilityId),
  });
}

export interface SeriesReviseResultDto {
  series_id: string;
  scope: string;
  new_time: string;
  affected_count: number;
  appointments: AppointmentDto[];
}

/** Seri toplu revizesi (future_only): tüm gelecek randevular aynı saate kayar. */
export function useSeriesRevise(facilityId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      seriesId,
      ...body
    }: {
      seriesId: string;
      new_time: string;
      duration_minutes?: number | null;
      dock_id?: string | null;
      auto_assign_dock?: boolean;
      note?: string | null;
    }) =>
      apiRequest<SeriesReviseResultDto>(
        `/facilities/${facilityId}/appointment-series/${seriesId}/revise`,
        { method: "POST", body: { scope: "future_only", ...body } },
      ),
    onSuccess: () => invalidateSeriesScope(queryClient, facilityId),
  });
}

/** Seri toplu onayı: gelecekteki revize bekleyen randevular. */
export function useSeriesApprove(facilityId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ seriesId, note }: { seriesId: string; note?: string | null }) =>
      apiRequest<{ series_id: string; affected_count: number }>(
        `/facilities/${facilityId}/appointment-series/${seriesId}/approve`,
        {
          method: "POST",
          body: { scope: "revision_pending_future_only", note: note || null },
        },
      ),
    onSuccess: () => invalidateSeriesScope(queryClient, facilityId),
  });
}

// ------------------------------------------------- admin create + loglar

/** Admin, tedarikçi adına randevu/seri oluşturur (onaylı doğar). */
export function useAdminCreateAppointment(facilityId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: unknown) =>
      apiRequest<AppointmentDto | SeriesCreateResultDto>(
        `/facilities/${facilityId}/appointments`,
        { method: "POST", body },
      ),
    onSuccess: () => invalidateSeriesScope(queryClient, facilityId),
  });
}

/** Failed e-postayı yeniden gönderir (lifecycle tekrar ÇALIŞMAZ). */
export function useEmailResend(facilityId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (emailLogId: string) =>
      apiRequest<{
        id: string;
        status: string;
        retry_count: number;
        max_attempts: number;
        error_message: string | null;
      }>(`/facilities/${facilityId}/email-logs/${emailLogId}/resend`, {
        method: "POST",
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["email-logs", facilityId ?? "none"] }),
  });
}

// ------------------------------------------------------------ denetim izleri

export interface AuditLogFilters {
  action?: string;
  entity_type?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export function useAuditLogs(facilityId: string | null, filters: AuditLogFilters) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== null && value !== "") {
      params.set(key, String(value));
    }
  }
  return useQuery({
    queryKey: ["audit-logs", facilityId ?? "none", params.toString()],
    queryFn: () =>
      apiRequest<AuditListDto>(
        `/facilities/${facilityId}/audit-logs?${params.toString()}`,
      ),
    enabled: facilityId !== null,
  });
}
