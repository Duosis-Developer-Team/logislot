"use client";

/** Platform (vendor) paneli hook'lari — yalnizca agregat veri. */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api/client";

/**
 * Musteri hesabi — 1 tenant = 1 tesis (urun karari 2026-07).
 * Operasyonel kapsam (tesis) alanlari bu kaydin icine gomuludur; ayri bir
 * "tesis" varligi arayuzde YOKTUR.
 */
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
  /** Operasyonel kapsam kimligi (eski kayitlarda null olabilir). */
  facility_id: string | null;
  address: string | null;
  facility_status: string | null;
  /** Yalnizca create yanitinda dolu. */
  bootstrap?: {
    vehicle_categories: number;
    product_categories: number;
    docks: number;
    roles: number;
  } | null;
  /** Gecici parola BIR kez gosterilir. */
  initial_admin?: {
    id: string;
    name: string;
    email: string;
    temporary_password: string;
    must_change_password: boolean;
  } | null;
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
  // Yalnizca create yanitinda dolu; gecici parola BIR kez gosterilir.
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
  /** Dinamik kotalar: {"max_tenants": 300, ...}. Anahtar yok = sinirsiz. */
  limits_json: Record<string, number>;
  status: string;
}

/** Limit editorunun dinamik kurulmasi icin backend katalogu. */
export interface PlanLimitDimensionDto {
  key: string;
  label: string;
  description: string;
  unit: string;
  enforced_at: "assignment" | "usage";
}

export function usePlanLimitDimensions() {
  return useQuery({
    queryKey: ["platform", "plan-limit-dimensions"],
    queryFn: () =>
      apiRequest<{ dimensions: PlanLimitDimensionDto[] }>("/platform/plan-limit-dimensions"),
    staleTime: 600_000,
  });
}

export interface TenantUsageRow {
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
}

export interface FacilityUsageRow {
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
  tenant_usage: TenantUsageRow[];
  facility_usage: FacilityUsageRow[];
}

export function usePlatformUsage(dateFrom: string, dateTo: string) {
  return useQuery({
    queryKey: ["platform", "usage", dateFrom, dateTo],
    queryFn: () =>
      apiRequest<PlatformUsageDto>(
        `/platform/usage?date_from=${dateFrom}&date_to=${dateTo}`,
      ),
  });
}

export function usePlatformTenants() {
  return useQuery({
    queryKey: ["platform", "tenants"],
    queryFn: () => apiRequest<PlatformTenantDto[]>("/platform/tenants"),
  });
}

export function usePlatformFacilities() {
  return useQuery({
    queryKey: ["platform", "facilities"],
    queryFn: () => apiRequest<PlatformFacilityDto[]>("/platform/facilities"),
  });
}

export function usePlatformPlans() {
  return useQuery({
    queryKey: ["platform", "plans"],
    queryFn: () => apiRequest<PlanDto[]>("/platform/plans"),
  });
}

export function usePlanMutations() {
  const queryClient = useQueryClient();
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["platform"] });

  const save = useMutation({
    mutationFn: ({ id, body }: { id?: string; body: unknown }) =>
      apiRequest<PlanDto>(id ? `/platform/plans/${id}` : "/platform/plans", {
        method: id ? "PATCH" : "POST",
        body,
      }),
    onSuccess: invalidate,
  });
  const retire = useMutation({
    mutationFn: (id: string) =>
      apiRequest<PlanDto>(`/platform/plans/${id}`, { method: "DELETE" }),
    onSuccess: invalidate,
  });
  const assignTenant = useMutation({
    mutationFn: ({ tenantId, planId }: { tenantId: string; planId: string }) =>
      apiRequest(`/platform/tenants/${tenantId}/plan-assignment`, {
        method: "POST",
        body: { plan_id: planId },
      }),
    onSuccess: invalidate,
  });
  const assignFacility = useMutation({
    mutationFn: ({ facilityId, planId }: { facilityId: string; planId: string }) =>
      apiRequest(`/platform/facilities/${facilityId}/plan-assignment`, {
        method: "POST",
        body: { plan_id: planId },
      }),
    onSuccess: invalidate,
  });
  return { save, retire, assignTenant, assignFacility };
}

/** Vendor onboarding (Sprint 8): tenant ve tesis olustur/duzenle. */
export function useTenantMutations() {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["platform"] });

  const save = useMutation({
    mutationFn: ({ id, body }: { id?: string; body: unknown }) =>
      apiRequest<PlatformTenantDto>(id ? `/platform/tenants/${id}` : "/platform/tenants", {
        method: id ? "PATCH" : "POST",
        body,
      }),
    onSuccess: invalidate,
  });
  return { save };
}

export function useFacilityMutations() {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["platform"] });

  const create = useMutation({
    mutationFn: ({ tenantId, body }: { tenantId: string; body: unknown }) =>
      apiRequest<PlatformFacilityDto>(`/platform/tenants/${tenantId}/facilities`, {
        method: "POST",
        body,
      }),
    onSuccess: invalidate,
  });
  const patch = useMutation({
    mutationFn: ({ id, body }: { id: string; body: unknown }) =>
      apiRequest<PlatformFacilityDto>(`/platform/facilities/${id}`, {
        method: "PATCH",
        body,
      }),
    onSuccess: invalidate,
  });
  return { create, patch };
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

/** Plan included_quota esik uyarilari (fatura degil; yalnizca sinyal). */
export function usePlanUsageWarnings(dateFrom: string, dateTo: string) {
  return useQuery({
    queryKey: ["platform", "usage-warnings", dateFrom, dateTo],
    queryFn: () =>
      apiRequest<{ warnings: PlanUsageWarningDto[] }>(
        `/platform/usage/warnings?date_from=${dateFrom}&date_to=${dateTo}`,
      ),
  });
}
