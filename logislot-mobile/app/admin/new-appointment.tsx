/**
 * Admin "Yeni Randevu" — tedarikçi ADINA oluşturma.
 * Web components/appointments/admin-create-drawer.tsx karşılığı.
 *
 * Kurallar UI'da da yansır: tedarikçi seçilince yalnızca ONUN izinli
 * kategorileri listelenir, kategori varsayılan aracı getirir, süre
 * seçenekleri tedarikçi/kategori limitlerine göre filtrelenir. Rampa
 * atamasını varsayılan olarak engine yapar; manuel seçim de tam kural
 * setinden geçer (backend). Admin açtığı için randevu ONAYLI doğar.
 */

import { router } from "expo-router";
import { useMemo, useState } from "react";
import { Alert, ScrollView, Text, View } from "react-native";
import { useAdminAvailability, useAdminCreateAppointment } from "@/api/admin";
import { ApiError } from "@/api/client";
import { CARGO_WINDOW_LABELS, type CargoWindow } from "@/api/shared";
import { docks, productCategories, suppliers, vehicleCategories } from "@/api/resources";
import type { AppointmentDto, SeriesCreateResultDto } from "@/api/types";
import { useSession } from "@/auth/session";
import {
  Button,
  Card,
  Chip,
  ErrorState,
  Field,
  LoadingState,
  PickerField,
  SwitchRow,
} from "@/components/ui";
import { useTheme } from "@/theme/theme";
import { spacing } from "@/theme/tokens";
import { addDaysISO, dayLabel, timeInTz, todayISO } from "@/utils/format";

const DURATION_OPTIONS = [30, 45, 60, 90, 120, 150, 180, 240];
const CARGO_WINDOWS: CargoWindow[] = ["morning", "afternoon", "all_day"];
const UNITS = [
  { value: "pallet", label: "Palet" },
  { value: "piece", label: "Adet" },
  { value: "box", label: "Kutu" },
  { value: "carton", label: "Koli" },
];

