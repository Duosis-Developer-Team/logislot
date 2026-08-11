import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useCalendarDay } from "@/api/admin";
import { useSession } from "@/auth/session";
import { AppointmentCard } from "@/components/appointment";
import {
  OverrideModal,
  type OverrideModalInitial,
} from "@/components/override-modal";
import { Button, EmptyState, ErrorState, LoadingState, Screen } from "@/components/ui";
import { useTheme } from "@/theme/theme";
import { spacing } from "@/theme/tokens";
import { addDaysISO, todayISO } from "@/utils/format";

/**
 * Yönetim — Takvim (mobile agenda): gün seçici oklar + rampa gruplu randevu
 * listesi. Web'deki saat-ızgara timeline'ının mobile-native karşılığı.
 */
export default function AdminCalendar() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { activeFacilityId, can } = useSession();
  const [date, setDate] = useState(todayISO());
  const day = useCalendarDay(activeFacilityId, date);

  // Takvimden tek dokunuşla istisna: görüntülenen gün ön-seçili, tip "kapalı".
  const [overrideInitial, setOverrideInitial] = useState<OverrideModalInitial | null>(null);
  const canOverride = can("calendar.override");
  function openOverride(dockId?: string) {
    setOverrideInitial({ date, type: "closed", dockIds: dockId ? [dockId] : [] });
  }

  const dateLabel = useMemo(
    () =>
      new Date(`${date}T12:00:00`).toLocaleDateString("tr-TR", {
        weekday: "long",
        day: "numeric",
        month: "long",
      }),
    [date],
  );

  const data = day.data;
  const tz = data?.facility.timezone ?? "Europe/Istanbul";

  // Rampa bazlı gruplama — mobile'da sütun yerine bölüm.
  const grouped = useMemo(() => {
    if (!data) return [];
    return data.docks.map((dock) => ({
      dock,
      appointments: data.appointments
        .filter((a) => a.dock_id === dock.id)
        .sort(
          (a, b) =>
            new Date(a.scheduled_start_at).getTime() -
            new Date(b.scheduled_start_at).getTime(),
        ),
    }));
  }, [data]);

  return (
    <Screen style={{ paddingTop: insets.top }}>
      <View style={{ gap: spacing.md }}>
        <Text style={{ color: colors.text, fontSize: 24, fontWeight: "800" }}>Takvim</Text>

        {/* Gün gezinme */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: spacing.sm,
          }}
        >
          <ArrowButton icon="chevron-back" onPress={() => setDate(addDaysISO(date, -1))} />
          <Pressable onPress={() => setDate(todayISO())} style={{ flex: 1 }}>
            <Text
              style={{
                color: colors.text,
                fontSize: 15,
                fontWeight: "600",
                textAlign: "center",
              }}
            >
              {dateLabel}
            </Text>
            <Text style={{ color: colors.faintText, fontSize: 11, textAlign: "center" }}>
              Bugüne dönmek için dokun
            </Text>
          </Pressable>
          <ArrowButton icon="chevron-forward" onPress={() => setDate(addDaysISO(date, 1))} />
        </View>

        {canOverride && (
          <Button
            title="İstisna Ekle"
            variant="secondary"
            onPress={() => openOverride()}
            style={{ height: 42 }}
          />
        )}

        {day.isLoading ? (
          <LoadingState label="Takvim yükleniyor…" />
        ) : day.isError || !data ? (
          <ErrorState message="Takvim yüklenemedi." onRetry={() => day.refetch()} />
        ) : (
          <>
            {data.cargo_advisories.length > 0 && (
              <View
                style={{
                  backgroundColor: `${colors.cargo}15`,
                  borderRadius: 12,
                  padding: 12,
                  gap: 4,
                }}
              >
                {data.cargo_advisories.map((adv) => (
                  <Text key={adv.appointment_id} style={{ color: colors.cargo, fontSize: 12 }}>
                    📦 {adv.message}
                  </Text>
                ))}
              </View>
            )}

            {data.appointments.length === 0 && (
              <EmptyState
                title="Bu gün randevu yok"
                description="Farklı bir gün seçin ya da tedarikçi taleplerini bekleyin."
              />
            )}

            {grouped.map(({ dock, appointments }) => (
              <View key={dock.id} style={{ gap: spacing.sm }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Text style={{ color: colors.text, fontSize: 15, fontWeight: "700" }}>
                    {dock.name}
                  </Text>
                  {dock.has_cargo_warning && (
                    <Ionicons name="cube-outline" size={14} color={colors.cargo} />
                  )}
                  <Text style={{ color: colors.faintText, fontSize: 12 }}>
                    {dock.day_window
                      ? `${dock.day_window.start}–${dock.day_window.end}`
                      : "Bugün kapalı"}
                  </Text>
                  {canOverride && (
                    <Pressable
                      onPress={() => openOverride(dock.id)}
                      accessibilityLabel={`${dock.name} için istisna ekle`}
                      hitSlop={8}
                      style={({ pressed }) => ({ marginLeft: "auto", opacity: pressed ? 0.6 : 1 })}
                    >
                      <Ionicons name="calendar-outline" size={16} color={colors.mutedText} />
                    </Pressable>
                  )}
                </View>
                {appointments.length === 0 ? (
                  <Text style={{ color: colors.faintText, fontSize: 13, paddingLeft: 4 }}>
                    Randevu yok
                  </Text>
                ) : (
                  appointments.map((a) => (
                    <AppointmentCard
                      key={a.id}
                      appointment={a}
                      tz={tz}
                      showSupplier
                      onPress={() => router.push(`/admin/appointment/${a.id}` as never)}
                    />
                  ))
                )}
              </View>
            ))}
          </>
        )}
      </View>

      <OverrideModal
        visible={overrideInitial !== null}
        initial={overrideInitial}
        onClose={() => setOverrideInitial(null)}
      />
    </Screen>
  );
}

function ArrowButton({
  icon,
  onPress,
}: {
  icon: "chevron-back" | "chevron-forward";
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        width: 42,
        height: 42,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.card,
        alignItems: "center",
        justifyContent: "center",
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Ionicons name={icon} size={20} color={colors.text} />
    </Pressable>
  );
}
