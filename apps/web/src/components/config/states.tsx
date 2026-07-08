"use client";

import { AlertTriangle, Inbox, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function LoadingState({ label = "Yükleniyor…" }: { label?: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground animate-fade-in">
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </span>
      <span className="text-sm font-medium">{label}</span>
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
    <div className="flex flex-col items-center gap-3 py-16 text-center animate-fade-in">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
        <AlertTriangle className="h-6 w-6 text-destructive" />
      </span>
      <p className="max-w-sm text-sm text-muted-foreground">{message}</p>
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
    <div className="flex flex-col items-center gap-2 py-16 text-center animate-fade-in">
      <span className="mb-1 flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
        <Inbox className="h-7 w-7 text-muted-foreground/70" />
      </span>
      <p className="font-semibold tracking-tight">{title}</p>
      <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
      {actionLabel && onAction && (
        <Button size="sm" className="mt-3" onClick={onAction}>
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
          ? "inline-flex items-center gap-1.5 rounded-full bg-status-approved/15 px-2 py-0.5 text-xs font-semibold text-status-approved ring-1 ring-inset ring-current/15"
          : "inline-flex items-center gap-1.5 rounded-full bg-status-cancelled/15 px-2 py-0.5 text-xs font-semibold text-status-cancelled ring-1 ring-inset ring-current/15"
      }
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {active ? "Aktif" : "Pasif"}
    </span>
  );
}
