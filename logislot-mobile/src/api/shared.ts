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

// --- Destek ticketlari (Hermes Ticket Hub sozlesmesi) ---
//
// Degerler Hermes ile PAYLASILAN sozlesmedendir (apps/api/app/core/enums.py ve
// 00_SHARED_PLATFORM/04). Yeni deger eklemek additive'dir; bilinmeyen bir deger
// UI'da ham koduyla gosterilir ve ekrani KIRMAZ.

export const TICKET_STATUSES = [
  "open",
  "in_progress",
  "waiting_customer",
  "resolved",
  "closed",
  "reopened",
  "cancelled",
] as const;

export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  open: "Açık",
  in_progress: "İşlemde",
  waiting_customer: "Sizden Bilgi Bekleniyor",
  resolved: "Çözüldü",
  closed: "Kapatıldı",
  reopened: "Yeniden Açıldı",
  cancelled: "İptal Edildi",
};

export const TICKET_CATEGORIES = [
  "bug",
  "incident",
  "improvement",
  "question",
  "data_correction",
] as const;

export type TicketCategory = (typeof TICKET_CATEGORIES)[number];

export const TICKET_CATEGORY_LABELS: Record<TicketCategory, string> = {
  bug: "Hata",
  incident: "Kesinti / Arıza",
  improvement: "İyileştirme Talebi",
  question: "Soru",
  data_correction: "Veri Düzeltme",
};

export const TICKET_CATEGORY_HINTS: Record<TicketCategory, string> = {
  bug: "Beklenen gibi çalışmayan bir ekran veya işlem",
  incident: "Çalışmayı durduran kesinti veya erişim sorunu",
  improvement: "Yeni özellik veya mevcut akışın iyileştirilmesi",
  question: "Kullanım sorusu veya bilgi talebi",
  data_correction: "Yanlış girilmiş kaydın düzeltilmesi",
};

export const TICKET_IMPACTS = [
  "single_user",
  "multiple_users",
  "tenant_blocked",
  "security_or_data_risk",
] as const;

export type TicketImpact = (typeof TICKET_IMPACTS)[number];

export const TICKET_IMPACT_LABELS: Record<TicketImpact, string> = {
  single_user: "Tek kullanıcı etkileniyor",
  multiple_users: "Birden çok kullanıcı etkileniyor",
  tenant_blocked: "İşlemlerimiz durdu",
  security_or_data_risk: "Güvenlik veya veri kaybı riski",
};

export const TICKET_RESOLUTION_CODE_LABELS: Record<string, string> = {
  fixed: "Düzeltildi",
  workaround: "Geçici çözüm sağlandı",
  configuration: "Yapılandırma ile çözüldü",
  not_reproducible: "Tekrarlanamadı",
  duplicate: "Aynı talep daha önce açılmış",
  wont_fix: "Değişiklik yapılmayacak",
  answered: "Yanıtlandı",
};

/** Yerel gönderim durumu — Hermes'in değil, LogiSlot'un alanıdır. */
export const TICKET_DELIVERY_STATUS_LABELS: Record<string, string> = {
  draft: "Taslak",
  pending: "Gönderiliyor",
  delivering: "Gönderiliyor",
  synced: "Senkron",
  retrying: "Yeniden deneniyor",
  failed: "Gönderilemedi",
};

/** Müşteri listesindeki sekmeler; backend `status_group` parametresiyle eşleşir. */
export const TICKET_STATUS_GROUPS = [
  { key: "open", label: "Açık" },
  { key: "in_progress", label: "İşlemde" },
  { key: "waiting_customer", label: "Sizden Bilgi Bekliyor" },
  { key: "closed", label: "Çözüldü / Kapalı" },
] as const;

export type TicketStatusGroup = (typeof TICKET_STATUS_GROUPS)[number]["key"];

/** V1 ek dosya allowlist'i — SVG/HTML/script/arşiv bilerek yok. */
export const TICKET_ATTACHMENT_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/pdf",
  "text/plain",
] as const;

export function ticketStatusLabel(status: string): string {
  return TICKET_STATUS_LABELS[status as TicketStatus] ?? status;
}

export function ticketCategoryLabel(category: string): string {
  return TICKET_CATEGORY_LABELS[category as TicketCategory] ?? category;
}

export function ticketImpactLabel(impact: string): string {
  return TICKET_IMPACT_LABELS[impact as TicketImpact] ?? impact;
}
