"use client";

/**
 * Tedarikci sure limitleri — tesis varsayilani (musteri karari 2026-11).
 *
 * Limit randevu sayisi yerine rampada kaplanan SURE uzerinden: gunluk,
 * haftalik, aylik dakika. Tedarikci karti donem bazinda devralir, sinirsiz
 * yapar ya da ezer. Sunucu her olusturmada kilit altinda zorlar.
 */

import { Gauge } from "lucide-react";
import { useState } from "react";
import { MINUTE_DIMENSIONS, useFormatMinutes } from "@/components/domain/minute-limits";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { useSaveSupplierMinuteLimits, useSupplierMinuteLimits } from "@/lib/api/supplier-limits";
import type { MinuteDimension } from "@/lib/api/types";
import { useSession } from "@/lib/auth/session";
import { useApiErrorMessage } from "@/lib/i18n/api-error";
import { useT } from "@/lib/i18n/provider";

type Draft = Record<MinuteDimension, string>;

export default function SupplierLimitsPage() {
  const t = useT();
  const copy = t.admin.supplierLimits;
  const limitsCopy = t.minuteLimits;
  const format = useFormatMinutes();
  const errorMessage = useApiErrorMessage();
  const { activeFacilityId, can } = useSession();
  const limits = useSupplierMinuteLimits(activeFacilityId);
  const save = useSaveSupplierMinuteLimits(activeFacilityId);
  const [draftOverride, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const draft: Draft | null =
    draftOverride ??
    (limits.data
      ? {
          daily: limits.data.daily?.toString() ?? "",
          weekly: limits.data.weekly?.toString() ?? "",
          monthly: limits.data.monthly?.toString() ?? "",
        }
      : null);

  if (!can("supplier.manage"))
    return <p className="text-sm text-muted-foreground">{copy.needsPermission}</p>;

  async function onSave() {
    if (!draft) return;
    setError(null);
    setSaved(false);
    const toNumber = (v: string) => (v.trim() === "" ? null : Number(v));
    try {
      await save.mutateAsync({
        daily: toNumber(draft.daily),
        weekly: toNumber(draft.weekly),
        monthly: toNumber(draft.monthly),
      });
      setSaved(true);
    } catch (err) {
      setError(errorMessage(err, copy.saveFailed));
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-bold">{copy.title}</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">{copy.description}</p>
      </div>
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Gauge className="h-4 w-4 text-primary" /> {copy.cardTitle}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {limits.isError ? (
            <p className="text-sm text-destructive">{copy.loadError}</p>
          ) : !draft ? (
            <p className="text-sm text-muted-foreground">{t.common.loading}</p>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                {MINUTE_DIMENSIONS.map((d) => {
                  const value = draft[d];
                  const n = Number(value);
                  return (
                    <div key={d}>
                      <Label htmlFor={`limit-${d}`}>{limitsCopy.minutesLabel(limitsCopy.dimensions[d])}</Label>
                      <Input
                        id={`limit-${d}`}
                        type="number"
                        min={1}
                        max={limits.data?.max_minutes[d]}
                        placeholder={limitsCopy.modes.unlimited}
                        value={value}
                        onChange={(e) => {
                          setSaved(false);
                          setDraft({ ...draft, [d]: e.target.value });
                        }}
                      />
                      <p className="mt-1 text-xs text-muted-foreground">
                        {value && n > 0 ? format(n) : limitsCopy.modes.unlimited} · {copy.periodHint[d]}
                      </p>
                    </div>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">{copy.emptyHint}</p>
              <p className="rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground">{copy.rulesNote}</p>
              {error && <p className="text-sm text-destructive">{error}</p>}
              {saved && <p className="text-sm text-status-approved">{copy.saved}</p>}
              <div className="flex justify-end">
                <Button onClick={() => void onSave()} disabled={save.isPending}>
                  {save.isPending ? t.common.saving : t.common.save}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
