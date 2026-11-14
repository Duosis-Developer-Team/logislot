/**
 * Tedarikçi İptal Kuralları (yönetim) — web
 * app/(admin)/admin/settings/supplier-cancellation karşılığı.
 *
 * Müşteri talebi (2026-10) ve 2026-11 toplantısı: tedarikçi iptal ederken
 * firmanın listesinden sebep seçer, telafi randevusunu aynı işlemde açar ve
 * randevuya belirli bir süreden az kalınca iptal edemez. Kural tesis genelinde
 * tektir ve yalnızca tedarikçi iptallerine uygulanır — yönetim her zaman
 * iptal edebilir.
 */

import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import {
  useCancellationReasons,
  useSaveCancellationReasons,
  useSaveSupplierCancellationPolicy,
  useSupplierCancellationPolicy,
  type CancellationReasonInput,
} from "@/api/admin";
import { ApiError } from "@/api/client";
import type { SupplierCancellationPolicyDto } from "@/api/types";
import { useSession } from "@/auth/session";
import { Button, Card, Field, LoadingState, SwitchRow } from "@/components/ui";
import { useTheme } from "@/theme/theme";
import { spacing } from "@/theme/tokens";

const MAX_REASONS = 30;

export default function AdminSupplierCancellation() {
  const { colors } = useTheme();
  const session = useSession();
  const facilityId = session.activeFacilityId;

  if (!session.can("supplier.manage"))
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, padding: spacing.lg }}>
        <Text style={{ color: colors.mutedText, fontSize: 13 }}>
          Bu sayfayı görüntülemek için tedarikçi yönetimi yetkisi gerekir.
        </Text>
      </View>
    );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 64 }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ gap: spacing.md }}>
          <Text style={{ color: colors.mutedText, fontSize: 13 }}>
            Tedarikçilerin portaldan randevu iptal ederken uyması gereken kurallar. Kurallar
            yalnızca tedarikçi iptallerine uygulanır; tesis yönetimi randevuları her zaman iptal
            edebilir.
          </Text>
          <PolicyCard facilityId={facilityId} />
          <ReasonsCard facilityId={facilityId} />
        </View>
      </ScrollView>
    </View>
  );
}

function PolicyCard({ facilityId }: { facilityId: string | null }) {
  const { colors } = useTheme();
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
          require_makeup: policy.data.require_makeup,
          min_notice_hours: policy.data.min_notice_hours,
        }
      : null);
  const hours = hoursOverride ?? (policy.data ? String(policy.data.min_notice_hours) : "");
  const max = policy.data?.max_notice_hours ?? 720;

  if (policy.isError)
    return (
      <Text style={{ color: colors.destructive, fontSize: 13 }}>İptal kuralları yüklenemedi.</Text>
    );
  if (!draft) return <LoadingState label="Kurallar yükleniyor…" />;

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
    <View style={{ gap: spacing.md }}>
      {policy.data?.is_customized === false && (
        <Text style={{ color: colors.mutedText, fontSize: 12 }}>
          Henüz kural tanımlanmadı: tedarikçiler sebep girmeden, randevu başlayana kadar iptal
          edebilir.
        </Text>
      )}
      <Card style={{ gap: spacing.md }}>
        <SwitchRow
          label="Sebep seçimi zorunlu"
          hint="Tedarikçi iptal ederken aşağıdaki listeden sebep seçer. Açıklama isteğe bağlıdır; sebep bazında zorunlu yapılabilir."
          value={draft.require_reason}
          onValueChange={(v) => setDraft({ ...draft, require_reason: v })}
        />
        <SwitchRow
          label="Telafi randevusu zorunlu"
          hint="Tedarikçi iptal ederken telafi randevusunun gün ve saatini seçer; iptal ve telafi tek işlemde yapılır, telafi “Telafi” olarak işaretlenir. Açıkken seriler toplu iptal edilemez."
          value={draft.require_makeup}
          onValueChange={(v) => setDraft({ ...draft, require_makeup: v })}
        />
        <Field
          label="İptal için son süre (saat)"
          value={hours}
          onChangeText={setHours}
          keyboardType="number-pad"
          placeholder="24"
        />
        <Text style={{ color: colors.faintText, fontSize: 12 }}>
          Randevuya bu süreden az kaldığında tedarikçi portaldan iptal edemez. 0 = randevu başlayana
          kadar iptal serbest.
        </Text>
      </Card>
      {error && <Text style={{ color: colors.destructive, fontSize: 13 }}>{error}</Text>}
      {saved && (
        <Text style={{ color: colors.status.approved, fontSize: 13 }}>
          İptal kuralları kaydedildi.
        </Text>
      )}
      <Button title="Kuralları Kaydet" loading={save.isPending} onPress={() => void onSave()} />
    </View>
  );
}

interface DraftReason extends CancellationReasonInput {
  key: string;
}

