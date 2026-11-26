/**
 * Tedarikçi iptal penceresi — web components/domain/supplier-cancel-dialog.tsx
 * karşılığı. Tekil randevu ve seri iptalinin ORTAK formu.
 *
 * Hangi alanın zorunlu olduğunu tesisin iptal kuralı belirler
 * (`profile.cancellation_policy`); kural sunucuda da zorlanır.
 * 2026-11 toplantısı: sebep FİRMANIN listesinden seçilir (açıklama sebep
 * bazında zorunlu olabilir) ve telafi zorunluysa iptal, telafi randevusunun
 * gün/saati seçilmeden gönderilemez — ikisi sunucuda tek işlemde yapılır.
 *
 * Mobilde tarih seçici kütüphanesi yok (bilinçli: bağımlılık eklememek için);
 * telafi günü, diğer ekranlardaki gibi gün çipleriyle seçilir.
 */

import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { CARGO_WINDOWS, CARGO_WINDOW_LABELS, type CargoWindow } from "@/api/shared";
import { useSupplierAvailability, type SupplierCancelBody } from "@/api/supplier";
import type {
  AppointmentDto,
  CancellationReasonOptionDto,
  SupplierCancellationPolicyDto,
} from "@/api/types";
import { AppModal, Button, Chip, Field } from "@/components/ui";
import { useTheme } from "@/theme/theme";
import { radius, spacing } from "@/theme/tokens";
import { addDaysISO, dayLabel, timeInTz, todayISO } from "@/utils/format";

const NOTE_MIN_LENGTH = 3;
const MAKEUP_DAY_OPTIONS = 60;

interface SupplierCancelFormProps {
  onClose: () => void;
  intro: React.ReactNode;
  policy: SupplierCancellationPolicyDto | undefined;
  reasons: CancellationReasonOptionDto[];
  /** Telafi için iptal edilen randevu (tekil iptal). Seri iptalinde verilmez. */
  appointment?: AppointmentDto;
  timezone?: string;
  /** Kural sebep istemese de serbest metin sebep zorunluysa (seri iptali). */
  legacyReason?: { label: string; placeholder: string; minError: string };
  confirmLabel: string;
  pending: boolean;
  error: string | null;
  onSubmit: (body: SupplierCancelBody) => void;
}

export function SupplierCancelModal({
  visible,
  title,
  ...form
}: SupplierCancelFormProps & { visible: boolean; title: string }) {
  // Form yalnızca açıkken mount edilir: her açılışta temiz durumla doğar,
  // önceki randevunun seçimi taşınmaz.
  return (
    <AppModal visible={visible} onClose={form.onClose} title={title}>
      {visible && <SupplierCancelForm {...form} />}
    </AppModal>
  );
}

function SupplierCancelForm({
  onClose,
  intro,
  policy,
  reasons,
  appointment,
  timezone = "Europe/Istanbul",
  legacyReason,
  confirmLabel,
  pending,
  error,
  onSubmit,
}: SupplierCancelFormProps) {
  const { colors } = useTheme();
  const [reasonId, setReasonId] = useState("");
  const [note, setNote] = useState("");
  const [makeupDate, setMakeupDate] = useState("");
  const [makeupStart, setMakeupStart] = useState<string | null>(null);
  const [makeupWindow, setMakeupWindow] = useState<CargoWindow | null>(
    (appointment?.cargo_window as CargoWindow | null) ?? null,
  );
  const [localError, setLocalError] = useState<string | null>(null);

  const showPicker = (policy?.require_reason ?? false) && reasons.length > 0;
  const showMakeup = (policy?.require_makeup ?? false) && appointment !== undefined;
  const showLegacy = !showPicker && legacyReason !== undefined;
  const selectedReason = reasons.find((r) => r.id === reasonId);
  const noteRequired = selectedReason?.note_required ?? false;
  const isCargo = appointment?.delivery_type === "cargo";

  function submit() {
    const trimmed = note.trim();
    if (showPicker && !reasonId) return setLocalError("Lütfen bir iptal sebebi seçin.");
    if (showPicker && noteRequired && trimmed.length < NOTE_MIN_LENGTH)
      return setLocalError("Bu sebep için kısa bir açıklama yazın (en az 3 karakter).");
    if (showLegacy && trimmed.length < NOTE_MIN_LENGTH)
      return setLocalError(legacyReason!.minError);
    if (showMakeup && (!makeupDate || (isCargo ? !makeupWindow : !makeupStart)))
      return setLocalError("Lütfen telafi randevusu için gün ve saat seçin.");
    setLocalError(null);
    onSubmit({
      ...(showPicker ? { reason_id: reasonId } : {}),
      ...(trimmed ? { reason: trimmed } : {}),
      ...(showMakeup
        ? {
            makeup: isCargo
              ? { target_date: makeupDate, cargo_window: makeupWindow! }
              : { target_date: makeupDate, start_at: makeupStart! },
          }
        : {}),
    });
  }

  const message = localError ?? error;

  return (
    <View style={{ gap: spacing.md }}>
      {intro}

      {showPicker && (
        <View style={{ gap: 8 }}>
          <Text style={{ color: colors.text, fontSize: 14, fontWeight: "500" }}>
            İptal sebebi (zorunlu)
          </Text>
          {reasons.map((reason) => {
            const selected = reasonId === reason.id;
            return (
              <Pressable
                key={reason.id}
                onPress={() => setReasonId(reason.id)}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 10,
                  borderWidth: 1,
                  borderRadius: radius.md,
                  paddingHorizontal: 12,
                  paddingVertical: 11,
                  borderColor: selected ? colors.primary : colors.border,
                  backgroundColor: selected ? `${colors.primary}14` : colors.card,
                }}
              >
                <Ionicons
                  name={selected ? "radio-button-on" : "radio-button-off"}
                  size={20}
                  color={selected ? colors.primary : colors.mutedText}
                />
                <Text style={{ color: colors.text, fontSize: 14, flex: 1 }}>{reason.label}</Text>
              </Pressable>
            );
          })}
        </View>
      )}

      {showPicker && (
        <Field
          label={noteRequired ? "Açıklama (zorunlu)" : "Açıklama (isteğe bağlı)"}
          value={note}
          onChangeText={setNote}
          placeholder="Kısaca açıklayın"
          maxLength={500}
          multiline
          style={{ height: 80, paddingTop: 12, textAlignVertical: "top" }}
        />
      )}

      {showLegacy && (
        <Field
          label={legacyReason!.label}
          value={note}
          onChangeText={setNote}
          placeholder={legacyReason!.placeholder}
          maxLength={500}
        />
      )}

      {showMakeup && (
        <MakeupPicker
          appointment={appointment!}
          timezone={timezone}
          date={makeupDate}
          start={makeupStart}
          window={makeupWindow}
          onDate={(value) => {
            setMakeupDate(value);
            setMakeupStart(null);
          }}
          onStart={setMakeupStart}
          onWindow={setMakeupWindow}
        />
      )}

      {message && <Text style={{ color: colors.destructive, fontSize: 13 }}>{message}</Text>}
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <Button title="Vazgeç" variant="secondary" onPress={onClose} style={{ flex: 1 }} />
        <Button
          title={confirmLabel}
          variant="destructive"
          loading={pending}
          onPress={submit}
          style={{ flex: 2 }}
        />
      </View>
    </View>
  );
}

