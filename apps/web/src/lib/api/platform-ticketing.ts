"use client";

/**
 * Platform Yonetimi — Hermes ticket yonlendirmesi.
 *
 * Bu hook'lar Hermes'e DOGRUDAN gitmez; hepsi LogiSlot backend'i uzerinden
 * calisir. Tarayici hicbir zaman Hermes servis kimligini gormez ve grup
 * katalogunu backend'in dogruladigi haliyle alir.
 */

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiEnvelope, apiRequest } from "@/lib/api/client";
import type {
  HermesGroupDto,
  TicketIntegrationHealthDto,
  TicketRouteDetailDto,
  TicketRouteRowDto,
} from "@/lib/api/types";

const ROOT = "/platform/ticket-routing";

const PAGE_SIZE = 100;

/**
 * Yonlendirme listesi. Arama/durum filtresi SUNUCUYA gonderilir.
 *
 * Uc nokta sayfalidir; istemcide filtrelemek ilk sayfanin disinda kalan bir
 * musteri hesabini gorunmez yapar ve "yonlendirmesi yok" gibi okunurdu.
 * `total` degeri, listenin kirpildigini kullaniciya soyleyebilmek icin
 * zarfin `meta` alanindan alinir.
 */
export function useTicketRoutes({
  search,
  status,
}: {
  search: string;
  status: string;
}) {
  const query = new URLSearchParams({ limit: String(PAGE_SIZE) });
  if (search.trim()) query.set("search", search.trim());
  if (status && status !== "all") query.set("status", status);

  return useQuery({
    queryKey: ["platform", "ticket-routing", "list", search.trim(), status],
    queryFn: async () => {
      const envelope = await apiEnvelope<TicketRouteRowDto[]>(`${ROOT}?${query}`);
      return {
        items: envelope.data,
        total: Number(envelope.meta?.total ?? envelope.data.length),
      };
    },
    placeholderData: keepPreviousData,
  });
}

export function useTicketRoute(tenantId: string | null) {
  return useQuery({
    queryKey: ["platform", "ticket-routing", "detail", tenantId],
    queryFn: () => apiRequest<TicketRouteDetailDto>(`${ROOT}/${tenantId}`),
    enabled: !!tenantId,
  });
}

export function useHermesGroups(enabled: boolean) {
  return useQuery({
    queryKey: ["platform", "ticket-routing", "groups"],
    queryFn: () =>
      apiRequest<{ items: HermesGroupDto[]; stale: boolean; error_code: string | null }>(
        `${ROOT}/groups`,
      ),
    enabled,
    staleTime: 120_000,
  });
}

export function useTicketRoutingMutations() {
  const queryClient = useQueryClient();
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["platform", "ticket-routing"] });

  const refreshGroups = useMutation({
    mutationFn: () =>
      apiRequest<{ items: HermesGroupDto[] }>(`${ROOT}/groups/refresh`, {
        method: "POST",
      }),
    onSuccess: invalidate,
  });

  const save = useMutation({
    mutationFn: ({
      tenantId,
      groupId,
      isActive,
      expectedRouteVersion,
    }: {
      tenantId: string;
      groupId: string;
      isActive: boolean;
      expectedRouteVersion: number | null;
    }) =>
      apiRequest<TicketRouteRowDto>(`${ROOT}/${tenantId}`, {
        method: "PUT",
        body: {
          hermes_group_id: groupId,
          is_active: isActive,
          expected_route_version: expectedRouteVersion,
        },
      }),
    onSuccess: invalidate,
  });

  const test = useMutation({
    mutationFn: ({ tenantId, groupId }: { tenantId: string; groupId?: string | null }) =>
      apiRequest<{
        ok: boolean;
        group_name?: string | null;
        error_code?: string;
        message?: string;
        checked_at: string;
      }>(`${ROOT}/${tenantId}/test`, {
        method: "POST",
        body: { hermes_group_id: groupId ?? null },
      }),
    onSuccess: invalidate,
  });

  return { refreshGroups, save, test };
}

export function useTicketIntegrationHealth() {
  return useQuery({
    queryKey: ["platform", "ticket-routing", "health"],
    queryFn: () => apiRequest<TicketIntegrationHealthDto>(`${ROOT}/health/summary`),
    // Bu ekran izin gerektirir; yetkisiz kullanicida kart gizlenir, sayfa
    // KIRILMAZ. Bu yuzden hata durumunda tekrar denenmez.
    retry: false,
    refetchInterval: 60_000,
  });
}
