"use client";

import { X } from "lucide-react";
import { OVERLAY_CLASS, useModalBehavior } from "@/components/ui/overlay";
import { useT } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  className?: string;
}

/**
 * Ortalı premium modal — büyük içerikler için (sticky başlık + kaydırılabilir gövde).
 * Mobilde alttan yükselen sayfa (bottom sheet); sm+ ortalı kart.
 */
export function Modal({ open, onClose, title, children, className }: ModalProps) {
  const t = useT();
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
          "flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl border border-border bg-card shadow-pop animate-fade-up sm:rounded-2xl",
          className,
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between gap-4 border-b border-border px-5 py-4 sm:px-6">
          <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
          <button
            onClick={onClose}
            aria-label={t.common.close}
            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">{children}</div>
      </div>
    </div>
  );
}
