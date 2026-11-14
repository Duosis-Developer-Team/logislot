"use client";

/** Islem suresi kurallari ve politikasi (bkz. docs/SURE_HESAPLAMA.md). */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api/client";
import type {
  DurationEstimateDto,
  DurationMode,
  DurationPolicyDto,
  DurationRuleDto,
  DurationRuleInput,
  DurationScenario,
} from "@/lib/api/types";

const policyKey = (fid: string | null) => ["config", "duration-policy", fid ?? "none"];
const rulesKey = (fid: string | null) => ["config", "duration-rules", fid ?? "none"];

export function useDurationPolicy(facilityId: string | null) {
  return useQuery({
    queryKey: policyKey(facilityId),
    queryFn: () => apiRequest<DurationPolicyDto>(`/facilities/${facilityId}/duration-policy`),
    enabled: facilityId !== null,
    staleTime: 60_000,
  });
}

export function useSaveDurationPolicy(facilityId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { mode?: DurationMode; rounding_minutes?: number }) =>
      apiRequest<DurationPolicyDto>(`/facilities/${facilityId}/duration-policy`, {
        method: "PATCH",
        body,
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(policyKey(facilityId), data);
      queryClient.invalidateQueries({ queryKey: ["config", "duration-evaluate"] });
      queryClient.invalidateQueries({ queryKey: ["supplier", "catalog"] });
    },
  });
}

export function useDurationRules(facilityId: string | null) {
  return useQuery({
    queryKey: rulesKey(facilityId),
    queryFn: () => apiRequest<DurationRuleDto[]>(`/facilities/${facilityId}/duration-rules`),
    enabled: facilityId !== null,
  });
}

/** Kural degisikliklerinin hepsi guncel listeyi dondurur; onbellege yazilir. */
export function useDurationRuleMutations(facilityId: string | null) {
  const queryClient = useQueryClient();
  const base = `/facilities/${facilityId}/duration-rules`;
  const onSuccess = (rows: DurationRuleDto[]) => {
    queryClient.setQueryData(rulesKey(facilityId), rows);
    queryClient.invalidateQueries({ queryKey: ["config", "duration-evaluate"] });
  };
  return {
    create: useMutation({
      mutationFn: (body: DurationRuleInput) =>
        apiRequest<DurationRuleDto[]>(base, { method: "POST", body }),
      onSuccess,
    }),
    update: useMutation({
      mutationFn: ({ id, body }: { id: string; body: DurationRuleInput }) =>
        apiRequest<DurationRuleDto[]>(`${base}/${id}`, { method: "PATCH", body }),
      onSuccess,
    }),
    remove: useMutation({
      mutationFn: (id: string) =>
        apiRequest<DurationRuleDto[]>(`${base}/${id}`, { method: "DELETE" }),
      onSuccess,
    }),
    order: useMutation({
      mutationFn: (body: { rule_ids?: string[]; by_specificity?: boolean }) =>
        apiRequest<DurationRuleDto[]>(`${base}/order`, { method: "PUT", body }),
      onSuccess,
    }),
  };
}

/** Senaryolarin surelerini hesaplar (deneme kutusu, senaryo tablosu, yonetim formu). */
export function useDurationEvaluate(facilityId: string | null, scenarios: DurationScenario[] | null) {
  return useQuery({
    queryKey: ["config", "duration-evaluate", facilityId ?? "none", scenarios],
    queryFn: () =>
      apiRequest<{ mode: DurationMode; results: DurationEstimateDto[] }>(
        `/facilities/${facilityId}/duration-rules/evaluate`,
        { method: "POST", body: { scenarios } },
      ),
    enabled: facilityId !== null && scenarios !== null && scenarios.length > 0,
    staleTime: 30_000,
  });
}

/** Tedarikci sihirbazi: tesisin kurallarindan islem suresi. */
export function useSupplierDurationEstimate(
  params: Omit<DurationScenario, "vehicle_category_id"> & { vehicle_category_id: string | null } | null,
) {
  return useQuery({
    queryKey: ["supplier", "duration", params],
    queryFn: () =>
      apiRequest<DurationEstimateDto & { mode: DurationMode; rounding_minutes: number }>(
        "/supplier/duration/estimate",
        { method: "POST", body: params },
      ),
    enabled: params !== null,
    staleTime: 30_000,
  });
}