export default function AdminNewAppointment() {
  const { colors } = useTheme();
  const session = useSession();
  const facilityId = session.activeFacilityId;
  const supplierList = suppliers.useList(facilityId);
  const categoryList = productCategories.useList(facilityId);
  const vehicleList = vehicleCategories.useList(facilityId);
  const dockList = docks.useList(facilityId);
  const create = useAdminCreateAppointment(facilityId);
  const tz = session.activeFacility?.timezone ?? "Europe/Istanbul";

  const [supplierId, setSupplierId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [productName, setProductName] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unit, setUnit] = useState("pallet");
  const [vehicleOverrideId, setVehicleOverrideId] = useState<string | null>(null);
  const [plate, setPlate] = useState("");
  const [driver, setDriver] = useState("");
  const [isCargo, setIsCargo] = useState(false);
  const [cargoWindow, setCargoWindow] = useState<CargoWindow>("morning");
  const [date, setDate] = useState(addDaysISO(todayISO(), 1));
  const [duration, setDuration] = useState<number | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [dockMode, setDockMode] = useState<"auto" | "manual">("auto");
  const [dockId, setDockId] = useState("");
  const [note, setNote] = useState("");
  const [recurringEnabled, setRecurringEnabled] = useState(false);
  const [frequency, setFrequency] = useState<"weekly" | "biweekly" | "monthly">("weekly");
  const [count, setCount] = useState("4");
  const [formError, setFormError] = useState<string | null>(null);

  const supplier = supplierList.data?.find((s) => s.id === supplierId) ?? null;
  const allowedCategories = (categoryList.data ?? []).filter(
    (c) => c.is_active && (supplier?.allowed_product_category_ids ?? []).includes(c.id),
  );
  const category = allowedCategories.find((c) => c.id === categoryId) ?? null;
  const effectiveVehicleId = vehicleOverrideId ?? category?.default_vehicle_category_id ?? null;

  // useMemo yok: React Compiler türetilmiş listeyi kendisi optimize eder.
  const minDuration = category
    ? Math.max(category.min_block_minutes, supplier?.min_block_minutes ?? 0)
    : 0;
  const maxDuration = supplier?.max_block_minutes ?? Infinity;
  const filteredDurations = category
    ? DURATION_OPTIONS.filter((d) => d >= minDuration && d <= maxDuration)
    : [];
  const durationOptions = category
    ? filteredDurations.length > 0
      ? filteredDurations
      : [minDuration]
    : [];
  const effectiveDuration =
    duration && durationOptions.includes(duration) ? duration : durationOptions[0] ?? null;

  const availability = useAdminAvailability(
    facilityId,
    !isCargo && supplier && category && effectiveDuration && date
      ? {
          supplier_id: supplier.id,
          product_category_id: category.id,
          vehicle_category_id: effectiveVehicleId,
          target_date: date,
          duration_minutes: effectiveDuration,
        }
      : null,
  );
  const slots = availability.data ?? [];
  const selectedSlotData = slots.find((s) => s.start === selectedSlot) ?? null;

  const dayOptions = useMemo(
    () => Array.from({ length: 14 }, (_, i) => addDaysISO(todayISO(), i)),
    [],
  );

  const maxCount = frequency === "monthly" ? 6 : 12;
  const effectiveCount = Math.min(Math.max(parseInt(count, 10) || 2, 2), maxCount);

  async function onSubmit() {
    setFormError(null);
    if (!supplier || !category || !productName.trim()) {
      setFormError("Tedarikçi, kategori ve ürün adı zorunludur.");
      return;
    }
    if (!isCargo && !selectedSlot) {
      setFormError("Başlangıç saati seçin.");
      return;
    }
    if (dockMode === "manual" && !dockId) {
      setFormError("Manuel modda rampa seçin.");
      return;
    }
    try {
      const result = await create.mutateAsync({
        supplier_id: supplier.id,
        product_category_id: category.id,
        product_name: productName,
        quantity: Math.max(1, parseInt(quantity, 10) || 1),
        quantity_unit: unit,
        vehicle_category_id: vehicleOverrideId,
        license_plate: plate || null,
        driver_name: driver || null,
        delivery_type: isCargo ? "cargo" : "standard",
        cargo_window: isCargo ? cargoWindow : null,
        target_date: date,
        start_at: isCargo ? null : selectedSlot,
        duration_minutes: isCargo ? null : effectiveDuration,
        auto_assign_dock: dockMode === "auto",
        dock_id: dockMode === "manual" ? dockId : null,
        note: note || null,
        recurring:
          recurringEnabled && !isCargo
            ? { frequency, occurrence_count: effectiveCount }
            : undefined,
      });
      const isSeries = "series_id" in (result as SeriesCreateResultDto);
      Alert.alert(
        "Oluşturuldu",
        isSeries
          ? `${(result as SeriesCreateResultDto).occurrence_count} onaylı randevu oluşturuldu; tedarikçiye bildirim gönderildi.`
          : `Randevu onaylı olarak oluşturuldu (${(result as AppointmentDto).product_name}); tedarikçiye bildirim gönderildi.`,
        [{ text: "Tamam", onPress: () => router.back() }],
      );
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Randevu oluşturulamadı");
    }
  }

  if (supplierList.isLoading)
    return (
      <View style={{ flex: 1, justifyContent: "center", backgroundColor: colors.background }}>
        <LoadingState />
      </View>
    );
  if (supplierList.isError)
    return (
      <View style={{ flex: 1, justifyContent: "center", backgroundColor: colors.background }}>
        <ErrorState
          message="Tedarikçiler yüklenemedi."
          onRetry={() => supplierList.refetch()}
        />
      </View>
    );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 64 }}
        keyboardShouldPersistTaps="handled"
      >
        <PickerField
          label="Tedarikçi"
          value={supplierId || null}
          placeholder="— Tedarikçi seçin —"
          options={(supplierList.data ?? [])
            .filter((s) => s.is_active)
            .map((s) => ({ value: s.id, label: s.company_name }))}
          onChange={(v) => {
            setSupplierId(v);
            setCategoryId("");
            setVehicleOverrideId(null);
            setSelectedSlot(null);
          }}
        />

        {supplier && (
          <Card style={{ gap: spacing.md }}>
            <PickerField
              label="Kategori (yalnızca tedarikçinin izinlileri)"
              value={categoryId || null}
              options={allowedCategories.map((c) => ({ value: c.id, label: c.display_name }))}
              onChange={(v) => {
                setCategoryId(v);
                setVehicleOverrideId(null);
                setSelectedSlot(null);
              }}
            />
            <Field
              label="Ürün Adı"
              value={productName}
              onChangeText={setProductName}
              placeholder="Örn. Acil teslimat"
            />
            <View style={{ flexDirection: "row", gap: spacing.md }}>
              <View style={{ flex: 1 }}>
                <Field
                  label="Miktar"
                  value={quantity}
                  onChangeText={setQuantity}
                  keyboardType="number-pad"
                />
              </View>
              <View style={{ flex: 1 }}>
                <PickerField
                  label="Birim"
                  value={unit}
                  options={UNITS}
                  onChange={setUnit}
                />
              </View>
            </View>
            <PickerField
              label="Araç"
              value={effectiveVehicleId}
              placeholder="—"
              options={(vehicleList.data ?? [])
                .filter((v) => v.is_active)
                .map((v) => ({ value: v.id, label: v.display_name }))}
              onChange={(v) => {
                setVehicleOverrideId(v || null);
                setSelectedSlot(null);
              }}
            />
            <View style={{ flexDirection: "row", gap: spacing.md }}>
              <View style={{ flex: 1 }}>
                <Field
                  label="Plaka"
                  value={plate}
                  onChangeText={setPlate}
                  placeholder="34 ABC 123"
                  autoCapitalize="characters"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Field
                  label="Sürücü"
                  value={driver}
                  onChangeText={setDriver}
                  placeholder="Ad Soyad"
                />
              </View>
            </View>

            <View style={{ gap: 8 }}>
              <Text style={{ color: colors.text, fontSize: 14, fontWeight: "500" }}>
                Teslimat Tipi
              </Text>
              <View style={{ flexDirection: "row", gap: spacing.sm }}>
                <Chip label="Standart" selected={!isCargo} onPress={() => setIsCargo(false)} />
                <Chip
                  label="Kargo"
                  selected={isCargo}
                  onPress={() => {
                    setIsCargo(true);
                    setRecurringEnabled(false);
                  }}
                />
              </View>
            </View>

            <View style={{ gap: 8 }}>
              <Text style={{ color: colors.text, fontSize: 14, fontWeight: "500" }}>Gün</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={{ flexDirection: "row", gap: 6 }}>
                  {dayOptions.map((d) => (
                    <Chip
                      key={d}
                      label={dayLabel(d)}
                      selected={date === d}
                      onPress={() => {
                        setDate(d);
                        setSelectedSlot(null);
                      }}
                    />
                  ))}
                </View>
              </ScrollView>
            </View>

            {isCargo ? (
              <View style={{ gap: 8 }}>
                <Text style={{ color: colors.text, fontSize: 14, fontWeight: "500" }}>
                  Beklenen Pencere
                </Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                  {CARGO_WINDOWS.map((w) => (
                    <Chip
                      key={w}
                      label={CARGO_WINDOW_LABELS[w]}
                      selected={cargoWindow === w}
                      onPress={() => setCargoWindow(w)}
                    />
                  ))}
                </View>
                <Text style={{ color: colors.faintText, fontSize: 12 }}>
                  Kargo kesin slot değil, tahmini pencere ayırır; planlamacıya takvimde uyarı
                  gösterilir.
                </Text>
              </View>
            ) : (
              category && (
                <>
                  <View style={{ gap: 8 }}>
                    <Text style={{ color: colors.text, fontSize: 14, fontWeight: "500" }}>
                      Süre
                    </Text>
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                      {durationOptions.map((d) => (
                        <Chip
                          key={d}
                          label={`${d} dk`}
                          selected={effectiveDuration === d}
                          onPress={() => {
                            setDuration(d);
                            setSelectedSlot(null);
                          }}
                        />
                      ))}
                    </View>
                  </View>
                  <View style={{ gap: 8 }}>
                    <Text style={{ color: colors.text, fontSize: 14, fontWeight: "500" }}>
                      Başlangıç Saati
                    </Text>
                    {availability.isLoading ? (
                      <LoadingState label="Müsaitlik hesaplanıyor…" />
                    ) : slots.length === 0 ? (
                      <Text style={{ color: colors.mutedText, fontSize: 13 }}>
                        Bu gün için uygun slot yok.
                      </Text>
                    ) : (
                      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                        {slots.map((s) => (
                          <Chip
                            key={s.start}
                            label={`${timeInTz(s.start, tz)}${
                              s.advisory_warnings.length > 0 ? " ⚠" : ""
                            }`}
                            selected={selectedSlot === s.start}
                            disabled={s.status === "full"}
                            onPress={() => setSelectedSlot(s.start)}
                          />
                        ))}
                      </View>
                    )}
                    {selectedSlotData && selectedSlotData.advisory_warnings.length > 0 && (
                      <Text style={{ color: colors.cargo, fontSize: 12 }}>
                        ⚠ Bu aralıkta kargo bekleniyor — engel değildir, farkındalık içindir.
                      </Text>
                    )}
                  </View>
                </>
              )
            )}

            <View style={{ gap: 8 }}>
              <Text style={{ color: colors.text, fontSize: 14, fontWeight: "500" }}>Rampa</Text>
              <View style={{ flexDirection: "row", gap: spacing.sm }}>
                <Chip
                  label="Otomatik ata"
                  selected={dockMode === "auto"}
                  onPress={() => setDockMode("auto")}
                />
                <Chip
                  label="Manuel seç"
                  selected={dockMode === "manual"}
                  onPress={() => setDockMode("manual")}
                />
              </View>
              {dockMode === "manual" && (
                <PickerField
                  value={dockId || null}
                  placeholder="— Rampa —"
                  options={(dockList.data ?? [])
                    .filter((d) => d.is_active)
                    .map((d) => ({ value: d.id, label: d.name }))}
                  onChange={setDockId}
                />
              )}
              <Text style={{ color: colors.faintText, fontSize: 12 }}>
                Manuel seçimde de uyumluluk ve çakışma kuralları tam uygulanır.
              </Text>
            </View>

            {!isCargo && (
              <View
                style={{
                  gap: spacing.sm,
                  borderTopWidth: 1,
                  borderTopColor: colors.border,
                  paddingTop: spacing.md,
                }}
              >
                <SwitchRow
                  label="Tekrarlayan randevu oluştur"
                  value={recurringEnabled}
                  onValueChange={setRecurringEnabled}
                />
                {recurringEnabled && (
                  <>
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                      {(
                        [
                          ["weekly", "Her hafta"],
                          ["biweekly", "2 haftada bir"],
                          ["monthly", "Her ay"],
                        ] as const
                      ).map(([f, label]) => (
                        <Chip
                          key={f}
                          label={label}
                          selected={frequency === f}
                          onPress={() => {
                            setFrequency(f);
                            if (f === "monthly" && (parseInt(count, 10) || 0) > 6) setCount("6");
                          }}
                        />
                      ))}
                    </View>
                    <Field
                      label={`Tekrar Sayısı (en fazla ${maxCount})`}
                      value={count}
                      onChangeText={setCount}
                      keyboardType="number-pad"
                    />
                    <Text style={{ color: colors.faintText, fontSize: 12 }}>
                      Tüm tarihler kural setinden geçer; biri uygun değilse hiçbiri
                      oluşturulmaz. Admin açtığı için tüm randevular onaylı doğar.
                    </Text>
                  </>
                )}
              </View>
            )}

            <Field
              label="Not (opsiyonel — denetim kaydına işlenir)"
              value={note}
              onChangeText={setNote}
              placeholder='Örn. "Telefonla oluşturuldu"'
            />
          </Card>
        )}

        {formError && (
          <Text style={{ color: colors.destructive, fontSize: 13 }}>{formError}</Text>
        )}
        <Button
          title={create.isPending ? "Oluşturuluyor…" : "Randevu Oluştur"}
          loading={create.isPending}
          disabled={!supplier}
          onPress={() => void onSubmit()}
        />
      </ScrollView>
    </View>
  );
}
