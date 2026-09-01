"use client";

/** Yonetim paneli randevu/takvim/dashboard hook'lari. */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api/client";
import type {
  AppointmentDto,
  CalendarDayDto,
  CalendarWeekDto,
  DashboardSummaryDto,
  SeriesCreateResultDto,
  SlotDto,
} from "@/lib/api/types";

const key = (facilityId: string | null, status?: string) => [
  "appointments",
  facilityId ?? "none",
  status ?? "all",
];

/** Sunucunun kabul ettigi en buyuk sayfa (`le=500`).
 *
 * Varsayilan 100'du ve istemci limit GONDERMIYORDU: liste sessizce kirpiliyor,
 * kullanici eksik oldugunu anlamiyordu. CSV disa aktarimiyla birlikte bu daha
 * da onemli hale geldi — eksik bir dosya karar verdirir. Kirpma artik acikca
 * gosterilir (bkz. `isTruncated`). */
export const APPOINTMENT_PAGE_LIMIT = 500;

export function useAppointments(facilityId: string | null, status?: string) {
  const statusQuery = status && status !== "all" ? `&status=${status}` : "";
  return useQuery({
    queryKey: key(facilityId, status),
    queryFn: () =>
      apiRequest<AppointmentDto[]>(
        `/facilities/${facilityId}/appointments?limit=${APPOINTMENT_PAGE_LIMIT}${statusQuery}`,
      ),
    enabled: facilityId !== null,
  });
}

/** Sonuc sayisi limite DAYANDIYSA daha fazlasi olabilir; sunucu toplam sayi
 *  dondurmuyor, dolayisiyla "kesin" degil "olabilir" denir. */
export function isTruncated(rows: AppointmentDto[] | undefined): boolean {
  return (rows?.length ?? 0) >= APPOINTMENT_PAGE_LIMIT;
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

/** Revize formunda advisory onizlemesi icin admin availability sorgusu. */
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

/** Mutasyon sonrasi randevu/takvim/dashboard/detay hepsi tazelenir. */
export function useAppointmentActions(facilityId: string | null) {
  const queryClient = useQueryClient();
  const invalidate = () => {
    const fid = facilityId ?? "none";
    queryClient.invalidateQueries({ queryKey: ["appointments", fid] });
    queryClient.invalidateQueries({ queryKey: ["appointment", fid] });
    queryClient.invalidateQueries({ queryKey: ["calendar", fid] });
    queryClient.invalidateQueries({ queryKey: ["dashboard", fid] });
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
  // Rampa degisimi REVIZE DEGILDIR: saat/sure ve randevu durumu korunur,
  // tedarikciden yeniden onay istenmez (yalnizca bilgilendirilir).
  const changeDock = useMutation({
    mutationFn: ({ id, dock_id, note }: { id: string; dock_id: string | null; note?: string | null }) =>
      post(facilityId, id, "dock-change", { dock_id, note: note || null }),
    onSuccess: (_data, vars) => {
      invalidate();
      queryClient.invalidateQueries({
        queryKey: ["dock-options", facilityId ?? "none", vars.id],
      });
    },
  });
  return { approve, reject, complete, cancel, revise, changeDock };
}

export interface DockOptionDto {
  dock_id: string;
  name: string;
  is_current: boolean;
  available: boolean;
  reason_code: string | null;
  reason: string | null;
  booked_minutes_today: number;
}

/**
 * Randevunun tasinabilecegi rampalar — uyumluluk ve doluluk SUNUCU kararidir.
 *
 * Istemci bu mantigi kopyalamaz; yalnizca listeyi cizer. Boylece kural
 * degisikligi tek yerden (AvailabilityService) yayilir.
 */
export function useDockOptions(facilityId: string | null, appointmentId: string | null) {
  return useQuery({
    queryKey: ["dock-options", facilityId ?? "none", appointmentId],
    queryFn: () =>
      apiRequest<{ options: DockOptionDto[] }>(
        `/facilities/${facilityId}/appointments/${appointmentId}/dock-options`,
      ),
    enabled: facilityId !== null && appointmentId !== null,
    staleTime: 10_000,
  });
}

// ---------------------------------------------------------- seriler (Sprint 9)

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

export interface SeriesCancelResultDto {
  series_id: string;
  status: string;
  scope: string;
  affected_count: number;
  cancelled_appointment_ids: string[];
}

/** Seri toplu iptali (future_only). Basarida takvim/liste/dashboard tazelenir. */
export function useSeriesCancel(facilityId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ seriesId, reason }: { seriesId: string; reason?: string | null }) =>
      apiRequest<SeriesCancelResultDto>(
        `/facilities/${facilityId}/appointment-series/${seriesId}/cancel`,
        { method: "POST", body: { scope: "future_only", reason: reason || null } },
      ),
    onSuccess: () => {
      const fid = facilityId ?? "none";
      for (const prefix of ["series", "appointments", "appointment", "calendar", "dashboard"]) {
        queryClient.invalidateQueries({ queryKey: [prefix, fid] });
      }
    },
  });
}

// ------------------------------------------------- admin create + seri revise (Sprint 10)

/** Admin, tedarikci adina randevu/seri olusturur (onayli dogar). */
export function useAdminCreateAppointment(facilityId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: unknown) =>
      apiRequest<AppointmentDto | SeriesCreateResultDto>(
        `/facilities/${facilityId}/appointments`,
        { method: "POST", body },
      ),
    onSuccess: () => {
      const fid = facilityId ?? "none";
      for (const prefix of ["appointments", "calendar", "dashboard", "series"]) {
        queryClient.invalidateQueries({ queryKey: [prefix, fid] });
      }
    },
  });
}

export interface SeriesReviseResultDto {
  series_id: string;
  scope: string;
  new_time: string;
  affected_count: number;
  appointments: AppointmentDto[];
}

/** Seri toplu revizesi (future_only): tum gelecek randevular ayni saate kayar. */
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
    onSuccess: () => {
      const fid = facilityId ?? "none";
      for (const prefix of ["series", "appointments", "appointment", "calendar", "dashboard"]) {
        queryClient.invalidateQueries({ queryKey: [prefix, fid] });
      }
    },
  });
}

/** Failed e-postayi yeniden gonderir (lifecycle tekrar CALISMAZ). */
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

/** Seri toplu onayi: gelecekteki revize bekleyen randevular (Sprint 11). */
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
    onSuccess: () => {
      const fid = facilityId ?? "none";
      for (const prefix of ["series", "appointments", "appointment", "calendar", "dashboard"]) {
        queryClient.invalidateQueries({ queryKey: [prefix, fid] });
      }
    },
  });
}
