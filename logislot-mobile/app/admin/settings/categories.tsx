/** Ürün Kategorileri CRUD — web (admin)/admin/settings/categories karşılığı. */

import { useState } from "react";
import { Alert, Text, View } from "react-native";
import { ApiError } from "@/api/client";
import { productCategories, vehicleCategories } from "@/api/resources";
import { DEFAULT_MAX_BLOCK_MINUTES, formatDurationRange } from "@/api/shared";
import type { ProductCategoryDto } from "@/api/types";
import { useSession } from "@/auth/session";
import { ActiveBadge, ConfigList } from "@/components/config";
import {
  AppModal,
  Button,
  Card,
  Field,
  KeyValueRow,
  PickerField,
  SwitchRow,
} from "@/components/ui";
import { useTheme } from "@/theme/theme";
import { spacing } from "@/theme/tokens";

// Backend ile aynı sınır: app/schemas/config.py -> MAX_BLOCK_MINUTES_CAP
const MAX_BLOCK_MINUTES_CAP = 1440;

export default function CategoriesScreen() {
  const { colors } = useTheme();
  const session = useSession();
  const facilityId = session.activeFacilityId;
  const list = productCategories.useList(facilityId);
  const vehicles = vehicleCategories.useList(facilityId);
  const save = productCategories.useSave(facilityId);
  const deactivate = productCategories.useDeactivate(facilityId);

  const [editing, setEditing] = useState<ProductCategoryDto | null>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [description, setDescription] = useState("");
  const [minBlock, setMinBlock] = useState("30");
  const [maxBlock, setMaxBlock] = useState("");
  const [defaultVehicleId, setDefaultVehicleId] = useState<string | null>(null);
  const [isActive, setIsActive] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);

  function openCreate() {
    setEditing(null);
    setName("");
    setDisplayName("");
    setDescription("");
    setMinBlock("30");
    // Üst sınır boş bırakılırsa sistem varsayılanı (120 dk) uygulanır; form da
    // bu değerle açılır ki kural görünür olsun.
    setMaxBlock(String(DEFAULT_MAX_BLOCK_MINUTES));
    setDefaultVehicleId(null);
    setIsActive(true);
    setFormError(null);
    setOpen(true);
  }

  function openEdit(row: ProductCategoryDto) {
    setEditing(row);
    setName(row.name);
    setDisplayName(row.display_name);
    setDescription(row.description ?? "");
    setMinBlock(String(row.min_block_minutes));
    setMaxBlock(row.max_block_minutes != null ? String(row.max_block_minutes) : "");
    setDefaultVehicleId(row.default_vehicle_category_id);
    setIsActive(row.is_active);
    setFormError(null);
    setOpen(true);
  }

  async function onSubmit() {
    setFormError(null);
    const minutes = parseInt(minBlock, 10);
    if (!name.trim() || !displayName.trim()) {
      setFormError("Ad ve görünen ad zorunludur.");
      return;
    }
    if (!Number.isInteger(minutes) || minutes <= 0 || minutes > MAX_BLOCK_MINUTES_CAP) {
      setFormError("Min. blokaj süresi 1–1440 dk arasında olmalı.");
      return;
    }
    // Boş = üst sınır yok (null gönderilir).
    const trimmedMax = maxBlock.trim();
    const maxMinutes = trimmedMax === "" ? null : parseInt(trimmedMax, 10);
    if (
      maxMinutes !== null &&
      (!Number.isInteger(maxMinutes) || maxMinutes <= 0 || maxMinutes > MAX_BLOCK_MINUTES_CAP)
    ) {
      setFormError("Maks. blokaj süresi 1–1440 dk arasında olmalı veya boş bırakılmalı.");
      return;
    }
    if (maxMinutes !== null && maxMinutes < minutes) {
      setFormError("Maksimum blokaj süresi, minimumdan küçük olamaz.");
      return;
    }
    try {
      await save.mutateAsync({
        id: editing?.id,
        body: {
          name,
          display_name: displayName,
          description: description || null,
          min_block_minutes: minutes,
          max_block_minutes: maxMinutes,
          default_vehicle_category_id: defaultVehicleId || null,
          is_active: isActive,
        },
      });
      setOpen(false);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Kaydedilemedi");
    }
  }

  function onDeactivate(row: ProductCategoryDto) {
    Alert.alert(
      "Kategoriyi pasifleştir",
      `"${row.display_name}" pasifleştirilecek. Geçmiş randevular etkilenmez; tedarikçiler yeni randevuda bu kategoriyi seçemez.`,
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

  const vehicleName = (id: string | null) =>
    vehicles.data?.find((v) => v.id === id)?.display_name ?? "—";

  return (
    <>
      <ConfigList
        query={list}
        createLabel="Yeni Kategori"
        onCreate={openCreate}
        description="Blokaj süresi aralığı ve varsayılan araç kategorisi randevu uygunluğunu doğrudan etkiler."
        searchText={(r) => `${r.name} ${r.display_name}`}
        keyExtractor={(r) => r.id}
        emptyTitle="Kategori bulunamadı"
        emptyDescription="Tedarikçiler yalnızca burada tanımlı ve kendilerine izinli kategorilerden randevu talep edebilir."
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
            <KeyValueRow
              label="Blokaj Süresi"
              value={formatDurationRange(
                row.min_block_minutes,
                row.max_block_minutes ?? DEFAULT_MAX_BLOCK_MINUTES,
              )}
            />
            <KeyValueRow
              label="Varsayılan Araç"
              value={vehicleName(row.default_vehicle_category_id)}
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
        title={editing ? "Kategoriyi Düzenle" : "Yeni Ürün Kategorisi"}
      >
        <View style={{ gap: spacing.md }}>
          <Field label="Ad" value={name} onChangeText={setName} placeholder="Örn. Soğuk Zincir" />
          <Field
            label="Tedarikçiye Görünen Ad"
            value={displayName}
            onChangeText={setDisplayName}
          />
          <Field
            label="Açıklama"
            value={description}
            onChangeText={setDescription}
            placeholder="Opsiyonel"
          />
          <Field
            label="Min. Blokaj Süresi (dk) — kalite kontrol gibi ek süreler dahildir"
            value={minBlock}
            onChangeText={setMinBlock}
            keyboardType="number-pad"
          />
          <Field
            label="Maks. Blokaj Süresi (dk) — boş bırakılırsa üst sınır uygulanmaz"
            value={maxBlock}
            onChangeText={setMaxBlock}
            keyboardType="number-pad"
            placeholder="Sınırsız"
          />
          <Text style={{ color: colors.mutedText, fontSize: 12 }}>
            Randevu oluştururken seçilebilen süreler bu aralıkla sınırlanır. Tedarikçi
            kartında ayrıca bir limit tanımlıysa, iki aralığın kesişimi uygulanır.
          </Text>
          <PickerField
            label="Varsayılan Araç Kategorisi (sihirbazı önceden doldurur)"
            value={defaultVehicleId}
            placeholder="— Seçilmedi —"
            options={(vehicles.data ?? [])
              .filter((v) => v.is_active)
              .map((v) => ({ value: v.id, label: v.display_name }))}
            onChange={(v) => setDefaultVehicleId(v)}
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
