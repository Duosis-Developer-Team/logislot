/**
 * Tedarikçi iptal penceresi — web components/domain/supplier-cancel-dialog.tsx
 * karşılığı. Tekil randevu ve seri iptalinin ORTAK formu.
 *
 * Hangi alanın zorunlu olduğunu tesisin iptal kuralı belirler
 * (`profile.cancellation_policy`, müşteri talebi 2026-10); kural sunucuda da
 * zorlanır. Kural kapalı tesiste tekil iptal eski sade onay olarak kalır; seri
 * iptali eski serbest metin sebebini ister (`legacyReason`).
 *
 * Mobilde tarih seçici kütüphanesi yok (bilinçli: bağımlılık eklememek için);
 * alternatif tarih, diğer ekranlardaki gibi gün çipleriyle seçilir. Çip listesi
 * ilk 90 günü kapsar — sunucu 365 güne kadar kabul eder.
 */

import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import {
  SUPPLIER_CANCELLATION_REASONS,
  SUPPLIER_CANCELLATION_REASON_LABELS,
} from "@/api/shared";
import type { SupplierCancelBody } from "@/api/supplier";
import type { SupplierCancellationPolicyDto } from "@/api/types";
import { AppModal, Button, Chip, Field } from "@/components/ui";
import { useTheme } from "@/theme/theme";
import { radius, spacing } from "@/theme/tokens";
import { addDaysISO, dayLabel, todayISO } from "@/utils/format";

const NOTE_MIN_LENGTH = 3;
const DATE_OPTION_DAYS = 90;

interface SupplierCancelFormProps {
  onClose: () => void;
  intro: React.ReactNode;
  policy: SupplierCancellationPolicyDto | undefined;
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
  // Form yalnizca acikken mount edilir: her acilista temiz durumla dogar,
  // onceki randevunun secimi tasinmaz.
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
  legacyReason,
  confirmLabel,
  pending,
  error,
  onSubmit,
}: SupplierCancelFormProps) {
  const { colors } = useTheme();
  const [reasonCode, setReasonCode] = useState("");
  const [note, setNote] = useState("");
  const [alternativeDate, setAlternativeDate] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  // Her render'da hesaplanır (90 öğe, ucuz): gece yarısını geçen açık ekranda
  // "bugün" bayat kalmasın.
  const dateOptions = Array.from({ length: DATE_OPTION_DAYS }, (_, i) =>
    addDaysISO(todayISO(), i),
  );

  const showPicker = policy?.require_reason ?? false;
  const showDate = policy?.require_alternative_date ?? false;
  const showLegacy = !showPicker && legacyReason !== undefined;

  function submit() {
    const trimmed = note.trim();
    if (showPicker && !reasonCode) return setLocalError("Lütfen bir iptal sebebi seçin.");
    if (showPicker && reasonCode === "other" && trimmed.length < NOTE_MIN_LENGTH)
      return setLocalError("'Diğer' seçtiğinizde kısa bir açıklama yazın (en az 3 karakter).");
    if (showLegacy && trimmed.length < NOTE_MIN_LENGTH)
      return setLocalError(legacyReason!.minError);
    if (showDate && !alternativeDate)
      return setLocalError("Lütfen alternatif gönderim tarihini seçin.");
    setLocalError(null);
    onSubmit({
      ...(showPicker ? { reason_code: reasonCode } : {}),
      ...(trimmed ? { reason: trimmed } : {}),
      ...(showDate ? { alternative_date: alternativeDate } : {}),
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
          {SUPPLIER_CANCELLATION_REASONS.map((code) => {
            const selected = reasonCode === code;
            return (
              <Pressable
                key={code}
                onPress={() => setReasonCode(code)}
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
                <Text style={{ color: colors.text, fontSize: 14, flex: 1 }}>
                  {SUPPLIER_CANCELLATION_REASON_LABELS[code]}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}

      {showPicker && (
        <Field
          label={reasonCode === "other" ? "Açıklama (zorunlu)" : "Açıklama (isteğe bağlı)"}
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

      {showDate && (
        <View style={{ gap: 8 }}>
          <Text style={{ color: colors.text, fontSize: 14, fontWeight: "500" }}>
            Alternatif gönderim tarihi (zorunlu)
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={{ flexDirection: "row", gap: 6 }}>
              {dateOptions.map((d) => (
                <Chip
                  key={d}
                  label={dayLabel(d)}
                  selected={alternativeDate === d}
                  onPress={() => setAlternativeDate(d)}
                />
              ))}
            </View>
          </ScrollView>
          <Text style={{ color: colors.mutedText, fontSize: 12 }}>
            Ürünleri gönderebileceğiniz yeni tarih. Tesis yönetimi bu tarihi görür; yeni
            randevu talebini ayrıca oluşturabilirsiniz.
          </Text>
        </View>
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
