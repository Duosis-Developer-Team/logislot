/**
 * Tedarikçi süre limitleri — web components/domain/minute-limits.tsx karşılığı.
 *
 * - MinuteLimitsField : tedarikçi formunda dönem bazında varsayılan / sınırsız / özel.
 * - MinuteUsageCard   : sihirbazlarda kullanılan / kalan süre ve aşım uyarısı.
 */

import { Ionicons } from "@expo/vector-icons";
import { Text, TextInput, View } from "react-native";
import type {
  MinuteDimension,
  MinuteLimitMode,
  MinuteLimitOverrides,
  MinuteUsageDto,
} from "@/api/types";
import { Chip } from "@/components/ui";
import { useTheme } from "@/theme/theme";
import { radius } from "@/theme/tokens";

export const MINUTE_DIMENSIONS: MinuteDimension[] = ["daily", "weekly", "monthly"];
export const DIMENSION_LABELS: Record<MinuteDimension, string> = {
  daily: "Günlük",
  weekly: "Haftalık",
  monthly: "Aylık",
};
const MODE_LABELS: Record<MinuteLimitMode, string> = {
  inherit: "Varsayılan",
  unlimited: "Sınırsız",
  custom: "Özel",
};

export const INHERIT_ALL: MinuteLimitOverrides = {
  daily: { mode: "inherit", minutes: null },
  weekly: { mode: "inherit", minutes: null },
  monthly: { mode: "inherit", minutes: null },
};

export function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h === 0 ? `${m} dk` : m === 0 ? `${h} sa` : `${h} sa ${m} dk`;
}

export function exceededUsage(
  usage: MinuteUsageDto[] | undefined,
  requested: number | null,
): MinuteUsageDto | null {
  if (!usage || !requested) return null;
  return usage.find((u) => u.limit !== null && u.used + requested > u.limit) ?? null;
}

export function overridesToBody(value: MinuteLimitOverrides): MinuteLimitOverrides | null {
  return MINUTE_DIMENSIONS.every((d) => value[d].mode === "inherit") ? null : value;
}

export function MinuteLimitsField({
  value,
  onChange,
  defaults,
}: {
  value: MinuteLimitOverrides;
  onChange: (next: MinuteLimitOverrides) => void;
  defaults: Record<MinuteDimension, number | null> | undefined;
}) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: 10 }}>
      {MINUTE_DIMENSIONS.map((d) => {
        const row = value[d];
        const fallback = defaults?.[d] ?? null;
        return (
          <View key={d} style={{ gap: 6 }}>
            <Text style={{ color: colors.text, fontSize: 14, fontWeight: "500" }}>
              {DIMENSION_LABELS[d]}
            </Text>
            <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
              {(Object.keys(MODE_LABELS) as MinuteLimitMode[]).map((mode) => (
                <Chip
                  key={mode}
                  label={MODE_LABELS[mode]}
                  selected={row.mode === mode}
                  onPress={() =>
                    onChange({
                      ...value,
                      [d]: {
                        mode,
                        minutes: mode === "custom" ? row.minutes ?? fallback ?? 480 : null,
                      },
                    })
                  }
                />
              ))}
            </View>
            {row.mode === "custom" ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <TextInput
                  value={row.minutes != null ? String(row.minutes) : ""}
                  keyboardType="number-pad"
                  accessibilityLabel={`${DIMENSION_LABELS[d]} limit (dakika)`}
                  onChangeText={(text) =>
                    onChange({
                      ...value,
                      [d]: { mode: "custom", minutes: text ? parseInt(text, 10) || null : null },
                    })
                  }
                  style={{
                    width: 110,
                    height: 44,
                    borderRadius: radius.md,
                    borderWidth: 1,
                    borderColor: colors.border,
                    backgroundColor: colors.card,
                    paddingHorizontal: 12,
                    color: colors.text,
                    fontSize: 16,
                  }}
                />
                <Text style={{ color: colors.mutedText, fontSize: 12 }}>
                  {row.minutes ? formatMinutes(row.minutes) : "dakika"}
                </Text>
              </View>
            ) : (
              <Text style={{ color: colors.faintText, fontSize: 12 }}>
                {row.mode === "inherit"
                  ? `Tesis varsayılanı: ${fallback === null ? "sınırsız" : formatMinutes(fallback)}`
                  : "Bu tedarikçi için sınır yok"}
              </Text>
            )}
          </View>
        );
      })}
    </View>
  );
}

export function MinuteUsageCard({
  usage,
  requested,
  title = "Süre limitiniz",
}: {
  usage: MinuteUsageDto[] | undefined;
  requested: number | null;
  title?: string;
}) {
  const { colors } = useTheme();
  const limited = (usage ?? []).filter((u) => u.limit !== null);
  if (limited.length === 0) return null;
  const exceeded = exceededUsage(usage, requested);
  return (
    <View
      style={{
        gap: 8,
        padding: 12,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: exceeded ? colors.destructive : colors.border,
        backgroundColor: colors.card,
      }}
    >
      <Text style={{ color: colors.mutedText, fontSize: 12, fontWeight: "700" }}>{title}</Text>
      {limited.map((u) => {
        const limit = u.limit as number;
        const after = u.used + (requested ?? 0);
        const usedPct = Math.min((u.used / limit) * 100, 100);
        const addPct = Math.max(Math.min((after / limit) * 100, 100) - usedPct, 0);
        const over = after > limit;
        return (
          <View key={u.dimension} style={{ gap: 4 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ color: colors.text, fontSize: 12, fontWeight: "600" }}>
                {DIMENSION_LABELS[u.dimension]}
              </Text>
              <Text style={{ color: over ? colors.destructive : colors.mutedText, fontSize: 12 }}>
                {formatMinutes(u.used)} / {formatMinutes(limit)} · kalan {formatMinutes(u.remaining ?? 0)}
              </Text>
            </View>
            <View
              style={{
                flexDirection: "row",
                height: 6,
                borderRadius: 3,
                overflow: "hidden",
                backgroundColor: colors.border,
              }}
            >
              <View style={{ width: `${usedPct}%`, backgroundColor: colors.primary }} />
              <View
                style={{
                  width: `${addPct}%`,
                  backgroundColor: over ? colors.destructive : colors.status.approved,
                }}
              />
            </View>
          </View>
        );
      })}
      {exceeded ? (
        <View style={{ flexDirection: "row", gap: 6 }}>
          <Ionicons name="warning-outline" size={14} color={colors.destructive} />
          <Text style={{ color: colors.destructive, fontSize: 12, flex: 1 }}>
            {DIMENSION_LABELS[exceeded.dimension]} süre limiti aşılıyor: bu randevu{" "}
            {formatMinutes(requested ?? 0)}, kalan {formatMinutes(exceeded.remaining ?? 0)}. Başka
            bir gün seçin ya da tesisle iletişime geçin.
          </Text>
        </View>
      ) : requested ? (
        <Text style={{ color: colors.mutedText, fontSize: 12 }}>
          Bu randevu ({formatMinutes(requested)}) limitinize sığıyor.
        </Text>
      ) : null}
    </View>
  );
}
