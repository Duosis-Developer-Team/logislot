/** Randevu domain bileşenleri — StatusBadge, CargoBadge, MakeupBadge, AppointmentCard. */

import { Ionicons } from "@expo/vector-icons";
import { Pressable, Text, View } from "react-native";
import {
  APPOINTMENT_STATUS_LABELS,
  CARGO_WINDOW_LABELS,
  QUANTITY_UNIT_LABELS,
  type AppointmentStatus,
  type CargoWindow,
  type QuantityUnit,
} from "@/api/shared";
import type { AppointmentDto, LinkedAppointmentDto } from "@/api/types";
import { Badge, Card } from "@/components/ui";
import { useTheme } from "@/theme/theme";
import { formatDate, timeInTz } from "@/utils/format";

export function statusColor(
  status: string,
  colors: ReturnType<typeof useTheme>["colors"],
): string {
  const map: Record<string, string> = {
    pending: colors.status.pending,
    approved: colors.status.approved,
    revision_pending: colors.status.revision,
    rejected: colors.status.rejected,
    completed: colors.status.completed,
    cancelled: colors.status.cancelled,
  };
  return map[status] ?? colors.mutedText;
}

export function StatusBadge({ status }: { status: string }) {
  const { colors } = useTheme();
  return (
    <Badge
      label={APPOINTMENT_STATUS_LABELS[status as AppointmentStatus] ?? status}
      color={statusColor(status, colors)}
    />
  );
}

export function CargoBadge({ window }: { window?: string | null }) {
  const { colors } = useTheme();
  const label = window
    ? `Kargo · ${CARGO_WINDOW_LABELS[window as CargoWindow] ?? window}`
    : "Kargo";
  return <Badge label={label} color={colors.cargo} />;
}

/** Telafi randevusu işareti (müşteri kararı 2026-11: telafiler bayrakla işaretlenir). */
export function MakeupBadge() {
  const { colors } = useTheme();
  return <Badge label="Telafi" color={colors.status.revision} />;
}

/** İptal edilen <-> telafi randevusu bağlantıları; dokununca karşı randevu açılır. */
export function MakeupLinks({
  makeupOf,
  makeup,
  tz,
  onOpen,
}: {
  makeupOf: LinkedAppointmentDto | null;
  makeup: LinkedAppointmentDto | null;
  tz: string;
  onOpen: (id: string) => void;
}) {
  const { colors } = useTheme();
  const rows = [
    makeupOf ? { label: "İptal edilen randevu", linked: makeupOf } : null,
    makeup ? { label: "Telafi randevusu", linked: makeup } : null,
  ].filter((row): row is { label: string; linked: LinkedAppointmentDto } => row !== null);
  return (
    <View
      style={{
        gap: 8,
        borderRadius: 12,
        padding: 12,
        backgroundColor: `${colors.status.revision}12`,
      }}
    >
      {rows.map(({ label, linked }) => (
        <Pressable
          key={linked.id}
          onPress={() => onOpen(linked.id)}
          style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
        >
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.mutedText, fontSize: 12 }}>{label}</Text>
            <Text style={{ color: colors.text, fontSize: 13, fontWeight: "600" }}>
              {formatDate(linked.scheduled_start_at)} {timeInTz(linked.scheduled_start_at, tz)}
            </Text>
          </View>
          <StatusBadge status={linked.status} />
          <Ionicons name="chevron-forward" size={16} color={colors.mutedText} />
        </Pressable>
      ))}
    </View>
  );
}

/** Ortak randevu kartı — supplier ve admin listelerinde kullanılır. */
export function AppointmentCard({
  appointment: a,
  tz,
  showSupplier,
  onPress,
}: {
  appointment: AppointmentDto;
  tz: string;
  showSupplier?: boolean;
  onPress?: () => void;
}) {
  const { colors } = useTheme();
  const unitLabel =
    QUANTITY_UNIT_LABELS[a.quantity_unit as QuantityUnit] ?? a.quantity_unit;
  return (
    <Card onPress={onPress} style={{ gap: 8 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Text
            numberOfLines={1}
            style={{ color: colors.text, fontSize: 15, fontWeight: "700" }}
          >
            {showSupplier && a.supplier_name ? a.supplier_name : a.product_name}
          </Text>
          <Text numberOfLines={1} style={{ color: colors.mutedText, fontSize: 13 }}>
            {showSupplier ? a.product_name : `${a.quantity} ${unitLabel}`}
            {a.product_category_name ? ` · ${a.product_category_name}` : ""}
          </Text>
          {a.order_numbers && a.order_numbers.length > 0 && (
            <Text numberOfLines={1} style={{ color: colors.faintText, fontSize: 12 }}>
              Sipariş: {a.order_numbers.join(", ")}
            </Text>
          )}
        </View>
        <StatusBadge status={a.status} />
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <Ionicons name="calendar-outline" size={13} color={colors.faintText} />
          <Text style={{ color: colors.mutedText, fontSize: 12 }}>
            {formatDate(a.scheduled_start_at)}
          </Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <Ionicons name="time-outline" size={13} color={colors.faintText} />
          <Text style={{ color: colors.mutedText, fontSize: 12 }}>
            {timeInTz(a.scheduled_start_at, tz)}–{timeInTz(a.scheduled_end_at, tz)}
          </Text>
        </View>
        {a.dock_name && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Ionicons name="business-outline" size={13} color={colors.faintText} />
            <Text style={{ color: colors.mutedText, fontSize: 12 }}>{a.dock_name}</Text>
          </View>
        )}
      </View>
      {(a.delivery_type === "cargo" || a.is_makeup) && (
        <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
          {a.delivery_type === "cargo" && <CargoBadge window={a.cargo_window} />}
          {a.is_makeup && <MakeupBadge />}
        </View>
      )}
    </Card>
  );
}