/** Telafi randevusunun gün + saat (kargoda pencere) seçimi; gerçek müsaitlikle. */
function MakeupPicker({
  appointment,
  timezone,
  date,
  start,
  window,
  onDate,
  onStart,
  onWindow,
}: {
  appointment: AppointmentDto;
  timezone: string;
  date: string;
  start: string | null;
  window: CargoWindow | null;
  onDate: (value: string) => void;
  onStart: (value: string) => void;
  onWindow: (value: CargoWindow) => void;
}) {
  const { colors } = useTheme();
  // Pencere açılış anı: geçmiş saatleri ayıklamak için tek seferlik referans.
  const [openedAt] = useState(() => Date.now());
  const isCargo = appointment.delivery_type === "cargo";
  // Her render'da hesaplanır (ucuz): gece yarısını geçen açık ekranda
  // "bugün" bayat kalmasın.
  const dayOptions = Array.from({ length: MAKEUP_DAY_OPTIONS }, (_, i) =>
    addDaysISO(todayISO(), i),
  );
  const slots = useSupplierAvailability(
    date && !isCargo
      ? {
          product_category_id: appointment.product_category_id,
          vehicle_category_id: appointment.vehicle_category_id,
          target_date: date,
          duration_minutes: appointment.duration_minutes,
        }
      : null,
  );
  const open = (slots.data ?? []).filter(
    (slot) => slot.status !== "full" && new Date(slot.start).getTime() > openedAt,
  );

  return (
    <View
      style={{
        gap: 10,
        borderWidth: 1,
        borderColor: `${colors.primary}55`,
        backgroundColor: `${colors.primary}0D`,
        borderRadius: radius.md,
        padding: spacing.md,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <Ionicons name="refresh-circle-outline" size={18} color={colors.primary} />
        <Text style={{ color: colors.text, fontSize: 14, fontWeight: "600" }}>
          Telafi randevusu (zorunlu)
        </Text>
      </View>
      <Text style={{ color: colors.mutedText, fontSize: 12 }}>
        İptal, telafi randevusuyla birlikte yapılır. Telafi randevusu aynı ürün ve araç
        bilgileriyle açılır ve “Telafi” olarak işaretlenir.
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={{ flexDirection: "row", gap: 6 }}>
          {dayOptions.map((d) => (
            <Chip key={d} label={dayLabel(d)} selected={date === d} onPress={() => onDate(d)} />
          ))}
        </View>
      </ScrollView>
      {date !== "" && isCargo && (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {CARGO_WINDOWS.map((value) => (
            <Chip
              key={value}
              label={CARGO_WINDOW_LABELS[value]}
              selected={window === value}
              onPress={() => onWindow(value)}
            />
          ))}
        </View>
      )}
      {date !== "" && !isCargo && (
        <View style={{ gap: 6 }}>
          <Text style={{ color: colors.text, fontSize: 13, fontWeight: "500" }}>Saat</Text>
          {slots.isLoading ? (
            <Text style={{ color: colors.mutedText, fontSize: 12 }}>Yükleniyor…</Text>
          ) : open.length === 0 ? (
            <Text style={{ color: colors.mutedText, fontSize: 12 }}>
              Bu gün için uygun saat yok; başka bir gün seçin.
            </Text>
          ) : (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {open.map((slot) => (
                <Chip
                  key={slot.start}
                  label={timeInTz(slot.start, timezone)}
                  selected={start === slot.start}
                  onPress={() => onStart(slot.start)}
                />
              ))}
            </View>
          )}
        </View>
      )}
    </View>
  );
}
