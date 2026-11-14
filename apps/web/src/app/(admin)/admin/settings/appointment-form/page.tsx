"use client";

/**
 * Randevu formu ayarlari (yonetim ekrani).
 *
 * Musteri karari (2026-11): randevuda siparis no zorunlu, coklu olabilir;
 * guvenlik entegrasyonu icin surucu kimlik numarasi. LogiSlot genel bir urun
 * oldugu icin alanlar herkese zorla acilmaz; firma alan bazinda gizli /
 * istege bagli / zorunlu secer. Ayar YALNIZCA yeni randevulara uygulanir;
 * tedarikci portali, yonetim adina olusturma ve mobil ayni ayari okur, sunucu
 * da zorlar.
 */

import { ClipboardList, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label, Select } from "@/components/ui/input";
import { useAppointmentForm, useSaveAppointmentForm } from "@/lib/api/appointments";
import type { AppointmentFormDto, FormFieldMode } from "@/lib/api/types";
import { useSession } from "@/lib/auth/session";
import { useApiErrorMessage } from "@/lib/i18n/api-error";
import { useT } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";

const MODES: FormFieldMode[] = ["hidden", "optional", "required"];

type Draft = AppointmentFormDto & { driver_id_retention_days: number };

function ModeSwitch({
  label,
  value,
  onChange,
}: {
  label: string;
  value: FormFieldMode;
  onChange: (mode: FormFieldMode) => void;
}) {
  const t = useT();
  return (
    <div role="radiogroup" aria-label={label} className="flex shrink-0 rounded-lg bg-muted p-1">
      {MODES.map((mode) => (
        <button
          key={mode}
          type="button"
          role="radio"
          aria-checked={value === mode}
          onClick={() => onChange(mode)}
          className={cn(
            "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
            value === mode
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {t.admin.appointmentForm.modes[mode]}
        </button>
      ))}
    </div>
  );
}

export default function AppointmentFormPage() {
  const t = useT();
  const copy = t.admin.appointmentForm;
  const errorMessage = useApiErrorMessage();
  const { activeFacilityId, can } = useSession();
  const form = useAppointmentForm(activeFacilityId);
  const save = useSaveAppointmentForm(activeFacilityId);
  const [draftOverride, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const draft: Draft | null =
    draftOverride ??
    (form.data
      ? {
          order_numbers: form.data.order_numbers,
          driver_id_number: form.data.driver_id_number,
          driver_id_retention_days: form.data.driver_id_retention_days,
        }
      : null);

  if (!can("supplier.manage"))
    return <p className="text-sm text-muted-foreground">{copy.needsPermission}</p>;

  function update(patch: Partial<Draft>) {
    if (!draft) return;
    setSaved(false);
    setDraft({ ...draft, ...patch });
  }

  async function onSave() {
    if (!draft) return;
    setError(null);
    setSaved(false);
    try {
      await save.mutateAsync(draft);
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
            <ClipboardList className="h-4 w-4 text-primary" /> {copy.fieldsTitle}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {form.isError ? (
            <p className="text-sm text-destructive">{copy.loadError}</p>
          ) : !draft ? (
            <p className="text-sm text-muted-foreground">{t.common.loading}</p>
          ) : (
            <>
              <div className="flex flex-col gap-3 rounded-lg border border-border p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="text-sm font-medium">{copy.orderNumbers}</div>
                  <p className="text-xs text-muted-foreground">
                    {copy.orderNumbersHint(form.data?.max_order_numbers ?? 20)}
                  </p>
                </div>
                <ModeSwitch
                  label={copy.orderNumbers}
                  value={draft.order_numbers}
                  onChange={(mode) => update({ order_numbers: mode })}
                />
              </div>

              <div className="flex flex-col gap-3 rounded-lg border border-border p-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 text-sm font-medium">
                      <ShieldCheck className="h-4 w-4 text-primary" /> {copy.driverId}
                    </div>
                    <p className="text-xs text-muted-foreground">{copy.driverIdHint}</p>
                  </div>
                  <ModeSwitch
                    label={copy.driverId}
                    value={draft.driver_id_number}
                    onChange={(mode) => update({ driver_id_number: mode })}
                  />
                </div>
                {draft.driver_id_number !== "hidden" && (
                  <div className="flex flex-col gap-2 rounded-md bg-muted/50 p-3 text-xs">
                    <div className="flex flex-wrap items-center gap-2">
                      <Label htmlFor="driver-id-retention" className="mb-0">
                        {copy.retention}
                      </Label>
                      <Select
                        id="driver-id-retention"
                        className="w-40"
                        value={draft.driver_id_retention_days}
                        onChange={(e) => update({ driver_id_retention_days: Number(e.target.value) })}
                      >
                        {(form.data?.driver_id_retention_choices ?? [7, 30, 90, 180, 365]).map((d) => (
                          <option key={d} value={d}>
                            {copy.retentionOption(d)}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <p className="text-muted-foreground">{copy.driverIdPrivacy}</p>
                  </div>
                )}
              </div>

              <p className="text-xs text-muted-foreground">{copy.appliesToNew}</p>
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
