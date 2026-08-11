import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, Switch, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ApiError } from "@/api/client";
import {
  CARGO_WINDOW_LABELS,
  QUANTITY_UNIT_LABELS,
  type CargoWindow,
  formatDurationRange,
  resolveDurationRange,
} from "@/api/shared";
import {
  useCreateSupplierAppointment,
  useSupplierAvailability,
  useSupplierCatalog,
  useSupplierProfile,
} from "@/api/supplier";
import type { AppointmentDto, SeriesCreateResultDto } from "@/api/types";
import { Button, Card, Chip, ErrorState, Field, LoadingState } from "@/components/ui";
import { useTheme } from "@/theme/theme";
import { spacing } from "@/theme/tokens";
import { addDaysISO, dayLabel, timeInTz, todayISO } from "@/utils/format";

/**
 * Yeni randevu sihirbazı — web wizard'ın mobile-native karşılığı:
 * 3 adım (Ürün → Araç & Teslimat → Tarih & Özet), dokunulabilir chip/slot seçimi.
 * Aynı API contract: /supplier/availability/evaluate + POST /supplier/appointments.
 * Tekrarlayan seri de web ile aynı kurallar: yalnızca standart teslimat,
 * haftalık/2 haftalık/aylık, 2..12 (aylıkta 6) tekrar; hepsi-ya-hiç doğrulama.
 */

const STEPS = ["Ürün", "Araç & Teslimat", "Tarih & Özet"];

const FREQUENCY_LABELS = {
  weekly: "Her hafta",
  biweekly: "2 haftada bir",
  monthly: "Her ay",
} as const;
type Frequency = keyof typeof FREQUENCY_LABELS;

/** Ay ekleme — backend ile aynı kural: hedef ayda gün yoksa ayın son gününe kırpılır. */
function addMonthsClamped(base: Date, months: number): Date {
  const day = base.getDate();
  const target = new Date(base.getFullYear(), base.getMonth() + months, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(day, lastDay));
  return target;
}

function occurrenceDates(startDate: string, frequency: Frequency, count: number): Date[] {
  const base = new Date(`${startDate}T12:00:00`);
  return Array.from({ length: count }, (_, i) => {
    if (frequency === "weekly") return new Date(base.getTime() + i * 7 * 86_400_000);
    if (frequency === "biweekly") return new Date(base.getTime() + i * 14 * 86_400_000);
    return addMonthsClamped(base, i);
  });
}

