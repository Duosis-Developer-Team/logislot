/**
 * Tekrarlayan Seriler — web (admin)/admin/series karşılığı.
 * Seri listesi + detay (occurrence'lar) + toplu onay/revize/iptal (future_only).
 */

import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useState } from "react";
import { Alert, FlatList, Pressable, RefreshControl, Text, View } from "react-native";
import {
  useAppointmentSeries,
  useSeriesApprove,
  useSeriesCancel,
  useSeriesDetail,
  useSeriesRevise,
  type SeriesListRowDto,
} from "@/api/admin";
import { ApiError } from "@/api/client";
import { docks as dockResource } from "@/api/resources";
import { APPOINTMENT_STATUS_LABELS, type AppointmentStatus } from "@/api/shared";
import { useSession } from "@/auth/session";
import {
  AppModal,
  Badge,
  Button,
  Card,
  Chip,
  EmptyState,
  ErrorState,
  Field,
  LoadingState,
  PickerField,
} from "@/components/ui";
import { useTheme } from "@/theme/theme";
import { spacing } from "@/theme/tokens";
import { dayLabel } from "@/utils/format";

const FREQUENCY_LABELS: Record<string, string> = {
  weekly: "Haftalık",
  biweekly: "2 haftada bir",
  monthly: "Aylık",
};

function futureCancellable(row: SeriesListRowDto): number {
  return (
    (row.status_counts["pending"] ?? 0) +
    (row.status_counts["approved"] ?? 0) +
    (row.status_counts["revision_pending"] ?? 0)
  );
}

