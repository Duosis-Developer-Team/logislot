"use client";

/**
 * Bildirim tercihleri formu (Sprint 10) — admin ve supplier ortak.
 * Kullanici yalnizca KENDI tercihlerini yonetir. `appointment_revised`
 * panel bildirimi kritiktir ve kapatilamaz (backend zorlar).
 */

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ApiError, apiRequest } from "@/lib/api/client";

interface PreferencesDto {
  in_app_enabled: boolean;
  email_enabled: boolean;
  email_events: Record<string, boolean>;
}

const EVENT_LABELS: Record<string, string> = {
  appointment_approved: "Randevu onaylandığında",
  appointment_rejected: "Randevu reddedildiğinde",
  appointment_revised: "Randevu revize edildiğinde",
  appointment_cancelled: "Randevu iptal edildiğinde",
  appointment_revised_team: "Ekip revize bilgilendirmesi",
  appointment_series_cancelled: "Seri iptal edildiğinde",
  appointment_series_revised: "Seri revize edildiğinde",
};

export function usePreferences() {
  return useQuery({
    queryKey: ["auth", "notification-preferences"],
    queryFn: () => apiRequest<PreferencesDto>("/auth/notification-preferences"),
  });
}

export function NotificationPreferencesForm({ onSaved }: { onSaved?: () => void }) {
  const queryClient = useQueryClient();
  const prefs = usePreferences();
  const [draft, setDraft] = useState<PreferencesDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (prefs.data && draft === null) setDraft(prefs.data);
  }, [prefs.data, draft]);

  const save = useMutation({
    mutationFn: (body: PreferencesDto) =>
      apiRequest<PreferencesDto>("/auth/notification-preferences", {
        method: "PATCH",
        body,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["auth", "notification-preferences"] });
      setSaved(true);
      onSaved?.();
    },
  });

  if (prefs.isLoading || draft === null)
    return <p className="text-sm text-muted-foreground">Tercihler yükleniyor…</p>;
  if (prefs.isError)
    return <p className="text-sm text-destructive">Tercihler yüklenemedi.</p>;

  async function onSave() {
    setError(null);
    setSaved(false);
    try {
      await save.mutateAsync(draft!);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Kaydedilemedi");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
        <Switch
          checked={draft.in_app_enabled}
          onChange={(v) => setDraft({ ...draft, in_app_enabled: v })}
          label="Panel bildirimleri"
        />
        <p className="text-xs text-muted-foreground">
          Kapatılsa bile <strong>randevu revizeleri</strong> panelde görünmeye devam
          eder (operasyonel olarak kritiktir).
        </p>
      </div>

      <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
        <Switch
          checked={draft.email_enabled}
          onChange={(v) => setDraft({ ...draft, email_enabled: v })}
          label="E-posta bildirimleri"
        />
        <p className="text-xs text-muted-foreground">
          E-postaları kapatırsanız panel bildirimleri devam eder — panel her zaman
          güncel kaynaktır. Varsayılan: tüm bildirimler açık.
        </p>
        {draft.email_enabled && (
          <div className="mt-1 flex flex-col gap-1.5 border-t border-border pt-2">
            {Object.entries(draft.email_events).map(([key, enabled]) => (
              <Switch
                key={key}
                checked={enabled}
                onChange={(v) =>
                  setDraft({
                    ...draft,
                    email_events: { ...draft.email_events, [key]: v },
                  })
                }
                label={EVENT_LABELS[key] ?? key}
              />
            ))}
          </div>
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {saved && (
        <p className="text-sm text-status-approved">Tercihleriniz kaydedildi.</p>
      )}
      <div className="flex justify-end">
        <Button onClick={() => void onSave()} disabled={save.isPending}>
          {save.isPending ? "Kaydediliyor…" : "Kaydet"}
        </Button>
      </div>
    </div>
  );
}
