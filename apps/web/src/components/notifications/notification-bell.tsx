"use client";

/**
 * Bildirim zili + panel. Admin varyanti bildirime tiklayinca route_hint'e
 * (deep-link -> AppointmentDrawer) gider; supplier varyanti randevular
 * sayfasina yonlendirir. Severity yalnizca gorsel siddettir.
 */

import {
  AlertTriangle,
  Bell,
  CheckCheck,
  CheckCircle2,
  Info,
  Package,
  XCircle,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  adminNotifications,
  supplierNotifications,
} from "@/lib/api/notifications";
import type { NotificationDto } from "@/lib/api/types";
import { cn } from "@/lib/utils";

const SEVERITY_ICON = {
  info: { icon: Info, className: "text-status-completed" },
  success: { icon: CheckCircle2, className: "text-status-approved" },
  warning: { icon: AlertTriangle, className: "text-status-pending" },
  error: { icon: XCircle, className: "text-status-rejected" },
} as const;

function timeAgo(iso: string): string {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutes < 1) return "şimdi";
  if (minutes < 60) return `${minutes} dk önce`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} sa önce`;
  return `${Math.round(hours / 24)} gün önce`;
}

interface NotificationBellProps {
  variant: "admin" | "supplier";
  facilityId: string | null;
}

export function NotificationBell({ variant, facilityId }: NotificationBellProps) {
  const router = useRouter();
  const hooks = variant === "admin" ? adminNotifications : supplierNotifications;
  const [open, setOpen] = useState(false);
  const list = hooks.useList(facilityId);
  const unread = hooks.useUnreadCount(facilityId);
  const actions = hooks.useActions(facilityId);

  const unreadCount = unread.data?.unread ?? 0;

  async function onClickNotification(notification: NotificationDto) {
    if (!notification.is_read) {
      actions.markRead.mutate(notification.id);
    }
    setOpen(false);
    if (variant === "admin") {
      const hint =
        notification.metadata_json?.route_hint ??
        (notification.metadata_json?.appointment_id
          ? `/admin/appointments?appointmentId=${notification.metadata_json.appointment_id}`
          : "/admin/appointments");
      router.push(hint);
    } else {
      router.push("/supplier/appointments");
    }
  }

  return (
    <div className="relative">
      <button
        className="relative rounded-lg p-2 text-muted-foreground hover:bg-muted"
        aria-label="Bildirimler"
        onClick={() => setOpen(!open)}
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-2 w-96 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-border bg-card shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
              <span className="text-sm font-semibold">Bildirimler</span>
              {unreadCount > 0 && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => actions.readAll.mutate()}
                  disabled={actions.readAll.isPending}
                >
                  <CheckCheck className="h-3.5 w-3.5" /> Tümünü okundu işaretle
                </Button>
              )}
            </div>
            <div className="max-h-96 overflow-y-auto">
              {list.isLoading ? (
                <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                  Yükleniyor…
                </p>
              ) : list.isError ? (
                <p className="px-4 py-8 text-center text-sm text-destructive">
                  Bildirimler yüklenemedi.
                </p>
              ) : (list.data ?? []).length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                  Bildirim yok. Randevu hareketleri burada görünür.
                </p>
              ) : (
                (list.data ?? []).map((notification) => {
                  const config = SEVERITY_ICON[notification.severity] ?? SEVERITY_ICON.info;
                  const Icon =
                    notification.type === "cargo_advisory" ? Package : config.icon;
                  return (
                    <button
                      key={notification.id}
                      onClick={() => onClickNotification(notification)}
                      className={cn(
                        "flex w-full items-start gap-3 border-b border-border/60 px-4 py-3 text-left transition-colors hover:bg-muted/50",
                        !notification.is_read && "bg-primary/[0.04]",
                      )}
                    >
                      <Icon
                        className={cn(
                          "mt-0.5 h-4 w-4 shrink-0",
                          notification.type === "cargo_advisory"
                            ? "text-cargo"
                            : config.className,
                        )}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              "truncate text-sm",
                              notification.is_read ? "font-medium" : "font-semibold",
                            )}
                          >
                            {notification.title}
                          </span>
                          {!notification.is_read && (
                            <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />
                          )}
                        </div>
                        {notification.body && (
                          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                            {notification.body}
                          </p>
                        )}
                        <span className="mt-0.5 block text-[10px] text-muted-foreground/70">
                          {timeAgo(notification.created_at)}
                        </span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
