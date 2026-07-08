"use client";

/** Bildirim hook'lari — admin (facility-scoped) ve supplier varyantlari. */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api/client";
import type { NotificationDto } from "@/lib/api/types";

const POLL_MS = 45_000; // cache-dostu hafif polling; WebSocket gerekmiyor

function makeNotificationHooks(basePath: (fid: string | null) => string, keyRoot: string) {
  function useList(facilityId: string | null) {
    return useQuery({
      queryKey: [keyRoot, "list", facilityId ?? "self"],
      queryFn: () => apiRequest<NotificationDto[]>(basePath(facilityId)),
      enabled: facilityId !== undefined && (keyRoot === "supplier-notif" || facilityId !== null),
    });
  }

  function useUnreadCount(facilityId: string | null) {
    return useQuery({
      queryKey: [keyRoot, "unread", facilityId ?? "self"],
      queryFn: () =>
        apiRequest<{ unread: number }>(`${basePath(facilityId)}/unread-count`),
      enabled: facilityId !== undefined && (keyRoot === "supplier-notif" || facilityId !== null),
      refetchInterval: POLL_MS,
    });
  }

  function useActions(facilityId: string | null) {
    const queryClient = useQueryClient();
    const invalidate = () =>
      queryClient.invalidateQueries({ queryKey: [keyRoot] });

    const markRead = useMutation({
      mutationFn: (id: string) =>
        apiRequest(`${basePath(facilityId)}/${id}/read`, { method: "POST" }),
      onSuccess: invalidate,
    });
    const readAll = useMutation({
      mutationFn: () =>
        apiRequest(`${basePath(facilityId)}/read-all`, { method: "POST" }),
      onSuccess: invalidate,
    });
    const remove = useMutation({
      mutationFn: (id: string) =>
        apiRequest(`${basePath(facilityId)}/${id}`, { method: "DELETE" }),
      onSuccess: invalidate,
    });
    return { markRead, readAll, remove };
  }

  return { useList, useUnreadCount, useActions };
}

export const adminNotifications = makeNotificationHooks(
  (fid) => `/facilities/${fid}/notifications`,
  "admin-notif",
);

export const supplierNotifications = makeNotificationHooks(
  () => "/supplier/notifications",
  "supplier-notif",
);
