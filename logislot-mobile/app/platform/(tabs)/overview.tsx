import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { usePlatformUsage } from "@/api/platform";
import { ErrorState, LoadingState, MetricCard, Screen, SectionTitle } from "@/components/ui";
import { useTheme } from "@/theme/theme";
import { spacing } from "@/theme/tokens";
import { addDaysISO, todayISO } from "@/utils/format";

/** Platform — Genel Bakış: son 30 gün agregat kullanım (web platform/usage karşılığı). */
export default function PlatformOverview() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const dateTo = todayISO();
  const dateFrom = addDaysISO(dateTo, -30);
  const usage = usePlatformUsage(dateFrom, dateTo);

  if (usage.isLoading)
    return <Screen scroll={false}><LoadingState label="Kullanım yükleniyor…" /></Screen>;
  if (usage.isError || !usage.data)
    return (
      <Screen scroll={false}>
        <ErrorState message="Kullanım verisi yüklenemedi." onRetry={() => usage.refetch()} />
      </Screen>
    );

  const t = usage.data.totals;

  return (
    <Screen style={{ paddingTop: insets.top }}>
      <View style={{ gap: spacing.md }}>
        <View>
          <Text style={{ color: colors.text, fontSize: 24, fontWeight: "800" }}>
            Genel Bakış
          </Text>
          <Text style={{ color: colors.mutedText, fontSize: 13 }}>
            Son 30 gün · yalnızca agregat metrikler, PII gösterilmez
          </Text>
        </View>

        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <MetricCard label="Tenant" value={t.tenants} icon="business-outline" tone={colors.accent} />
          <MetricCard label="Tesis" value={`${t.active_facilities}/${t.facilities}`} icon="home-outline" tone={colors.accent} />
        </View>
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <MetricCard label="Oluşturulan Randevu" value={t.appointments_created} icon="calendar-outline" tone={colors.status.completed} />
          <MetricCard label="Tamamlanan" value={t.appointments_completed} icon="checkmark-done-outline" tone={colors.status.approved} />
        </View>
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <MetricCard label="Aktif Rampa" value={t.active_docks} icon="git-branch-outline" tone={colors.accent} />
          <MetricCard label="Aktif Tedarikçi" value={t.active_suppliers} icon="people-outline" tone={colors.accent} />
        </View>

        <SectionTitle title="Tenant Kullanımı" />
        {usage.data.tenant_usage.map((row) => (
          <View
            key={row.tenant_id}
            style={{
              backgroundColor: colors.card,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 14,
              padding: spacing.md,
              gap: 4,
              marginBottom: spacing.sm,
            }}
          >
            <Text style={{ color: colors.text, fontSize: 14, fontWeight: "700" }}>
              {row.tenant_name}
            </Text>
            <Text style={{ color: colors.mutedText, fontSize: 12 }}>
              {row.assigned_plan ?? "Plan yok"} · {row.facility_count} tesis ·{" "}
              {row.appointments_created} randevu ({row.appointments_completed} tamam)
            </Text>
          </View>
        ))}
      </View>
    </Screen>
  );
}
