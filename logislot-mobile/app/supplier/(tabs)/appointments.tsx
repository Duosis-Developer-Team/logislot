import { router } from "expo-router";
import { useMemo, useState } from "react";
import { FlatList, RefreshControl, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  useSupplierAppointments,
  useSupplierProfile,
  useSupplierSeries,
} from "@/api/supplier";
import { AppointmentCard } from "@/components/appointment";
import {
  Card,
  Chip,
  EmptyState,
  ErrorState,
  LoadingState,
  MetricCard,
} from "@/components/ui";
import { useTheme } from "@/theme/theme";
import { spacing } from "@/theme/tokens";

/** Tedarikçi — Randevularım (web supplier/appointments karşılığı). */
export default function SupplierAppointments() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const profile = useSupplierProfile();
  const list = useSupplierAppointments();
  const series = useSupplierSeries();
  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");

  // Ekran acilis ani — gecmis/gelecek ayrimi icin tek seferlik referans.
  const [now] = useState(() => Date.now());
  const all = useMemo(() => list.data ?? [], [list.data]);
  const { upcoming, past } = useMemo(() => {
    const up = all
      .filter(
        (a) =>
          new Date(a.scheduled_start_at).getTime() >= now - 3600_000 &&
          !["completed", "cancelled", "rejected"].includes(a.status),
      )
      .sort(
        (a, b) =>
          new Date(a.scheduled_start_at).getTime() -
          new Date(b.scheduled_start_at).getTime(),
      );
    return { upcoming: up, past: all.filter((a) => !up.includes(a)) };
  }, [all, now]);

  if (list.isLoading) return <ScreenShell><LoadingState /></ScreenShell>;
  if (list.isError)
    return (
      <ScreenShell>
        <ErrorState message="Randevular yüklenemedi." onRetry={() => list.refetch()} />
      </ScreenShell>
    );
  const shown = tab === "upcoming" ? upcoming : past;
  const tz = profile.data?.facility.timezone ?? "Europe/Istanbul";
  const activeSeries = (series.data ?? []).filter((s) => s.status === "active");

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <FlatList
        data={shown}
        keyExtractor={(a) => a.id}
        contentContainerStyle={{
          padding: spacing.lg,
          paddingTop: insets.top + spacing.md,
          gap: spacing.md,
          paddingBottom: spacing.xl * 2,
        }}
        refreshControl={
          <RefreshControl
            refreshing={list.isRefetching}
            onRefresh={() => void list.refetch()}
            tintColor={colors.accent}
          />
        }
        ListHeaderComponent={
          <View style={{ gap: spacing.md, marginBottom: spacing.sm }}>
            <View>
              <Text style={{ color: colors.text, fontSize: 24, fontWeight: "800" }}>
                {profile.data?.company_name ?? "Randevularım"}
              </Text>
              {profile.data && (
                <Text style={{ color: colors.mutedText, fontSize: 13, marginTop: 2 }}>
                  Kod: {profile.data.code}
                  {profile.data.category_label ? ` · ${profile.data.category_label}` : ""}
                </Text>
              )}
            </View>

            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              <MetricCard label="Yaklaşan" value={upcoming.length} icon="time-outline" tone={colors.accent} />
              <MetricCard
                label="Bekleyen"
                value={all.filter((a) => a.status === "pending").length}
                icon="hourglass-outline"
                tone={colors.status.pending}
              />
              <MetricCard
                label="Tamamlanan"
                value={all.filter((a) => a.status === "completed").length}
                icon="checkmark-done-outline"
                tone={colors.status.completed}
              />
            </View>

            {activeSeries.length > 0 && (
              <Card style={{ gap: 6, padding: spacing.md }}>
                <Text style={{ color: colors.text, fontSize: 13, fontWeight: "700" }}>
                  Tekrarlayan randevular
                </Text>
                {activeSeries.map((s) => (
                  <Text key={s.id} style={{ color: colors.mutedText, fontSize: 12 }}>
                    • {s.product_name ?? "Seri"} —{" "}
                    {s.frequency === "weekly"
                      ? "haftalık"
                      : s.frequency === "biweekly"
                        ? "2 haftada bir"
                        : "aylık"}{" "}
                    × {s.occurrence_count}
                  </Text>
                ))}
              </Card>
            )}

            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              <Chip label={`Yaklaşan (${upcoming.length})`} selected={tab === "upcoming"} onPress={() => setTab("upcoming")} />
              <Chip label={`Geçmiş (${past.length})`} selected={tab === "past"} onPress={() => setTab("past")} />
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <AppointmentCard
            appointment={item}
            tz={tz}
            onPress={() => router.push(`/supplier/appointment/${item.id}` as never)}
          />
        )}
        ListEmptyComponent={
          <EmptyState
            title="Randevu yok"
            description={
              tab === "upcoming"
                ? "Yeni Randevu sekmesinden 3 adımda talep oluşturabilirsiniz."
                : "Geçmiş randevunuz bulunmuyor."
            }
          />
        }
      />
    </View>
  );
}

function ScreenShell({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, justifyContent: "center", backgroundColor: colors.background }}>
      {children}
    </View>
  );
}
