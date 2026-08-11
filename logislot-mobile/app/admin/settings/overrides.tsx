/** Takvim İstisnaları CRUD — web (admin)/admin/settings/overrides karşılığı. */

import { useState } from "react";
import { Alert, Text, View } from "react-native";
import { ApiError } from "@/api/client";
import { dockOverrides, docks } from "@/api/resources";
import type { OverrideDto, OverrideType } from "@/api/types";
import { useSession } from "@/auth/session";
import { ActiveBadge, ConfigList } from "@/components/config";
import { AppModal, Badge, Button, Card, Chip, Field, PickerField } from "@/components/ui";
import { useTheme } from "@/theme/theme";
import { spacing } from "@/theme/tokens";
import { todayISO } from "@/utils/format";

export default function OverridesScreen() {
  const { colors } = useTheme();
  const session = useSession();
  const facilityId = session.activeFacilityId;
  const list = dockOverrides.useList(facilityId);
  const dockList = docks.useList(facilityId);
  const save = dockOverrides.useSave(facilityId);
  const deactivate = dockOverrides.useDeactivate(facilityId);

  const [editing, setEditing] = useState<OverrideDto | null>(null);
  const [open, setOpen] = useState(false);
  const [dockId, setDockId] = useState<string | null>(null);
  const [date, setDate] = useState(todayISO());
  const [type, setType] = useState<OverrideType>("closed");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [reason, setReason] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  function openCreate() {
    setEditing(null);
    setDockId(null);
    setDate(todayISO());
    setType("closed");
    setStartTime("");
    setEndTime("");
    setReason("");
    setFormError(null);
    setOpen(true);
  }

  function openEdit(row: OverrideDto) {
    setEditing(row);
    setDockId(row.dock_id);
    setDate(row.date);
    setType(row.type);
    setStartTime(row.start_time?.slice(0, 5) ?? "");
    setEndTime(row.end_time?.slice(0, 5) ?? "");
    setReason(row.reason ?? "");
    setFormError(null);
    setOpen(true);
  }

  async function onSubmit() {
    setFormError(null);
    if (!dockId) {
      setFormError("Rampa seçin.");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setFormError("Tarih YYYY-AA-GG biçiminde olmalı.");
      return;
    }
    if (type === "extra_hours") {
      if (!startTime || !endTime) {
        setFormError("Ek mesai için başlangıç ve bitiş saati zorunludur.");
        return;
      }
      if (endTime <= startTime) {
        setFormError("Bitiş, başlangıçtan sonra olmalı.");
        return;
      }
    }
    try {
      await save.mutateAsync({
        id: editing?.id,
        body: {
          dock_id: dockId,
          date,
          type,
          start_time: startTime || null,
          end_time: endTime || null,
          reason: reason || null,
        },
      });
      setOpen(false);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Kaydedilemedi");
    }
  }

  function onDeactivate(row: OverrideDto) {
    Alert.alert(
      "İstisnayı pasifleştir",
      "Bu istisna pasifleştirilecek ve rampa o gün normal çalışma düzenine döner.",
      [
        { text: "Vazgeç", style: "cancel" },
        {
          text: "Pasifleştir",
          style: "destructive",
          onPress: () =>
            deactivate.mutate(row.id, {
              onError: (err) =>
                Alert.alert(
                  "İşlem başarısız",
                  err instanceof ApiError ? err.message : "İşlem başarısız",
                ),
            }),
        },
      ],
    );
  }

  const dockName = (id: string) => dockList.data?.find((d) => d.id === id)?.name ?? "?";

  return (
    <>
      <ConfigList
        query={list}
        createLabel="Yeni İstisna"
        onCreate={openCreate}
        description="Kapalı gün müsaitlikte sert engel üretir; ek mesai o günün çalışma penceresinin yerine geçer ve normal saat dışına slot açabilir."
        searchText={(r) => `${dockName(r.dock_id)} ${r.date} ${r.reason ?? ""}`}
        keyExtractor={(r) => r.id}
        emptyTitle="Takvim istisnası yok"
        emptyDescription="Bakım için kapalı gün ya da bayram öncesi ek mesai tanımlayın; müsaitlik anında güncellenir."
        renderItem={(row) => (
          <Card style={{ gap: spacing.sm }}>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: spacing.sm,
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontSize: 15, fontWeight: "600" }}>
                  {new Date(row.date).toLocaleDateString("tr-TR", {
                    day: "2-digit",
                    month: "long",
                    weekday: "long",
                  })}
                </Text>
                <Text style={{ color: colors.mutedText, fontSize: 12 }}>
                  {dockName(row.dock_id)}
                  {row.reason ? ` · ${row.reason}` : ""}
                </Text>
              </View>
              <ActiveBadge active={row.is_active} />
            </View>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4 }}>
              <Badge
                label={row.type === "closed" ? "Kapalı" : "Ek Mesai"}
                color={row.type === "closed" ? colors.status.rejected : colors.status.approved}
              />
              <Badge
                label={
                  row.start_time && row.end_time
                    ? `${row.start_time.slice(0, 5)}–${row.end_time.slice(0, 5)}`
                    : "Tüm gün"
                }
                color={colors.mutedText}
              />
            </View>
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              <Button
                title="Düzenle"
                variant="secondary"
                onPress={() => openEdit(row)}
                style={{ flex: 1, height: 40 }}
              />
              {row.is_active && (
                <Button
                  title="Pasifleştir"
                  variant="ghost"
                  onPress={() => onDeactivate(row)}
                  style={{ flex: 1, height: 40 }}
                />
              )}
            </View>
          </Card>
        )}
      />

      <AppModal
        visible={open}
        onClose={() => setOpen(false)}
        title={editing ? "İstisnayı Düzenle" : "Yeni Takvim İstisnası"}
      >
        <View style={{ gap: spacing.md }}>
          <PickerField
            label="Rampa"
            value={dockId}
            placeholder="— Rampa seçin —"
            options={(dockList.data ?? [])
              .filter((d) => d.is_active)
              .map((d) => ({ value: d.id, label: d.name }))}
            onChange={setDockId}
          />
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
                label="Ek Mesai"
                selected={type === "extra_hours"}
                onPress={() => setType("extra_hours")}
              />
            </View>
          </View>
          {type === "extra_hours" ? (
            <View style={{ flexDirection: "row", gap: spacing.md }}>
              <View style={{ flex: 1 }}>
                <Field
                  label="Başlangıç (SS:DD)"
                  value={startTime}
                  onChangeText={setStartTime}
                  placeholder="06:00"
                  autoCapitalize="none"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Field
                  label="Bitiş (SS:DD)"
                  value={endTime}
                  onChangeText={setEndTime}
                  placeholder="22:00"
                  autoCapitalize="none"
                />
              </View>
            </View>
          ) : (
            <Text style={{ color: colors.faintText, fontSize: 12 }}>
              Kapalı istisna tüm günü randevuya kapatır.
            </Text>
          )}
          <Field
            label="Sebep"
            value={reason}
            onChangeText={setReason}
            placeholder="Örn. Planlı bakım"
          />
          {formError && (
            <Text style={{ color: colors.destructive, fontSize: 13 }}>{formError}</Text>
          )}
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <Button
              title="İptal"
              variant="secondary"
              onPress={() => setOpen(false)}
              style={{ flex: 1 }}
            />
            <Button
              title={save.isPending ? "Kaydediliyor…" : "Kaydet"}
              loading={save.isPending}
              onPress={() => void onSubmit()}
              style={{ flex: 2 }}
            />
          </View>
        </View>
      </AppModal>
    </>
  );
}
