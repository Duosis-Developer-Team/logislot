/**
 * Destek ticket hook'ları — web `apps/web/src/lib/api/tickets.ts` ile AYNI contract.
 *
 * MOBIL KAPSAM KARARI (docs/FEATURE_PARITY_MATRIX.md): ek dosya YÜKLEME
 * mobilde v1'de yoktur. Sebep teknik: dosya seçici/kamera erişimi yeni bir
 * native bağımlılık ve yeni bir izin akışı gerektirir; ticket'ın kendisi
 * (aç/listele/oku/yanıtla/yeniden aç/kapat) mobilde tamdır ve web'le aynı
 * API'yi kullanır. Ek dosya gerektiğinde kullanıcı web portalına yönlendirilir.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "./client";
import type {
  TicketConfigDto,
  TicketDetailDto,
  TicketRowDto,
} from "./types";

/** Gönderim bekleyen kayıt varken liste daha sık tazelenir. */
const PENDING_POLL_MS = 8_000;

export interface TicketListParams {
  statusGroup?: string;
  search?: string;
}

function buildQuery(params: TicketListParams): string {
  const query = new URLSearchParams();
  if (params.statusGroup) query.set("status_group", params.statusGroup);
  if (params.search?.trim()) query.set("search", params.search.trim());
  const text = query.toString();
  return text ? `?${text}` : "";
}

function makeTicketApi(prefix: string, keyRoot: string) {
  const key = (...parts: unknown[]) => [keyRoot, ...parts];

  function useConfig() {
    return useQuery({
      queryKey: key("config"),
      queryFn: () => apiRequest<TicketConfigDto>(`${prefix}/config`),
      staleTime: 60_000,
    });
  }

  function useList(params: TicketListParams) {
    return useQuery({
      queryKey: key("list", params),
      queryFn: () => apiRequest<TicketRowDto[]>(`${prefix}${buildQuery(params)}`),
      refetchInterval: (query) =>
        (query.state.data ?? []).some(
          (t) => t.delivery_status !== "synced" || t.sync_gap,
        )
          ? PENDING_POLL_MS
          : false,
    });
  }

  function useDetail(ticketId: string | null) {
    return useQuery({
      queryKey: key("detail", ticketId),
      queryFn: () => apiRequest<TicketDetailDto>(`${prefix}/${ticketId}`),
      enabled: !!ticketId,
      refetchInterval: (query) => {
        const data = query.state.data;
        if (!data) return false;
        const pending =
          data.delivery_status !== "synced" ||
          data.sync_gap ||
          data.messages.some((m) => m.is_pending);
        return pending ? PENDING_POLL_MS : false;
      },
    });
  }

  function useMutations() {
    const queryClient = useQueryClient();
    const invalidate = () => queryClient.invalidateQueries({ queryKey: [keyRoot] });

    const create = useMutation({
      mutationFn: (body: unknown) =>
        apiRequest<TicketDetailDto>(prefix, { method: "POST", body }),
      onSuccess: invalidate,
    });
    const reply = useMutation({
      mutationFn: ({ id, body }: { id: string; body: string }) =>
        apiRequest<TicketDetailDto>(`${prefix}/${id}/messages`, {
          method: "POST",
          body: { body, attachment_upload_ids: [] },
        }),
      onSuccess: invalidate,
    });
    const reopen = useMutation({
      mutationFn: ({ id, reason }: { id: string; reason: string }) =>
        apiRequest<TicketDetailDto>(`${prefix}/${id}/reopen`, {
          method: "POST",
          body: { reason },
        }),
      onSuccess: invalidate,
    });
    const confirmClose = useMutation({
      mutationFn: (id: string) =>
        apiRequest<TicketDetailDto>(`${prefix}/${id}/confirm-close`, {
          method: "POST",
        }),
      onSuccess: invalidate,
    });
    return { create, reply, reopen, confirmClose };
  }

  return { useConfig, useList, useDetail, useMutations };
}

export const adminTickets = makeTicketApi("/tickets", "admin-tickets");
export const supplierTickets = makeTicketApi("/supplier/tickets", "supplier-tickets");

export type TicketApi = ReturnType<typeof makeTicketApi>;
