import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Alert, Text, View } from "react-native";
import { ApiError } from "@/api/client";
import { QUANTITY_UNIT_LABELS, type QuantityUnit } from "@/api/shared";
import {
  useCancelSupplierAppointment,
  useSupplierAppointmentDetail,
  useSupplierProfile,
} from "@/api/supplier";
import { CargoBadge, StatusBadge } from "@/components/appointment";
import { Button, Card, ErrorState, LoadingState, Screen } from "@/components/ui";
import { useTheme } from "@/theme/theme";
import { spacing } from "@/theme/tokens";
import { formatDate, timeInTz } from "@/utils/format";

/** Tedarikçi randevu detayı + iptal (web kart aksiyonlarının ekran karşılığı). */
export default function SupplierAppointmentDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const detail = useSupplierAppointmentDetail(id ?? null);
  const profile = useSupplierProfile();
  const cancel = useCancelSupplierAppointment();
  // Ekran acilis ani — gecmis/gelecek ayrimi icin tek seferlik referans.
  const [now] = useState(() => Date.now());

  if (detail.isLoading) return <Screen scroll={false}><LoadingState /></Screen>;
  if (detail.isError || !detail.data)
    return (
      <Screen scroll={false}>
        <ErrorState message="Randevu yüklenemedi." onRetry={() => detail.refetch()} />
      </Screen>
    );

  const a = detail.data;
  const tz = profile.data?.facility.timezone ?? "Europe/Istanbul";
  const canCancel =
    ["pending", "approved"].includes(a.status) &&
    new Date(a.scheduled_start_at).getTime() > now;

  function confirmCancel() {
    Alert.alert(
      "Randevuyu iptal et",
      `"${a.product_name}" randevusu iptal edilecek. Bu işlem geri alınamaz.`,
      [
        { text: "Vazgeç", style: "cancel" },
        {
          text: "İptal Et",
          style: "destructive",
          onPress: () => {
            cancel.mutate(a.id, {
              onSuccess: () => router.back(),
              onError: (err) =>
                Alert.alert(
                  "İptal edilemedi",
                  err instanceof ApiError ? err.message : "Bir hata oluştu.",
                ),
            });
          },
        },
      ],
    );
  }

  return (
    <Screen>
      <View style={{ gap: spacing.md }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontSize: 20, fontWeight: "800" }}>
              {a.product_name}
            </Text>
            <Text style={{ color: colors.mutedText, fontSize: 13 }}>
              {a.quantity}{" "}
              {QUANTITY_UNIT_LABELS[a.quantity_unit as QuantityUnit] ?? a.quantity_unit}
              {a.product_category_name ? ` · ${a.product_category_name}` : ""}
            </Text>
          </View>
          <StatusBadge status={a.status} />
        </View>

        <Card style={{ gap: 8 }}>
          <Row label="Tarih" value={formatDate(a.scheduled_start_at)} />
          <Row
            label="Saat"
            value={`${timeInTz(a.scheduled_start_at, tz)}–${timeInTz(a.scheduled_end_at, tz)} (${a.duration_minutes} dk)`}
          />
          <Row label="Rampa" value={a.dock_name ?? "—"} />
          <Row label="Araç" value={a.vehicle_category_name ?? "—"} />
          {a.license_plate && <Row label="Plaka" value={a.license_plate} />}
          {a.driver_name && <Row label="Sürücü" value={a.driver_name} />}
        </Card>

        {a.delivery_type === "cargo" && <CargoBadge window={a.cargo_window} />}

        {a.series && (
          <Card style={{ padding: spacing.md }}>
            <Text style={{ color: colors.accent, fontSize: 13 }}>
              Tekrarlayan serinin {a.series.occurrence_index}/{a.series.occurrence_count}.
              randevusu
            </Text>
          </Card>
        )}

        {a.status === "rejected" && a.rejection_reason && (
          <NoteBox color={colors.status.rejected} text={`Red sebebi: ${a.rejection_reason}`} />
        )}
        {a.status === "revision_pending" && a.original_start_at && (
          <NoteBox
            color={colors.status.revision}
            text={`Tesis yeni saat önerdi: ${formatDate(a.original_start_at)} ${timeInTz(a.original_start_at, tz)} → ${formatDate(a.scheduled_start_at)} ${timeInTz(a.scheduled_start_at, tz)}${a.revision_note ? `\nNot: ${a.revision_note}` : ""}`}
          />
        )}
        {a.status === "cancelled" && a.cancellation_reason && (
          <NoteBox color={colors.status.cancelled} text={`İptal sebebi: ${a.cancellation_reason}`} />
        )}

        {canCancel && (
          <Button
            title="Randevuyu İptal Et"
            variant="destructive"
            loading={cancel.isPending}
            onPress={confirmCancel}
          />
        )}
      </View>
    </Screen>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
      <Text style={{ color: colors.mutedText, fontSize: 13 }}>{label}</Text>
      <Text style={{ color: colors.text, fontSize: 13, fontWeight: "500", flexShrink: 1, textAlign: "right" }}>
        {value}
      </Text>
    </View>
  );
}

function NoteBox({ color, text }: { color: string; text: string }) {
  return (
    <View style={{ backgroundColor: `${color}15`, borderRadius: 12, padding: 12 }}>
      <Text style={{ color, fontSize: 13 }}>{text}</Text>
    </View>
  );
}
