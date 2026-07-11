/** Platform (vendor) hook'ları — web apps/web/src/lib/api/platform.ts ile aynı contract. */

import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "./client";
import type { PlatformFacilityDto, PlatformTenantDto, PlatformUsageDto } from "./types";

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
