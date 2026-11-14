"use client";

/**
 * Tedarikci sure limitleri (musteri karari 2026-11): gunluk / haftalik / aylik
 * dakika; tesis varsayilani + tedarikci bazli ezme. Bkz.
 * apps/api/app/services/supplier_limits.py.
 *
 * - MinuteLimitsEditor : tedarikci kartinda donem bazinda devral / sinirsiz / ozel.
 * - MinuteUsagePanel   : sihirbaz ve yonetim formunda kullanilan / kalan sure.
 */

import { AlertTriangle } from "lucide-react";
import { Input } from "@/components/ui/input";
import type {
  MinuteDimension,
  MinuteLimitMode,
  MinuteLimitOverrides,
  MinuteUsageDto,
} from "@/lib/api/types";
import { useT } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";

export const MINUTE_DIMENSIONS: MinuteDimension[] = ["daily", "weekly", "monthly"];
const MODES: MinuteLimitMode[] = ["inherit", "unlimited", "custom"];

export const INHERIT_ALL: MinuteLimitOverrides = {
  daily: { mode: "inherit", minutes: null },
  weekly: { mode: "inherit", minutes: null },
  monthly: { mode: "inherit", minutes: null },
};

/** "510" -> "8 sa 30 dk" (dile gore). */
export function useFormatMinutes() {
  const t = useT();
  return (minutes: number) => {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return t.minuteLimits.duration(h, m);
  };
}

/** Bu sure eklenince asilan ilk donem (sunucuyla ayni sira: gun, hafta, ay). */
export function exceededUsage(
  usage: MinuteUsageDto[] | undefined,
  requested: number | null,
): MinuteUsageDto | null {
  if (!usage || !requested) return null;
  return usage.find((u) => u.limit !== null && u.used + requested > u.limit) ?? null;
}

/** Sunucuya gidecek ezme; hepsi "devral" ise null (tesis varsayilani). */
export function overridesToBody(value: MinuteLimitOverrides): MinuteLimitOverrides | null {
  return MINUTE_DIMENSIONS.every((d) => value[d].mode === "inherit") ? null : value;
}

export function MinuteLimitsEditor({
  value,
  onChange,
  defaults,
}: {
  value: MinuteLimitOverrides;
  onChange: (next: MinuteLimitOverrides) => void;
  defaults: Record<MinuteDimension, number | null> | undefined;
}) {
  const t = useT();
  const copy = t.minuteLimits;
  const format = useFormatMinutes();
  return (
    <div className="flex flex-col gap-2">
      {MINUTE_DIMENSIONS.map((d) => {
        const row = value[d];
        const fallback = defaults?.[d] ?? null;
        return (
          <div
            key={d}
            className="flex flex-col gap-2 rounded-lg border border-border p-2.5 sm:flex-row sm:items-center"
          >
            <div className="w-20 shrink-0 text-sm font-medium">{copy.dimensions[d]}</div>
            <div role="radiogroup" aria-label={copy.dimensions[d]} className="flex rounded-lg bg-muted p-1">
              {MODES.map((mode) => (
                <button
                  key={mode}
                  type="button"
                  role="radio"
                  aria-checked={row.mode === mode}
                  onClick={() =>
                    onChange({
                      ...value,
                      [d]: {
                        mode,
                        minutes: mode === "custom" ? row.minutes ?? fallback ?? 480 : null,
                      },
                    })
                  }
                  className={cn(
                    "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                    row.mode === mode
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {copy.modes[mode]}
                </button>
              ))}
            </div>
            {row.mode === "custom" ? (
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={1}
                  className="w-28"
                  aria-label={copy.minutesLabel(copy.dimensions[d])}
                  value={row.minutes ?? ""}
                  onChange={(e) =>
                    onChange({
                      ...value,
                      [d]: { mode: "custom", minutes: e.target.value ? Number(e.target.value) : null },
                    })
                  }
                />
                <span className="text-xs text-muted-foreground">
                  {row.minutes ? format(row.minutes) : copy.minutesUnit}
                </span>
              </div>
            ) : (
              <span className="text-xs text-muted-foreground">
                {row.mode === "inherit"
                  ? copy.inheritHint(fallback === null ? copy.unlimited : format(fallback))
                  : copy.unlimitedHint}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function MinuteUsagePanel({
  usage,
  requested,
  title,
}: {
  usage: MinuteUsageDto[] | undefined;
  requested: number | null;
  title?: string;
}) {
  const t = useT();
  const copy = t.minuteLimits;
  const format = useFormatMinutes();
  const limited = (usage ?? []).filter((u) => u.limit !== null);
  if (limited.length === 0) return null;
  const exceeded = exceededUsage(usage, requested);
  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-lg border p-3",
        exceeded ? "border-destructive/50 bg-destructive/5" : "border-border",
      )}
    >
      <div className="text-xs font-semibold text-muted-foreground">{title ?? copy.usageTitle}</div>
      {limited.map((u) => {
        const limit = u.limit as number;
        const after = u.used + (requested ?? 0);
        const usedPct = Math.min((u.used / limit) * 100, 100);
        const addPct = Math.max(Math.min((after / limit) * 100, 100) - usedPct, 0);
        const over = after > limit;
        return (
          <div key={u.dimension} className="flex flex-col gap-1">
            <div className="flex justify-between text-xs">
              <span className="font-medium">{copy.dimensions[u.dimension]}</span>
              <span className={cn("tabular-nums", over && "font-semibold text-destructive")}>
                {copy.usageLine(format(u.used), format(limit), format(u.remaining ?? 0))}
              </span>
            </div>
            <div className="flex h-1.5 overflow-hidden rounded-full bg-muted">
              <div className="h-full bg-primary/70" style={{ width: `${usedPct}%` }} />
              <div
                className={cn("h-full", over ? "bg-destructive" : "bg-status-approved")}
                style={{ width: `${addPct}%` }}
              />
            </div>
          </div>
        );
      })}
      {exceeded ? (
        <p className="flex items-start gap-1.5 text-xs text-destructive">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {copy.exceeded(
            copy.dimensions[exceeded.dimension],
            format(requested ?? 0),
            format(exceeded.remaining ?? 0),
          )}
        </p>
      ) : (
        requested && <p className="text-xs text-muted-foreground">{copy.fits(format(requested))}</p>
      )}
    </div>
  );
}
