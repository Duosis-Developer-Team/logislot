import { router } from "expo-router";
import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useDashboardSummary } from "@/api/admin";
import { useSession } from "@/auth/session";
import { AppointmentCard } from "@/components/appointment";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  MetricCard,
  Screen,
  SectionTitle,
} from "@/components/ui";
import { useTheme } from "@/theme/theme";
import { spacing } from "@/theme/tokens";

/** Yönetim — Genel Bakış (web admin/dashboard karşılığı). */
export default function AdminDashboard() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { activeFacilityId, activeFacility } = useSession();
  const summary = useDashboardSummary(activeFacilityId);
  const tz = activeFacility?.timezone ?? "Europe/Istanbul";

  if (summary.isLoading)
    return <Screen scroll={false}><LoadingState label="Özet yükleniyor…" /></Screen>;
  if (summary.isError || !summary.data)
    return (
      <Screen scroll={false}>
        <ErrorState message="Dashboard yüklenemedi." onRetry={() => summary.refetch()} />
      </Screen>
    );

  const data = summary.data;

  return (
    <Screen style={{ paddingTop: insets.top }}>
      <View style={{ gap: spacing.md }}>
        <View>
          <Text style={{ color: colors.text, fontSize: 24, fontWeight: "800" }}>
            Genel Bakış
          </Text>
          <Text style={{ color: colors.mutedText, fontSize: 13 }}>
            {activeFacility?.name} — günün operasyonel özeti
          </Text>
        </View>

        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <MetricCard label="Bugünkü" value={data.today_appointments} icon="calendar-outline" tone={colors.accent} />
          <MetricCard label="Onay Bekleyen" value={data.pending_approvals} icon="hourglass-outline" tone={colors.status.pending} />
        </View>
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <MetricCard label="Bugün Tamamlanan" value={data.completed_today} icon="checkmark-done-outline" tone={colors.status.completed} />
          <MetricCard label="Bu Hafta" value={data.week_total} icon="stats-chart-outline" tone={colors.status.approved} />
        </View>
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <MetricCard label="Aktif Tedarikçi" value={data.active_suppliers} icon="people-outline" tone={colors.accent} />
          <MetricCard label="Kargo Uyarılı" value={data.cargo_warned} icon="cube-outline" tone={colors.cargo} />
        </View>

        <SectionTitle title="Onay Bekleyen Talepler" />
        {data.pending_list.length === 0 ? (
          <EmptyState title="Bekleyen talep yok" description="Yeni talepler burada görünür." />
        ) : (
          <View style={{ gap: spacing.sm }}>
            {data.pending_list.map((a) => (
              <AppointmentCard
                key={a.id}
                appointment={a}
                tz={tz}
                showSupplier
                onPress={() => router.push(`/admin/appointment/${a.id}` as never)}
              />
            ))}
          </View>
        )}

        <SectionTitle title="Yaklaşan Randevular" />
        {data.upcoming.length === 0 ? (
          <EmptyState title="Yaklaşan randevu yok" description="Takvim boş görünüyor." />
        ) : (
          <View style={{ gap: spacing.sm }}>
            {data.upcoming.map((a) => (
              <AppointmentCard
                key={a.id}
                appointment={a}
                tz={tz}
                showSupplier
                onPress={() => router.push(`/admin/appointment/${a.id}` as never)}
              />
            ))}
          </View>
        )}
      </View>
    </Screen>
  );
}
