/** Rampa Çakışma Grupları CRUD — web (admin)/admin/settings/conflict-groups karşılığı. */

import { useState } from "react";
import { Alert, Text, View } from "react-native";
import { ApiError } from "@/api/client";
import { conflictGroups, docks, vehicleCategories } from "@/api/resources";
import type { ConflictGroupDto, ConflictRelationType } from "@/api/types";
import { useSession } from "@/auth/session";
import { ActiveBadge, ConfigList, MultiSelectChips } from "@/components/config";
import { AppModal, Badge, Button, Card, Chip, Field, SwitchRow } from "@/components/ui";
import { useTheme } from "@/theme/theme";
import { spacing } from "@/theme/tokens";

const TYPE_LABELS: Record<ConflictRelationType, string> = {
  mutual_block: "Karşılıklı Bloke",
  shared_capacity: "Paylaşımlı Kapasite",
  conditional: "Koşullu",
};

const TYPE_HELP: Record<ConflictRelationType, string> = {
  mutual_block: "Üye rampalardan biri doluyken diğerleri de bloke olur.",
  shared_capacity:
    "Rampalar tek fiziksel kapasiteyi paylaşır. (İlk sürümde karşılıklı bloke gibi davranır.)",
  conditional: "Yalnızca seçtiğiniz araç kategorileri geldiğinde grup devreye girer.",
};

export default function ConflictGroupsScreen() {
  const { colors } = useTheme();
  const session = useSession();
  const facilityId = session.activeFacilityId;
  const list = conflictGroups.useList(facilityId);
  const dockList = docks.useList(facilityId);
  const vehicles = vehicleCategories.useList(facilityId);
  const save = conflictGroups.useSave(facilityId);
  const deactivate = conflictGroups.useDeactivate(facilityId);

  const [editing, setEditing] = useState<ConflictGroupDto | null>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [relationType, setRelationType] = useState<ConflictRelationType>("mutual_block");
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [triggerVehicleIds, setTriggerVehicleIds] = useState<string[]>([]);
  const [isActive, setIsActive] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);

  const dockName = (id: string) => dockList.data?.find((d) => d.id === id)?.name ?? "?";
  const vehicleName = (id: string) =>
    vehicles.data?.find((v) => v.id === id)?.display_name ?? "?";

  function triggerSummary(group: ConflictGroupDto): string {
    const ids = group.trigger_condition_json?.vehicle_category_ids ?? [];
    if (group.relation_type !== "conditional" || ids.length === 0) return "Her zaman";
    return `${ids.map(vehicleName).join(" veya ")} geldiğinde`;
  }

  function openCreate() {
    setEditing(null);
    setName("");
    setRelationType("mutual_block");
    setMemberIds([]);
    setTriggerVehicleIds([]);
    setIsActive(true);
    setFormError(null);
    setOpen(true);
  }

  function openEdit(row: ConflictGroupDto) {
    setEditing(row);
    setName(row.name);
    setRelationType(row.relation_type);
    setMemberIds(row.member_dock_ids);
    setTriggerVehicleIds(row.trigger_condition_json?.vehicle_category_ids ?? []);
    setIsActive(row.is_active);
    setFormError(null);
    setOpen(true);
  }

  async function onSubmit() {
    setFormError(null);
    if (!name.trim()) {
      setFormError("Grup adı zorunludur.");
      return;
    }
    if (memberIds.length < 2) {
      setFormError("Çakışma grubu en az 2 rampa içermeli.");
      return;
    }
    if (relationType === "conditional" && triggerVehicleIds.length === 0) {
      setFormError("Koşullu grup için en az bir tetikleyici araç kategorisi seçin.");
      return;
    }
    try {
      await save.mutateAsync({
        id: editing?.id,
        body: {
          name,
          relation_type: relationType,
          member_dock_ids: memberIds,
          trigger_condition_json:
            relationType === "conditional"
              ? { vehicle_category_ids: triggerVehicleIds }
              : null,
          is_active: isActive,
        },
      });
      setOpen(false);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Kaydedilemedi");
    }
  }

  function onDeactivate(row: ConflictGroupDto) {
    Alert.alert(
      "Grubu pasifleştir",
      `"${row.name}" pasifleştirilecek. Grup, müsaitlik hesabında artık dikkate alınmaz.`,
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

  return (
    <>
      <ConfigList
        query={list}
        createLabel="Yeni Grup"
        onCreate={openCreate}
        description="Fiziksel rampa ilişkileri koda değil konfigürasyona yazılır. Aktif gruplar müsaitlik hesabında kardeş rampaları da kontrol eder."
        searchText={(r) => r.name}
        keyExtractor={(r) => r.id}
        emptyTitle="Çakışma grubu yok"
        emptyDescription='Örnek: "Rampa 1-2 bitişik; TIR yanaştığında ikisi birden bloke olur" senaryosu burada bir koşullu grupla tanımlanır.'
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
                  {row.name}
                </Text>
                <Text style={{ color: colors.mutedText, fontSize: 12 }}>
                  {TYPE_LABELS[row.relation_type]} · {triggerSummary(row)}
                </Text>
              </View>
              <ActiveBadge active={row.is_active} />
            </View>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4 }}>
              {row.member_dock_ids.map((id) => (
                <Badge key={id} label={dockName(id)} color={colors.mutedText} />
              ))}
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
        title={editing ? "Grubu Düzenle" : "Yeni Çakışma Grubu"}
      >
        <View style={{ gap: spacing.md }}>
          <Field
            label="Grup Adı"
            value={name}
            onChangeText={setName}
            placeholder='Örn. "Rampa 1-2 Bitişik Blok"'
          />
          <View style={{ gap: 6 }}>
            <Text style={{ color: colors.text, fontSize: 14, fontWeight: "500" }}>
              İlişki Tipi
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {(Object.keys(TYPE_LABELS) as ConflictRelationType[]).map((t) => (
                <Chip
                  key={t}
                  label={TYPE_LABELS[t]}
                  selected={relationType === t}
                  onPress={() => setRelationType(t)}
                />
              ))}
            </View>
            <Text style={{ color: colors.faintText, fontSize: 12 }}>
              {TYPE_HELP[relationType]}
            </Text>
          </View>

          <View style={{ gap: 6 }}>
            <Text style={{ color: colors.text, fontSize: 14, fontWeight: "500" }}>
              Üye Rampalar (en az 2)
            </Text>
            <MultiSelectChips
              options={(dockList.data ?? [])
                .filter((d) => d.is_active)
                .map((d) => ({ value: d.id, label: d.name }))}
              value={memberIds}
              onChange={setMemberIds}
            />
          </View>

          {relationType === "conditional" && (
            <View style={{ gap: 6 }}>
              <Text style={{ color: colors.text, fontSize: 14, fontWeight: "500" }}>
                Tetikleyici Araç Kategorileri
              </Text>
              <MultiSelectChips
                options={(vehicles.data ?? [])
                  .filter((v) => v.is_active)
                  .map((v) => ({ value: v.id, label: v.display_name }))}
                value={triggerVehicleIds}
                onChange={setTriggerVehicleIds}
              />
              {triggerVehicleIds.length > 0 && (
                <Text style={{ color: colors.accent, fontSize: 12 }}>
                  {triggerVehicleIds.map(vehicleName).join(" veya ")} geldiğinde bu grup
                  devreye girer; diğer araçlarda rampalar bağımsız çalışır.
                </Text>
              )}
            </View>
          )}

          <SwitchRow label="Aktif" value={isActive} onValueChange={setIsActive} />
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
