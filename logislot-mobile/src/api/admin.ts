/** Yönetim paneli hook'ları — web apps/web/src/lib/api/appointments.ts ile aynı contract. */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "./client";
import type { AppointmentDto, CalendarDayDto, DashboardSummaryDto } from "./types";

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
