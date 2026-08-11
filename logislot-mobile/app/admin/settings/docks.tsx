/** Rampalar CRUD — web (admin)/admin/settings/docks karşılığı. */

import { useState } from "react";
import { Alert, Text, View } from "react-native";
import { ApiError } from "@/api/client";
import {
  conflictGroups,
  docks,
  productCategories,
  vehicleCategories,
} from "@/api/resources";
import type { DockDto, WorkingHours } from "@/api/types";
import { useSession } from "@/auth/session";
import {
  ActiveBadge,
  ConfigList,
  DEFAULT_WORKING_HOURS,
  MultiSelectField,
  summarizeWorkingHours,
  WorkingHoursEditor,
} from "@/components/config";
import { AppModal, Badge, Button, Card, Field, KeyValueRow, SwitchRow } from "@/components/ui";
import { useTheme } from "@/theme/theme";
import { spacing } from "@/theme/tokens";

export default function DocksScreen() {
  const { colors } = useTheme();
  const session = useSession();
  const facilityId = session.activeFacilityId;
  const list = docks.useList(facilityId);
  const categories = productCategories.useList(facilityId);
  const vehicles = vehicleCategories.useList(facilityId);
  const groups = conflictGroups.useList(facilityId);
  const save = docks.useSave(facilityId);
  const deactivate = docks.useDeactivate(facilityId);

  const [editing, setEditing] = useState<DockDto | null>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [acceptedProducts, setAcceptedProducts] = useState<string[]>([]);
  const [acceptedVehicles, setAcceptedVehicles] = useState<string[]>([]);
  const [customHours, setCustomHours] = useState(false);
  const [hours, setHours] = useState<WorkingHours>(DEFAULT_WORKING_HOURS);
  const [formError, setFormError] = useState<string | null>(null);

  function openCreate() {
    setEditing(null);
    setName("");
    setNote("");
    setIsActive(true);
    setAcceptedProducts([]);
    setAcceptedVehicles([]);
    setCustomHours(false);
    setHours(DEFAULT_WORKING_HOURS);
    setFormError(null);
    setOpen(true);
  }

  function openEdit(row: DockDto) {
    setEditing(row);
    setName(row.name);
    setNote(row.note ?? "");
    setIsActive(row.is_active);
    setAcceptedProducts(row.accepted_product_category_ids);
    setAcceptedVehicles(row.accepted_vehicle_category_ids);
    setCustomHours(row.working_hours_json !== null);
    setHours(row.working_hours_json ?? DEFAULT_WORKING_HOURS);
    setFormError(null);
    setOpen(true);
  }

  async function onSubmit() {
    setFormError(null);
    if (!name.trim()) {
      setFormError("Ad zorunludur.");
      return;
    }
    try {
      await save.mutateAsync({
        id: editing?.id,
        body: {
          name,
          note: note || null,
          is_active: isActive,
          working_hours_json: customHours ? hours : null,
          accepted_product_category_ids: acceptedProducts,
          accepted_vehicle_category_ids: acceptedVehicles,
        },
      });
      setOpen(false);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Kaydedilemedi");
    }
  }

  function onDeactivate(row: DockDto) {
    Alert.alert(
      "Rampayı pasifleştir",
      `"${row.name}" pasifleştirilecek. Yeni randevularda aday olmaz; mevcut randevu geçmişi bozulmaz.`,
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

  const categoryName = (id: string) =>
    categories.data?.find((c) => c.id === id)?.display_name ?? "?";
  const vehicleName = (id: string) =>
    vehicles.data?.find((v) => v.id === id)?.display_name ?? "?";
  const groupsOf = (dockId: string) =>
    (groups.data ?? []).filter((g) => g.member_dock_ids.includes(dockId));

  return (
    <>
      <ConfigList
        query={list}
        createLabel="Yeni Rampa"
        onCreate={openCreate}
        description="Kabul edilen ürün/araç kategorileri, çalışma saatleri ve çakışma grubu üyelikleri müsaitlik hesabını doğrudan belirler."
        searchText={(r) => `${r.name} ${r.note ?? ""}`}
        keyExtractor={(r) => r.id}
        emptyTitle="Rampa yok"
        emptyDescription="Tedarikçi manuel rampa seçmez; sistem uygun rampayı burada tanımladığınız kısıtlara göre atar."
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
                {row.note && (
                  <Text style={{ color: colors.mutedText, fontSize: 12 }}>{row.note}</Text>
                )}
              </View>
              <ActiveBadge active={row.is_active} />
            </View>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4 }}>
              {row.accepted_product_category_ids.length === 0 ? (
                <Badge label="Tüm ürünler" color={colors.mutedText} />
              ) : (
                row.accepted_product_category_ids.map((id) => (
                  <Badge key={id} label={categoryName(id)} color={colors.accent} />
                ))
              )}
              {row.accepted_vehicle_category_ids.length === 0 ? (
                <Badge label="Tüm araçlar" color={colors.mutedText} />
              ) : (
                row.accepted_vehicle_category_ids.map((id) => (
                  <Badge key={id} label={vehicleName(id)} color={colors.primary} />
                ))
              )}
              {groupsOf(row.id).map((g) => (
                <Badge key={g.id} label={g.name} color={colors.cargo} />
              ))}
            </View>
            <KeyValueRow
              label="Çalışma Saatleri"
              value={summarizeWorkingHours(row.working_hours_json)}
            />
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
        title={editing ? "Rampayı Düzenle" : "Yeni Rampa"}
      >
        <View style={{ gap: spacing.md }}>
          <Field label="Ad" value={name} onChangeText={setName} placeholder="Örn. Rampa 4" />
          <Field
            label="Not"
            value={note}
            onChangeText={setNote}
            placeholder="Örn. TIR uyumlu"
          />

          <View style={{ gap: 6 }}>
            <Text style={{ color: colors.text, fontSize: 14, fontWeight: "500" }}>
              Kabul Edilen Ürün Kategorileri
            </Text>
            <MultiSelectField
              options={(categories.data ?? [])
                .filter((c) => c.is_active)
                .map((c) => ({ value: c.id, label: c.display_name }))}
              value={acceptedProducts}
              onChange={setAcceptedProducts}
              searchPlaceholder="Ürün kategorisi ara…"
            />
          </View>

          <View style={{ gap: 6 }}>
            <Text style={{ color: colors.text, fontSize: 14, fontWeight: "500" }}>
              Kabul Edilen Araç Kategorileri
            </Text>
            <MultiSelectField
              options={(vehicles.data ?? [])
                .filter((v) => v.is_active)
                .map((v) => ({ value: v.id, label: v.display_name }))}
              value={acceptedVehicles}
              onChange={setAcceptedVehicles}
              searchPlaceholder="Araç kategorisi ara…"
            />
          </View>

          <SwitchRow
            label="Özel çalışma saatleri tanımla"
            hint={customHours ? undefined : "Tesisin varsayılan çalışma profili uygulanır."}
            value={customHours}
            onValueChange={setCustomHours}
          />
          {customHours && <WorkingHoursEditor value={hours} onChange={setHours} />}

          <SwitchRow
            label="Aktif"
            hint="Pasif rampa müsaitlik ve akıllı atamada aday olmaz; geçmiş randevular korunur."
            value={isActive}
            onValueChange={setIsActive}
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
