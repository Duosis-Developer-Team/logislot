/**
 * Tedarikçi İptal Kuralları (yönetim) — web
 * app/(admin)/admin/settings/supplier-cancellation karşılığı.
 *
 * Müşteri talebi (2026-10): tedarikçi portaldan randevu iptal ederken sebep ve
 * alternatif gönderim tarihi girsin, randevuya belirli bir süreden az kalınca
 * iptal edemesin. Kural tesis genelinde tektir ve yalnızca tedarikçi
 * iptallerine uygulanır — yönetim her zaman iptal edebilir.
 */

import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import {
  useSaveSupplierCancellationPolicy,
  useSupplierCancellationPolicy,
} from "@/api/admin";
import { ApiError } from "@/api/client";
import {
  SUPPLIER_CANCELLATION_REASONS,
  SUPPLIER_CANCELLATION_REASON_LABELS,
} from "@/api/shared";
import type { SupplierCancellationPolicyDto } from "@/api/types";
import { useSession } from "@/auth/session";
import { Button, Card, Field, LoadingState, SwitchRow } from "@/components/ui";
import { useTheme } from "@/theme/theme";
import { spacing } from "@/theme/tokens";

export default function AdminSupplierCancellation() {
  const { colors } = useTheme();
  const session = useSession();
  const facilityId = session.activeFacilityId;
  const policy = useSupplierCancellationPolicy(facilityId);
  const save = useSaveSupplierCancellationPolicy(facilityId);
  const [draftOverride, setDraft] = useState<SupplierCancellationPolicyDto | null>(null);
  // Saat alanı metin olarak tutulur: silip yeniden yazarken "0"a zorlanmasın.
  const [hoursOverride, setHours] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const draft: SupplierCancellationPolicyDto | null =
    draftOverride ??
    (policy.data
      ? {
          require_reason: policy.data.require_reason,
          require_alternative_date: policy.data.require_alternative_date,
          min_notice_hours: policy.data.min_notice_hours,
        }
      : null);
  const hours = hoursOverride ?? (policy.data ? String(policy.data.min_notice_hours) : "");

  if (!session.can("supplier.manage"))
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, padding: spacing.lg }}>
        <Text style={{ color: colors.mutedText, fontSize: 13 }}>
          Bu sayfayı görüntülemek için tedarikçi yönetimi yetkisi gerekir.
        </Text>
      </View>
    );

  const max = policy.data?.max_notice_hours ?? 720;

  async function onSave() {
    if (!draft) return;
    setError(null);
    setSaved(false);
    const parsed = Number(hours);
    if (!/^\d+$/.test(hours.trim()) || parsed > max) {
      setError(`0 ile ${max} arasında bir tam sayı girin.`);
      return;
    }
    try {
      await save.mutateAsync({ ...draft, min_notice_hours: parsed });
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "İptal kuralları kaydedilemedi.");
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 64 }}>
        <View style={{ gap: spacing.md }}>
          <Text style={{ color: colors.mutedText, fontSize: 13 }}>
            Tedarikçilerin portaldan randevu iptal ederken uyması gereken kurallar. Kurallar
            yalnızca tedarikçi iptallerine uygulanır; tesis yönetimi randevuları her zaman iptal
            edebilir.
          </Text>

          {policy.isError ? (
            <Text style={{ color: colors.destructive, fontSize: 13 }}>
              İptal kuralları yüklenemedi.
            </Text>
          ) : !draft ? (
            <LoadingState label="Kurallar yükleniyor…" />
          ) : (
            <>
              {policy.data?.is_customized === false && (
                <Text style={{ color: colors.mutedText, fontSize: 12 }}>
                  Henüz kural tanımlanmadı: tedarikçiler sebep girmeden, randevu başlayana kadar
                  iptal edebilir.
                </Text>
              )}
              <Card style={{ gap: spacing.md }}>
                <SwitchRow
                  label="Sebep seçimi zorunlu"
                  hint="Tedarikçi iptal ederken hazır listeden sebep seçer; 'Diğer' seçerse açıklama yazar."
                  value={draft.require_reason}
                  onValueChange={(v) => setDraft({ ...draft, require_reason: v })}
                />
                {draft.require_reason && (
                  <Text style={{ color: colors.faintText, fontSize: 12 }}>
                    Sebepler:{" "}
                    {SUPPLIER_CANCELLATION_REASONS.map(
                      (code) => SUPPLIER_CANCELLATION_REASON_LABELS[code],
                    ).join(" · ")}
                  </Text>
                )}
                <SwitchRow
                  label="Alternatif gönderim tarihi zorunlu"
                  hint="Tedarikçi ürünleri gönderebileceği yeni tarihi girer."
                  value={draft.require_alternative_date}
                  onValueChange={(v) => setDraft({ ...draft, require_alternative_date: v })}
                />
                <Field
                  label="İptal için son süre (saat)"
                  value={hours}
                  onChangeText={setHours}
                  keyboardType="number-pad"
                  placeholder="24"
                />
                <Text style={{ color: colors.faintText, fontSize: 12 }}>
                  Randevuya bu süreden az kaldığında tedarikçi portaldan iptal edemez. 0 = randevu
                  başlayana kadar iptal serbest.
                </Text>
              </Card>
              {error && <Text style={{ color: colors.destructive, fontSize: 13 }}>{error}</Text>}
              {saved && (
                <Text style={{ color: colors.status.approved, fontSize: 13 }}>
                  İptal kuralları kaydedildi.
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
