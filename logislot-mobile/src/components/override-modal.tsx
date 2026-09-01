/**
 * Takvim istisnası formu — Ayarlar > Takvim İstisnaları ve Takvim sekmesinin
 * ortak modalı (web: components/config/override-drawer.tsx karşılığı).
 * Oluşturmada ÇOKLU rampa seçilebilir (tek istek, N kayıt); düzenlemede rampa
 * sabittir (PATCH dock_id kabul etmez).
 */

import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Text, View } from "react-native";
import { ApiError } from "@/api/client";
import { dockOverrides, docks } from "@/api/resources";
import type { OverrideDto, OverrideType } from "@/api/types";
import { useSession } from "@/auth/session";
import { MultiSelectField, TimeSelect } from "@/components/config";
import { AppModal, Button, Chip, Field } from "@/components/ui";
import { useTheme } from "@/theme/theme";
import { spacing } from "@/theme/tokens";
import { todayISO } from "@/utils/format";

export interface OverrideModalInitial {
  /** "YYYY-AA-GG" — takvimden açılışta görüntülenen gün. */
  date?: string;
  /** Ön-seçili rampalar (örneğin rampa satırından hızlı kapatma). */
  dockIds?: string[];
  type?: OverrideType;
}

interface OverrideModalProps {
  visible: boolean;
  /** Dolu ise düzenleme modu; null ise oluşturma modu. */
  editing?: OverrideDto | null;
  initial?: OverrideModalInitial | null;
  onClose: () => void;
  onSaved?: (message: string) => void;
}

export function OverrideModal({
  visible,
  editing = null,
  initial = null,
  onClose,
  onSaved,
}: OverrideModalProps) {
  // Form state'i açılış parametrelerinden türer; effect ile senkronlamak yerine
  // key değişince gövde yeniden mount edilir (temiz sıfırlama).
  const formKey = [
    editing?.id ?? "new",
    initial?.date ?? "",
    (initial?.dockIds ?? []).join(","),
    initial?.type ?? "",
  ].join("|");

  return (
    <AppModal
      visible={visible}
      onClose={onClose}
      title={editing ? "İstisnayı Düzenle" : "Yeni Takvim İstisnası"}
    >
      {visible && (
        <OverrideForm
          key={formKey}
          editing={editing}
          initial={initial}
          onClose={onClose}
          onSaved={onSaved}
        />
      )}
    </AppModal>
  );
}

