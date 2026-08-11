/**
 * LogiSlot paylaşılan domain sabitleri — packages/shared/src/index.ts kopyası.
 * logislot-mobile workspace DIŞINDA (standalone) olduğu için kopyalandı;
 * ileride ortak paket çıkarımı planlanıyor (docs/WEB_MOBILE_PARITY.md).
 * Backend enum'larıyla (apps/api/app/core/enums.py) birebir aynı değerler.
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

/** Randevu sihirbazlarında sunulan standart süre seçenekleri (dakika). */
export const DURATION_OPTIONS = [30, 45, 60, 90, 120, 150, 180, 240] as const;

/**
 * Hiçbir yerde üst sınır tanımlı değilse uygulanan SİSTEM VARSAYILANI (dakika).
 *
 * Önceden tanımsız üst sınır "sınırsız" demekti ve tek bir randevu tüm günü
 * kapatabiliyordu. Açıkça girilen kategori/tedarikçi limiti bunu EZER.
 * Backend karşılığı: app/rules/availability.py DEFAULT_MAX_BLOCK_MINUTES.
 */
export const DEFAULT_MAX_BLOCK_MINUTES = 120;

export interface BlockLimits {
  min_block_minutes: number | null;
  max_block_minutes: number | null;
}

export interface CategoryBlockLimits {
  min_block_minutes: number;
  /** null = kategori bazlı üst sınır yok. */
  max_block_minutes: number | null;
}

export interface DurationRange {
  min: number;
  /** null = üst sınır yok. */
  max: number | null;
  /** Kullanıcıya sunulacak seçenekler; `conflicting` ise boştur. */
  options: number[];
  /** Kategori ve tedarikçi aralıkları kesişmiyor -> geçerli süre YOK. */
  conflicting: boolean;
}

/**
 * Kategori aralığı ile tedarikçi aralığının KESİŞİMİ.
 *
 * Backend karşılığı: `AvailabilityService.validate_duration`.
 */
export function resolveDurationRange(
  category: CategoryBlockLimits,
  supplierLimits?: BlockLimits | null,
): DurationRange {
  const min = Math.max(category.min_block_minutes, supplierLimits?.min_block_minutes ?? 0);
  const caps = [category.max_block_minutes, supplierLimits?.max_block_minutes ?? null].filter(
    (value): value is number => value != null,
  );
  // Hiç limit yoksa "sınırsız" değil, sistem varsayılanı uygulanır.
  const max = caps.length > 0 ? Math.min(...caps) : DEFAULT_MAX_BLOCK_MINUTES;

  if (max !== null && max < min) {
    return { min, max, options: [], conflicting: true };
  }

  const options = DURATION_OPTIONS.filter((d) => d >= min && (max === null || d <= max));
  // Standart listede aralığa düşen değer yoksa taban süreyi tek seçenek yap;
  // min <= max garantili olduğu için bu değer HER ZAMAN geçerlidir.
  return { min, max, options: options.length > 0 ? [...options] : [min], conflicting: false };
}

/** "30–120 dk" / "min 60 dk" gibi insan okunur aralık etiketi. */
export function formatDurationRange(min: number, max: number | null): string {
  return max == null ? `min ${min} dk` : `${min}–${max} dk`;
}
