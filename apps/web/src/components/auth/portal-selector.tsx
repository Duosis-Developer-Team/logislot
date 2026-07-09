"use client";

import { Check } from "lucide-react";
import { PORTALS, type Portal } from "@/components/auth/portals";
import { cn } from "@/lib/utils";

/**
 * Premium portal seçici — segment kart yapısı, animasyonlu seçili durum.
 */
export function PortalSelector({
  value,
  onChange,
}: {
  value: Portal;
  onChange: (portal: Portal) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Portal seçimi"
      className="grid grid-cols-3 gap-2 sm:gap-2.5"
    >
      {PORTALS.map((p) => {
        const Icon = p.icon;
        const selected = value === p.key;
        return (
          <button
            key={p.key}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={p.title}
            onClick={() => onChange(p.key)}
            className={cn(
              "group relative flex flex-col items-center gap-2 rounded-2xl border p-3 text-center transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              selected
                ? "-translate-y-0.5 border-primary/60 bg-primary/[0.06] shadow-primary-glow ring-1 ring-primary/25"
                : "border-border bg-card hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-soft",
            )}
          >
            <span
              className={cn(
                "absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-primary-foreground transition-all duration-200",
                selected ? "scale-100 opacity-100" : "scale-50 opacity-0",
              )}
            >
              <Check className="h-2.5 w-2.5" strokeWidth={3} />
            </span>
            <span
              className={cn(
                "flex h-11 w-11 items-center justify-center rounded-xl transition-colors duration-200",
                selected
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-muted text-muted-foreground group-hover:text-foreground",
              )}
            >
              <Icon className="h-5 w-5" />
            </span>
            <span
              className={cn(
                "text-xs font-semibold leading-tight transition-colors",
                selected ? "text-primary" : "text-foreground",
              )}
            >
              {p.short}
            </span>
          </button>
        );
      })}
    </div>
  );
}
