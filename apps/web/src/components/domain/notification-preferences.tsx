"use client";

/**
 * Bildirim tercihi formlari — IKI AYRI KAPSAM vardir:
 *
 * 1. `NotificationPreferencesForm` — yonetici kendi bildirimlerini yonetir
 *    (`/auth/notification-preferences`). Yoneticiye giden TEK e-posta sablonu
 *    revize ekip bilgilendirmesidir; diger sablonlarin alicisi tedarikcidir.
 *
 * 2. `SupplierNotificationPolicyForm` — tedarikcilere hangi bildirimlerin
 *    gidecegini YONETIM belirler (`/facilities/:id/supplier-notification-policy`).
 *    Tedarikci bu tercihleri kendi panelinde ne gorur ne degistirir.
 *
 * `appointment_revised` ve `appointment_dock_changed` PANEL bildirimleri
 * kapatilamaz (backend zorlar) — saat/rampa degisikligi tedarikciden gizlenemez.
 */

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ApiError, apiRequest } from "@/lib/api/client";
import { useT } from "@/lib/i18n/provider";

interface PreferencesDto {
  in_app_enabled: boolean;
  email_enabled: boolean;
  email_events: Record<string, boolean>;
}

interface SupplierPolicyDto extends PreferencesDto {
  /** false ise hicbir sey degistirilmemis, varsayilan (hepsi acik) gecerli. */
  is_customized: boolean;
}

export function usePreferences() {
  return useQuery({
    queryKey: ["auth", "notification-preferences"],
    queryFn: () => apiRequest<PreferencesDto>("/auth/notification-preferences"),
  });
}

/** Iki formun ortak govdesi: panel/e-posta anahtarlari + kaydet. */
function PreferencesFields({
  draft,
  setDraft,
  banner,
  inAppHint,
  emailHint,
  savedText,
  isPending,
  error,
  saved,
  onSave,
}: {
  draft: PreferencesDto;
  setDraft: (next: PreferencesDto) => void;
  banner?: React.ReactNode;
  inAppHint: React.ReactNode;
  emailHint: React.ReactNode;
  savedText: string;
  isPending: boolean;
  error: string | null;
  saved: boolean;
  onSave: () => void;
}) {
  const t = useT();
  const copy = t.components.notificationPreferences;
  return (
    <div className="flex flex-col gap-4">
      {banner}
      <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
        <Switch
          checked={draft.in_app_enabled}
          onChange={(v) => setDraft({ ...draft, in_app_enabled: v })}
          label={copy.inAppLabel}
        />
        <p className="text-xs text-muted-foreground">{inAppHint}</p>
      </div>

      <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
        <Switch
          checked={draft.email_enabled}
          onChange={(v) => setDraft({ ...draft, email_enabled: v })}
          label={copy.emailLabel}
        />
        <p className="text-xs text-muted-foreground">{emailHint}</p>
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
                label={copy.events[key] ?? key}
              />
            ))}
          </div>
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {saved && <p className="text-sm text-status-approved">{savedText}</p>}
      <div className="flex justify-end">
        <Button onClick={onSave} disabled={isPending}>
          {isPending ? t.common.saving : t.common.save}
        </Button>
      </div>
    </div>
  );
}

export function NotificationPreferencesForm({ onSaved }: { onSaved?: () => void }) {
  const copy = useT().components.notificationPreferences;
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

  // Hata ONCE kontrol edilir: istek basarisizsa draft hep null kalir ve
  // "yukleniyor" ekrani asla bitmezdi.
  if (prefs.isError)
    return <p className="text-sm text-destructive">{copy.selfLoadError}</p>;
  if (prefs.isLoading || draft === null)
    return <p className="text-sm text-muted-foreground">{copy.selfLoading}</p>;

  async function onSave() {
    setError(null);
    setSaved(false);
    try {
      await save.mutateAsync(draft!);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : copy.saveFailed);
    }
  }

  return (
    <PreferencesFields
      draft={draft}
      setDraft={setDraft}
      inAppHint={
        <>
          {copy.selfInAppLead} <strong>{copy.selfInAppStrong}</strong>{" "}
          {copy.selfInAppTail}
        </>
      }
      emailHint={copy.selfEmailHint}
      savedText={copy.selfSaved}
      isPending={save.isPending}
      error={error}
      saved={saved}
      onSave={() => void onSave()}
    />
  );
}

const policyKey = (facilityId: string) => [
  "config",
  "supplier-notification-policy",
  facilityId,
];

export function useSupplierNotificationPolicy(facilityId: string | null) {
  return useQuery({
    queryKey: policyKey(facilityId ?? "none"),
    queryFn: () =>
      apiRequest<SupplierPolicyDto>(
        `/facilities/${facilityId}/supplier-notification-policy`,
      ),
    enabled: facilityId !== null,
  });
}

export function SupplierNotificationPolicyForm({
  facilityId,
}: {
  facilityId: string | null;
}) {
  const copy = useT().components.notificationPreferences;
  const queryClient = useQueryClient();
  const policy = useSupplierNotificationPolicy(facilityId);
  const [draft, setDraft] = useState<PreferencesDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (policy.data && draft === null) {
      const { in_app_enabled, email_enabled, email_events } = policy.data;
      setDraft({ in_app_enabled, email_enabled, email_events });
    }
  }, [policy.data, draft]);

  const save = useMutation({
    mutationFn: (body: PreferencesDto) =>
      apiRequest<SupplierPolicyDto>(
        `/facilities/${facilityId}/supplier-notification-policy`,
        { method: "PATCH", body },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: policyKey(facilityId ?? "none") });
      setSaved(true);
    },
  });

  if (policy.isError)
    return <p className="text-sm text-destructive">{copy.policyLoadError}</p>;
  if (policy.isLoading || draft === null)
    return <p className="text-sm text-muted-foreground">{copy.policyLoading}</p>;

  async function onSave() {
    setError(null);
    setSaved(false);
    try {
      await save.mutateAsync(draft!);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : copy.saveFailed);
    }
  }

  return (
    <PreferencesFields
      draft={draft}
      setDraft={setDraft}
      banner={
        policy.data?.is_customized === false ? (
          <p className="rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
            {copy.defaultPolicy}
          </p>
        ) : null
      }
      inAppHint={
        <>
          {copy.supplierInAppLead} <strong>{copy.supplierInAppStrong}</strong>{" "}
          {copy.supplierInAppTail}
        </>
      }
      emailHint={copy.supplierEmailHint}
      savedText={copy.savedSupplier}
      isPending={save.isPending}
      error={error}
      saved={saved}
      onSave={() => void onSave()}
    />
  );
}
