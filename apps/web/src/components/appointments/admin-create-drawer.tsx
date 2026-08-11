"use client";

/**
 * Admin "Yeni Randevu" drawer'i (Sprint 10) — tedarikci ADINA olusturma.
 *
 * Kurallar UI'da da yansir: tedarikci secilince yalnizca ONUN izinli
 * kategorileri listelenir, kategori varsayilan araci getirir, sure
 * secenekleri tedarikci/kategori limitlerine gore filtrelenir. Rampa
 * atamasini varsayilan olarak engine yapar; manuel secim de tam kural
 * setinden gecer (backend). Admin actigi icin randevu ONAYLI dogar.
 */

import { Package } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  CARGO_WINDOW_LABELS,
  type CargoWindow,
  formatDurationRange,
  resolveDurationRange,
} from "@logislot/shared";
import { ErrorState, LoadingState } from "@/components/config/states";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Input, Label, Select } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  useAdminAvailability,
  useAdminCreateAppointment,
} from "@/lib/api/appointments";
import { ApiError } from "@/lib/api/client";
import { docks, productCategories, suppliers, vehicleCategories } from "@/lib/api/resources";
import type { AppointmentDto, SeriesCreateResultDto } from "@/lib/api/types";
import { useSession } from "@/lib/auth/session";
import { cn } from "@/lib/utils";

const CARGO_WINDOWS: CargoWindow[] = ["morning", "afternoon", "all_day"];

function addDaysISO(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export interface AdminCreateInitialValues {
  date?: string;      // "YYYY-MM-DD"
  time?: string;      // "HH:MM" (tesis saat diliminde) — slotlar yuklenince otomatik secilir
  dockId?: string;    // manuel rampa on-secimi
}

interface AdminCreateDrawerProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (message: string) => void;
  /** Takvim bos-slot tiklamasindan on-dolu acilis (Sprint 12). */
  initial?: AdminCreateInitialValues | null;
}

