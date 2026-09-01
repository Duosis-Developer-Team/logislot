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

// ---------------------------------------------------------------- diller
//
// Yukaridaki `*_LABELS` sabitleri TURKCEDIR ve OYLE KALIR: mobil uygulama
// dogrudan onlari kullaniyor ve bu turda cevrilmedi. Web, asagidaki
// `*_LABELS_BY_LOCALE` haritalarindan secili dile gore okur.
//
// Ayni degerleri iki yerde tutmamak icin Turkce taraf mevcut sabitleri
// yeniden kullanir; yalnizca Ingilizce karsiliklar burada tanimlidir.

export type LabelLocale = "tr" | "en";

function byLocale<T>(tr: T, en: T): Record<LabelLocale, T> {
  return { tr, en };
}

export const APPOINTMENT_STATUS_LABELS_BY_LOCALE = byLocale(APPOINTMENT_STATUS_LABELS, {
  pending: "Pending",
  approved: "Approved",
  revision_pending: "Change requested",
  rejected: "Rejected",
  completed: "Completed",
  cancelled: "Cancelled",
});

export const DELIVERY_TYPE_LABELS_BY_LOCALE = byLocale(DELIVERY_TYPE_LABELS, {
  standard: "Scheduled",
  // "Kargo" burada parcel/courier teslimati demek: varis saati belirsizdir.
  cargo: "Courier (arrival not fixed)",
});

export const CARGO_WINDOW_LABELS_BY_LOCALE = byLocale(CARGO_WINDOW_LABELS, {
  morning: "Morning (08:00–12:00)",
  afternoon: "Afternoon (12:00–18:00)",
  all_day: "All day",
});

export const QUANTITY_UNIT_LABELS_BY_LOCALE = byLocale(QUANTITY_UNIT_LABELS, {
  pallet: "Pallet",
  piece: "Piece",
  box: "Box",
  carton: "Carton",
});

export const SLOT_STATUS_LABELS_BY_LOCALE = byLocale(SLOT_STATUS_LABELS, {
  available: "Available",
  partial: "Partly booked",
  full: "Full",
});

export const TICKET_STATUS_LABELS_BY_LOCALE = byLocale(TICKET_STATUS_LABELS, {
  open: "Open",
  in_progress: "In progress",
  waiting_customer: "Waiting on you",
  resolved: "Resolved",
  closed: "Closed",
  reopened: "Reopened",
  cancelled: "Cancelled",
});

export const TICKET_CATEGORY_LABELS_BY_LOCALE = byLocale(TICKET_CATEGORY_LABELS, {
  bug: "Bug",
  incident: "Outage / incident",
  improvement: "Improvement request",
  question: "Question",
  data_correction: "Data correction",
});

export const TICKET_CATEGORY_HINTS_BY_LOCALE = byLocale(TICKET_CATEGORY_HINTS, {
  bug: "A screen or action that doesn't behave as expected",
  incident: "An outage or access problem that stops work",
  improvement: "A new capability or a change to an existing flow",
  question: "A how-to question or a request for information",
  data_correction: "A record that was entered incorrectly",
});

export const TICKET_IMPACT_LABELS_BY_LOCALE = byLocale(TICKET_IMPACT_LABELS, {
  single_user: "One person affected",
  multiple_users: "Several people affected",
  tenant_blocked: "Our operations have stopped",
  security_or_data_risk: "Security or data-loss risk",
});

export const TICKET_RESOLUTION_CODE_LABELS_BY_LOCALE = byLocale(
  TICKET_RESOLUTION_CODE_LABELS,
  {
    fixed: "Fixed",
    workaround: "Workaround provided",
    configuration: "Resolved by configuration",
    not_reproducible: "Could not reproduce",
    duplicate: "Duplicate of an earlier request",
    wont_fix: "Will not be changed",
    answered: "Answered",
  },
);

export const TICKET_DELIVERY_STATUS_LABELS_BY_LOCALE = byLocale(
  TICKET_DELIVERY_STATUS_LABELS,
  {
    draft: "Draft",
    pending: "Sending",
    delivering: "Sending",
    synced: "In sync",
    retrying: "Retrying",
    failed: "Not delivered",
  },
);

export const TICKET_STATUS_GROUP_LABELS_BY_LOCALE = byLocale(
  Object.fromEntries(TICKET_STATUS_GROUPS.map((g) => [g.key, g.label])) as Record<
    TicketStatusGroup,
    string
  >,
  {
    open: "Open",
    in_progress: "In progress",
    waiting_customer: "Waiting on you",
    closed: "Resolved / closed",
  },
);
