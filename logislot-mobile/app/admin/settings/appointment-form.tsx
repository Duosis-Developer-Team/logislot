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

type Draft = AppointmentFormDto & { driver_id_retention_days: number };

export default function AdminAppointmentForm() {
  const { colors } = useTheme();
  const session = useSession();
  const facilityId = session.activeFacilityId;
  const form = useAppointmentForm(facilityId);
  const save = useSaveAppointmentForm(facilityId);
  const [draftOverride, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const draft: Draft | null =
    draftOverride ??
    (form.data
      ? {
          order_numbers: form.data.order_numbers,
          driver_id_number: form.data.driver_id_number,
          description: form.data.description,
          driver_id_retention_days: form.data.driver_id_retention_days,
        }
      : null);

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
              <Card style={{ gap: spacing.sm }}>
                <Text style={{ color: colors.text, fontSize: 15, fontWeight: "600" }}>
                  Açıklama
                </Text>
                <Text style={{ color: colors.faintText, fontSize: 12 }}>
                  Sevkiyat için serbest metin (ör. aynı sevkiyattaki birden fazla ürün). En fazla{" "}
                  {form.data?.description_max_length ?? 1000} karakter. Ürün adı alanı aynen kalır.
                </Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                  {MODES.map((mode) => (
                    <Chip
                      key={mode.value}
                      label={mode.label}
                      selected={draft.description === mode.value}
                      onPress={() => {
                        setSaved(false);
                        setDraft({ ...draft, description: mode.value });
                      }}
                    />
                  ))}
                </View>
              </Card>
              <Card style={{ gap: spacing.sm }}>
                <Text style={{ color: colors.text, fontSize: 15, fontWeight: "600" }}>
                  Sürücü kimlik no (T.C. / pasaport)
                </Text>
                <Text style={{ color: colors.faintText, fontSize: 12 }}>
                  Güvenlik girişi için sürücünün T.C. kimlik ya da pasaport numarası. Kişisel
                  veridir: şifreli saklanır, ekranlarda maskeli görünür.
                </Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                  {MODES.map((mode) => (
                    <Chip
                      key={mode.value}
                      label={mode.label}
                      selected={draft.driver_id_number === mode.value}
                      onPress={() => {
                        setSaved(false);
                        setDraft({ ...draft, driver_id_number: mode.value });
                      }}
                    />
                  ))}
                </View>
                {draft.driver_id_number !== "hidden" && (
                  <>
                    <Text style={{ color: colors.text, fontSize: 14, fontWeight: "500" }}>
                      Randevudan sonra saklama süresi
                    </Text>
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                      {(form.data?.driver_id_retention_choices ?? [7, 30, 90, 180, 365]).map((d) => (
                        <Chip
                          key={d}
                          label={`${d} gün`}
                          selected={draft.driver_id_retention_days === d}
                          onPress={() => {
                            setSaved(false);
                            setDraft({ ...draft, driver_id_retention_days: d });
                          }}
                        />
                      ))}
                    </View>
                    <Text style={{ color: colors.faintText, fontSize: 12 }}>
                      Numarayı açık görmek için “Sürücü kimlik numarasını görüntüle” izni gerekir;
                      her görüntüleme denetim kaydına yazılır. Süre dolunca numara kalıcı olarak
                      silinir. Raporlara, e-postalara ve bildirimlere eklenmez.
                    </Text>
                  </>
                )}
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
