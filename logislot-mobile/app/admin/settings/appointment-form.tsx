/**
 * Randevu Formu (yönetim) — web app/(admin)/admin/settings/appointment-form karşılığı.
 *
 * Müşteri kararı (2026-11): randevuda sipariş no zorunlu, çoklu olabilir.
 * Alan herkese zorla açılmaz; firma alan bazında gizli / isteğe bağlı /
 * zorunlu seçer. Ayar yalnızca yeni randevulara uygulanır ve sunucuda zorlanır.
 */

import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useAppointmentForm, useSaveAppointmentForm } from "@/api/admin";
import { ApiError } from "@/api/client";
import type { AppointmentFormDto, FormFieldMode } from "@/api/types";
import { useSession } from "@/auth/session";
import { Button, Card, Chip, LoadingState } from "@/components/ui";
import { useTheme } from "@/theme/theme";
import { spacing } from "@/theme/tokens";

const MODES: { value: FormFieldMode; label: string }[] = [
  { value: "hidden", label: "Gizli" },
  { value: "optional", label: "İsteğe bağlı" },
  { value: "required", label: "Zorunlu" },
];

export default function AdminAppointmentForm() {
  const { colors } = useTheme();
  const session = useSession();
  const facilityId = session.activeFacilityId;
  const form = useAppointmentForm(facilityId);
  const save = useSaveAppointmentForm(facilityId);
  const [draftOverride, setDraft] = useState<AppointmentFormDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const draft = draftOverride ?? (form.data ? { order_numbers: form.data.order_numbers } : null);

  if (!session.can("supplier.manage"))
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, padding: spacing.lg }}>
        <Text style={{ color: colors.mutedText, fontSize: 13 }}>
          Bu sayfayı görüntülemek için tedarikçi yönetimi yetkisi gerekir.
        </Text>
      </View>
    );

  async function onSave() {
    if (!draft) return;
    setError(null);
    setSaved(false);
    try {
      await save.mutateAsync(draft);
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Randevu formu ayarları kaydedilemedi.");
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 64 }}>
        <View style={{ gap: spacing.md }}>
          <Text style={{ color: colors.mutedText, fontSize: 13 }}>
            Tedarikçinin ve yönetimin randevu oluştururken dolduracağı ek alanlar. Her alanı
            gizleyebilir, isteğe bağlı ya da zorunlu yapabilirsiniz.
          </Text>
          {form.isError ? (
            <Text style={{ color: colors.destructive, fontSize: 13 }}>
              Randevu formu ayarları yüklenemedi.
            </Text>
          ) : !draft ? (
            <LoadingState />
          ) : (
            <>
              <Card style={{ gap: spacing.sm }}>
                <Text style={{ color: colors.text, fontSize: 15, fontWeight: "600" }}>
                  Sipariş no
                </Text>
                <Text style={{ color: colors.faintText, fontSize: 12 }}>
                  Sevkiyatın sipariş numaraları. Bir randevuya en fazla{" "}
                  {form.data?.max_order_numbers ?? 20} numara girilebilir.
                </Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                  {MODES.map((mode) => (
                    <Chip
                      key={mode.value}
                      label={mode.label}
                      selected={draft.order_numbers === mode.value}
                      onPress={() => {
                        setSaved(false);
                        setDraft({ ...draft, order_numbers: mode.value });
                      }}
                    />
                  ))}
                </View>
              </Card>
              <Text style={{ color: colors.faintText, fontSize: 12 }}>
                Değişiklik yalnızca yeni randevulara uygulanır; mevcut randevular etkilenmez.
              </Text>
              {error && <Text style={{ color: colors.destructive, fontSize: 13 }}>{error}</Text>}
              {saved && (
                <Text style={{ color: colors.status.approved, fontSize: 13 }}>
                  Randevu formu kaydedildi.
                </Text>
              )}
              <Button title="Kaydet" loading={save.isPending} onPress={() => void onSave()} />
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
}