export default function NewAppointmentWizard() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const catalog = useSupplierCatalog();
  const profile = useSupplierProfile();
  const create = useCreateSupplierAppointment();

  const [step, setStep] = useState(0);
  const [result, setResult] = useState<AppointmentDto | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Adım 1 — ürün
  const [productName, setProductName] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unit, setUnit] = useState("pallet");

  // Adım 2 — araç & teslimat
  const [vehicleOverrideId, setVehicleOverrideId] = useState<string | null>(null);
  const [plate, setPlate] = useState("");
  const [driver, setDriver] = useState("");
  const [isCargo, setIsCargo] = useState(false);
  const [cargoWindow, setCargoWindow] = useState<CargoWindow>("morning");

  // Adım 3 — zaman
  const [date, setDate] = useState(addDaysISO(todayISO(), 1));
  const [duration, setDuration] = useState<number | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);

  // Tekrarlayan seri (yalnızca standart teslimat; kargo ile birleşmez)
  const [recurringEnabled, setRecurringEnabled] = useState(false);
  const [recurringFrequency, setRecurringFrequency] = useState<Frequency>("weekly");
  const [recurringCount, setRecurringCount] = useState("4");
  const [seriesResult, setSeriesResult] = useState<SeriesCreateResultDto | null>(null);

  const categories = catalog.data?.product_categories ?? [];
  const vehicles = catalog.data?.vehicle_categories ?? [];
  const limits = catalog.data?.limits;
  const category = categories.find((c) => c.id === categoryId) ?? null;
  const defaultVehicleId = category?.default_vehicle_category_id ?? null;
  const effectiveVehicleId = vehicleOverrideId ?? defaultVehicleId;

  // Kategori aralığı x tedarikçi aralığı kesişimi (backend ile aynı kural).
  const durationRange = useMemo(
    () => (category ? resolveDurationRange(category, limits) : null),
    [category, limits],
  );
  const durationOptions = durationRange?.options ?? [];

  const effectiveDuration =
    duration && durationOptions.includes(duration) ? duration : durationOptions[0] ?? null;

  const availabilityParams =
    step === 2 && !isCargo && category && effectiveDuration
      ? {
          product_category_id: category.id,
          vehicle_category_id: effectiveVehicleId,
          target_date: date,
          duration_minutes: effectiveDuration,
        }
      : null;
  const availability = useSupplierAvailability(availabilityParams);
  const slots = availability.data ?? [];
  const tz = profile.data?.facility.timezone ?? "Europe/Istanbul";

  const selectedSlotData = slots.find((s) => s.start === selectedSlot) ?? null;
  const selectedAdvisories = selectedSlotData?.advisory_warnings ?? [];

  const qty = Math.max(1, parseInt(quantity, 10) || 1);
  const canNext =
    step === 0
      ? productName.trim().length > 0 && category !== null
      : step === 1
        ? isCargo || plate.trim().length > 0
        : isCargo || selectedSlot !== null;

  const dayOptions = useMemo(
    () => Array.from({ length: 14 }, (_, i) => addDaysISO(todayISO(), i + 1)),
    [],
  );

  // Web ile aynı kurallar: kargo iken seri kapalı; aylıkta en fazla 6 tekrar.
  const recurringActive = recurringEnabled && !isCargo;
  const maxOccurrences = recurringFrequency === "monthly" ? 6 : 12;
  const effectiveRecurringCount = Math.min(
    Math.max(parseInt(recurringCount, 10) || 2, 2),
    maxOccurrences,
  );
  const previewDates = recurringActive
    ? occurrenceDates(date, recurringFrequency, effectiveRecurringCount)
    : [];

  async function submit() {
    setSubmitError(null);
    const body = {
      product_category_id: categoryId,
      product_name: productName,
      quantity: qty,
      quantity_unit: unit,
      vehicle_category_id: vehicleOverrideId,
      license_plate: plate || null,
      driver_name: driver || null,
      delivery_type: isCargo ? "cargo" : "standard",
      cargo_window: isCargo ? cargoWindow : null,
      target_date: date,
      start_at: isCargo ? null : selectedSlot,
      duration_minutes: isCargo ? null : effectiveDuration,
      acknowledged_warning_codes: selectedAdvisories.map((w) => w.code),
      recurring: recurringActive
        ? { frequency: recurringFrequency, occurrence_count: effectiveRecurringCount }
        : undefined,
    };
    try {
      if (recurringActive) {
        const created = (await create.mutateAsync(body)) as unknown as SeriesCreateResultDto;
        setSeriesResult(created);
      } else {
        const created = (await create.mutateAsync(body)) as AppointmentDto;
        setResult(created);
      }
    } catch (err) {
      // Seri hatası: hangi tekrarın hangi tarihte neden düştüğü mesajda gelir.
      setSubmitError(
        err instanceof ApiError ? err.message : "Talep gönderilemedi; tekrar deneyin.",
      );
    }
  }

  function reset() {
    setStep(0);
    setResult(null);
    setSeriesResult(null);
    setProductName("");
    setCategoryId("");
    setQuantity("1");
    setVehicleOverrideId(null);
    setPlate("");
    setDriver("");
    setIsCargo(false);
    setSelectedSlot(null);
    setSubmitError(null);
    setRecurringEnabled(false);
    setRecurringFrequency("weekly");
    setRecurringCount("4");
  }

  if (catalog.isLoading)
    return <Center><LoadingState label="Katalog yükleniyor…" /></Center>;
  if (catalog.isError)
    return (
      <Center>
        <ErrorState message="Katalog yüklenemedi." onRetry={() => catalog.refetch()} />
      </Center>
    );

  // Seri başarı ekranı — web ile aynı içerik: sayaç + tüm tekrar tarihleri.
  if (seriesResult) {
    const first = seriesResult.appointments[0];
    const seriesApproved = first?.status === "approved";
    return (
      <Center>
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }}>
          <Card style={{ alignItems: "center", gap: spacing.md, margin: spacing.lg }}>
            <View
              style={{
                width: 64,
                height: 64,
                borderRadius: 32,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: seriesApproved
                  ? `${colors.status.approved}20`
                  : `${colors.status.pending}20`,
              }}
            >
              <Ionicons
                name="repeat"
                size={30}
                color={seriesApproved ? colors.status.approved : colors.status.pending}
              />
            </View>
            <Text style={{ color: colors.text, fontSize: 18, fontWeight: "700", textAlign: "center" }}>
              {seriesApproved
                ? `${seriesResult.occurrence_count} randevunuz onaylandı`
                : `${seriesResult.occurrence_count} randevu talebiniz onaya gönderildi`}
            </Text>
            <Text style={{ color: colors.mutedText, fontSize: 13, textAlign: "center" }}>
              {FREQUENCY_LABELS[seriesResult.frequency]} tekrarlayan seri oluşturuldu.
            </Text>
            <View style={{ gap: 4, alignSelf: "stretch" }}>
              {seriesResult.appointments.map((a) => (
                <Text key={a.id} style={{ color: colors.mutedText, fontSize: 13 }}>
                  <Text style={{ color: colors.text, fontWeight: "600" }}>
                    {a.occurrence_index}.
                  </Text>{" "}
                  {new Date(a.scheduled_start_at).toLocaleString("tr-TR", {
                    day: "2-digit",
                    month: "long",
                    hour: "2-digit",
                    minute: "2-digit",
                    timeZone: tz,
                  })}
                </Text>
              ))}
            </View>
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              <Button
                title="Randevularım"
                variant="secondary"
                onPress={() => {
                  reset();
                  router.replace("/supplier/appointments" as never);
                }}
                style={{ paddingHorizontal: 20 }}
              />
              <Button title="Yeni Talep" onPress={reset} style={{ paddingHorizontal: 20 }} />
            </View>
          </Card>
        </ScrollView>
      </Center>
    );
  }

  // Başarı ekranı
  if (result) {
    const approved = result.status === "approved";
    return (
      <Center>
        <Card style={{ alignItems: "center", gap: spacing.md, margin: spacing.lg }}>
          <View
            style={{
              width: 64,
              height: 64,
              borderRadius: 32,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: approved
                ? `${colors.status.approved}20`
                : `${colors.status.pending}20`,
            }}
          >
            <Ionicons
              name="checkmark"
              size={32}
              color={approved ? colors.status.approved : colors.status.pending}
            />
          </View>
          <Text style={{ color: colors.text, fontSize: 18, fontWeight: "700", textAlign: "center" }}>
            {approved ? "Randevunuz onaylandı" : "Talebiniz onaya gönderildi"}
          </Text>
          <Text style={{ color: colors.mutedText, fontSize: 13, textAlign: "center" }}>
            {result.product_name} ·{" "}
            {new Date(result.scheduled_start_at).toLocaleString("tr-TR", {
              day: "2-digit",
              month: "long",
              hour: "2-digit",
              minute: "2-digit",
              timeZone: tz,
            })}
          </Text>
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <Button
              title="Randevularım"
              variant="secondary"
              onPress={() => {
                reset();
                router.replace("/supplier/appointments" as never);
              }}
              style={{ paddingHorizontal: 20 }}
            />
            <Button title="Yeni Talep" onPress={reset} style={{ paddingHorizontal: 20 }} />
          </View>
        </Card>
      </Center>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        contentContainerStyle={{
          padding: spacing.lg,
          paddingTop: insets.top + spacing.md,
          paddingBottom: spacing.xl * 3,
          gap: spacing.lg,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={{ color: colors.text, fontSize: 24, fontWeight: "800" }}>
          Yeni Randevu
        </Text>

        {/* Stepper */}
        <View style={{ flexDirection: "row", gap: 6 }}>
          {STEPS.map((label, i) => (
            <View key={label} style={{ flex: 1, gap: 4 }}>
              <View
                style={{
                  height: 5,
                  borderRadius: 3,
                  backgroundColor: i <= step ? colors.accent : colors.border,
                }}
              />
              <Text
                numberOfLines={1}
                style={{
                  fontSize: 10,
                  fontWeight: "600",
                  color: i === step ? colors.accent : colors.faintText,
                }}
              >
                {i + 1}. {label}
              </Text>
            </View>
          ))}
        </View>

        {step === 0 && (
          <Card style={{ gap: spacing.lg }}>
            <Field
              label="Ürün / Malzeme Adı"
              value={productName}
              onChangeText={setProductName}
              placeholder="Örn. Buğday Unu Tip 650"
            />
            <View style={{ gap: 8 }}>
              <Text style={{ color: colors.text, fontSize: 14, fontWeight: "500" }}>
                Kategori
              </Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
                {categories.map((c) => (
                  <Chip
                    key={c.id}
                    label={c.display_name}
                    selected={categoryId === c.id}
                    onPress={() => {
                      setCategoryId(c.id);
                      setVehicleOverrideId(null);
                      setSelectedSlot(null);
                    }}
                  />
                ))}
              </View>
              <Text style={{ color: colors.faintText, fontSize: 12 }}>
                Yalnızca size tanımlı kategoriler listelenir. Uygun rampayı sistem seçer.
              </Text>
            </View>
            <View style={{ flexDirection: "row", gap: spacing.md }}>
              <View style={{ flex: 1 }}>
                <Field
                  label="Miktar"
                  value={quantity}
                  onChangeText={setQuantity}
                  keyboardType="number-pad"
                />
              </View>
              <View style={{ flex: 1, gap: 8 }}>
                <Text style={{ color: colors.text, fontSize: 14, fontWeight: "500" }}>
                  Birim
                </Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                  {(catalog.data?.quantity_units ?? []).map((u) => (
                    <Chip
                      key={u.value}
                      label={QUANTITY_UNIT_LABELS[u.value as never] ?? u.label}
                      selected={unit === u.value}
                      onPress={() => setUnit(u.value)}
                    />
                  ))}
                </View>
              </View>
            </View>
          </Card>
        )}

        {step === 1 && (
          <Card style={{ gap: spacing.lg }}>
            <View style={{ gap: 8 }}>
              <Text style={{ color: colors.text, fontSize: 14, fontWeight: "500" }}>
                Araç Kategorisi
              </Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
                {vehicles.map((v) => (
                  <Chip
                    key={v.id}
                    label={`${v.display_name}${v.id === defaultVehicleId ? " ✓" : ""}`}
                    selected={effectiveVehicleId === v.id}
                    onPress={() => {
                      setVehicleOverrideId(v.id);
                      setSelectedSlot(null);
                    }}
                  />
                ))}
              </View>
            </View>
            <Field label="Plaka" value={plate} onChangeText={setPlate} placeholder="34 ABC 123" autoCapitalize="characters" />
            <Field label="Sürücü (opsiyonel)" value={driver} onChangeText={setDriver} placeholder="Ad Soyad" />
            <View style={{ gap: 8 }}>
              <Text style={{ color: colors.text, fontSize: 14, fontWeight: "500" }}>
                Teslimat Tipi
              </Text>
              <View style={{ flexDirection: "row", gap: spacing.sm }}>
                <SelectCard
                  title="Standart"
                  subtitle="Kesin saat aralığı"
                  selected={!isCargo}
                  onPress={() => setIsCargo(false)}
                />
                <SelectCard
                  title="Kargo"
                  subtitle="Belirsiz varış"
                  selected={isCargo}
                  accent={colors.cargo}
                  onPress={() => setIsCargo(true)}
                />
              </View>
            </View>
            {isCargo && (
              <View style={{ gap: 8 }}>
                <Text style={{ color: colors.text, fontSize: 14, fontWeight: "500" }}>
                  Beklenen Pencere
                </Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
                  {(catalog.data?.cargo_windows ?? []).map((w) => (
                    <Chip
                      key={w}
                      label={CARGO_WINDOW_LABELS[w as CargoWindow] ?? w}
                      selected={cargoWindow === w}
                      onPress={() => setCargoWindow(w as CargoWindow)}
                    />
                  ))}
                </View>
              </View>
            )}
          </Card>
        )}

        {step === 2 && (
          <Card style={{ gap: spacing.lg }}>
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

            {!isCargo && (
              <>
                <View style={{ gap: 8 }}>
                  <Text style={{ color: colors.text, fontSize: 14, fontWeight: "500" }}>
                    Tahmini Süre
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
                  {durationRange?.conflicting ? (
                    <Text style={{ color: colors.destructive, fontSize: 12 }}>
                      Bu kategorinin süre aralığı size tanımlı limitlerle kesişmiyor.
                      Lütfen tesis yöneticisiyle iletişime geçin.
                    </Text>
                  ) : (
                    durationRange && (
                      <Text style={{ color: colors.mutedText, fontSize: 12 }}>
                        İzin verilen aralık:{" "}
                        {formatDurationRange(durationRange.min, durationRange.max)}
                      </Text>
                    )
                  )}
                </View>
                <View style={{ gap: 8 }}>
                  <Text style={{ color: colors.text, fontSize: 14, fontWeight: "500" }}>
                    Başlangıç Saati
                  </Text>
                  {availability.isLoading ? (
                    <LoadingState label="Müsaitlik hesaplanıyor…" />
                  ) : availability.isError ? (
                    <ErrorState message="Müsaitlik alınamadı." onRetry={() => availability.refetch()} />
                  ) : slots.length === 0 ? (
                    <Text style={{ color: colors.mutedText, fontSize: 13 }}>
                      Bu gün için uygun slot yok. Farklı bir gün deneyin.
                    </Text>
                  ) : (
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                      {slots.map((s) => (
                        <Chip
                          key={s.start}
                          label={timeInTz(s.start, tz)}
                          selected={selectedSlot === s.start}
                          disabled={s.status === "full"}
                          onPress={() => setSelectedSlot(s.start)}
                        />
                      ))}
                    </View>
                  )}
                  {selectedAdvisories.length > 0 && (
                    <Text style={{ color: colors.cargo, fontSize: 12 }}>
                      ⚠ Bu aralıkta aynı rampada kargo bekleniyor; talebiniz engellenmez.
                    </Text>
                  )}
                </View>
              </>
            )}

            {/* Tekrarlayan seri — web ile aynı: yalnızca standart teslimatta */}
            {!isCargo && (
              <View
                style={{
                  gap: spacing.sm,
                  borderTopWidth: 1,
                  borderTopColor: colors.border,
                  paddingTop: spacing.md,
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <Text style={{ color: colors.text, fontSize: 14, fontWeight: "500" }}>
                    Tekrarlayan randevu oluştur
                  </Text>
                  <Switch
                    value={recurringEnabled}
                    onValueChange={setRecurringEnabled}
                    trackColor={{ true: colors.accent }}
                  />
                </View>
                {recurringEnabled && (
                  <>
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                      {(Object.keys(FREQUENCY_LABELS) as Frequency[]).map((f) => (
                        <Chip
                          key={f}
                          label={FREQUENCY_LABELS[f]}
                          selected={recurringFrequency === f}
                          onPress={() => {
                            setRecurringFrequency(f);
                            if (f === "monthly" && (parseInt(recurringCount, 10) || 0) > 6) {
                              setRecurringCount("6");
                            }
                          }}
                        />
                      ))}
                    </View>
                    <Field
                      label={`Tekrar Sayısı (2–${maxOccurrences})`}
                      value={recurringCount}
                      onChangeText={setRecurringCount}
                      keyboardType="number-pad"
                    />
                    <View
                      style={{
                        gap: 4,
                        borderRadius: 12,
                        borderWidth: 1,
                        borderColor: colors.border,
                        padding: spacing.md,
                      }}
                    >
                      <Text style={{ color: colors.text, fontSize: 12, fontWeight: "700" }}>
                        {effectiveRecurringCount} randevu oluşturulacak:
                      </Text>
                      {previewDates.map((d, i) => (
                        <Text key={d.toISOString()} style={{ color: colors.mutedText, fontSize: 12 }}>
                          {i + 1}.{" "}
                          {d.toLocaleDateString("tr-TR", {
                            day: "2-digit",
                            month: "long",
                            year: "numeric",
                          })}
                        </Text>
                      ))}
                      <Text style={{ color: colors.faintText, fontSize: 11, marginTop: 2 }}>
                        Tüm tarihler kural setinden geçer; biri uygun değilse hiçbiri
                        oluşturulmaz ve hangi tarihin neden uygun olmadığı gösterilir.
                      </Text>
                    </View>
                  </>
                )}
              </View>
            )}

            {/* Özet */}
            <View
              style={{
                gap: 6,
                borderTopWidth: 1,
                borderTopColor: colors.border,
                paddingTop: spacing.md,
              }}
            >
              <Text style={{ color: colors.text, fontSize: 14, fontWeight: "700" }}>
                Talep Özeti
              </Text>
              <SummaryRow label="Ürün" value={productName || "—"} />
              <SummaryRow label="Kategori" value={category?.display_name ?? "—"} />
              <SummaryRow
                label="Miktar"
                value={`${qty} ${QUANTITY_UNIT_LABELS[unit as never] ?? unit}`}
              />
              <SummaryRow
                label="Teslimat"
                value={isCargo ? `Kargo · ${CARGO_WINDOW_LABELS[cargoWindow]}` : "Standart"}
              />
              <SummaryRow
                label="Tarih"
                value={`${dayLabel(date)}${
                  !isCargo && selectedSlot
                    ? ` · ${timeInTz(selectedSlot, tz)} (${effectiveDuration} dk)`
                    : ""
                }`}
              />
              {recurringActive && (
                <SummaryRow
                  label="Tekrar"
                  value={`${FREQUENCY_LABELS[recurringFrequency]} · ${effectiveRecurringCount} randevu`}
                />
              )}
              {limits?.auto_approval_enabled && (
                <Text style={{ color: colors.status.approved, fontSize: 12 }}>
                  Otomatik onay yetkiniz var; talebiniz anında onaylanır.
                </Text>
              )}
            </View>
          </Card>
        )}

        {submitError && (
          <Text style={{ color: colors.destructive, fontSize: 13 }}>{submitError}</Text>
        )}

        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          {step > 0 && (
            <Button
              title="Geri"
              variant="secondary"
              onPress={() => setStep(step - 1)}
              style={{ flex: 1 }}
            />
          )}
          {step < 2 ? (
            <Button
              title="Devam"
              disabled={!canNext}
              onPress={() => setStep(step + 1)}
              style={{ flex: 2 }}
            />
          ) : (
            <Button
              title="Randevu Talep Et"
              disabled={!canNext}
              loading={create.isPending}
              onPress={() => void submit()}
              style={{ flex: 2 }}
            />
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, justifyContent: "center", backgroundColor: colors.background }}>
      {children}
    </View>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
      <Text style={{ color: colors.mutedText, fontSize: 13 }}>{label}</Text>
      <Text style={{ color: colors.text, fontSize: 13, fontWeight: "500", flexShrink: 1 }}>
        {value}
      </Text>
    </View>
  );
}

function SelectCard({
  title,
  subtitle,
  selected,
  onPress,
  accent,
}: {
  title: string;
  subtitle: string;
  selected: boolean;
  onPress: () => void;
  accent?: string;
}) {
  const { colors } = useTheme();
  const tone = accent ?? colors.accent;
  return (
    <Pressable
      onPress={onPress}
      style={{
        flex: 1,
        padding: spacing.md,
        borderRadius: 12,
        borderWidth: 1.5,
        borderColor: selected ? tone : colors.border,
        backgroundColor: selected ? `${tone}12` : colors.card,
        gap: 2,
      }}
    >
      <Text style={{ color: selected ? tone : colors.text, fontSize: 14, fontWeight: "700" }}>
        {title}
      </Text>
      <Text style={{ color: colors.mutedText, fontSize: 11 }}>{subtitle}</Text>
    </Pressable>
  );
}
