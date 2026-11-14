import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Alert, Text, View } from "react-native";
import { ApiError } from "@/api/client";
import {
  QUANTITY_UNIT_LABELS,
  cancellationReasonText,
  type QuantityUnit,
} from "@/api/shared";
import {
  useCancelSupplierAppointment,
  useSupplierAppointmentDetail,
  useSupplierProfile,
  type SupplierCancelBody,
} from "@/api/supplier";
import { CargoBadge, MakeupBadge, MakeupLinks, StatusBadge } from "@/components/appointment";
import { SupplierCancelModal } from "@/components/supplier-cancel";
import { Button, Card, ErrorState, LoadingState, Screen } from "@/components/ui";
import { useTheme } from "@/theme/theme";
import { spacing } from "@/theme/tokens";
import { formatDate, timeInTz } from "@/utils/format";

const HOUR_MS = 3600_000;

/** Tedarikçi randevu detayı + iptal (web kart aksiyonlarının ekran karşılığı). */
export default function SupplierAppointmentDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const detail = useSupplierAppointmentDetail(id ?? null);
  const profile = useSupplierProfile();
  const cancel = useCancelSupplierAppointment();
  // Ekran acilis ani — gecmis/gelecek ayrimi icin tek seferlik referans.
  const [now] = useState(() => Date.now());
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  if (detail.isLoading) return <Screen scroll={false}><LoadingState /></Screen>;
  if (detail.isError || !detail.data)
    return (
      <Screen scroll={false}>
        <ErrorState message="Randevu yüklenemedi." onRetry={() => detail.refetch()} />
      </Screen>
    );

  const a = detail.data;
  const tz = profile.data?.facility.timezone ?? "Europe/Istanbul";
  const policy = profile.data?.cancellation_policy;
  const startMs = new Date(a.scheduled_start_at).getTime();
  const cancellableStatus = ["pending", "approved"].includes(a.status) && startMs > now;
  // Tesisin iptal kurali: randevuya bu sureden az kalinca portaldan iptal kapanir.
  const deadlineMs = policy?.min_notice_hours
    ? startMs - policy.min_notice_hours * HOUR_MS
    : null;
  const windowClosed = deadlineMs !== null && deadlineMs < now;
  // Kural profille gelir; yüklenmeden form eksik alanla açılmasın.
  const canCancel = cancellableStatus && !windowClosed && profile.isSuccess;

  function submitCancel(body: SupplierCancelBody) {
    setCancelError(null);
    cancel.mutate(
      { id: a.id, ...body },
      {
        onSuccess: () => {
          setCancelOpen(false);
          Alert.alert(
            "Randevu iptal edildi",
            body.makeup
              ? "Telafi randevusu oluşturuldu; tesise bildirim gönderildi."
              : "Tesise bildirim gönderildi.",
          );
          router.back();
        },
        // Form açık kalır: kullanıcı seçimini kaybetmeden düzeltebilsin.
        onError: (err) =>
          setCancelError(err instanceof ApiError ? err.message : "Bir hata oluştu."),
      },
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
          <View style={{ alignItems: "flex-end", gap: 4 }}>
            <StatusBadge status={a.status} />
            {a.is_makeup && <MakeupBadge />}
          </View>
        </View>

        <Card style={{ gap: 8 }}>
          <Row label="Tarih" value={formatDate(a.scheduled_start_at)} />
          {a.order_numbers && a.order_numbers.length > 0 && (
            <Row label="Sipariş no" value={a.order_numbers.join(", ")} />
          )}
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
        {a.status === "cancelled" && (a.cancellation_reason_label || a.cancellation_reason) && (
          <NoteBox
            color={colors.status.cancelled}
            text={`İptal sebebi: ${cancellationReasonText(a.cancellation_reason_label, a.cancellation_reason)}`}
          />
        )}
        {(a.makeup_of || a.makeup_appointment) && (
          <MakeupLinks
            makeupOf={a.makeup_of ?? null}
            makeup={a.makeup_appointment ?? null}
            tz={tz}
            onOpen={(id) => router.push(`/supplier/appointment/${id}`)}
          />
        )}

        {cancellableStatus && windowClosed && (
          <NoteBox
            color={colors.mutedText}
            text={`Randevuya ${policy!.min_notice_hours} saatten az kaldığı için portaldan iptal edilemez. Değişiklik için tesisle iletişime geçin.`}
          />
        )}
        {canCancel && (
          <View style={{ gap: 6 }}>
            <Button
              title="Randevuyu İptal Et"
              variant="destructive"
              loading={cancel.isPending}
              onPress={() => {
                setCancelError(null);
                setCancelOpen(true);
              }}
            />
            {deadlineMs !== null && (
              <Text style={{ color: colors.mutedText, fontSize: 12, textAlign: "center" }}>
                İptal için son: {formatDate(new Date(deadlineMs).toISOString())}{" "}
                {timeInTz(new Date(deadlineMs).toISOString(), tz)}
              </Text>
            )}
          </View>
        )}
      </View>

      <SupplierCancelModal
        visible={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title="Randevuyu iptal et"
        intro={
          <Text style={{ color: colors.mutedText, fontSize: 13 }}>
            {`"${a.product_name}" randevusu iptal edilecek. Bu işlem geri alınamaz.`}
          </Text>
        }
        policy={policy}
        reasons={profile.data?.cancellation_reasons ?? []}
        appointment={a}
        timezone={tz}
        confirmLabel="İptal Et"
        pending={cancel.isPending}
        error={cancelError}
        onSubmit={submitCancel}
      />
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
