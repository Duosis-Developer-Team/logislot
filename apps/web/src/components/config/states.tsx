"use client";

import { AlertTriangle, Inbox, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function LoadingState({ label = "Yükleniyor…" }: { label?: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-14 text-muted-foreground">
      <Loader2 className="h-6 w-6 animate-spin" />
      <span className="text-sm">{label}</span>
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-3 py-14 text-center">
      <AlertTriangle className="h-7 w-7 text-destructive" />
      <p className="text-sm text-muted-foreground">{message}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Tekrar Dene
        </Button>
      )}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
}: {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-2 py-14 text-center">
      <Inbox className="h-8 w-8 text-muted-foreground/60" />
      <p className="font-medium">{title}</p>
      <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
      {actionLabel && onAction && (
        <Button size="sm" className="mt-2" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
}

export function ActiveBadge({ active }: { active: boolean }) {
  return (
    <span
      className={
        active
          ? "inline-flex items-center gap-1 rounded-full bg-status-approved/15 px-2 py-0.5 text-xs font-medium text-status-approved"
          : "inline-flex items-center gap-1 rounded-full bg-status-cancelled/15 px-2 py-0.5 text-xs font-medium text-status-cancelled"
      }
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {active ? "Aktif" : "Pasif"}
    </span>
  );
}
