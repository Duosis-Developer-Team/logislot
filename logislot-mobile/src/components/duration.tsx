/**
 * İşlem süresi bileşenleri — web components/duration/* karşılığı
 * (docs/SURE_HESAPLAMA.md).
 *
 * - DurationEstimateCard: "sistem hesaplar" modunda sihirbazın süre kutusu.
 * - DurationChips: "tedarikçi seçer"/"sistem önerir" modunda süre seçimi;
 *   önerilen süre işaretlenir ve kategori aralığı dışındaysa listeye eklenir.
 */

import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import type { DurationEstimateDto } from "@/api/types";
import { Chip, ErrorState } from "@/components/ui";
import { useTheme } from "@/theme/theme";
import { radius } from "@/theme/tokens";

export const DURATION_SOURCE_LABELS: Record<string, string> = {
  rule: "kurala göre hesaplandı",
  fallback: "kategori taban süresi (kural yok)",
  manual: "elle seçildi",
};

/** Kategori aralığı seçeneklerine önerilen süreyi ekler (sıralı, tekrarsız). */
export function withSuggested(options: number[], suggested: number | null): number[] {
  if (suggested === null || options.includes(suggested)) return options;
  return [...options, suggested].sort((a, b) => a - b);
}

function Steps({ steps }: { steps: string[] }) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <View style={{ gap: 4 }}>
      <Pressable
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
        style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
      >
        <Ionicons name={open ? "chevron-down" : "chevron-forward"} size={14} color={colors.primary} />
        <Text style={{ color: colors.primary, fontSize: 12, fontWeight: "600" }}>
          Nasıl hesaplandı?
        </Text>
      </Pressable>
      {open &&
        steps.map((step) => (
          <Text key={step} style={{ color: colors.mutedText, fontSize: 12, paddingLeft: 18 }}>
            • {step}
          </Text>
        ))}
    </View>
  );
}

export function DurationEstimateCard({
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
  const { colors } = useTheme();
  if (error) return <ErrorState message="İşlem süresi hesaplanamadı." onRetry={onRetry} />;
  return (
    <View style={{ gap: 8 }}>
      <Text style={{ color: colors.text, fontSize: 14, fontWeight: "500" }}>Tahmini Süre</Text>
      <View
        style={{
          gap: 6,
          padding: 12,
          borderRadius: radius.md,
          borderWidth: 1,
          borderColor: colors.primary,
          backgroundColor: colors.card,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Ionicons name="calculator-outline" size={18} color={colors.primary} />
          <Text style={{ color: colors.text, fontSize: 20, fontWeight: "700" }}>
            {loading || !estimate ? "…" : `${estimate.minutes} dk`}
          </Text>
          <Text style={{ color: colors.mutedText, fontSize: 12 }}>sistem hesapladı</Text>
        </View>
        <Text style={{ color: colors.mutedText, fontSize: 12 }}>
          İşlem süresi tesisin kurallarına göre araç, kategori, sevkiyat tipi ve miktardan
          hesaplanır.
        </Text>
        {estimate && <Steps steps={estimate.steps} />}
      </View>
    </View>
  );
}

export function DurationChips({
  options,
  value,
  suggested,
  estimate,
  onChange,
}: {
  options: number[];
  value: number | null;
  suggested: number | null;
  estimate: DurationEstimateDto | null;
  onChange: (minutes: number) => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: 8 }}>
      <Text style={{ color: colors.text, fontSize: 14, fontWeight: "500" }}>Tahmini Süre</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        {options.map((d) => (
          <Chip
            key={d}
            label={d === suggested ? `${d} dk · önerilen` : `${d} dk`}
            selected={value === d}
            onPress={() => onChange(d)}
          />
        ))}
      </View>
      {suggested !== null && estimate && (
        <Text style={{ color: colors.mutedText, fontSize: 12 }}>
          {value === suggested
            ? estimate.source === "rule"
              ? "Süre; araç, kategori, sevkiyat tipi ve miktara göre önerildi."
              : "Bu sevkiyata uyan kural yok; kategorinin taban süresi önerildi."
            : `Önerilen süre ${suggested} dk. Farklı bir süre seçtiniz.`}
        </Text>
      )}
    </View>
  );
}
