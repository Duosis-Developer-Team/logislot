/** Araç Kategorileri CRUD — web (admin)/admin/settings/vehicle-categories karşılığı. */

import { useState } from "react";
import { Alert, Text, View } from "react-native";
import { ApiError } from "@/api/client";
import { vehicleCategories } from "@/api/resources";
import type { VehicleCategoryDto } from "@/api/types";
import { useSession } from "@/auth/session";
import { ActiveBadge, ConfigList } from "@/components/config";
import { AppModal, Button, Card, Field, SwitchRow } from "@/components/ui";
import { useTheme } from "@/theme/theme";
import { spacing } from "@/theme/tokens";

export default function VehicleCategoriesScreen() {
  const { colors } = useTheme();
  const session = useSession();
  const facilityId = session.activeFacilityId;
  const list = vehicleCategories.useList(facilityId);
  const save = vehicleCategories.useSave(facilityId);
  const deactivate = vehicleCategories.useDeactivate(facilityId);

  const [editing, setEditing] = useState<VehicleCategoryDto | null>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [description, setDescription] = useState("");
  const [physicalNote, setPhysicalNote] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);

  function openCreate() {
    setEditing(null);
    setName("");
    setDisplayName("");
    setDescription("");
    setPhysicalNote("");
    setIsActive(true);
    setFormError(null);
    setOpen(true);
  }

  function openEdit(row: VehicleCategoryDto) {
    setEditing(row);
    setName(row.name);
    setDisplayName(row.display_name);
    setDescription(row.description ?? "");
    setPhysicalNote(row.physical_note ?? "");
    setIsActive(row.is_active);
    setFormError(null);
    setOpen(true);
  }

  async function onSubmit() {
    setFormError(null);
    if (!name.trim() || !displayName.trim()) {
      setFormError("Ad ve görünen ad zorunludur.");
      return;
    }
    try {
      await save.mutateAsync({
        id: editing?.id,
        body: {
          name,
          display_name: displayName,
          description: description || null,
          physical_note: physicalNote || null,
          is_active: isActive,
        },
      });
      setOpen(false);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Kaydedilemedi");
    }
  }

  function onDeactivate(row: VehicleCategoryDto) {
    Alert.alert(
      "Araç kategorisini pasifleştir",
      `"${row.display_name}" pasifleştirilecek. Bu kategoriye bağlı rampa uyumlulukları ve varsayılanlar yeni randevularda kullanılmaz.`,
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
        createLabel="Yeni Araç Kategorisi"
        onCreate={openCreate}
        description="Araç kategorisi birinci sınıf varlıktır: rampa uyumluluğu ve çakışma grubu tetikleri buna bağlanır."
        searchText={(r) => `${r.name} ${r.display_name}`}
        keyExtractor={(r) => r.id}
        emptyTitle="Araç kategorisi yok"
        emptyDescription="TIR, Kamyonet, Frigorifik gibi tipler tanımlayın; rampalar hangi araçları kabul edeceğini bunlara göre bilir."
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
                  {row.display_name}
                </Text>
                <Text style={{ color: colors.mutedText, fontSize: 12 }}>{row.name}</Text>
              </View>
              <ActiveBadge active={row.is_active} />
            </View>
            {row.physical_note && (
              <Text style={{ color: colors.mutedText, fontSize: 13 }}>{row.physical_note}</Text>
            )}
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
        title={editing ? "Araç Kategorisini Düzenle" : "Yeni Araç Kategorisi"}
      >
        <View style={{ gap: spacing.md }}>
          <Field
            label="Ad"
            value={name}
            onChangeText={setName}
            placeholder="Örn. Frigorifik TIR"
          />
          <Field label="Görünen Ad" value={displayName} onChangeText={setDisplayName} />
          <Field
            label="Açıklama"
            value={description}
            onChangeText={setDescription}
            placeholder="Opsiyonel"
          />
          <Field
            label="Fiziksel Not (bilgilendirici; zorlayıcı kural üretmez)"
            value={physicalNote}
            onChangeText={setPhysicalNote}
            placeholder='Örn. "uzun şasi, geri manevra alanı gerekir"'
          />
          {editing && <SwitchRow label="Aktif" value={isActive} onValueChange={setIsActive} />}
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
