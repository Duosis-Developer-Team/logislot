/** Platform (vendor) hook'ları — web apps/web/src/lib/api/platform.ts ile aynı contract. */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "./client";
import type {
  AuditListDto,
  PlanDto,
  PlanUsageWarningDto,
  PlatformFacilityDto,
  PlatformTenantDto,
  PlatformUsageDto,
  SupportHealthDto,
} from "./types";

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
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["platform"] });

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

/** Vendor onboarding: tenant ve tesis oluştur/düzenle. */
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

/** Plan included_quota eşik uyarıları (fatura değil; yalnızca sinyal). */
export function usePlanUsageWarnings(dateFrom: string, dateTo: string) {
  return useQuery({
    queryKey: ["platform", "usage-warnings", dateFrom, dateTo],
    queryFn: () =>
      apiRequest<{ warnings: PlanUsageWarningDto[] }>(
        `/platform/usage/warnings?date_from=${dateFrom}&date_to=${dateTo}`,
      ),
  });
}

/** Destek sağlığı — scheduler/e-posta/bildirim özetleri. */
export function useSupportHealth() {
  return useQuery({
    queryKey: ["platform", "support-health"],
    queryFn: () => apiRequest<SupportHealthDto>("/platform/support/health"),
    refetchInterval: 60_000,
  });
}

// ------------------------------------------------------------ denetim izleri

export interface PlatformAuditFilters {
  action?: string;
  entity_type?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export function usePlatformAuditLogs(filters: PlatformAuditFilters) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== null && value !== "") {
      params.set(key, String(value));
    }
  }
  return useQuery({
    queryKey: ["platform", "audit-logs", params.toString()],
    queryFn: () => apiRequest<AuditListDto>(`/platform/audit-logs?${params.toString()}`),
  });
}
