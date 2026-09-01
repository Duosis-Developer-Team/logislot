"use client";

import { Check, ChevronLeft, ChevronRight, Package } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import {
  CARGO_WINDOW_LABELS,
  SLOT_STATUS_LABELS,
  type CargoWindow,
  resolveDurationRange,
} from "@logislot/shared";
import { ErrorState, LoadingState } from "@/components/config/states";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Input, Label, Select } from "@/components/ui/input";
import { ApiError } from "@/lib/api/client";
import {
  useCreateSupplierAppointment,
  useSupplierAvailability,
  useSupplierCatalog,
  useSupplierProfile,
} from "@/lib/api/supplier";
import { Switch } from "@/components/ui/switch";
import type { AppointmentDto, SeriesCreateResultDto } from "@/lib/api/types";
import { useApiErrorMessage } from "@/lib/i18n/api-error";
import { useT } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";

/**
 * v2.0 sihirbazi — GERCEK API akisi:
 *   1. Urun (catalog: izinli aktif kategoriler)
 *   2. Arac & teslimat (kategori varsayilani otomatik, override edilebilir)
 *   3. Zaman (availability'den gercek 30 dk slotlar) + ozet -> POST create
 * Tedarikci manuel rampa SECMEZ; atamayi rule engine yapar.
 */



