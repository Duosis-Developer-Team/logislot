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