function OverrideForm({
  editing,
  initial,
  onClose,
  onSaved,
}: Omit<OverrideModalProps, "visible">) {
  const { colors } = useTheme();
  const { activeFacilityId } = useSession();
  const queryClient = useQueryClient();
  const dockList = docks.useList(activeFacilityId);
  const overrideList = dockOverrides.useList(activeFacilityId);
  const save = dockOverrides.useSave(activeFacilityId);

  const [dockIds, setDockIds] = useState<string[]>(
    editing ? [editing.dock_id] : (initial?.dockIds ?? []),
  );
  const [date, setDate] = useState(editing?.date ?? initial?.date ?? todayISO());
  const [type, setType] = useState<OverrideType>(editing?.type ?? initial?.type ?? "closed");
  const [startTime, setStartTime] = useState(editing?.start_time?.slice(0, 5) ?? "");
  const [endTime, setEndTime] = useState(editing?.end_time?.slice(0, 5) ?? "");
  const [reason, setReason] = useState(editing?.reason ?? "");
  const [formError, setFormError] = useState<string | null>(null);

  const dockName = (id: string) => dockList.data?.find((d) => d.id === id)?.name ?? "?";

  // Aynı rampa+gün için ikinci aktif istisna API'de reddedilir; seçenekten düşür.
  const takenDockIds = new Set(
    (overrideList.data ?? [])
      .filter((o) => o.is_active && o.date === date && o.id !== editing?.id)
      .map((o) => o.dock_id),
  );
  const activeDocks = (dockList.data ?? []).filter((d) => d.is_active);
  const options = activeDocks
    .filter((d) => !takenDockIds.has(d.id))
    .map((d) => ({ value: d.id, label: d.name }));
  const takenNames = activeDocks.filter((d) => takenDockIds.has(d.id)).map((d) => d.name);
  // Tarih değişince artık seçilemeyen rampalar seçimden düşer.
  const selected = dockIds.filter((id) => !takenDockIds.has(id));

  async function onSubmit() {
    setFormError(null);
    if (!editing && selected.length === 0) {
      setFormError("En az bir rampa seçin.");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setFormError("Tarih YYYY-AA-GG biçiminde olmalı.");
      return;
    }
    if (type === "extra_hours") {
      if (!startTime || !endTime) {
        setFormError("Saat değişikliği için başlangıç ve bitiş saati zorunludur.");
        return;
      }
      if (endTime <= startTime) {
        setFormError("Bitiş, başlangıçtan sonra olmalı.");
        return;
      }
    }
    const shared = {
      date,
      type,
      start_time: startTime || null,
      end_time: endTime || null,
      reason: reason || null,
    };
    try {
      await save.mutateAsync({
        id: editing?.id,
        body: editing ? shared : { ...shared, dock_ids: selected },
      });
      // Takvim görünümü ayrı sorgu ağacında; kapalı bantlar anında tazelensin.
      await queryClient.invalidateQueries({ queryKey: ["calendar"] });
      onSaved?.(
        editing
          ? "İstisna güncellendi."
          : selected.length > 1
            ? `${selected.length} rampa için istisna oluşturuldu.`
            : "İstisna oluşturuldu.",
      );
      onClose();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Kaydedilemedi");
    }
  }

  return (
    <View style={{ gap: spacing.md }}>
      <View style={{ gap: 6 }}>
        <Text style={{ color: colors.text, fontSize: 14, fontWeight: "500" }}>
          {editing ? "Rampa" : "Rampalar (çoklu seçim)"}
        </Text>
        {editing ? (
          <Text style={{ color: colors.mutedText, fontSize: 13 }}>
            {dockName(editing.dock_id)} · rampa değiştirilemez, yeni istisna oluşturun
          </Text>
        ) : (
          <>
            {/* Toplu seç/temizle artık MultiSelectField başlığında; ayrı buton
                kaldırıldı (aynı işlev için iki kontrol olmasın). */}
            <MultiSelectField
              options={options}
              value={selected}
              onChange={setDockIds}
              searchPlaceholder="Rampa ara…"
              emptyHint="İstisnanın uygulanacağı rampaları seçin."
            />
            {takenNames.length > 0 && (
              <Text style={{ color: colors.faintText, fontSize: 12 }}>
                Bu tarihte zaten istisnası olan rampalar listede yok: {takenNames.join(", ")}.
              </Text>
            )}
          </>
        )}
      </View>

      <Field
        label="Tarih (YYYY-AA-GG)"
        value={date}
        onChangeText={setDate}
        placeholder="2026-07-15"
        autoCapitalize="none"
      />

      <View style={{ gap: 6 }}>
        <Text style={{ color: colors.text, fontSize: 14, fontWeight: "500" }}>Tip</Text>
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <Chip
            label="Kapalı (bakım, tatil…)"
            selected={type === "closed"}
            onPress={() => setType("closed")}
          />
          <Chip
            label="Saat değişikliği"
            selected={type === "extra_hours"}
            onPress={() => setType("extra_hours")}
          />
        </View>
      </View>

      {type === "extra_hours" ? (
        <View style={{ flexDirection: "row", gap: spacing.md }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.mutedText, fontSize: 13 }}>Başlangıç</Text>
            <TimeSelect value={startTime} onChange={setStartTime} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.mutedText, fontSize: 13 }}>Bitiş</Text>
            <TimeSelect value={endTime} onChange={setEndTime} />
          </View>
        </View>
      ) : (
        <Text style={{ color: colors.faintText, fontSize: 12 }}>
          Kapalı istisna, seçilen rampaların o gününü tamamen randevuya kapatır.
        </Text>
      )}

      <Field
        label="Sebep"
        value={reason}
        onChangeText={setReason}
        placeholder="Örn. Planlı bakım"
      />

      {formError && <Text style={{ color: colors.destructive, fontSize: 13 }}>{formError}</Text>}

      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <Button title="İptal" variant="secondary" onPress={onClose} style={{ flex: 1 }} />
        <Button
          title={save.isPending ? "Kaydediliyor…" : "Kaydet"}
          loading={save.isPending}
          onPress={() => void onSubmit()}
          style={{ flex: 2 }}
        />
      </View>
    </View>
  );
}
