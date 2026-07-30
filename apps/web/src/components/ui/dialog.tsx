"use client";

import { X } from "lucide-react";
import { OVERLAY_CLASS, useModalBehavior } from "@/components/ui/overlay";
import { cn } from "@/lib/utils";

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  className?: string;
}

export function Dialog({ open, onClose, title, children, className }: DialogProps) {
  useModalBehavior(open, onClose);
  if (!open) return null;
  return (
    <div
      className={cn(OVERLAY_CLASS, "flex items-end justify-center p-0 sm:items-center sm:p-4")}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className={cn(
          // Uzun icerikte dialog viewport'u tasmasin diye kendi icinde kayar.
          "max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-border bg-card p-5 shadow-pop animate-fade-up sm:rounded-2xl",
          className,
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Kapat"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
