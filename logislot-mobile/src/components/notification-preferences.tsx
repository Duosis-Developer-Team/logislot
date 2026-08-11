/**
 * Bildirim tercihi formları — web components/domain/notification-preferences.tsx
 * karşılığı. İKİ AYRI KAPSAM vardır:
 *
 * 1. `NotificationPreferencesForm` — yönetici KENDİ bildirimlerini yönetir.
 * 2. `SupplierNotificationPolicyForm` — tedarikçilere hangi bildirimlerin
 *    gideceğini YÖNETİM belirler; tedarikçi kendi panelinde bu tercihleri ne
 *    görür ne değiştirir.
 *
 * `appointment_revised` ve `appointment_dock_changed` PANEL bildirimleri
 * kapatılamaz (backend zorlar).
 */

import { useState } from "react";
import { Text, View } from "react-native";
import { ApiError } from "@/api/client";
import {
  NOTIFICATION_EVENT_LABELS,
  useNotificationPreferences,
  useSaveNotificationPreferences,
  useSaveSupplierNotificationPolicy,
  useSupplierNotificationPolicy,
} from "@/api/notifications";
import type { NotificationPreferencesDto } from "@/api/types";
import { Button, Card, SwitchRow } from "@/components/ui";
import { useTheme } from "@/theme/theme";
import { spacing } from "@/theme/tokens";

/** İki formun ortak gövdesi: panel/e-posta anahtarları + kaydet. */
function PreferenceFields({
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
  draft: NotificationPreferencesDto;
  setDraft: (next: NotificationPreferencesDto) => void;
  banner?: string | null;
  inAppHint: string;
  emailHint: string;
  savedText: string;
  isPending: boolean;
  error: string | null;
  saved: boolean;
  onSave: () => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: spacing.md }}>
      {banner ? (
        <Card>
          <Text style={{ color: colors.mutedText, fontSize: 13 }}>{banner}</Text>
        </Card>
      ) : null}

      <Card style={{ gap: spacing.sm }}>
        <SwitchRow
          label="Panel bildirimleri"
          hint={inAppHint}
          value={draft.in_app_enabled}
          onValueChange={(v) => setDraft({ ...draft, in_app_enabled: v })}
        />
      </Card>

      <Card style={{ gap: spacing.sm }}>
        <SwitchRow
          label="E-posta bildirimleri"
          hint={emailHint}
          value={draft.email_enabled}
          onValueChange={(v) => setDraft({ ...draft, email_enabled: v })}
        />
        {draft.email_enabled && (
          <View
            style={{
              gap: spacing.sm,
              borderTopWidth: 1,
              borderTopColor: colors.border,
              paddingTop: spacing.sm,
            }}
          >
            {Object.entries(draft.email_events).map(([key, enabled]) => (
              <SwitchRow
                key={key}
                label={NOTIFICATION_EVENT_LABELS[key] ?? key}
                value={enabled}
                onValueChange={(v) =>
                  setDraft({
                    ...draft,
                    email_events: { ...draft.email_events, [key]: v },
                  })
                }
              />
            ))}
          </View>
        )}
      </Card>

      {error && <Text style={{ color: colors.destructive, fontSize: 13 }}>{error}</Text>}
      {saved && (
        <Text style={{ color: colors.status.approved, fontSize: 13 }}>{savedText}</Text>
      )}
      <Button
        title={isPending ? "Kaydediliyor…" : "Kaydet"}
        loading={isPending}
        onPress={onSave}
      />
    </View>
  );
}

export function NotificationPreferencesForm() {
  const { colors } = useTheme();
  const prefs = useNotificationPreferences();
  const save = useSaveNotificationPreferences();
  // Effect'siz taslak: kullanıcı dokunana kadar sunucu verisi gösterilir.
  const [draftOverride, setDraft] = useState<NotificationPreferencesDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const draft = draftOverride ?? prefs.data ?? null;

  // Hata ÖNCE kontrol edilir: istek başarısızsa draft hep null kalır ve
  // "yükleniyor" ekranı asla bitmezdi.
  if (prefs.isError) {
    return (
      <Text style={{ color: colors.destructive, fontSize: 13 }}>Tercihler yüklenemedi.</Text>
    );
  }
  if (prefs.isLoading || draft === null) {
    return (
      <Text style={{ color: colors.mutedText, fontSize: 13 }}>Tercihler yükleniyor…</Text>
    );
  }

  async function onSave() {
    setError(null);
    setSaved(false);
    try {
      await save.mutateAsync(draft!);
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Kaydedilemedi");
    }
  }

  return (
    <PreferenceFields
      draft={draft}
      setDraft={setDraft}
      inAppHint="Kapatılsa bile randevu revizeleri panelde görünmeye devam eder (operasyonel olarak kritiktir)."
      emailHint="E-postaları kapatırsanız panel bildirimleri devam eder — panel her zaman güncel kaynaktır. Varsayılan: tüm bildirimler açık."
      savedText="Tercihleriniz kaydedildi."
      isPending={save.isPending}
      error={error}
      saved={saved}
      onSave={() => void onSave()}
    />
  );
}

export function SupplierNotificationPolicyForm({
  facilityId,
}: {
  facilityId: string | null;
}) {
  const { colors } = useTheme();
  const policy = useSupplierNotificationPolicy(facilityId);
  const save = useSaveSupplierNotificationPolicy(facilityId);
  const [draftOverride, setDraft] = useState<NotificationPreferencesDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  // is_customized sunucudan gelir ama PATCH gövdesine girmez.
  const draft =
    draftOverride ??
    (policy.data
      ? {
          in_app_enabled: policy.data.in_app_enabled,
          email_enabled: policy.data.email_enabled,
          email_events: policy.data.email_events,
        }
      : null);

  if (policy.isError) {
    return (
      <Text style={{ color: colors.destructive, fontSize: 13 }}>Politika yüklenemedi.</Text>
    );
  }
  if (policy.isLoading || draft === null) {
    return (
      <Text style={{ color: colors.mutedText, fontSize: 13 }}>Politika yükleniyor…</Text>
    );
  }

  async function onSave() {
    setError(null);
    setSaved(false);
    try {
      await save.mutateAsync(draft!);
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Kaydedilemedi");
    }
  }

  return (
    <PreferenceFields
      draft={draft}
      setDraft={setDraft}
      banner={
        policy.data?.is_customized === false
          ? "Varsayılan politika geçerli: tedarikçilere tüm bildirimler gönderiliyor."
          : null
      }
      inAppHint="Kapatılsa bile randevu revizesi ve rampa değişikliği tedarikçinin panelinde görünür — sürücünün gideceği saat ve yer gizlenemez."
      emailHint="E-postaları kapatırsanız tedarikçinin panel bildirimleri devam eder — panel her zaman güncel kaynaktır. Varsayılan: tüm bildirimler açık."
      savedText="Tedarikçi bildirim politikası kaydedildi."
      isPending={save.isPending}
      error={error}
      saved={saved}
      onSave={() => void onSave()}
    />
  );
}
