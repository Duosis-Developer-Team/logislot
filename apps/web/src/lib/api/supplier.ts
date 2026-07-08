"use client";

/** Tedarikci portal hook'lari — tumu authenticated supplier context'inde calisir. */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api/client";
import type {
  AppointmentDto,
  SlotDto,
  SupplierCatalogDto,
  SupplierProfileDto,
} from "@/lib/api/types";

export function useSupplierProfile() {
  return useQuery({
    queryKey: ["supplier", "profile"],
    queryFn: () => apiRequest<SupplierProfileDto>("/supplier/profile"),
    staleTime: 60_000,
  });
}

export function useSupplierCatalog() {
  return useQuery({
    queryKey: ["supplier", "catalog"],
    queryFn: () => apiRequest<SupplierCatalogDto>("/supplier/catalog"),
    staleTime: 60_000,
  });
}

export function useSupplierAppointments() {
  return useQuery({
    queryKey: ["supplier", "appointments"],
    queryFn: () => apiRequest<AppointmentDto[]>("/supplier/appointments"),
  });
}

export interface AvailabilityParams {
  product_category_id: string;
  vehicle_category_id: string | null;
  target_date: string;
  duration_minutes: number;
}

export function useSupplierAvailability(params: AvailabilityParams | null) {
  return useQuery({
    queryKey: ["supplier", "availability", params],
    queryFn: () =>
      apiRequest<SlotDto[]>("/supplier/availability/evaluate", {
        method: "POST",
        body: params,
      }),
    enabled: params !== null,
  });
}

export function useCreateSupplierAppointment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: unknown) =>
      apiRequest<AppointmentDto>("/supplier/appointments", { method: "POST", body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["supplier", "appointments"] });
      queryClient.invalidateQueries({ queryKey: ["supplier", "availability"] });
    },
  });
}

export function useCancelSupplierAppointment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiRequest<AppointmentDto>(`/supplier/appointments/${id}/cancel`, {
        method: "POST",
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["supplier", "appointments"] }),
  });
}

// -------------------------------------------- tekrarlayan seriler (Sprint 12)

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

export function useSupplierSeries() {
  return useQuery({
    queryKey: ["supplier", "series"],
    queryFn: () => apiRequest<SupplierSeriesRowDto[]>("/supplier/appointment-series"),
  });
}

export function useSupplierSeriesDetail(seriesId: string | null) {
  return useQuery({
    queryKey: ["supplier", "series", seriesId ?? "none"],
    queryFn: () =>
      apiRequest<{ id: string; frequency: string; occurrence_count: number; appointments: AppointmentDto[] }>(
        `/supplier/appointment-series/${seriesId}`,
      ),
    enabled: seriesId !== null,
  });
}

/** Tedarikci kendi serisinin GELECEK randevularini iptal eder (sebep zorunlu). */
export function useSupplierSeriesCancel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ seriesId, reason }: { seriesId: string; reason: string }) =>
      apiRequest<{ affected_count: number }>(
        `/supplier/appointment-series/${seriesId}/cancel`,
        { method: "POST", body: { reason } },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["supplier"] });
    },
  });
}