export function AdminCreateDrawer({ open, onClose, onSuccess, initial }: AdminCreateDrawerProps) {
  const { activeFacilityId, activeFacility } = useSession();
  const supplierList = suppliers.useList(activeFacilityId);
  const categoryList = productCategories.useList(activeFacilityId);
  const vehicleList = vehicleCategories.useList(activeFacilityId);
  const dockList = docks.useList(activeFacilityId);
  const create = useAdminCreateAppointment(activeFacilityId);
  const tz = activeFacility?.timezone ?? "Europe/Istanbul";

  const [supplierId, setSupplierId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [productName, setProductName] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [unit, setUnit] = useState("pallet");
  const [vehicleOverrideId, setVehicleOverrideId] = useState<string | null>(null);
  const [plate, setPlate] = useState("");
  const [driver, setDriver] = useState("");
  const [isCargo, setIsCargo] = useState(false);
  const [cargoWindow, setCargoWindow] = useState<CargoWindow>("morning");
  const [date, setDate] = useState(addDaysISO(1));
  const [duration, setDuration] = useState<number | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [dockMode, setDockMode] = useState<"auto" | "manual">("auto");
  const [dockId, setDockId] = useState("");
  const [note, setNote] = useState("");
  const [recurringEnabled, setRecurringEnabled] = useState(false);
  const [frequency, setFrequency] = useState<"weekly" | "biweekly" | "monthly">("weekly");
  const [count, setCount] = useState(4);
  const [formError, setFormError] = useState<string | null>(null);
  // Takvimden gelen tercih edilen saat: slotlar yuklendiginde BIR kez uygulanir
  const [preferredTime, setPreferredTime] = useState<string | null>(null);
  const appliedInitialRef = useRef(false);

  useEffect(() => {
    if (open && initial && !appliedInitialRef.current) {
      appliedInitialRef.current = true;
      if (initial.date) setDate(initial.date);
      if (initial.time) setPreferredTime(initial.time);
      if (initial.dockId) {
        setDockMode("manual");
        setDockId(initial.dockId);
      }
    }
    if (!open) appliedInitialRef.current = false;
  }, [open, initial]);

  const supplier = supplierList.data?.find((s) => s.id === supplierId) ?? null;
  const allowedCategories = (categoryList.data ?? []).filter(
    (c) =>
      c.is_active && (supplier?.allowed_product_category_ids ?? []).includes(c.id),
  );
  const category = allowedCategories.find((c) => c.id === categoryId) ?? null;
  const effectiveVehicleId =
    vehicleOverrideId ?? category?.default_vehicle_category_id ?? null;

  // Kategori araligi x tedarikci araligi kesisimi (backend ile ayni kural).
  const durationRange = useMemo(
    () => (category ? resolveDurationRange(category, supplier) : null),
    [category, supplier],
  );
  const durationOptions = durationRange?.options ?? [];
  const effectiveDuration =
    duration && durationOptions.includes(duration) ? duration : durationOptions[0] ?? null;

  const availability = useAdminAvailability(
    activeFacilityId,
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

  /**
   * Manuel secimde listelenecek rampalar.
   *
   * Uyumluluk: rampanin kabul ettigi urun kategorileri (BOS liste = hepsini
   * kabul et — backend ile ayni kural). Uyumsuz rampa listeye HIC girmez.
   *
   * Doluluk: secili slotun `candidate_dock_ids` degeri SUNUCUNUN karari —
   * o aralikta gercekten musait rampalar. Uyumlu ama dolu rampa listede
   * kalir ama secilemez; kullanici neden secemedigini gorur.
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
    // Kargo akisinda tek bir aralik yoktur; doluluk slot bazli bilinemez.
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

  const slotLabel = (iso: string) =>
    new Date(iso).toLocaleTimeString("tr-TR", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: tz,
    });

  useEffect(() => {
    if (preferredTime && slots.length > 0 && !selectedSlot) {
      const match = slots.find(
        (s) => s.status !== "full" && slotLabel(s.start) === preferredTime,
      );
      if (match) setSelectedSlot(match.start);
      setPreferredTime(null); // yalnizca bir kez dene
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preferredTime, slots, selectedSlot]);

  const maxCount = frequency === "monthly" ? 6 : 12;

  function reset() {
    setSupplierId("");
    setCategoryId("");
    setProductName("");
    setQuantity(1);
    setVehicleOverrideId(null);
    setPlate("");
    setDriver("");
    setIsCargo(false);
    setDate(addDaysISO(1));
    setDuration(null);
    setSelectedSlot(null);
    setDockMode("auto");
    setDockId("");
    setNote("");
    setRecurringEnabled(false);
    setFormError(null);
  }

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
    if (dockMode === "manual" && !effectiveDockId) {
      setFormError("Manuel modda rampa seçin.");
      return;
    }
    try {
      const result = await create.mutateAsync({
        supplier_id: supplier.id,
        product_category_id: category.id,
        product_name: productName,
        quantity,
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
        dock_id: dockMode === "manual" ? effectiveDockId : null,
        note: note || null,
        recurring:
          recurringEnabled && !isCargo
            ? { frequency, occurrence_count: Math.min(Math.max(count, 2), maxCount) }
            : undefined,
      });
      const isSeries = "series_id" in (result as SeriesCreateResultDto);
      onSuccess(
        isSeries
          ? `${(result as SeriesCreateResultDto).occurrence_count} onaylı randevu oluşturuldu; tedarikçiye bildirim gönderildi.`
          : `Randevu onaylı olarak oluşturuldu (${(result as AppointmentDto).product_name}); tedarikçiye bildirim gönderildi.`,
      );
      reset();
      onClose();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Randevu oluşturulamadı");
    }
  }

  return (
    <Drawer open={open} onClose={onClose} title="Yeni Randevu (Tedarikçi Adına)">
      {supplierList.isLoading ? (
        <LoadingState />
      ) : supplierList.isError ? (
        <ErrorState message="Tedarikçiler yüklenemedi." onRetry={() => supplierList.refetch()} />
      ) : (
        <div className="flex flex-col gap-4">
          <div>
            <Label>Tedarikçi</Label>
            <Select
              value={supplierId}
              onChange={(e) => {
                setSupplierId(e.target.value);
                setCategoryId("");
                setVehicleOverrideId(null);
                setSelectedSlot(null);
              }}
            >
              <option value="">— Tedarikçi seçin —</option>
              {(supplierList.data ?? [])
                .filter((s) => s.is_active)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.company_name}
                  </option>
                ))}
            </Select>
          </div>

          {supplier && (
            <>
              <div className="grid grid-cols-2 gap-3">
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
                    <option value="">— Seçin —</option>
                    {allowedCategories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.display_name}
                      </option>
                    ))}
                  </Select>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Yalnızca tedarikçinin izinli kategorileri.
                  </p>
                </div>
                <div>
                  <Label>Ürün Adı</Label>
                  <Input
                    value={productName}
                    onChange={(e) => setProductName(e.target.value)}
                    placeholder="Örn. Acil teslimat"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
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
                    <option value="pallet">Palet</option>
                    <option value="piece">Adet</option>
                    <option value="box">Kutu</option>
                    <option value="carton">Koli</option>
                  </Select>
                </div>
                <div>
                  <Label>Araç</Label>
                  <Select
                    value={effectiveVehicleId ?? ""}
                    onChange={(e) => {
                      setVehicleOverrideId(e.target.value || null);
                      setSelectedSlot(null);
                    }}
                  >
                    <option value="">—</option>
                    {(vehicleList.data ?? [])
                      .filter((v) => v.is_active)
                      .map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.display_name}
                        </option>
                      ))}
                  </Select>
                </div>
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
                  <Label>Sürücü</Label>
                  <Input
                    value={driver}
                    onChange={(e) => setDriver(e.target.value)}
                    placeholder="Ad Soyad"
                  />
                </div>
              </div>

              <div>
                <Label>Teslimat Tipi</Label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setIsCargo(false)}
                    className={cn(
                      "rounded-lg border p-2 text-left text-sm",
                      !isCargo
                        ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                        : "border-border",
                    )}
                  >
                    Standart
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsCargo(true);
                      setRecurringEnabled(false);
                    }}
                    className={cn(
                      "flex items-center gap-1 rounded-lg border p-2 text-left text-sm",
                      isCargo ? "border-cargo bg-cargo/5 ring-1 ring-cargo/30" : "border-border",
                    )}
                  >
                    <Package className="h-3.5 w-3.5 text-cargo" /> Kargo
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Gün</Label>
                  <Input
                    type="date"
                    value={date}
                    min={addDaysISO(0)}
                    onChange={(e) => {
                      setDate(e.target.value);
                      setSelectedSlot(null);
                    }}
                  />
                </div>
                {!isCargo && (
                  <div>
                    <Label>Süre</Label>
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
                          {d} dk
                        </option>
                      ))}
                    </Select>
                    {durationRange && !durationRange.conflicting && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        İzin verilen aralık:{" "}
                        {formatDurationRange(durationRange.min, durationRange.max)}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {!isCargo && durationRange?.conflicting && (
                <p className="text-sm text-destructive">
                  Bu kategorinin süre aralığı ({category?.min_block_minutes}–
                  {category?.max_block_minutes} dk) tedarikçinin limitleriyle (
                  {supplier?.min_block_minutes ?? "—"}–{supplier?.max_block_minutes ?? "—"}{" "}
                  dk) kesişmiyor. Ayarlardan limitlerden birini güncelleyin.
                </p>
              )}

              {isCargo ? (
                <div>
                  <Label>Beklenen Pencere</Label>
                  <Select
                    value={cargoWindow}
                    onChange={(e) => setCargoWindow(e.target.value as CargoWindow)}
                  >
                    {CARGO_WINDOWS.map((w) => (
                      <option key={w} value={w}>
                        {CARGO_WINDOW_LABELS[w]}
                      </option>
                    ))}
                  </Select>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Kargo kesin slot değil, tahmini pencere ayırır; planlamacıya takvimde
                    uyarı gösterilir.
                  </p>
                </div>
              ) : (
                category && (
                  <div>
                    <Label>Başlangıç Saati</Label>
                    {availability.isLoading ? (
                      <LoadingState label="Müsaitlik hesaplanıyor…" />
                    ) : slots.length === 0 ? (
                      <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
                        Bu gün için uygun slot yok.
                      </p>
                    ) : (
                      <div className="grid grid-cols-4 gap-1.5">
                        {slots.map((s) => (
                          <button
                            key={s.start}
                            type="button"
                            disabled={s.status === "full"}
                            onClick={() => setSelectedSlot(s.start)}
                            title={
                              s.advisory_warnings.length > 0
                                ? s.advisory_warnings[0].message
                                : undefined
                            }
                            className={cn(
                              "relative rounded-md border py-1.5 text-xs font-medium",
                              s.status === "full" &&
                                "cursor-not-allowed bg-muted text-muted-foreground line-through",
                              selectedSlot === s.start
                                ? "border-primary bg-primary text-primary-foreground"
                                : s.status !== "full" && "border-border bg-card hover:border-primary/50",
                            )}
                          >
                            {slotLabel(s.start)}
                            {s.advisory_warnings.length > 0 && (
                              <Package className="absolute right-0.5 top-0.5 h-2.5 w-2.5 text-cargo" />
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                    {selectedSlotData && selectedSlotData.advisory_warnings.length > 0 && (
                      <p className="mt-1.5 flex items-start gap-1.5 rounded-md bg-cargo/10 px-2 py-1.5 text-xs text-cargo">
                        <Package className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        Bu aralıkta kargo bekleniyor — engel değildir, farkındalık içindir.
                      </p>
                    )}
                  </div>
                )
              )}

              <div>
                <Label>Rampa</Label>
                <div className="flex gap-2">
                  <Select
                    value={dockMode}
                    onChange={(e) => setDockMode(e.target.value as "auto" | "manual")}
                    className="w-40 shrink-0"
                  >
                    <option value="auto">Otomatik ata</option>
                    <option value="manual">Manuel seç</option>
                  </Select>
                  {dockMode === "manual" && (
                    <Select value={effectiveDockId} onChange={(e) => setDockId(e.target.value)}>
                      <option value="">— Rampa —</option>
                      {eligibleDocks.map((d) => (
                        <option key={d.id} value={d.id} disabled={!d.available}>
                          {d.name}
                          {d.available ? "" : " — dolu"}
                        </option>
                      ))}
                    </Select>
                  )}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Manuel seçimde de uyumluluk ve çakışma kuralları tam uygulanır.
                </p>
              </div>

              {!isCargo && (
                <div className="rounded-lg border border-border p-3">
                  <Switch
                    checked={recurringEnabled}
                    onChange={setRecurringEnabled}
                    label="Tekrarlayan randevu oluştur"
                  />
                  {recurringEnabled && (
                    <div className="mt-2 grid grid-cols-2 gap-3">
                      <div>
                        <Label>Sıklık</Label>
                        <Select
                          value={frequency}
                          onChange={(e) => {
                            const f = e.target.value as "weekly" | "biweekly" | "monthly";
                            setFrequency(f);
                            if (f === "monthly" && count > 6) setCount(6);
                          }}
                        >
                          <option value="weekly">Her hafta</option>
                          <option value="biweekly">2 haftada bir</option>
                          <option value="monthly">Her ay</option>
                        </Select>
                      </div>
                      <div>
                        <Label>Tekrar Sayısı (en fazla {maxCount})</Label>
                        <Input
                          type="number"
                          min={2}
                          max={maxCount}
                          value={count}
                          onChange={(e) => setCount(Number(e.target.value))}
                        />
                      </div>
                      <p className="col-span-2 text-xs text-muted-foreground">
                        Tüm tarihler kural setinden geçer; biri uygun değilse hiçbiri
                        oluşturulmaz. Admin açtığı için tüm randevular onaylı doğar.
                      </p>
                    </div>
                  )}
                </div>
              )}

              <div>
                <Label>Not (opsiyonel)</Label>
                <Input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder='Örn. "Telefonla oluşturuldu"'
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Not denetim kaydına işlenir.
                </p>
              </div>
            </>
          )}

          {formError && <p className="text-sm text-destructive">{formError}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>
              İptal
            </Button>
            <Button
              onClick={() => void onSubmit()}
              disabled={
                create.isPending ||
                !supplier ||
                // Cakisan limitlerde gecerli bir sure yok; sunucuya bosuna gitme.
                (!isCargo && durationRange?.conflicting === true)
              }
            >
              {create.isPending ? "Oluşturuluyor…" : "Randevu Oluştur"}
            </Button>
          </div>
        </div>
      )}
    </Drawer>
  );
}
