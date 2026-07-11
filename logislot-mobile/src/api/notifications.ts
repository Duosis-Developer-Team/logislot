/**
 * Bildirim hook'ları — admin (facility-scoped) ve supplier varyantları.
 * KAYNAK CONTRACT: apps/web/src/lib/api/notifications.ts ile birebir aynı.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "./client";
import type { NotificationDto, NotificationPreferencesDto } from "./types";

const POLL_MS = 45_000; // cache-dostu hafif polling; WebSocket gerekmiyor

function makeNotificationHooks(
  basePath: (fid: string | null) => string,
  keyRoot: string,
) {
  function useList(facilityId: string | null) {
    return useQuery({
      queryKey: [keyRoot, "list", facilityId ?? "self"],
      queryFn: () => apiRequest<NotificationDto[]>(basePath(facilityId)),
      enabled: keyRoot === "supplier-notif" || facilityId !== null,
    });
  }

  function useUnreadCount(facilityId: string | null) {
    return useQuery({
      queryKey: [keyRoot, "unread", facilityId ?? "self"],
      queryFn: () =>
        apiRequest<{ unread: number }>(`${basePath(facilityId)}/unread-count`),
      enabled: keyRoot === "supplier-notif" || facilityId !== null,
      refetchInterval: POLL_MS,
    });
  }

  function useActions(facilityId: string | null) {
    const queryClient = useQueryClient();
    const invalidate = () => queryClient.invalidateQueries({ queryKey: [keyRoot] });

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

// ------------------------------------------------------- bildirim tercihleri

export function useNotificationPreferences() {
  return useQuery({
    queryKey: ["auth", "notification-preferences"],
    queryFn: () =>
      apiRequest<NotificationPreferencesDto>("/auth/notification-preferences"),
  });
}

export function useSaveNotificationPreferences() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: NotificationPreferencesDto) =>
      apiRequest<NotificationPreferencesDto>("/auth/notification-preferences", {
        method: "PATCH",
        body,
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["auth", "notification-preferences"] }),
  });
}

/** Web'deki EVENT_LABELS ile aynı — e-posta olay anahtarı → Türkçe etiket. */
export const NOTIFICATION_EVENT_LABELS: Record<string, string> = {
  appointment_approved: "Randevu onaylandığında",
  appointment_rejected: "Randevu reddedildiğinde",
  appointment_revised: "Randevu revize edildiğinde",
  appointment_cancelled: "Randevu iptal edildiğinde",
  appointment_revised_team: "Ekip revize bilgilendirmesi",
  appointment_series_cancelled: "Seri iptal edildiğinde",
  appointment_series_revised: "Seri revize edildiğinde",
};
