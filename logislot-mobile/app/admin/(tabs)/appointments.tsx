import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useState } from "react";
import { FlatList, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppointments } from "@/api/admin";
import { APPOINTMENT_STATUS_LABELS, APPOINTMENT_STATUSES } from "@/api/shared";
import { useSession } from "@/auth/session";
import { AppointmentCard } from "@/components/appointment";
import { DriverIdSearchModal } from "@/components/driver-id";
import { Chip, EmptyState, ErrorState, LoadingState } from "@/components/ui";
import { useTheme } from "@/theme/theme";
import { spacing } from "@/theme/tokens";

/** Yönetim — Randevular listesi (statü filtreli; web admin/appointments karşılığı). */
export default function AdminAppointments() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { activeFacilityId, activeFacility, can } = useSession();
  const [status, setStatus] = useState<string>("all");
  const [idSearchOpen, setIdSearchOpen] = useState(false);
  const list = useAppointments(activeFacilityId, status);
  const tz = activeFacility?.timezone ?? "Europe/Istanbul";

  const rows = (list.data ?? [])
    .slice()
    .sort(
      (a, b) =>
        new Date(b.scheduled_start_at).getTime() - new Date(a.scheduled_start_at).getTime(),
    );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <FlatList
        data={rows}
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
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={{ color: colors.text, fontSize: 24, fontWeight: "800" }}>
                Randevular
              </Text>
              {can("appt.driver_id.view") && (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setIdSearchOpen(true)}
                  hitSlop={8}
                  style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
                >
                  <Ionicons name="shield-checkmark-outline" size={18} color={colors.primary} />
                  <Text style={{ color: colors.primary, fontSize: 13, fontWeight: "600" }}>
                    Kimlikle bul
                  </Text>
                </Pressable>
              )}
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={{ flexDirection: "row", gap: 6 }}>
                <Chip label="Tümü" selected={status === "all"} onPress={() => setStatus("all")} />
                {APPOINTMENT_STATUSES.map((s) => (
                  <Chip
                    key={s}
                    label={APPOINTMENT_STATUS_LABELS[s]}
                    selected={status === s}
                    onPress={() => setStatus(s)}
                  />
                ))}
              </View>
            </ScrollView>
          </View>
        }
        renderItem={({ item }) => (
          <AppointmentCard
            appointment={item}
            tz={tz}
            showSupplier
            onPress={() => router.push(`/admin/appointment/${item.id}` as never)}
          />
        )}
        ListEmptyComponent={
          list.isLoading ? (
            <LoadingState />
          ) : list.isError ? (
            <ErrorState message="Randevular yüklenemedi." onRetry={() => list.refetch()} />
          ) : (
            <EmptyState title="Randevu yok" description="Bu filtrede randevu bulunmuyor." />
          )
        }
      />
      <DriverIdSearchModal visible={idSearchOpen} onClose={() => setIdSearchOpen(false)} />
    </View>
  );
}
