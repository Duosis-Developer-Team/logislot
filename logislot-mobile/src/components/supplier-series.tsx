/**
 * Tedarikçi "Tekrarlayan Randevular" bölümü — web
 * components/domain/supplier-series-section.tsx karşılığı.
 * Seri kartları + occurrence detayı + GÜÇLÜ onaylı gelecek-iptal (sebep zorunlu).
 */

import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Alert, Text, View } from "react-native";
import { ApiError } from "@/api/client";
import { APPOINTMENT_STATUS_LABELS, type AppointmentStatus } from "@/api/shared";
import {
  useSupplierSeries,
  useSupplierSeriesCancel,
  useSupplierSeriesDetail,
} from "@/api/supplier";
import type { SupplierSeriesRowDto } from "@/api/types";
import { AppModal, Badge, Button, Card, Field } from "@/components/ui";
import { useTheme } from "@/theme/theme";
import { spacing } from "@/theme/tokens";

const FREQUENCY_LABELS: Record<string, string> = {
  weekly: "Haftalık",
  biweekly: "2 haftada bir",
  monthly: "Aylık",
};

export function SupplierSeriesSection() {
  const { colors } = useTheme();
  const list = useSupplierSeries();
  const cancel = useSupplierSeriesCancel();
  const [detailId, setDetailId] = useState<string | null>(null);
  const detail = useSupplierSeriesDetail(detailId);
  const [cancelTarget, setCancelTarget] = useState<SupplierSeriesRowDto | null>(null);
  const [reason, setReason] = useState("");
  const [cancelError, setCancelError] = useState<string | null>(null);

  const rows = list.data ?? [];
  if (list.isLoading || rows.length === 0) return null;

  async function onCancel() {
    if (!cancelTarget) return;
    setCancelError(null);
    if (reason.trim().length < 3) {
      setCancelError("İptal sebebi zorunludur (en az 3 karakter).");
      return;
    }
    try {
      const result = await cancel.mutateAsync({ seriesId: cancelTarget.id, reason });
      setCancelTarget(null);
      setReason("");
      Alert.alert(
        "Seri iptal edildi",
        `Serinin gelecekteki ${result.affected_count} randevusu iptal edildi; tesise bildirim gönderildi.`,
      );
    } catch (err) {
      setCancelError(err instanceof ApiError ? err.message : "İptal edilemedi");
    }
  }

  return (
    <View style={{ gap: spacing.sm }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <Ionicons name="repeat" size={16} color={colors.accent} />
        <Text style={{ color: colors.text, fontSize: 14, fontWeight: "700" }}>
          Tekrarlayan Randevular
        </Text>
      </View>

      {rows.map((row) => (
        <Card key={row.id} style={{ gap: spacing.sm, padding: spacing.md }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: spacing.sm,
            }}
          >
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontSize: 14, fontWeight: "600" }}>
                {row.product_name ?? "Seri"}
              </Text>
              <Text style={{ color: colors.mutedText, fontSize: 12 }}>
                {FREQUENCY_LABELS[row.frequency] ?? row.frequency} × {row.occurrence_count}
              </Text>
            </View>
            <Badge
              label={row.status === "active" ? "Aktif" : "İptal Edildi"}
              color={row.status === "active" ? colors.status.approved : colors.status.cancelled}
            />
          </View>

          {row.next_appointment_at && (
            <Text style={{ color: colors.mutedText, fontSize: 12 }}>
              Sıradaki randevu:{" "}
              <Text style={{ color: colors.text, fontWeight: "600" }}>
                {new Date(row.next_appointment_at).toLocaleString("tr-TR", {
                  day: "2-digit",
                  month: "long",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </Text>
            </Text>
          )}

          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4 }}>
            {Object.entries(row.status_counts).map(([status, count]) => (
              <Badge
                key={status}
                label={`${
                  APPOINTMENT_STATUS_LABELS[status as AppointmentStatus] ?? status
                }: ${count}`}
                color={colors.mutedText}
              />
            ))}
          </View>

          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <Button
              title="Detay"
              variant="secondary"
              onPress={() => setDetailId(row.id)}
              style={{ flex: 1, height: 40 }}
            />
            {row.can_cancel_series && (
              <Button
                title="Seriyi İptal Et"
                variant="ghost"
                onPress={() => {
                  setReason("");
                  setCancelError(null);
                  setCancelTarget(row);
                }}
                style={{ flex: 1, height: 40 }}
              />
            )}
          </View>
        </Card>
      ))}

      {/* Detay */}
      <AppModal
        visible={detailId !== null}
        onClose={() => setDetailId(null)}
        title="Seri Detayı"
      >
        {detail.isLoading ? (
          <Text style={{ color: colors.mutedText, fontSize: 14 }}>Yükleniyor…</Text>
        ) : (
          <View style={{ gap: spacing.sm }}>
            {(detail.data?.appointments ?? []).map((appt) => (
              <View
                key={appt.id}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: spacing.sm,
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderRadius: 12,
                  paddingHorizontal: spacing.md,
                  paddingVertical: spacing.sm,
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontSize: 13 }}>
                    <Text style={{ fontWeight: "700" }}>{appt.occurrence_index}.</Text>{" "}
                    {new Date(appt.scheduled_start_at).toLocaleString("tr-TR", {
                      day: "2-digit",
                      month: "long",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </Text>
                  {appt.dock_name && (
                    <Text style={{ color: colors.mutedText, fontSize: 11 }}>
                      {appt.dock_name}
                    </Text>
                  )}
                  {appt.original_start_at && appt.status === "revision_pending" && (
                    <Text style={{ color: colors.status.revision, fontSize: 11 }}>
                      (yeni saat önerildi)
                    </Text>
                  )}
                </View>
                <Badge
                  label={
                    APPOINTMENT_STATUS_LABELS[appt.status as AppointmentStatus] ?? appt.status
                  }
                  color={
                    colors.status[appt.status as keyof typeof colors.status] ?? colors.mutedText
                  }
                />
              </View>
            ))}
          </View>
        )}
      </AppModal>

      {/* Güçlü onaylı iptal */}
      <AppModal
        visible={cancelTarget !== null}
        onClose={() => setCancelTarget(null)}
        title="Seriyi iptal et"
      >
        {cancelTarget && (
          <View style={{ gap: spacing.md }}>
            <View
              style={{
                borderWidth: 1,
                borderColor: `${colors.status.cancelled}66`,
                backgroundColor: `${colors.status.cancelled}15`,
                borderRadius: 12,
                padding: spacing.md,
              }}
            >
              <Text style={{ color: colors.status.cancelled, fontSize: 13 }}>
                Bu işlem gelecekteki{" "}
                <Text style={{ fontWeight: "700" }}>
                  {cancelTarget.future_cancellable_count} randevuyu
                </Text>{" "}
                iptal eder ve geri alınamaz. Tamamlanan randevular etkilenmez.
              </Text>
            </View>
            <Field
              label="İptal Sebebi (zorunlu)"
              value={reason}
              onChangeText={setReason}
              placeholder="Örn. Üretim planı değişti"
            />
            {cancelError && (
              <Text style={{ color: colors.destructive, fontSize: 13 }}>{cancelError}</Text>
            )}
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              <Button
                title="Vazgeç"
                variant="secondary"
                onPress={() => setCancelTarget(null)}
                style={{ flex: 1 }}
              />
              <Button
                title={`${cancelTarget.future_cancellable_count} Randevuyu İptal Et`}
                variant="destructive"
                loading={cancel.isPending}
                onPress={() => void onCancel()}
                style={{ flex: 2 }}
              />
            </View>
          </View>
        )}
      </AppModal>
    </View>
  );
}
