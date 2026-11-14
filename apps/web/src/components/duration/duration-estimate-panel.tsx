"use client";

/**
 * "Sistem hesaplar" modunda sihirbazin sure kutusu: tedarikci sureyi secmez,
 * hesaplanan sureyi ve nasil hesaplandigini gorur.
 */

import { Calculator } from "lucide-react";
import { ErrorState } from "@/components/config/states";
import { Label } from "@/components/ui/input";
import type { DurationEstimateDto } from "@/lib/api/types";
import { useT } from "@/lib/i18n/provider";

export function DurationEstimatePanel({
  estimate,
  loading,
  error,
  onRetry,
}: {
  estimate: DurationEstimateDto | null;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
}) {
  const t = useT();
  const copy = t.duration;
  if (error) return <ErrorState message={copy.estimateError} onRetry={onRetry} />;
  return (
    <div>
      <Label>{t.supplier.newAppointment.estimatedDuration}</Label>
      <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
        <div className="flex items-center gap-2">
          <Calculator className="h-4 w-4 text-primary" />
          <span className="text-lg font-bold tabular-nums">
            {loading || !estimate ? "…" : copy.minutes(estimate.minutes)}
          </span>
          <span className="text-xs text-muted-foreground">{copy.computedBadge}</span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{copy.computedHint}</p>
        {estimate && (
          <details className="mt-2 text-xs">
            <summary className="cursor-pointer font-medium text-primary">
              {copy.howCalculated}
            </summary>
            <ul className="mt-1 list-inside list-disc text-muted-foreground">
              {estimate.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </div>
  );
}
