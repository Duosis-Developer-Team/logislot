"use client";

/**
 * Randevu formu ayarlari (yonetim ekrani).
 *
 * Musteri karari (2026-11): randevuda siparis no zorunlu, coklu olabilir.
 * LogiSlot genel bir urun oldugu icin alan herkese zorla acilmaz; firma alan
 * bazinda gizli / istege bagli / zorunlu secer. Ayar YALNIZCA yeni
 * randevulara uygulanir; tedarikci portali, yonetim adina olusturma ve mobil
 * ayni ayari okur, sunucu da zorlar.
 */

import { ClipboardList } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  useAppointmentForm,
  useSaveAppointmentForm,
} from "@/lib/api/appointments";
import type { AppointmentFormDto, FormFieldMode } from "@/lib/api/types";
import { useSession } from "@/lib/auth/session";
import { useApiErrorMessage } from "@/lib/i18n/api-error";
import { useT } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";

const MODES: FormFieldMode[] = ["hidden", "optional", "required"];

export default function AppointmentFormPage() {
  const t = useT();
  const copy = t.admin.appointmentForm;
  const errorMessage = useApiErrorMessage();
  const { activeFacilityId, can } = useSession();
  const form = useAppointmentForm(activeFacilityId);
  const save = useSaveAppointmentForm(activeFacilityId);
  const [draftOverride, setDraft] = useState<AppointmentFormDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const draft = draftOverride ?? (form.data ? { order_numbers: form.data.order_numbers } : null);

  if (!can("supplier.manage"))
    return <p className="text-sm text-muted-foreground">{copy.needsPermission}</p>;

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
                <div
                  role="radiogroup"
                  aria-label={copy.orderNumbers}
                  className="flex shrink-0 rounded-lg bg-muted p-1"
                >
                  {MODES.map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      role="radio"
                      aria-checked={draft.order_numbers === mode}
                      onClick={() => {
                        setSaved(false);
                        setDraft({ ...draft, order_numbers: mode });
                      }}
                      className={cn(
                        "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                        draft.order_numbers === mode
                          ? "bg-card text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {copy.modes[mode]}
                    </button>
                  ))}
                </div>
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
