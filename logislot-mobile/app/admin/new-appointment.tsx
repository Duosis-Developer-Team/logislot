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
import { useAdminAvailability, useAdminCreateAppointment, useAppointmentForm } from "@/api/admin";
import { ApiError } from "@/api/client";
import { useDurationEvaluate, useDurationPolicy } from "@/api/duration";
import { useAdminMinuteUsage } from "@/api/supplier-limits";
import {
  CARGO_WINDOW_LABELS,
  type CargoWindow,
  QUANTITY_UNIT_LABELS,
  QUANTITY_UNITS,
  resolveDurationRange,
} from "@/api/shared";
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
import { DurationChips, withSuggested } from "@/components/duration";
import { MinuteUsageCard, exceededUsage } from "@/components/minute-limits";
import { OrderNumbersField } from "@/components/order-numbers";
import {
  DescriptionField,
  descriptionMissing,
  descriptionPayload,
} from "@/components/description";
import { DriverIdField, driverIdError, driverIdErrorText } from "@/components/driver-id";
import { useTheme } from "@/theme/theme";
import { spacing } from "@/theme/tokens";
import { addDaysISO, dayLabel, timeInTz, todayISO } from "@/utils/format";
import { RecurrenceEditor } from "@/components/recurrence-editor";
import {
  type RecurrenceRule,
  defaultRule,
  generateOccurrenceDates,
  toPayload as toRecurrencePayload,
} from "@/lib/recurrence";