function ReasonsCard({ facilityId }: { facilityId: string | null }) {
  const { colors } = useTheme();
  const list = useCancellationReasons(facilityId);
  const save = useSaveCancellationReasons(facilityId);
  const [draftOverride, setDraft] = useState<DraftReason[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const draft: DraftReason[] | null =
    draftOverride ??
    (list.data
      ? list.data.map((r) => ({
          id: r.id,
          key: r.id,
          label: r.label,
          note_required: r.note_required,
          is_active: r.is_active,
        }))
      : null);

  if (list.isError)
    return (
      <Text style={{ color: colors.destructive, fontSize: 13 }}>İptal sebepleri yüklenemedi.</Text>
    );
  if (!draft) return <LoadingState label="Sebepler yükleniyor…" />;

  function change(next: DraftReason[]) {
    setSaved(false);
    setDraft(next);
  }

  function update(index: number, patch: Partial<DraftReason>) {
    change(draft!.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function move(index: number, delta: number) {
    const next = [...draft!];
    const [row] = next.splice(index, 1);
    next.splice(index + delta, 0, row);
    change(next);
  }

  async function onSave() {
    setError(null);
    setSaved(false);
    const rows = draft!;
    if (rows.some((r) => r.label.trim().length < 2))
      return setError("Her sebebin en az 2 karakterlik bir adı olmalı.");
    const names = rows.map((r) => r.label.trim().toLocaleLowerCase("tr-TR"));
    if (new Set(names).size !== names.length)
      return setError("Aynı sebep birden fazla kez yazılmış.");
    if (!rows.some((r) => r.is_active)) return setError("En az bir aktif sebep olmalı.");
    try {
      const result = await save.mutateAsync(
        rows.map(({ id, label, note_required, is_active }) => ({
          ...(id ? { id } : {}),
          label: label.trim(),
          note_required,
          is_active,
        })),
      );
      setDraft(
        result.map((r) => ({
          id: r.id,
          key: r.id,
          label: r.label,
          note_required: r.note_required,
          is_active: r.is_active,
        })),
      );
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "İptal sebepleri kaydedilemedi.");
    }
  }

  return (
    <View style={{ gap: spacing.md }}>
      <Text style={{ color: colors.text, fontSize: 16, fontWeight: "700" }}>İptal Sebepleri</Text>
      <Text style={{ color: colors.mutedText, fontSize: 12 }}>
        Tedarikçinin iptal ederken göreceği liste, buradaki sırayla. Pasif sebepler tedarikçiye
        gösterilmez; silinen sebep geçmiş randevulardaki kaydı değiştirmez.
      </Text>
      {draft.map((row, index) => (
        <Card key={row.key} style={{ gap: spacing.sm, padding: spacing.md }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Text style={{ color: colors.mutedText, fontSize: 12, width: 18 }}>{index + 1}</Text>
            <View style={{ flex: 1 }}>
              <Field
                value={row.label}
                onChangeText={(v) => update(index, { label: v })}
                placeholder="Sebep adı"
                maxLength={120}
              />
            </View>
          </View>
          <SwitchRow
            label="Aktif"
            value={row.is_active}
            onValueChange={(v) => update(index, { is_active: v })}
          />
          <SwitchRow
            label="Açıklama zorunlu"
            value={row.note_required}
            onValueChange={(v) => update(index, { note_required: v })}
          />
          <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 16 }}>
            <IconButton
              icon="arrow-up"
              label="Yukarı taşı"
              disabled={index === 0}
              onPress={() => move(index, -1)}
            />
            <IconButton
              icon="arrow-down"
              label="Aşağı taşı"
              disabled={index === draft.length - 1}
              onPress={() => move(index, 1)}
            />
            <IconButton
              icon="trash-outline"
              label="Sebebi sil"
              destructive
              onPress={() => change(draft.filter((_, i) => i !== index))}
            />
          </View>
        </Card>
      ))}
      <Button
        title="Sebep Ekle"
        variant="secondary"
        disabled={draft.length >= MAX_REASONS}
        onPress={() =>
          change([
            ...draft,
            { key: `new-${Date.now()}`, label: "", note_required: false, is_active: true },
          ])
        }
      />
      {error && <Text style={{ color: colors.destructive, fontSize: 13 }}>{error}</Text>}
      {saved && (
        <Text style={{ color: colors.status.approved, fontSize: 13 }}>
          İptal sebepleri kaydedildi.
        </Text>
      )}
      <Button title="Sebepleri Kaydet" loading={save.isPending} onPress={() => void onSave()} />
    </View>
  );
}

function IconButton({
  icon,
  label,
  onPress,
  disabled,
  destructive,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  destructive?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={8}
      accessibilityLabel={label}
      style={{ opacity: disabled ? 0.3 : 1 }}
    >
      <Ionicons name={icon} size={20} color={destructive ? colors.destructive : colors.mutedText} />
    </Pressable>
  );
}
