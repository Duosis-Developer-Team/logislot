"use client";

import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}

/** Sag drawer — config create/edit formlarinin ortak kabi. */
export function Drawer({ open, onClose, title, description, children, className }: DrawerProps) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-foreground/40 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className={cn(
          "flex h-full w-full max-w-lg flex-col overflow-y-auto border-l border-border bg-card shadow-pop animate-slide-in-right",
          className,
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 border-b border-border bg-card/95 px-5 py-4 backdrop-blur">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Kapat"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          {description && (
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          )}
        </div>
        <div className="flex-1 p-5">{children}</div>
      </div>
    </div>
  );
}
