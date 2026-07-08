/**
 * Sprint 1 mock verisi — backend seed'inin (apps/api/app/seed.py) aynasi.
 * Ekranlar bu veriyle calisir; API entegrasyonu lib/api/client.ts uzerinden
 * sonraki sprintte baglanir. Mock ile gercek domain ayrimi nettir: tipler
 * @logislot/shared'dan gelir.
 */

import type { AppointmentSummary } from "@logislot/shared";

function atDay(offsetDays: number, hour: number, minute = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

export const MOCK_FACILITY = {
  id: "facility-1",
  name: "Cakes & Bakes Üretim Tesisi",
  tenant: "BTA / Cakes & Bakes",
  timezone: "Europe/Istanbul",
};

export const MOCK_DOCKS = [
  { id: "dock-1", name: "Rampa 1", note: "TIR uyumlu", is_active: true },
  { id: "dock-2", name: "Rampa 2", note: "TIR uyumlu, soğuk zincir", is_active: true },
  { id: "dock-3", name: "Rampa 3", note: "Yalnızca küçük araçlar", is_active: true },
];

export const MOCK_CATEGORIES = [
  { id: "pc-1", name: "Soğuk Zincir", min_block_minutes: 60, default_vehicle: "Frigorifik Araç" },
  { id: "pc-2", name: "Unlu Mamul Hammaddesi", min_block_minutes: 45, default_vehicle: "TIR" },
  { id: "pc-3", name: "Ambalaj", min_block_minutes: 30, default_vehicle: "Kamyon" },
  { id: "pc-4", name: "Genel", min_block_minutes: 30, default_vehicle: "Kamyonet" },
];

export const MOCK_VEHICLE_CATEGORIES = [
  { id: "vc-1", name: "TIR" },
  { id: "vc-2", name: "Kamyon" },
  { id: "vc-3", name: "Kamyonet" },
  { id: "vc-4", name: "Kargo/Parsel Aracı" },
  { id: "vc-5", name: "Frigorifik Araç" },
];

export interface MockAppointment extends AppointmentSummary {
  supplier_name: string;
  dock_name: string;
  category_name: string;
  vehicle_category_name: string;
}

export const MOCK_APPOINTMENTS: MockAppointment[] = [
  {
    id: "appt-1",
    product_name: "Buğday Unu Tip 650",
    quantity: 10,
    quantity_unit: "pallet",
    status: "approved",
    delivery_type: "standard",
    cargo_window: null,
    scheduled_start_at: atDay(0, 10),
    scheduled_end_at: atDay(0, 11),
    duration_minutes: 60,
    license_plate: "34 ABC 123",
    dock_id: "dock-1",
    supplier_id: "sup-1",
    supplier_name: "Anadolu Un A.Ş.",
    dock_name: "Rampa 1",
    category_name: "Unlu Mamul Hammaddesi",
    vehicle_category_name: "TIR",
  },
  {
    id: "appt-2",
    product_name: "Donuk Pasta Bazı",
    quantity: 6,
    quantity_unit: "box",
    status: "pending",
    delivery_type: "standard",
    cargo_window: null,
    scheduled_start_at: atDay(0, 13),
    scheduled_end_at: atDay(0, 14, 30),
    duration_minutes: 90,
    license_plate: "34 DEF 456",
    dock_id: "dock-2",
    supplier_id: "sup-2",
    supplier_name: "Marmara Soğuk Zincir Ltd.",
    dock_name: "Rampa 2",
    category_name: "Soğuk Zincir",
    vehicle_category_name: "Frigorifik Araç",
  },
  {
    id: "appt-3",
    product_name: "Etiket Ruloları",
    quantity: 20,
    quantity_unit: "carton",
    status: "pending",
    delivery_type: "cargo",
    cargo_window: "morning",
    scheduled_start_at: atDay(1, 8),
    scheduled_end_at: atDay(1, 9, 30),
    duration_minutes: 90,
    license_plate: null,
    dock_id: "dock-3",
    supplier_id: "sup-3",
    supplier_name: "Hızlı Kargo Lojistik",
    dock_name: "Rampa 3",
    category_name: "Genel",
    vehicle_category_name: "Kargo/Parsel Aracı",
  },
  {
    id: "appt-4",
    product_name: "Kek Kalıpları",
    quantity: 4,
    quantity_unit: "pallet",
    status: "completed",
    delivery_type: "standard",
    cargo_window: null,
    scheduled_start_at: atDay(-1, 11),
    scheduled_end_at: atDay(-1, 11, 45),
    duration_minutes: 45,
    license_plate: "06 XYZ 789",
    dock_id: "dock-3",
    supplier_id: "sup-1",
    supplier_name: "Anadolu Un A.Ş.",
    dock_name: "Rampa 3",
    category_name: "Genel",
    vehicle_category_name: "Kamyonet",
  },
  {
    id: "appt-5",
    product_name: "Süt Kreması",
    quantity: 8,
    quantity_unit: "box",
    status: "revision_pending",
    delivery_type: "standard",
    cargo_window: null,
    scheduled_start_at: atDay(1, 14),
    scheduled_end_at: atDay(1, 15, 30),
    duration_minutes: 90,
    license_plate: "34 KLM 001",
    dock_id: "dock-2",
    supplier_id: "sup-2",
    supplier_name: "Marmara Soğuk Zincir Ltd.",
    dock_name: "Rampa 2",
    category_name: "Soğuk Zincir",
    vehicle_category_name: "Frigorifik Araç",
  },
];

export const MOCK_SUPPLIER_PROFILE = {
  company_name: "Anadolu Un A.Ş.",
  code: "SUP-001",
  category_label: "Hammadde",
  contact_name: "Ali Kaya",
  contact_email: "tedarik@anadoluun.example.com",
  auto_approval_enabled: true,
  allowed_categories: ["Unlu Mamul Hammaddesi", "Genel"],
};

export const MOCK_TENANTS = [
  {
    id: "tenant-1",
    display_name: "BTA / Cakes & Bakes",
    status: "active",
    facilities: 1,
    plan: "Standart Plan",
    created_at: "2026-06-04",
  },
];

export const MOCK_USAGE = [
  {
    facility_name: "Cakes & Bakes Üretim Tesisi",
    tenant_name: "BTA / Cakes & Bakes",
    created_appointments: 4,
    pending_appointments: 2,
    active_docks: 3,
    active_suppliers: 3,
    active_users: 3,
  },
];

export const MOCK_PLANS = [
  {
    id: "plan-1",
    name: "Standart Plan",
    scope: "tenant",
    billing_unit_label: "per_appointment",
    status: "active",
  },
];
