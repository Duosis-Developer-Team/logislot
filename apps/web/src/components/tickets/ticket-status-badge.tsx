"use client";

import {
  AlertCircle,
  CheckCircle2,
  CircleDot,
  Clock,
  Loader2,
  MessageCircleQuestion,
  RotateCcw,
  XCircle,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useLabels } from "@/lib/i18n/labels";
import { useT } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";

/**
 * Ticket durum rozeti.
 *
 * Durum YALNIZCA renkle anlatilmaz: her rozet ikon + metin tasir
 * (00_SHARED_PLATFORM/01, bolum 9 — erisilebilirlik). Bilinmeyen bir durum
 * kodu geldiginde ekran KIRILMAZ, kod oldugu gibi notr bicimde gosterilir;
 * sozlesme enum'a additive deger ekleyebilir.
 */
const STATUS_STYLE: Record<string, { className: string; icon: LucideIcon }> = {
  open: { className: "bg-status-pending/15 text-status-pending", icon: CircleDot },
  reopened: { className: "bg-status-revision/15 text-status-revision", icon: RotateCcw },
  in_progress: { className: "bg-status-completed/15 text-status-completed", icon: Loader2 },
  waiting_customer: {
    className: "bg-accent/20 text-accent-foreground",
    icon: MessageCircleQuestion,
  },
  resolved: { className: "bg-status-approved/15 text-status-approved", icon: CheckCircle2 },
  closed: { className: "bg-status-cancelled/15 text-status-cancelled", icon: CheckCircle2 },
  cancelled: { className: "bg-status-cancelled/15 text-status-cancelled", icon: XCircle },
};

export function TicketStatusBadge({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  const labels = useLabels();
  const style = STATUS_STYLE[status] ?? {
    className: "bg-muted text-muted-foreground",
    icon: AlertCircle,
  };
  const Icon = style.icon;
  return (
    <Badge className={cn(style.className, className)}>
      <Icon className="h-3 w-3" aria-hidden />
      {labels.ticketStatus[status as keyof typeof labels.ticketStatus] ?? status}
    </Badge>
  );
}

/**
 * Yerel gonderim rozeti — Hermes'in degil LogiSlot'un durumu.
 *
 * `synced` durumunda hicbir sey gosterilmez: her satirda "senkron" yazmak
 * gurultu olur; kullanicinin gormesi gereken YALNIZCA anormal durumdur.
 */
export function TicketDeliveryBadge({
  deliveryStatus,
  syncGap,
  className,
}: {
  deliveryStatus: string;
  syncGap?: boolean;
  className?: string;
}) {
  const t = useT();
  if (deliveryStatus === "synced") {
    return syncGap ? (
      <Badge className={cn("bg-status-pending/15 text-status-pending", className)}>
        <Clock className="h-3 w-3" aria-hidden />
        {t.tickets.delivery.waitingUpdate}
      </Badge>
    ) : null;
  }
  if (deliveryStatus === "failed") {
    return (
      <Badge className={cn("bg-status-rejected/15 text-status-rejected", className)}>
        <AlertCircle className="h-3 w-3" aria-hidden />
        {t.tickets.delivery.failed}
      </Badge>
    );
  }
  return (
    <Badge className={cn("bg-muted text-muted-foreground", className)}>
      <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
      {t.tickets.delivery.sending}
    </Badge>
  );
}