export default function AdminSeries() {
  const { colors } = useTheme();
  const session = useSession();
  const facilityId = session.activeFacilityId;
  const can = session.can;
  const list = useAppointmentSeries(facilityId);
  const cancel = useSeriesCancel(facilityId);
  const approve = useSeriesApprove(facilityId);
  const revise = useSeriesRevise(facilityId);
  const dockList = dockResource.useList(facilityId);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const detail = useSeriesDetail(facilityId, expandedId);
  const [reviseTarget, setReviseTarget] = useState<SeriesListRowDto | null>(null);
  const [newTime, setNewTime] = useState("10:00");
  const [reviseDuration, setReviseDuration] = useState("");
  const [reviseDockMode, setReviseDockMode] = useState<"auto" | "manual">("auto");
  const [reviseDockId, setReviseDockId] = useState("");
  const [reviseNote, setReviseNote] = useState("");
  const [reviseError, setReviseError] = useState<string | null>(null);

  function onApprove(row: SeriesListRowDto) {
    const pendingCount = row.status_counts["revision_pending"] ?? 0;
    Alert.alert(
      "Seriyi onayla",
      `Serideki ${pendingCount} revize bekleyen randevu onaylanacak. Onay anında çakışmalar yeniden kontrol edilir; biri uygun değilse hiçbiri onaylanmaz.`,
      [
        { text: "Vazgeç", style: "cancel" },
        {
          text: "Seriyi Onayla",
          onPress: () => {
            approve.mutate(
              { seriesId: row.id },
              {
                onSuccess: (result) =>
                  Alert.alert("Onaylandı", `Serideki ${result.affected_count} randevu onaylandı.`),
                onError: (err) =>
                  Alert.alert(
                    "Onaylanamadı",
                    err instanceof ApiError ? err.message : "Onaylanamadı",
                  ),
              },
            );
          },
        },
      ],
    );
  }

  function onCancel(row: SeriesListRowDto) {
    Alert.alert(
      "Seriyi iptal et",
      `${row.supplier_name ?? "Tedarikçi"} serisinin gelecekteki ${futureCancellable(
        row,
      )} randevusu iptal edilecek. Tamamlanmış randevular etkilenmez; tedarikçiye tek özet bildirim gider.`,
      [
        { text: "Vazgeç", style: "cancel" },
        {
          text: "Seriyi İptal Et",
          style: "destructive",
          onPress: () => {
            cancel.mutate(
              { seriesId: row.id },
              {
                onSuccess: (result) =>
                  Alert.alert(
                    "İptal edildi",
                    `Serinin gelecekteki ${result.affected_count} randevusu iptal edildi.`,
                  ),
                onError: (err) =>
                  Alert.alert(
                    "İşlem başarısız",
                    err instanceof ApiError ? err.message : "İşlem başarısız",
                  ),
              },
            );
          },
        },
      ],
    );
  }

  async function onRevise() {
    if (!reviseTarget) return;
    setReviseError(null);
    try {
      const result = await revise.mutateAsync({
        seriesId: reviseTarget.id,
        new_time: newTime,
        duration_minutes: reviseDuration ? Number(reviseDuration) : null,
        auto_assign_dock: reviseDockMode === "auto",
        dock_id: reviseDockMode === "manual" ? reviseDockId || null : null,
        note: reviseNote || null,
      });
      setReviseTarget(null);
      Alert.alert(
        "Revize edildi",
        `Serideki ${result.affected_count} randevu ${result.new_time} saatine revize edildi (tedarikçi onayı bekleniyor).`,
      );
    } catch (err) {
      setReviseError(err instanceof ApiError ? err.message : "Revize edilemedi");
    }
  }

  if (list.isLoading)
    return (
      <View style={{ flex: 1, justifyContent: "center", backgroundColor: colors.background }}>
        <LoadingState />
      </View>
    );
  if (list.isError)
    return (
      <View style={{ flex: 1, justifyContent: "center", backgroundColor: colors.background }}>
        <ErrorState message="Seriler yüklenemedi." onRetry={() => list.refetch()} />
      </View>
    );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <FlatList
        data={list.data ?? []}
        keyExtractor={(row) => row.id}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 64 }}
        refreshControl={
          <RefreshControl
            refreshing={list.isRefetching}
            onRefresh={() => void list.refetch()}
            tintColor={colors.accent}
          />
        }
        ListHeaderComponent={
          <Text style={{ color: colors.mutedText, fontSize: 13, marginBottom: spacing.sm }}>
            Tedarikçi sihirbazından oluşturulan seriler. Seri iptali yalnızca gelecekteki
            randevuları kapsar; tamamlanmış randevulara dokunulmaz.
          </Text>
        }
        ListEmptyComponent={
          <EmptyState
            title="Tekrarlayan seri yok"
            description="Tedarikçiler sihirbazdan tekrarlayan randevu oluşturduğunda burada listelenir."
          />
        }
        renderItem={({ item: row }) => (
          <Card style={{ gap: spacing.sm }}>
            <Pressable
              onPress={() => setExpandedId(expandedId === row.id ? null : row.id)}
              style={{ gap: spacing.sm }}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  gap: spacing.sm,
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flex: 1 }}>
                  <Ionicons name="repeat" size={16} color={colors.accent} />
                  <Text style={{ color: colors.text, fontSize: 15, fontWeight: "600" }}>
                    {row.supplier_name ?? "—"}
                  </Text>
                </View>
                <Badge
                  label={row.status === "active" ? "Aktif" : "İptal Edildi"}
                  color={
                    row.status === "active" ? colors.status.approved : colors.status.cancelled
                  }
                />
              </View>
              <Text style={{ color: colors.mutedText, fontSize: 13 }}>
                {FREQUENCY_LABELS[row.frequency] ?? row.frequency} × {row.occurrence_count}
                {row.created_at ? ` · ${dayLabel(row.created_at.slice(0, 10))}` : ""}
              </Text>
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
            </Pressable>

            {expandedId === row.id &&
              (detail.isLoading ? (
                <LoadingState label="Randevular yükleniyor…" />
              ) : (
                <View style={{ gap: 6 }}>
                  {(detail.data?.appointments ?? []).map((appt) => (
                    <Pressable
                      key={appt.id}
                      onPress={() => router.push(`/admin/appointment/${appt.id}` as never)}
                      style={({ pressed }) => ({
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: spacing.sm,
                        borderWidth: 1,
                        borderColor: colors.border,
                        borderRadius: 10,
                        paddingHorizontal: spacing.md,
                        paddingVertical: spacing.sm,
                        opacity: pressed ? 0.8 : 1,
                      })}
                    >
                      <Text style={{ color: colors.text, fontSize: 13, flex: 1 }}>
                        <Text style={{ fontWeight: "700" }}>{appt.occurrence_index}.</Text>{" "}
                        {new Date(appt.scheduled_start_at).toLocaleString("tr-TR", {
                          day: "2-digit",
                          month: "long",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </Text>
                      <Badge
                        label={
                          APPOINTMENT_STATUS_LABELS[appt.status as AppointmentStatus] ??
                          appt.status
                        }
                        color={
                          colors.status[appt.status as keyof typeof colors.status] ??
                          colors.mutedText
                        }
                      />
                    </Pressable>
                  ))}
                </View>
              ))}

            {row.status === "active" && (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
                {can("appt.approve") && (row.status_counts["revision_pending"] ?? 0) > 0 && (
                  <Button
                    title="Seriyi Onayla"
                    onPress={() => onApprove(row)}
                    style={{ flex: 1, height: 40, minWidth: 120 }}
                  />
                )}
                {can("appt.revise") && futureCancellable(row) > 0 && (
                  <Button
                    title="Revize Et"
                    variant="secondary"
                    onPress={() => {
                      setReviseError(null);
                      setReviseNote("");
                      setReviseTarget(row);
                    }}
                    style={{ flex: 1, height: 40, minWidth: 100 }}
                  />
                )}
                {can("appt.cancel") && futureCancellable(row) > 0 && (
                  <Button
                    title="İptal Et"
                    variant="destructive"
                    onPress={() => onCancel(row)}
                    style={{ flex: 1, height: 40, minWidth: 100 }}
                  />
                )}
              </View>
            )}
          </Card>
        )}
      />

      {/* Seri revize — web dialogu ile aynı alanlar */}
      <AppModal
        visible={reviseTarget !== null}
        onClose={() => setReviseTarget(null)}
        title="Seriyi Revize Et"
      >
        {reviseTarget && (
          <View style={{ gap: spacing.md }}>
            <Text style={{ color: colors.mutedText, fontSize: 13 }}>
              <Text style={{ fontWeight: "700", color: colors.text }}>
                {futureCancellable(reviseTarget)}
              </Text>{" "}
              gelecek randevu aynı saate kaydırılacak; tamamlanmışlara dokunulmaz. Tüm
              tarihler kural setinden geçer — biri uymazsa hiçbiri değişmez. Randevular
              tedarikçi onayı için {"“"}Revize Bekliyor{"”"} durumuna alınır.
            </Text>
            <View style={{ flexDirection: "row", gap: spacing.md }}>
              <View style={{ flex: 1 }}>
                <Field
                  label="Yeni Saat (SS:DD)"
                  value={newTime}
                  onChangeText={setNewTime}
                  placeholder="10:00"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Field
                  label="Süre (dk, boş = değişmez)"
                  value={reviseDuration}
                  onChangeText={setReviseDuration}
                  keyboardType="number-pad"
                  placeholder="Örn. 90"
                />
              </View>
            </View>
            <View style={{ gap: 8 }}>
              <Text style={{ color: colors.text, fontSize: 14, fontWeight: "500" }}>Rampa</Text>
              <View style={{ flexDirection: "row", gap: spacing.sm }}>
                <Chip
                  label="Otomatik ata"
                  selected={reviseDockMode === "auto"}
                  onPress={() => setReviseDockMode("auto")}
                />
                <Chip
                  label="Manuel seç"
                  selected={reviseDockMode === "manual"}
                  onPress={() => setReviseDockMode("manual")}
                />
              </View>
              {reviseDockMode === "manual" && (
                <PickerField
                  value={reviseDockId || null}
                  placeholder="— Rampa —"
                  options={(dockList.data ?? [])
                    .filter((d) => d.is_active)
                    .map((d) => ({ value: d.id, label: d.name }))}
                  onChange={setReviseDockId}
                />
              )}
            </View>
            <Field
              label="Not (opsiyonel)"
              value={reviseNote}
              onChangeText={setReviseNote}
              placeholder="Örn. Pilot programı güncellendi"
            />
            {reviseError && (
              <Text style={{ color: colors.destructive, fontSize: 13 }}>{reviseError}</Text>
            )}
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              <Button
                title="Vazgeç"
                variant="secondary"
                onPress={() => setReviseTarget(null)}
                style={{ flex: 1 }}
              />
              <Button
                title={revise.isPending ? "Revize ediliyor…" : "Seriyi Revize Et"}
                loading={revise.isPending}
                onPress={() => void onRevise()}
                style={{ flex: 2 }}
              />
            </View>
          </View>
        )}
      </AppModal>
    </View>
  );
}
