"use client";

/** Tedarikci sure limitleri: tesis varsayilani + kullanim (bkz. services/supplier_limits.py). */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api/client";
import type { MinuteDimension, MinuteUsageDto, SupplierMinuteLimitsDto } from "@/lib/api/types";

const limitsKey = (fid: string | null) => ["config", "supplier-minute-limits", fid ?? "none"];

export function useSupplierMinuteLimits(facilityId: string | null) {
  return useQuery({
    queryKey: limitsKey(facilityId),
    queryFn: () =>
      apiRequest<SupplierMinuteLimitsDto>(`/facilities/${facilityId}/supplier-minute-limits`),
    enabled: facilityId !== null,
    staleTime: 60_000,
  });
}

export function useSaveSupplierMinuteLimits(facilityId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<MinuteDimension, number | null>) =>
      apiRequest<SupplierMinuteLimitsDto>(`/facilities/${facilityId}/supplier-minute-limits`, {
        method: "PUT",
        body,
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(limitsKey(facilityId), data);
      queryClient.invalidateQueries({ queryKey: ["minute-usage"] });
    },
  });
}

type UsageResponse = { target_date: string; usage: MinuteUsageDto[] };

/** Yonetim adina olusturma: secili tedarikcinin hedef gundeki kullanimi. */
export function useAdminMinuteUsage(
  facilityId: string | null,
  supplierId: string | null,
  targetDate: string | null,
) {
  return useQuery({
    queryKey: ["minute-usage", "admin", facilityId, supplierId, targetDate],
    queryFn: () =>
      apiRequest<UsageResponse>(
        `/facilities/${facilityId}/suppliers/${supplierId}/minute-usage?target_date=${targetDate}`,
      ),
    enabled: facilityId !== null && supplierId !== null && !!targetDate,
    staleTime: 15_000,
  });
}

/** Tedarikci sihirbazi: hedef gunun gun/hafta/ay kullanimi. */
export function useSupplierMinuteUsage(targetDate: string | null) {
  return useQuery({
    queryKey: ["minute-usage", "supplier", targetDate],
    queryFn: () =>
      apiRequest<UsageResponse>(`/supplier/minute-usage?target_date=${targetDate}`),
    enabled: !!targetDate,
    staleTime: 15_000,
  });
}
