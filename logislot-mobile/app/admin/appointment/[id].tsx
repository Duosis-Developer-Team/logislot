import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Alert, Text, View } from "react-native";
import { useAppointmentActions, useAppointmentDetail } from "@/api/admin";
import { ApiError } from "@/api/client";
import { QUANTITY_UNIT_LABELS, type QuantityUnit } from "@/api/shared";
import { useSession } from "@/auth/session";
import { CargoBadge, StatusBadge } from "@/components/appointment";
import { Button, Card, Chip, ErrorState, Field, LoadingState, Screen } from "@/components/ui";
import { useTheme } from "@/theme/theme";
import { spacing } from "@/theme/tokens";
import { addDaysISO, dayLabel, formatDate, isoFromWallClock, timeInTz, todayISO } from "@/utils/format";

/**
 * Yönetim — randevu detayı + aksiyonlar. Web AppointmentDrawer'ın mobile
 * karşılığı: aksiyonlar backend allowed_actions haritasına göre görünür
 * (statü + izin + rampa scope'u backend'de birleşir).
 */

const DURATIONS = [30, 45, 60, 90, 120, 150, 180, 240];

type ActionKind = "reject" | "complete" | "cancel" | "revise" | null;

export default function AdminAppointmentDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const { activeFacilityId, activeFacility } = useSession();
  const detail = useAppointmentDetail(activeFacilityId, id ?? null);
  const actions = useAppointmentActions(activeFacilityId);
  const tz = activeFacility?.timezone ?? "Europe/Istanbul";

  const [openForm, setOpenForm] = useState<ActionKind>(null);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);

  // Revize formu
  const [reviseDate, setReviseDate] = useState(todayISO());
  const [reviseTime, setReviseTime] = useState("09:00");
  const [reviseDuration, setReviseDuration] = useState(60);

  if (detail.isLoading) return <Screen scroll={false}><LoadingState /></Screen>;
  if (detail.isError || !detail.data)
    return (
      <Screen scroll={false}>
        <ErrorState message="Randevu yüklenemedi." onRetry={() => detail.refetch()} />
      </Screen>
    );

  const a = detail.data;
  const allowed = a.allowed_actions;
  const isBusy =
    actions.approve.isPending ||
    actions.reject.isPending ||
    actions.complete.isPending ||
    actions.cancel.isPending ||
    actions.revise.isPending;

  async function run(fn: () => Promise<unknown>, successMessage: string) {
    setActionError(null);
    try {
      await fn();
      setOpenForm(null);
      Alert.alert("Tamam", successMessage);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "İşlem başarısız");
    }
  }

  function confirmApprove() {
    Alert.alert(
      "Randevuyu onayla",
      `${a.supplier_name ?? ""} — "${a.product_name}" onaylanacak; tedarikçiye bildirim gider.`,
      [
        { text: "Vazgeç", style: "cancel" },
        {
          text: "Onayla",
          onPress: () =>
            void run(
              () => actions.approve.mutateAsync({ id: a.id }),
              "Randevu onaylandı.",
            ),
        },
      ],
    );
  }

  function openRevise() {
    const startLocal = new Date(a.scheduled_start_at).toLocaleString("sv-SE", {
      timeZone: tz,
    });
    setReviseDate(startLocal.slice(0, 10));
    setReviseTime(startLocal.slice(11, 16));
    setReviseDuration(a.duration_minutes);
    setReason("");
    setNote("");
    setActionError(null);
    setOpenForm("revise");
  }

  return (
    <Screen>
      <View style={{ gap: spacing.md }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontSize: 20, fontWeight: "800" }}>
              {a.supplier_name ?? a.product_name}
            </Text>
            <Text style={{ color: colors.mutedText, fontSize: 13 }}>{a.product_name}</Text>
          </View>
          <View style={{ gap: 6, alignItems: "flex-end" }}>
            <StatusBadge status={a.status} />
            {a.delivery_type === "cargo" && <CargoBadge window={a.cargo_window} />}
          </View>
        </View>

        <Card style={{ gap: 8 }}>
          <Row label="Tarih" value={formatDate(a.scheduled_start_at)} />
          <Row
            label="Saat"
            value={`${timeInTz(a.scheduled_start_at, tz)}–${timeInTz(a.scheduled_end_at, tz)} (${a.duration_minutes} dk)`}
          />
          <Row label="Rampa" value={a.dock_name ?? "—"} />
          <Row label="Kategori" value={a.product_category_name ?? "—"} />
          <Row
            label="Miktar"
            value={`${a.quantity} ${QUANTITY_UNIT_LABELS[a.quantity_unit as QuantityUnit] ?? a.quantity_unit}`}
          />
          <Row label="Araç" value={a.vehicle_category_name ?? "—"} />
          {a.license_plate && <Row label="Plaka" value={a.license_plate} />}
          {a.driver_name && <Row label="Sürücü" value={a.driver_name} />}
          {a.supplier_contact?.phone && (
            <Row label="İletişim" value={a.supplier_contact.phone} />
          )}
        </Card>

        {a.rejection_reason && (
          <NoteBox color={colors.status.rejected} text={`Red sebebi: ${a.rejection_reason}`} />
        )}
        {a.cancellation_reason && (
          <NoteBox color={colors.status.cancelled} text={`İptal sebebi: ${a.cancellation_reason}`} />
        )}
        {a.completion_note && (
          <NoteBox color={colors.status.completed} text={`Tamamlama notu: ${a.completion_note}`} />
        )}
        {(a.revisions?.length ?? 0) > 0 && (
          <Card style={{ gap: 6, padding: spacing.md }}>
            <Text style={{ color: colors.text, fontSize: 13, fontWeight: "700" }}>
              Revizyon Geçmişi
            </Text>
            {a.revisions!.map((r) => (
              <Text key={r.id} style={{ color: colors.mutedText, fontSize: 12 }}>
                {formatDate(r.old_start_at)} {timeInTz(r.old_start_at, tz)} →{" "}
                {formatDate(r.new_start_at)} {timeInTz(r.new_start_at, tz)}
                {r.note ? ` · ${r.note}` : ""}
              </Text>
            ))}
          </Card>
        )}

        {/* Aksiyonlar — backend allowed_actions */}
        {allowed && Object.values(allowed).some(Boolean) && (
          <View style={{ gap: spacing.sm }}>
            {allowed.approve && (
              <Button title="Onayla" onPress={confirmApprove} loading={actions.approve.isPending} />
            )}
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              {allowed.revise && (
                <Button title="Revize Et" variant="secondary" onPress={openRevise} style={{ flex: 1 }} />
              )}
              {allowed.complete && (
                <Button
                  title="Tamamla"
                  variant="secondary"
                  onPress={() => {
                    setNote("");
                    setActionError(null);
                    setOpenForm("complete");
                  }}
                  style={{ flex: 1 }}
                />
              )}
            </View>
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              {allowed.reject && (
                <Button
                  title="Reddet"
                  variant="destructive"
                  onPress={() => {
                    setReason("");
                    setActionError(null);
                    setOpenForm("reject");
                  }}
                  style={{ flex: 1 }}
                />
              )}
              {allowed.cancel && (
                <Button
                  title="İptal Et"
                  variant="ghost"
                  onPress={() => {
                    setReason("");
                    setActionError(null);
                    setOpenForm("cancel");
                  }}
                  style={{ flex: 1 }}
                />
              )}
            </View>
          </View>
        )}

        {/* Inline aksiyon formları */}
        {openForm === "reject" && (
          <ActionForm
            title="Randevuyu reddet"
            error={actionError}
            onCancel={() => setOpenForm(null)}
            confirmTitle="Reddet"
            confirmVariant="destructive"
            busy={isBusy}
            onConfirm={() => {
              if (!reason.trim()) {
                setActionError("Red sebebi zorunludur.");
                return;
              }
              void run(
                () => actions.reject.mutateAsync({ id: a.id, reason }),
                "Randevu reddedildi.",
              );
            }}
          >
            <Field
              label="Red Sebebi (zorunlu — tedarikçiye iletilir)"
              value={reason}
              onChangeText={setReason}
              placeholder="Örn. Uygun olmayan saat"
            />
          </ActionForm>
        )}

        {openForm === "complete" && (
          <ActionForm
            title="Randevuyu tamamla"
            error={actionError}
            onCancel={() => setOpenForm(null)}
            confirmTitle="Tamamla"
            busy={isBusy}
            onConfirm={() =>
              void run(
                () => actions.complete.mutateAsync({ id: a.id, note }),
                "Randevu tamamlandı.",
              )
            }
          >
            <Field
              label="Not (opsiyonel)"
              value={note}
              onChangeText={setNote}
              placeholder="Örn. Eksiksiz teslim alındı"
            />
          </ActionForm>
        )}

        {openForm === "cancel" && (
          <ActionForm
            title="Randevuyu iptal et"
            error={actionError}
            onCancel={() => setOpenForm(null)}
            confirmTitle="İptal Et"
            confirmVariant="destructive"
            busy={isBusy}
            onConfirm={() =>
              void run(
                () => actions.cancel.mutateAsync({ id: a.id, reason }),
                "Randevu iptal edildi.",
              )
            }
          >
            <Field
              label="İptal Sebebi (opsiyonel)"
              value={reason}
              onChangeText={setReason}
              placeholder="Örn. Operasyon iptali"
            />
          </ActionForm>
        )}

        {openForm === "revise" && (
          <ActionForm
            title="Randevuyu revize et"
            error={actionError}
            onCancel={() => setOpenForm(null)}
            confirmTitle="Revize Et"
            busy={isBusy}
            onConfirm={() =>
              void run(
                () =>
                  actions.revise.mutateAsync({
                    id: a.id,
                    new_start_at: isoFromWallClock(reviseDate, reviseTime, tz),
                    new_duration_minutes: reviseDuration,
                    auto_assign_dock: true,
                    note: note || null,
                  }),
                "Randevu revize edildi; tedarikçiye bildirim gitti.",
              )
            }
          >
            <View style={{ gap: 8 }}>
              <Text style={{ color: colors.text, fontSize: 14, fontWeight: "500" }}>
                Yeni Gün
              </Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                {Array.from({ length: 7 }, (_, i) => addDaysISO(todayISO(), i)).map((d) => (
                  <Chip key={d} label={dayLabel(d)} selected={reviseDate === d} onPress={() => setReviseDate(d)} />
                ))}
              </View>
            </View>
            <Field
              label="Yeni Başlangıç (SS:DD)"
              value={reviseTime}
              onChangeText={setReviseTime}
              placeholder="09:00"
              keyboardType="numbers-and-punctuation"
            />
            <View style={{ gap: 8 }}>
              <Text style={{ color: colors.text, fontSize: 14, fontWeight: "500" }}>Süre</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                {DURATIONS.map((d) => (
                  <Chip
                    key={d}
                    label={`${d} dk`}
                    selected={reviseDuration === d}
                    onPress={() => setReviseDuration(d)}
                  />
                ))}
              </View>
            </View>
            <Field
              label="Revizyon Notu (opsiyonel)"
              value={note}
              onChangeText={setNote}
              placeholder="Tedarikçiye iletilir"
            />
            <Text style={{ color: colors.faintText, fontSize: 11 }}>
              Rampa otomatik atanır; yeni aralık sunucuda yeniden doğrulanır (çalışma
              saatleri, çakışma, çakışma grupları).
            </Text>
          </ActionForm>
        )}

        <Button title="Geri" variant="ghost" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
      <Text style={{ color: colors.mutedText, fontSize: 13 }}>{label}</Text>
      <Text
        style={{ color: colors.text, fontSize: 13, fontWeight: "500", flexShrink: 1, textAlign: "right" }}
      >
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

function ActionForm({
  title,
  children,
  error,
  onCancel,
  onConfirm,
  confirmTitle,
  confirmVariant = "primary",
  busy,
}: {
  title: string;
  children: React.ReactNode;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
  confirmTitle: string;
  confirmVariant?: "primary" | "destructive";
  busy?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Card style={{ gap: spacing.md, borderColor: colors.accent }}>
      <Text style={{ color: colors.text, fontSize: 15, fontWeight: "700" }}>{title}</Text>
      {children}
      {error && <Text style={{ color: colors.destructive, fontSize: 13 }}>{error}</Text>}
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <Button title="Vazgeç" variant="secondary" onPress={onCancel} style={{ flex: 1 }} />
        <Button
          title={confirmTitle}
          variant={confirmVariant}
          onPress={onConfirm}
          loading={busy}
          style={{ flex: 1 }}
        />
      </View>
    </Card>
  );
}
