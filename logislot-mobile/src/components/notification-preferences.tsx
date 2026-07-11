/**
 * Bildirim tercihleri formu — web components/domain/notification-preferences.tsx
 * karşılığı; admin ve supplier ortak. Kullanıcı yalnızca KENDİ tercihlerini
 * yönetir. `appointment_revised` panel bildirimi kritiktir ve kapatılamaz
 * (backend zorlar).
 */

import { useState } from "react";
import { Text, View } from "react-native";
import { ApiError } from "@/api/client";
import {
  NOTIFICATION_EVENT_LABELS,
  useNotificationPreferences,
  useSaveNotificationPreferences,
} from "@/api/notifications";
import type { NotificationPreferencesDto } from "@/api/types";
import { Button, Card, SwitchRow } from "@/components/ui";
import { useTheme } from "@/theme/theme";
import { spacing } from "@/theme/tokens";

export function NotificationPreferencesForm() {
  const { colors } = useTheme();
  const prefs = useNotificationPreferences();
  const save = useSaveNotificationPreferences();
  // Effect'siz taslak: kullanıcı dokunana kadar sunucu verisi gösterilir.
  const [draftOverride, setDraft] = useState<NotificationPreferencesDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const draft = draftOverride ?? prefs.data ?? null;

  if (prefs.isLoading || draft === null) {
    return (
      <Text style={{ color: colors.mutedText, fontSize: 13 }}>Tercihler yükleniyor…</Text>
    );
  }
  if (prefs.isError) {
    return (
      <Text style={{ color: colors.destructive, fontSize: 13 }}>Tercihler yüklenemedi.</Text>
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
    <View style={{ gap: spacing.md }}>
      <Card style={{ gap: spacing.sm }}>
        <SwitchRow
          label="Panel bildirimleri"
          hint="Kapatılsa bile randevu revizeleri panelde görünmeye devam eder (operasyonel olarak kritiktir)."
          value={draft.in_app_enabled}
          onValueChange={(v) => setDraft({ ...draft, in_app_enabled: v })}
        />
      </Card>

      <Card style={{ gap: spacing.sm }}>
        <SwitchRow
          label="E-posta bildirimleri"
          hint="E-postaları kapatırsanız panel bildirimleri devam eder — panel her zaman güncel kaynaktır. Varsayılan: tüm bildirimler açık."
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
        <Text style={{ color: colors.status.approved, fontSize: 13 }}>
          Tercihleriniz kaydedildi.
        </Text>
      )}
      <Button
        title={save.isPending ? "Kaydediliyor…" : "Kaydet"}
        loading={save.isPending}
        onPress={() => void onSave()}
      />
    </View>
  );
}