const CARGO_WINDOWS: CargoWindow[] = ["morning", "afternoon", "all_day"];
const UNITS = QUANTITY_UNITS.map((u) => ({ value: u, label: QUANTITY_UNIT_LABELS[u] }));

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
  const [orderNumbers, setOrderNumbers] = useState<string[]>([]);
  const form = useAppointmentForm(session.activeFacilityId);
  const orderMode = form.data?.order_numbers ?? "hidden";
  const driverIdMode = form.data?.driver_id_number ?? "hidden";
  const descriptionMode = form.data?.description ?? "hidden";
  const [description, setDescription] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unit, setUnit] = useState("pallet");
  const [vehicleOverrideId, setVehicleOverrideId] = useState<string | null>(null);
  const [plate, setPlate] = useState("");
  const [driver, setDriver] = useState("");
  const [driverId, setDriverId] = useState("");
  const [cargoSelected, setIsCargo] = useState(false);
  const [cargoWindow, setCargoWindow] = useState<CargoWindow>("morning");
  const [date, setDate] = useState(addDaysISO(todayISO(), 1));
  const [duration, setDuration] = useState<number | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [dockMode, setDockMode] = useState<"auto" | "manual">("auto");
  const [dockId, setDockId] = useState("");
  const [note, setNote] = useState("");
  const [recurringEnabled, setRecurringEnabled] = useState(false);
  const [recurrence, setRecurrence] = useState<RecurrenceRule>(defaultRule);
  const [formError, setFormError] = useState<string | null>(null);

  const supplier = supplierList.data?.find((s) => s.id === supplierId) ?? null;
  // Kargo tedarikçi bazında açılır; kapalı tedarikçide seçenek görünmez ve
  // tedarikçi değişince önceki seçim otomatik düşer.
  const cargoAllowed = supplier?.cargo_enabled ?? false;
  const isCargo = cargoSelected && cargoAllowed;
  const allowedCategories = (categoryList.data ?? []).filter(
    (c) => c.is_active && (supplier?.allowed_product_category_ids ?? []).includes(c.id),
  );
  const category = allowedCategories.find((c) => c.id === categoryId) ?? null;
  const effectiveVehicleId = vehicleOverrideId ?? category?.default_vehicle_category_id ?? null;

  // useMemo yok: React Compiler türetilmiş listeyi kendisi optimize eder.
  // Kategori aralığı x tedarikçi aralığı kesişimi (backend ile aynı kural).
  const durationRange = category ? resolveDurationRange(category, supplier) : null;
  // Süre kuralları: tesis "tedarikçi seçer" dışındaysa hesaplanan süre
  // varsayılan gelir; yönetim her modda değiştirebilir (farklı seçim "elle"
  // kaydedilir ve kategori sınırlarına tabidir).
  const qty = Math.max(1, parseInt(quantity, 10) || 1);
  const durationPolicy = useDurationPolicy(facilityId);
  const rulesActive = (durationPolicy.data?.mode ?? "supplier") !== "supplier";
  const estimateQuery = useDurationEvaluate(
    facilityId,
    rulesActive && category
      ? [
          {
            product_category_id: category.id,
            vehicle_category_id: effectiveVehicleId,
            quantity: qty,
            quantity_unit: unit,
          },
        ]
      : null,
  );
  const estimate = rulesActive ? estimateQuery.data?.results[0] ?? null : null;
  const suggestedMinutes = estimate?.minutes ?? null;
  const durationOptions = withSuggested(durationRange?.options ?? [], suggestedMinutes);
  const effectiveDuration =
    duration && durationOptions.includes(duration)
      ? duration
      : suggestedMinutes ?? durationOptions[0] ?? null;
  // Kural süresi kategori aralığı dışında da geçerlidir.
  const durationBlocked =
    durationRange?.conflicting === true &&
    (suggestedMinutes === null || effectiveDuration !== suggestedMinutes);
  // Tedarikçinin süre limitleri yönetim adına oluşturmada da geçerli (sunucu zorlar).
  const minuteUsage = useAdminMinuteUsage(facilityId, supplier?.id ?? null, date || null);
  const limitExceeded =
    !isCargo && exceededUsage(minuteUsage.data?.usage, effectiveDuration) !== null;

  const availability = useAdminAvailability(
    facilityId,
    !isCargo && supplier && category && effectiveDuration && date
      ? {
          supplier_id: supplier.id,
          product_category_id: category.id,
          vehicle_category_id: effectiveVehicleId,
          target_date: date,
          duration_minutes: effectiveDuration,
          quantity: qty,
          quantity_unit: unit,
        }
      : null,
  );
  const slots = availability.data ?? [];
  const selectedSlotData = slots.find((s) => s.start === selectedSlot) ?? null;

  /**
   * Manuel secimde listelenecek rampalar (web ile ayni kural).
   *
   * Uyumluluk: rampanin kabul ettigi urun kategorileri (BOS liste = hepsi).
   * Doluluk: secili slotun `candidate_dock_ids` degeri — SUNUCU karari.
   * Uyumsuz rampa listeye girmez; uyumlu ama dolu olan "dolu" etiketiyle kalir.
   */
  const eligibleDocks = useMemo(() => {
    const all = (dockList.data ?? []).filter((d) => d.is_active);
    const compatible = categoryId
      ? all.filter(
          (d) =>
            d.accepted_product_category_ids.length === 0 ||
            d.accepted_product_category_ids.includes(categoryId),
        )
      : all;
    const freeIds = selectedSlotData ? new Set(selectedSlotData.candidate_dock_ids) : null;
    return compatible.map((d) => ({
      ...d,
      available: freeIds === null ? true : freeIds.has(d.id),
    }));
  }, [dockList.data, categoryId, selectedSlotData]);

  // Kategori/slot degisince onceki secim gecersizlesebilir. State'i efektle
  // duzeltmek yerine TURETIYORUZ: bayat bir id hicbir zaman gonderilmez.
  const effectiveDockId =
    dockId && eligibleDocks.some((d) => d.id === dockId && d.available) ? dockId : "";

  const dayOptions = useMemo(
    () => Array.from({ length: 14 }, (_, i) => addDaysISO(todayISO(), i)),
    [],
  );


  async function onSubmit() {
    setFormError(null);
    if (!supplier || !category || !productName.trim()) {
      setFormError("Tedarikçi, kategori ve ürün adı zorunludur.");
      return;
    }
    if (orderMode === "required" && orderNumbers.length === 0) {
      setFormError("En az bir sipariş numarası girin.");
      return;
    }
    if (descriptionMissing(descriptionMode, description)) {
      setFormError("Açıklama girin.");
      return;
    }
    const idError = driverIdError(driverIdMode, driverId);
    if (idError) {
      setFormError(driverIdErrorText(idError));
      return;
    }
    if (!isCargo && !selectedSlot) {
      setFormError("Başlangıç saati seçin.");
      return;
    }
    if (dockMode === "manual" && !effectiveDockId) {
      setFormError("Manuel modda rampa seçin.");
      return;
    }
    if (recurringEnabled && !isCargo && generateOccurrenceDates(date, recurrence).error) {
      setFormError("Tekrar ayarlarını kontrol edin.");
      return;
    }
    try {
      const result = await create.mutateAsync({
        supplier_id: supplier.id,
        product_category_id: category.id,
        product_name: productName,
        order_numbers: orderMode === "hidden" ? [] : orderNumbers,
        description: descriptionPayload(descriptionMode, description),
        quantity: qty,
        quantity_unit: unit,
        vehicle_category_id: vehicleOverrideId,
        license_plate: plate || null,
        driver_name: driver || null,
        driver_id_number: driverIdMode === "hidden" ? null : driverId.trim() || null,
        delivery_type: isCargo ? "cargo" : "standard",
        cargo_window: isCargo ? cargoWindow : null,
        target_date: date,
        start_at: isCargo ? null : selectedSlot,
        duration_minutes: isCargo ? null : effectiveDuration,
        auto_assign_dock: dockMode === "auto",
        dock_id: dockMode === "manual" ? effectiveDockId : null,
        note: note || null,
        recurring:
          recurringEnabled && !isCargo
            ? { recurrence: toRecurrencePayload(recurrence, date) }
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
              label="Kategori"
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
            <DescriptionField
              mode={descriptionMode}
              value={description}
              onChange={setDescription}
              maxLength={form.data?.description_max_length}
            />
            <OrderNumbersField
              mode={orderMode}
              value={orderNumbers}
              onChange={setOrderNumbers}
              max={form.data?.max_order_numbers ?? 20}
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
            <DriverIdField mode={driverIdMode} value={driverId} onChange={setDriverId} />

            <View style={{ gap: 8 }}>
              <Text style={{ color: colors.text, fontSize: 14, fontWeight: "500" }}>
                Teslimat Tipi
              </Text>
              <View style={{ flexDirection: "row", gap: spacing.sm }}>
                <Chip label="Standart" selected={!isCargo} onPress={() => setIsCargo(false)} />
                {cargoAllowed && (
                  <Chip
                    label="Kargo"
                    selected={isCargo}
                    onPress={() => {
                      setIsCargo(true);
                      setRecurringEnabled(false);
                    }}
                  />
                )}
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
              </View>
            ) : (
              category && (
                <>
                  <View style={{ gap: 8 }}>
                    <DurationChips
                      options={durationOptions}
                      value={effectiveDuration}
                      suggested={suggestedMinutes}
                      estimate={estimate}
                      onChange={(d) => {
                        setDuration(d);
                        setSelectedSlot(null);
                      }}
                    />
                    {durationBlocked && (
                      <Text style={{ color: colors.destructive, fontSize: 12 }}>
                        Bu kategorinin süre aralığı tedarikçinin limitleriyle kesişmiyor.
                        Ayarlardan limitlerden birini güncelleyin.
                      </Text>
                    )}
                    <MinuteUsageCard
                      usage={minuteUsage.data?.usage}
                      requested={effectiveDuration}
                      title="Tedarikçinin süre limiti"
                    />
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
                  value={effectiveDockId || null}
                  placeholder="— Rampa —"
                  options={eligibleDocks
                    .filter((d) => d.available)
                    .map((d) => ({ value: d.id, label: d.name }))}
                  onChange={setDockId}
                />
              )}
              <Text style={{ color: colors.faintText, fontSize: 12 }}>
                {dockMode === "manual"
                  ? "Yalnızca seçili ürün kategorisiyle uyumlu ve o saatte boş rampalar listelenir."
                  : "Uygun rampalar arasından o saatte boş ve gün içi en az dolu olan atanır."}
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
                  <RecurrenceEditor
                    startDate={date}
                    value={recurrence}
                    onChange={setRecurrence}
                    footer="Tüm tarihler kural setinden geçer; biri uygun değilse hiçbiri oluşturulmaz. Admin açtığı için tüm randevular onaylı doğar."
                  />
                )}
              </View>
            )}

            <Field
              label="Not"
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
          // Çakışan limitlerde geçerli bir süre yok; sunucuya boşuna gitme.
          disabled={!supplier || (!isCargo && durationBlocked) || limitExceeded}
          onPress={() => void onSubmit()}
        />
      </ScrollView>
    </View>
  );
}
