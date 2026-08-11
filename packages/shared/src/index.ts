/**
 * LogiSlot paylasilan domain sabitleri.
 * Backend enum'lariyla (apps/api/app/core/enums.py) birebir ayni degerler.
 */

export const APPOINTMENT_STATUSES = [
  "pending",
  "approved",
  "revision_pending",
  "rejected",
  "completed",
  "cancelled",
] as const;

export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

export const APPOINTMENT_STATUS_LABELS: Record<AppointmentStatus, string> = {
  pending: "Bekliyor",
  approved: "Onaylandı",
  revision_pending: "Revize Bekliyor",
  rejected: "Reddedildi",
  completed: "Tamamlandı",
  cancelled: "İptal",
};

export type DeliveryType = "standard" | "cargo";

export const DELIVERY_TYPE_LABELS: Record<DeliveryType, string> = {
  standard: "Standart",
  cargo: "Kargo (Belirsiz Varış)",
};

export type CargoWindow = "morning" | "afternoon" | "all_day";

export const CARGO_WINDOW_LABELS: Record<CargoWindow, string> = {
  morning: "Sabah (08:00–12:00)",
  afternoon: "Öğleden Sonra (12:00–18:00)",
  all_day: "Tüm Gün",
};

export type QuantityUnit = "pallet" | "piece" | "box" | "carton";

export const QUANTITY_UNIT_LABELS: Record<QuantityUnit, string> = {
  pallet: "Palet",
  piece: "Adet",
  box: "Kutu",
  carton: "Koli",
};

export type SlotStatus = "available" | "partial" | "full";

export const SLOT_STATUS_LABELS: Record<SlotStatus, string> = {
  available: "Müsait",
  partial: "Kısmen Dolu",
  full: "Dolu",
};

/** Randevu sihirbazlarinda sunulan standart sure secenekleri (dakika). */
export const DURATION_OPTIONS = [30, 45, 60, 90, 120, 150, 180, 240] as const;

/**
 * Hicbir yerde ust sinir tanimli degilse uygulanan SISTEM VARSAYILANI (dakika).
 *
 * Onceden tanimsiz ust sinir "sinirsiz" demekti ve tek bir randevu tum gunu
 * kapatabiliyordu. Acikca girilen kategori/tedarikci limiti bu varsayilani
 * EZER; varsayilan yalnizca hic limit yokken devreye girer.
 * Backend karsiligi: app/rules/availability.py DEFAULT_MAX_BLOCK_MINUTES.
 */
export const DEFAULT_MAX_BLOCK_MINUTES = 120;

export interface BlockLimits {
  min_block_minutes: number | null;
  max_block_minutes: number | null;
}

export interface CategoryBlockLimits {
  min_block_minutes: number;
  /** null = kategori bazli ust sinir yok. */
  max_block_minutes: number | null;
}

export interface DurationRange {
  min: number;
  /** null = ust sinir yok. */
  max: number | null;
  /** Kullaniciya sunulacak secenekler; `conflicting` ise bostur. */
  options: number[];
  /** Kategori ve tedarikci araliklari kesismiyor -> gecerli sure YOK. */
  conflicting: boolean;
}

/**
 * Kategori araligi ile tedarikci araliginin KESISIMI.
 *
 * Backend karsiligi: `AvailabilityService.validate_duration`. Iki tarafi da
 * ayni sekilde daraltir; buradaki tek fark, gecersiz secenegin kullaniciya
 * hic gosterilmemesidir.
 */
export function resolveDurationRange(
  category: CategoryBlockLimits,
  supplierLimits?: BlockLimits | null,
): DurationRange {
  const min = Math.max(category.min_block_minutes, supplierLimits?.min_block_minutes ?? 0);
  const caps = [category.max_block_minutes, supplierLimits?.max_block_minutes ?? null].filter(
    (value): value is number => value != null,
  );
  // Hic limit yoksa "sinirsiz" degil, sistem varsayilani uygulanir.
  const max = caps.length > 0 ? Math.min(...caps) : DEFAULT_MAX_BLOCK_MINUTES;

  if (max !== null && max < min) {
    return { min, max, options: [], conflicting: true };
  }

  const options = DURATION_OPTIONS.filter((d) => d >= min && (max === null || d <= max));
  // Standart listede araliga dusen deger yoksa taban sureyi tek secenek yap;
  // min <= max garantili oldugu icin bu deger HER ZAMAN gecerlidir.
  return { min, max, options: options.length > 0 ? [...options] : [min], conflicting: false };
}

/** "30–120 dk" / "min 60 dk" gibi insan okunur aralik etiketi. */
export function formatDurationRange(min: number, max: number | null): string {
  return max == null ? `min ${min} dk` : `${min}–${max} dk`;
}

export interface AppointmentSummary {
  id: string;
  product_name: string;
  quantity: number;
  quantity_unit: QuantityUnit;
  status: AppointmentStatus;
  delivery_type: DeliveryType;
  cargo_window: CargoWindow | null;
  scheduled_start_at: string;
  scheduled_end_at: string;
  duration_minutes: number;
  license_plate: string | null;
  dock_id: string | null;
  supplier_id: string;
}