function tomorrowISO(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** Ay ekleme — backend ile ayni kural: hedef ayda gun yoksa ayin son gunune kirpilir. */
function addMonthsClamped(base: Date, months: number): Date {
  const day = base.getDate();
  const target = new Date(base.getFullYear(), base.getMonth() + months, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(day, lastDay));
  return target;
}

function occurrenceDates(
  startDate: string,
  frequency: "weekly" | "biweekly" | "monthly",
  count: number,
): Date[] {
  const base = new Date(`${startDate}T12:00:00`);
  return Array.from({ length: count }, (_, i) => {
    if (frequency === "weekly") return new Date(base.getTime() + i * 7 * 86_400_000);
    if (frequency === "biweekly") return new Date(base.getTime() + i * 14 * 86_400_000);
    return addMonthsClamped(base, i);
  });
}

const FREQUENCY_LABELS = {
  weekly: "Her hafta",
  biweekly: "2 haftada bir",
  monthly: "Her ay",
} as const;

export default function NewAppointmentWizard() {
  const t = useT();
  const errorMessage = useApiErrorMessage();
  const catalog = useSupplierCatalog();
  const profile = useSupplierProfile();
  const create = useCreateSupplierAppointment();

  const [step, setStep] = useState(0);
  const [result, setResult] = useState<AppointmentDto | null>(null);
  const [seriesResult, setSeriesResult] = useState<SeriesCreateResultDto | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [confirmAdvisory, setConfirmAdvisory] = useState(false);

  // Adim 1 — urun
  const [productName, setProductName] = useState("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [quantity, setQuantity] = useState(1);
  const [unit, setUnit] = useState("pallet");

  // Adim 2 — arac & teslimat
  const [vehicleOverrideId, setVehicleOverrideId] = useState<string | null>(null);
  const [plate, setPlate] = useState("");
  const [driver, setDriver] = useState("");
  const [cargoSelected, setIsCargo] = useState(false);
  const [cargoWindow, setCargoWindow] = useState<CargoWindow>("morning");

  // Adim 3 — zaman
  const [date, setDate] = useState(tomorrowISO);
  const [duration, setDuration] = useState<number | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);

  // Tekrarlayan seri (yalnizca standart teslimat; kargo ile birlesmez)
  const [recurringEnabled, setRecurringEnabled] = useState(false);
  const [recurringFrequency, setRecurringFrequency] = useState<
    "weekly" | "biweekly" | "monthly"
  >("weekly");
  const [recurringCount, setRecurringCount] = useState(4);

  const categories = catalog.data?.product_categories ?? [];
  const vehicles = catalog.data?.vehicle_categories ?? [];
  const limits = catalog.data?.limits;
  // Kargo yalnizca yonetim bu tedarikci icin actiysa katalogda gelir;
  // gelmiyorsa secenek hic gosterilmez (standart her zaman acik).
  const cargoAllowed = (catalog.data?.delivery_types ?? []).includes("cargo");
  // Yonetim kargoyu kapatirsa acik sihirbazdaki secim de otomatik duser.
  const isCargo = cargoSelected && cargoAllowed;
  const category = categories.find((c) => c.id === categoryId) ?? null;

  const defaultVehicleId = category?.default_vehicle_category_id ?? null;
  const effectiveVehicleId = vehicleOverrideId ?? defaultVehicleId;
  const effectiveVehicle = vehicles.find((v) => v.id === effectiveVehicleId) ?? null;

  // Sure secenekleri: kategori araligi ile tedarikci araliginin KESISIMI.
  const durationRange = useMemo(
    () => (category ? resolveDurationRange(category, limits) : null),
    [category, limits],
  );
  const durationOptions = durationRange?.options ?? [];

  const effectiveDuration =
    duration && durationOptions.includes(duration) ? duration : durationOptions[0] ?? null;

  // Availability: urun + arac + gun + sure sabitlenince GERCEK musaitlik cekilir.
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
  const slotLabel = (iso: string) =>
    new Date(iso).toLocaleTimeString("tr-TR", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: tz,
    });

  const canNext =
    step === 0
      ? productName.trim().length > 0 && category !== null && quantity > 0
      : step === 1
        ? isCargo || plate.trim().length > 0
        : isCargo || selectedSlot !== null;

  // Secili slottaki kargo tavsiye uyarilari (engellemez; yalnizca farkindalik).
  const selectedSlotData = slots.find((s) => s.start === selectedSlot) ?? null;
  const selectedAdvisories = selectedSlotData?.advisory_warnings ?? [];

  const recurringActive = recurringEnabled && !isCargo;
  const maxOccurrences = recurringFrequency === "monthly" ? 6 : 12;
  const effectiveRecurringCount = Math.min(Math.max(recurringCount, 2), maxOccurrences);
  const previewDates = recurringActive
    ? occurrenceDates(date, recurringFrequency, effectiveRecurringCount)
    : [];

  async function doSubmit() {
    setSubmitError(null);
    setConfirmAdvisory(false);
    const body = {
      product_category_id: categoryId,
      product_name: productName,
      quantity,
      quantity_unit: unit,
      vehicle_category_id: vehicleOverrideId, // null -> backend kategori varsayilanini cozer
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
      // Seri hatasi: hangi tekrarin hangi tarihte neden dustugu mesajda gelir.
      setSubmitError(
        errorMessage(err, t.supplier.newAppointment.submitFailed),
      );
    }
  }

  function onSubmit() {
    // Kargo-uyarili slotta ENGELLEMEYEN onay diyalogu (v2.0: hard block yok).
    if (!isCargo && selectedAdvisories.length > 0) {
      setConfirmAdvisory(true);
      return;
    }
    void doSubmit();
  }

  if (catalog.isLoading) return <LoadingState label={t.supplier.newAppointment.catalogLoading} />;
  if (catalog.isError)
    return <ErrorState message={t.supplier.newAppointment.catalogError} onRetry={() => catalog.refetch()} />;
  if (categories.length === 0)
    return (
      <ErrorState message={t.supplier.newAppointment.noCategories} />
    );

  if (seriesResult) {
    const first = seriesResult.appointments[0];
    const approved = first?.status === "approved";
    return (
      <Card className="mx-auto w-full max-w-2xl">
        <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
          <span
            className={cn(
              "flex h-14 w-14 items-center justify-center rounded-full",
              approved ? "bg-status-approved/15" : "bg-status-pending/15",
            )}
          >
            <Check
              className={cn(
                "h-7 w-7",
                approved ? "text-status-approved" : "text-status-pending",
              )}
            />
          </span>
          <h2 className="text-lg font-bold">
            {approved
              ? t.supplier.newAppointment.seriesApproved(seriesResult.occurrence_count)
              : t.supplier.newAppointment.seriesPending(seriesResult.occurrence_count)}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t.supplier.newAppointment.seriesCreated(FREQUENCY_LABELS[seriesResult.frequency])}
          </p>
          <ul className="flex flex-col gap-1 text-sm">
            {seriesResult.appointments.map((a) => (
              <li key={a.id} className="text-muted-foreground">
                <span className="font-medium text-foreground">{a.occurrence_index}.</span>{" "}
                {new Date(a.scheduled_start_at).toLocaleString("tr-TR", {
                  day: "2-digit",
                  month: "long",
                  hour: "2-digit",
                  minute: "2-digit",
                  timeZone: tz,
                })}
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <Link href="/supplier/appointments">
              <Button variant="secondary">{t.supplier.newAppointment.myAppointments}</Button>
            </Link>
            <Button onClick={() => window.location.reload()}>Yeni Talep</Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (result) {
    const approved = result.status === "approved";
    return (
      <Card className="mx-auto w-full max-w-2xl">
        <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
          <span
            className={cn(
              "flex h-14 w-14 items-center justify-center rounded-full",
              approved ? "bg-status-approved/15" : "bg-status-pending/15",
            )}
          >
            <Check
              className={cn(
                "h-7 w-7",
                approved ? "text-status-approved" : "text-status-pending",
              )}
            />
          </span>
          <h2 className="text-lg font-bold">
            {approved
              ? t.supplier.newAppointment.singleApproved
              : t.supplier.newAppointment.singlePending}
          </h2>
          <p className="text-sm text-muted-foreground">
            {result.product_name} ·{" "}
            {new Date(result.scheduled_start_at).toLocaleString("tr-TR", {
              day: "2-digit",
              month: "long",
              hour: "2-digit",
              minute: "2-digit",
              timeZone: tz,
            })}
            {result.delivery_type === "cargo" &&
              t.supplier.newAppointment.cargoEstimateNote}
          </p>
          <div className="flex gap-2">
            <Link href="/supplier/appointments">
              <Button variant="secondary">{t.supplier.newAppointment.myAppointments}</Button>
            </Link>
            <Button onClick={() => window.location.reload()}>Yeni Talep</Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <div className="flex items-center gap-2">
        {t.supplier.newAppointment.steps.map((label, i) => (
          <div key={label} className="flex flex-1 flex-col gap-1">
            <div className={cn("h-1.5 rounded-full", i <= step ? "bg-primary" : "bg-muted")} />
            <span
              className={cn(
                "truncate text-[10px] font-medium",
                i === step ? "text-primary" : "text-muted-foreground",
              )}
            >
              {i + 1}. {label}
            </span>
          </div>
        ))}
      </div>

      {step === 0 && (
        <Card>
          <CardContent className="flex flex-col gap-4 pt-5">
            <div>
              <Label>{t.supplier.newAppointment.productName}</Label>
              <Input
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
                placeholder={t.supplier.newAppointment.productPlaceholder}
              />
            </div>
            <div>
              <Label>Kategori</Label>
              <Select
                value={categoryId}
                onChange={(e) => {
                  setCategoryId(e.target.value);
                  setVehicleOverrideId(null);
                  setSelectedSlot(null);
                }}
              >
                <option value="">{t.supplier.newAppointment.selectCategory}</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.display_name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Miktar</Label>
                <Input
                  type="number"
                  min={1}
                  value={quantity}
                  onChange={(e) => setQuantity(Number(e.target.value))}
                />
              </div>
              <div>
                <Label>Birim</Label>
                <Select value={unit} onChange={(e) => setUnit(e.target.value)}>
                  {(catalog.data?.quantity_units ?? []).map((u) => (
                    <option key={u.value} value={u.value}>
                      {u.label}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 1 && (
        <Card>
          <CardContent className="flex flex-col gap-4 pt-5">
            <div>
              <Label>{t.supplier.newAppointment.vehicleCategory}</Label>
              <Select
                value={effectiveVehicleId ?? ""}
                onChange={(e) => {
                  setVehicleOverrideId(e.target.value || null);
                  setSelectedSlot(null); // arac degisince slotlar yeniden hesaplanir
                }}
              >
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.display_name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Plaka</Label>
                <Input
                  value={plate}
                  onChange={(e) => setPlate(e.target.value)}
                  placeholder="34 ABC 123"
                />
              </div>
              <div>
                <Label>{t.supplier.newAppointment.driver}</Label>
                <Input
                  value={driver}
                  onChange={(e) => setDriver(e.target.value)}
                  placeholder="Ad Soyad"
                />
              </div>
            </div>

            <div>
              <Label>Teslimat Tipi</Label>
              <div className={cn("grid gap-2", cargoAllowed ? "grid-cols-2" : "grid-cols-1")}>
                <button
                  type="button"
                  onClick={() => setIsCargo(false)}
                  className={cn(
                    "rounded-lg border p-3 text-left text-sm",
                    !isCargo
                      ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                      : "border-border",
                  )}
                >
                  <div className="font-medium">Standart Randevu</div>
                  <div className="text-xs text-muted-foreground">
                    {t.supplier.newAppointment.exactWindow}
                  </div>
                </button>
                {cargoAllowed && (
                  <button
                    type="button"
                    onClick={() => setIsCargo(true)}
                    className={cn(
                      "rounded-lg border p-3 text-left text-sm",
                      isCargo ? "border-cargo bg-cargo/5 ring-1 ring-cargo/30" : "border-border",
                    )}
                  >
                    <div className="flex items-center gap-1 font-medium">
                      <Package className="h-3.5 w-3.5 text-cargo" /> Kargo
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {t.supplier.newAppointment.uncertainArrival}
                    </div>
                  </button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <div className="flex flex-col gap-4">
          <Card>
            <CardContent className="flex flex-col gap-4 pt-5">
              <div>
                <Label>{t.supplier.newAppointment.day}</Label>
                <Input
                  type="date"
                  value={date}
                  min={new Date().toISOString().slice(0, 10)}
                  onChange={(e) => {
                    setDate(e.target.value);
                    setSelectedSlot(null);
                  }}
                />
              </div>

              {isCargo ? (
                <div>
                  <Label>Beklenen Pencere</Label>
                  <div className="flex flex-col gap-2">
                    {(catalog.data?.cargo_windows ?? []).map((w) => (
                      <button
                        key={w}
                        type="button"
                        onClick={() => setCargoWindow(w as CargoWindow)}
                        className={cn(
                          "rounded-lg border p-3 text-left text-sm",
                          cargoWindow === w
                            ? "border-cargo bg-cargo/5 ring-1 ring-cargo/30"
                            : "border-border",
                        )}
                      >
                        {CARGO_WINDOW_LABELS[w as CargoWindow]}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <>
                  <div>
                    <Label>{t.supplier.newAppointment.estimatedDuration}</Label>
                    <Select
                      value={effectiveDuration ?? ""}
                      disabled={durationOptions.length === 0}
                      onChange={(e) => {
                        setDuration(Number(e.target.value));
                        setSelectedSlot(null);
                      }}
                    >
                      {durationOptions.map((d) => (
                        <option key={d} value={d}>
                          {d} dakika
                        </option>
                      ))}
                    </Select>
                    {durationRange?.conflicting && (
                      <p className="mt-1 text-xs text-destructive">
                        {t.supplier.newAppointment.durationMismatch}
                      </p>
                    )}
                  </div>
                  <div>
                    <Label>{t.supplier.newAppointment.startTime}</Label>
                    {availability.isLoading ? (
                      <LoadingState label={t.supplier.newAppointment.availabilityLoading} />
                    ) : availability.isError ? (
                      <ErrorState
                        message={t.supplier.newAppointment.availabilityError}
                        onRetry={() => availability.refetch()}
                      />
                    ) : slots.length === 0 ? (
                      <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
                        {t.supplier.newAppointment.noSlots}
                      </p>
                    ) : (
                      <>
                        <div className="grid grid-cols-3 gap-1.5">
                          {slots.map((s) => (
                            <button
                              key={s.start}
                              type="button"
                              disabled={s.status === "full"}
                              onClick={() => setSelectedSlot(s.start)}
                              title={
                                s.advisory_warnings.length > 0
                                  ? s.advisory_warnings[0].message
                                  : SLOT_STATUS_LABELS[s.status]
                              }
                              className={cn(
                                "relative rounded-md border py-1.5 text-xs font-medium transition-colors",
                                s.status === "full" &&
                                  "cursor-not-allowed border-border bg-muted text-muted-foreground line-through",
                                s.status === "partial" &&
                                  selectedSlot !== s.start &&
                                  "border-status-pending/40 bg-status-pending/10 text-status-pending",
                                s.status === "available" &&
                                  selectedSlot !== s.start &&
                                  "border-border bg-card hover:border-primary/50",
                                selectedSlot === s.start &&
                                  "border-primary bg-primary text-primary-foreground",
                              )}
                            >
                              {slotLabel(s.start)}
                              {s.advisory_warnings.length > 0 && (
                                <Package className="absolute right-0.5 top-0.5 h-2.5 w-2.5 text-cargo" />
                              )}
                            </button>
                          ))}
                        </div>
                        <div className="mt-2 flex gap-3 text-[10px] text-muted-foreground">
                          <span>{t.supplier.newAppointment.legendAvailable}</span>
                          <span className="text-status-pending">
                            {t.supplier.newAppointment.legendPartial}
                          </span>
                          <span className="line-through">■ Dolu</span>
                          <span className="text-cargo">{t.supplier.newAppointment.legendCargo}</span>
                        </div>
                        {selectedAdvisories.length > 0 && (
                          <div className="mt-2 flex items-start gap-2 rounded-lg border border-cargo/40 bg-cargo/10 px-3 py-2 text-xs text-cargo">
                            <Package className="mt-0.5 h-4 w-4 shrink-0" />
                            <span>
                              {t.supplier.newAppointment.cargoHintLead}{" "}
                              <strong>{t.supplier.newAppointment.cargoHintStrong}</strong>
                              {t.supplier.newAppointment.cargoHintTail}
                            </span>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {!isCargo && (
            <Card>
              <CardContent className="flex flex-col gap-3 pt-5">
                <Switch
                  checked={recurringEnabled}
                  onChange={(v) => {
                    setRecurringEnabled(v);
                  }}
                  label={t.supplier.newAppointment.recurringToggle}
                />
                {recurringEnabled && (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label>{t.supplier.newAppointment.frequency}</Label>
                        <Select
                          value={recurringFrequency}
                          onChange={(e) => {
                            const f = e.target.value as "weekly" | "biweekly" | "monthly";
                            setRecurringFrequency(f);
                            if (f === "monthly" && recurringCount > 6) setRecurringCount(6);
                          }}
                        >
                          <option value="weekly">Her hafta</option>
                          <option value="biweekly">2 haftada bir</option>
                          <option value="monthly">Her ay</option>
                        </Select>
                      </div>
                      <div>
                        <Label>{t.supplier.newAppointment.repeatCount}</Label>
                        <Input
                          type="number"
                          min={2}
                          max={maxOccurrences}
                          value={recurringCount}
                          onChange={(e) => setRecurringCount(Number(e.target.value))}
                        />
                      </div>
                    </div>
                    <div className="rounded-lg border border-border bg-muted/40 px-3 py-2">
                      <p className="mb-1 text-xs font-semibold">
                        {t.supplier.newAppointment.willCreate(effectiveRecurringCount)}
                      </p>
                      <ul className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                        {previewDates.map((d, i) => (
                          <li key={d.toISOString()}>
                            {i + 1}.{" "}
                            {d.toLocaleDateString("tr-TR", {
                              day: "2-digit",
                              month: "long",
                              year: "numeric",
                            })}
                          </li>
                        ))}
                      </ul>
                      <p className="mt-1.5 text-[11px] text-muted-foreground">
                        {t.supplier.newAppointment.allOrNothingLead}{" "}
                        <strong>{t.supplier.newAppointment.allOrNothingStrong}</strong>{" "}
                        {t.supplier.newAppointment.allOrNothingTail}
                      </p>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="pt-5">
              <h3 className="mb-2 text-sm font-semibold">{t.supplier.newAppointment.summaryTitle}</h3>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                <dt className="text-muted-foreground">{t.supplier.newAppointment.summaryProduct}</dt>
                <dd>{productName || "—"}</dd>
                <dt className="text-muted-foreground">Kategori</dt>
                <dd>{category?.display_name ?? "—"}</dd>
                <dt className="text-muted-foreground">Miktar</dt>
                <dd>
                  {quantity}{" "}
                  {catalog.data?.quantity_units.find((u) => u.value === unit)?.label}
                </dd>
                <dt className="text-muted-foreground">{t.supplier.newAppointment.summaryVehicle}</dt>
                <dd>{effectiveVehicle?.display_name ?? "—"}</dd>
                {plate && (
                  <>
                    <dt className="text-muted-foreground">Plaka</dt>
                    <dd className="font-mono">{plate}</dd>
                  </>
                )}
                <dt className="text-muted-foreground">Teslimat</dt>
                <dd>
                  {isCargo ? `Kargo · ${CARGO_WINDOW_LABELS[cargoWindow]}` : "Standart"}
                </dd>
                <dt className="text-muted-foreground">Tarih</dt>
                <dd>
                  {date}
                  {!isCargo && selectedSlot
                    ? ` · ${slotLabel(selectedSlot)} (${effectiveDuration} dk)`
                    : ""}
                </dd>
                {recurringActive && (
                  <>
                    <dt className="text-muted-foreground">Tekrar</dt>
                    <dd>
                      {FREQUENCY_LABELS[recurringFrequency]} · {effectiveRecurringCount} randevu
                    </dd>
                  </>
                )}
              </dl>
              {limits?.auto_approval_enabled && (
                <p className="mt-3 rounded-md bg-status-approved/10 px-2 py-1 text-xs text-status-approved">
                  {t.supplier.newAppointment.autoApproveNote}
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {submitError && (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {submitError}
        </p>
      )}

      <div className="flex gap-2">
        {step > 0 && (
          <Button variant="secondary" className="flex-1" onClick={() => setStep(step - 1)}>
            <ChevronLeft className="h-4 w-4" /> Geri
          </Button>
        )}
        {step < 2 ? (
          <Button className="flex-1" disabled={!canNext} onClick={() => setStep(step + 1)}>
            Devam <ChevronRight className="h-4 w-4" />
          </Button>
        ) : (
          <Button
            className="flex-1"
            disabled={!canNext || create.isPending}
            onClick={onSubmit}
          >
            {create.isPending
              ? t.supplier.newAppointment.sending
              : recurringActive
                ? `${effectiveRecurringCount} Randevu Talep Et`
                : "Randevu Talep Et"}
          </Button>
        )}
      </div>

      {/* Engellemeyen kargo onay diyalogu */}
      <Dialog
        open={confirmAdvisory}
        onClose={() => setConfirmAdvisory(false)}
        title={t.supplier.newAppointment.cargoDialogTitle}
      >
        <div className="flex flex-col gap-4">
          <p className="flex items-start gap-2 text-sm text-muted-foreground">
            <Package className="mt-0.5 h-5 w-5 shrink-0 text-cargo" />
            {t.supplier.newAppointment.cargoDialogText}
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirmAdvisory(false)}>
              {t.supplier.newAppointment.cargoDialogBack}
            </Button>
            <Button onClick={() => void doSubmit()} disabled={create.isPending}>
              {create.isPending
                ? t.supplier.newAppointment.sending
                : t.supplier.newAppointment.cargoDialogConfirm}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
