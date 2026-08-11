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

interface PreferencesDto {
  in_app_enabled: boolean;
  email_enabled: boolean;
  email_events: Record<string, boolean>;
}

interface SupplierPolicyDto extends PreferencesDto {
  /** false ise hicbir sey degistirilmemis, varsayilan (hepsi acik) gecerli. */
  is_customized: boolean;
}

const EVENT_LABELS: Record<string, string> = {
  appointment_approved: "Randevu onaylandığında",
  appointment_rejected: "Randevu reddedildiğinde",
  appointment_revised: "Randevu revize edildiğinde",
  appointment_dock_changed: "Rampa değiştirildiğinde",
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
  return (
    <div className="flex flex-col gap-4">
      {banner}
      <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
        <Switch
          checked={draft.in_app_enabled}
          onChange={(v) => setDraft({ ...draft, in_app_enabled: v })}
          label="Panel bildirimleri"
        />
        <p className="text-xs text-muted-foreground">{inAppHint}</p>
      </div>

      <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
        <Switch
          checked={draft.email_enabled}
          onChange={(v) => setDraft({ ...draft, email_enabled: v })}
          label="E-posta bildirimleri"
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
                label={EVENT_LABELS[key] ?? key}
              />
            ))}
          </div>
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {saved && <p className="text-sm text-status-approved">{savedText}</p>}
      <div className="flex justify-end">
        <Button onClick={onSave} disabled={isPending}>
          {isPending ? "Kaydediliyor…" : "Kaydet"}
        </Button>
      </div>
    </div>
  );
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

  // Hata ONCE kontrol edilir: istek basarisizsa draft hep null kalir ve
  // "yukleniyor" ekrani asla bitmezdi.
  if (prefs.isError)
    return <p className="text-sm text-destructive">Tercihler yüklenemedi.</p>;
  if (prefs.isLoading || draft === null)
    return <p className="text-sm text-muted-foreground">Tercihler yükleniyor…</p>;

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
    <PreferencesFields
      draft={draft}
      setDraft={setDraft}
      inAppHint={
        <>
          Kapatılsa bile <strong>randevu revizeleri</strong> panelde görünmeye devam
          eder (operasyonel olarak kritiktir).
        </>
      }
      emailHint="E-postaları kapatırsanız panel bildirimleri devam eder — panel her zaman güncel kaynaktır. Varsayılan: tüm bildirimler açık."
      savedText="Tercihleriniz kaydedildi."
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
    return <p className="text-sm text-destructive">Politika yüklenemedi.</p>;
  if (policy.isLoading || draft === null)
    return <p className="text-sm text-muted-foreground">Politika yükleniyor…</p>;

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
    <PreferencesFields
      draft={draft}
      setDraft={setDraft}
      banner={
        policy.data?.is_customized === false ? (
          <p className="rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
            Varsayılan politika geçerli: tedarikçilere tüm bildirimler gönderiliyor.
          </p>
        ) : null
      }
      inAppHint={
        <>
          Kapatılsa bile <strong>randevu revizesi ve rampa değişikliği</strong>{" "}
          tedarikçinin panelinde görünmeye devam eder — sürücünün gideceği saat ve
          yer gizlenemez.
        </>
      }
      emailHint="E-postaları kapatırsanız tedarikçinin panel bildirimleri devam eder — panel her zaman güncel kaynaktır. Varsayılan: tüm bildirimler açık."
      savedText="Tedarikçi bildirim politikası kaydedildi."
      isPending={save.isPending}
      error={error}
      saved={saved}
      onSave={() => void onSave()}
    />
  );
}
