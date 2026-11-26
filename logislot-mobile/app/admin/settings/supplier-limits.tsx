/**
 * Tedarikçi Süre Limitleri (yönetim) — web app/(admin)/admin/settings/supplier-limits
 * karşılığı. Tesis varsayılanı: günlük / haftalık / aylık dakika; boş = sınırsız.
 * Tedarikçi kartı dönem bazında devralır, sınırsız yapar ya da özel değer verir.
 */

import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { ApiError } from "@/api/client";
import { useSaveSupplierMinuteLimits, useSupplierMinuteLimits } from "@/api/supplier-limits";
import type { MinuteDimension } from "@/api/types";
import { useSession } from "@/auth/session";
import { DIMENSION_LABELS, MINUTE_DIMENSIONS, formatMinutes } from "@/components/minute-limits";
import { Button, Card, Field, LoadingState } from "@/components/ui";
import { useTheme } from "@/theme/theme";
import { spacing } from "@/theme/tokens";

const PERIOD_HINTS: Record<MinuteDimension, string> = {
  daily: "Tesisin yerel günü",
  weekly: "Pazartesi–Pazar",
  monthly: "Takvim ayı",
};

type Draft = Record<MinuteDimension, string>;

export default function AdminSupplierLimits() {
  const { colors } = useTheme();
  const session = useSession();
  const facilityId = session.activeFacilityId;
  const limits = useSupplierMinuteLimits(facilityId);
  const save = useSaveSupplierMinuteLimits(facilityId);
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

  if (!session.can("supplier.manage"))
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, padding: spacing.lg }}>
        <Text style={{ color: colors.mutedText, fontSize: 13 }}>
          Bu sayfayı görüntülemek için tedarikçi yönetimi yetkisi gerekir.
        </Text>
      </View>
    );

  async function onSave() {
    if (!draft) return;
    setError(null);
    setSaved(false);
    const toNumber = (v: string) => (v.trim() === "" ? null : parseInt(v, 10) || null);
    try {
      await save.mutateAsync({
        daily: toNumber(draft.daily),
        weekly: toNumber(draft.weekly),
        monthly: toNumber(draft.monthly),
      });
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Süre limitleri kaydedilemedi.");
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 64 }}>
        <View style={{ gap: spacing.md }}>
          <Text style={{ color: colors.mutedText, fontSize: 13 }}>
            Bir tedarikçinin rampada kaplayabileceği toplam süre. Tüm tedarikçilere uygulanan
            varsayılan burada belirlenir; tedarikçi kartında dönem bazında sınırsız yapılabilir ya
            da özel değer verilebilir.
          </Text>
          {limits.isError ? (
            <Text style={{ color: colors.destructive, fontSize: 13 }}>Süre limitleri yüklenemedi.</Text>
          ) : !draft ? (
            <LoadingState />
          ) : (
            <Card style={{ gap: spacing.sm }}>
              <Text style={{ color: colors.text, fontSize: 15, fontWeight: "600" }}>
                Varsayılan Limitler
              </Text>
              {MINUTE_DIMENSIONS.map((d) => {
                const n = parseInt(draft[d], 10);
                return (
                  <View key={d} style={{ gap: 4 }}>
                    <Field
                      label={`${DIMENSION_LABELS[d]} limit (dakika)`}
                      value={draft[d]}
                      placeholder="Sınırsız"
                      keyboardType="number-pad"
                      onChangeText={(v) => {
                        setSaved(false);
                        setDraft({ ...draft, [d]: v });
                      }}
                    />
                    <Text style={{ color: colors.faintText, fontSize: 12 }}>
                      {n > 0 ? formatMinutes(n) : "Sınırsız"} · {PERIOD_HINTS[d]}
                    </Text>
                  </View>
                );
              })}
              <Text style={{ color: colors.faintText, fontSize: 12 }}>
                İptal ve reddedilen randevular sayılmaz; kargo dahil diğer tüm randevuların süresi
                toplanır. Limit yeni randevulara uygulanır; mevcut randevular ve yönetimin revizeleri
                etkilenmez.
              </Text>
              {error && <Text style={{ color: colors.destructive, fontSize: 13 }}>{error}</Text>}
              {saved && (
                <Text style={{ color: colors.status.approved, fontSize: 13 }}>
                  Süre limitleri kaydedildi.
                </Text>
              )}
              <Button title="Kaydet" loading={save.isPending} onPress={() => void onSave()} />
            </Card>
          )}
        </View>
      </ScrollView>
    </View>
  );
}
