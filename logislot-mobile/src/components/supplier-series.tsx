/**
 * Tedarikçi "Tekrarlayan Randevular" bölümü — web
 * components/domain/supplier-series-section.tsx karşılığı.
 * Seri kartları + occurrence detayı + GÜÇLÜ onaylı gelecek-iptal (sebep zorunlu).
 *
 * Seri iptali tesisin iptal kuralına tekil iptalle AYNEN tabidir (sebep,
 * alternatif tarih, bildirim süresi); süre içindeki tekrarlar aktif kalır.
 */

import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Alert, Text, View } from "react-native";
import { ApiError } from "@/api/client";
import { APPOINTMENT_STATUS_LABELS, type AppointmentStatus } from "@/api/shared";
import {
  useSupplierProfile,
  useSupplierSeries,
  useSupplierSeriesCancel,
  useSupplierSeriesDetail,
  type SupplierCancelBody,
} from "@/api/supplier";
import type { SupplierSeriesRowDto } from "@/api/types";
import { SupplierCancelModal } from "@/components/supplier-cancel";
import { AppModal, Badge, Button, Card } from "@/components/ui";
import { useTheme } from "@/theme/theme";
import { spacing } from "@/theme/tokens";

const FREQUENCY_LABELS: Record<string, string> = {
  weekly: "Haftalık",
  biweekly: "2 haftada bir",
  monthly: "Aylık",
};

export function SupplierSeriesSection() {
  const { colors } = useTheme();
  const profile = useSupplierProfile();
  const list = useSupplierSeries();
  const cancel = useSupplierSeriesCancel();
  const [detailId, setDetailId] = useState<string | null>(null);
  const detail = useSupplierSeriesDetail(detailId);
  const [cancelTarget, setCancelTarget] = useState<SupplierSeriesRowDto | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const policy = profile.data?.cancellation_policy;

  const rows = list.data ?? [];
  if (list.isLoading || rows.length === 0) return null;

  async function onCancel(body: SupplierCancelBody) {
    if (!cancelTarget) return;
    setCancelError(null);
    try {
      const result = await cancel.mutateAsync({ seriesId: cancelTarget.id, ...body });
      setCancelTarget(null);
      Alert.alert(
        "Seri iptal edildi",
        result.kept_within_notice_count > 0
          ? `Serinin gelecekteki ${result.affected_count} randevusu iptal edildi. İptal süresi geçtiği için ${result.kept_within_notice_count} randevu aktif kaldı; onlar için tesisle iletişime geçin.`
          : `Serinin gelecekteki ${result.affected_count} randevusu iptal edildi; tesise bildirim gönderildi.`,
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
            {row.can_cancel_series && profile.isSuccess && (
              <Button
                title="Seriyi İptal Et"
                variant="ghost"
                onPress={() => {
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
      <SupplierCancelModal
        visible={cancelTarget !== null}
        onClose={() => setCancelTarget(null)}
        title="Seriyi iptal et"
        intro={
          cancelTarget && (
            <View style={{ gap: spacing.sm }}>
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
              {policy && policy.min_notice_hours > 0 && (
                <Text style={{ color: colors.mutedText, fontSize: 12 }}>
                  Randevuya {policy.min_notice_hours} saatten az kalan tekrarlar iptal edilmez
                  ve aktif kalır.
                </Text>
              )}
            </View>
          )
        }
        policy={policy}
        legacyReason={{
          label: "İptal Sebebi (zorunlu)",
          placeholder: "Örn. Üretim planı değişti",
          minError: "İptal sebebi zorunludur (en az 3 karakter).",
        }}
        confirmLabel={`${cancelTarget?.future_cancellable_count ?? 0} Randevuyu İptal Et`}
        pending={cancel.isPending}
        error={cancelError}
        onSubmit={(body) => void onCancel(body)}
      />
    </View>
  );
}
