import { Building2, Globe2, Truck, type LucideIcon } from "lucide-react";

export type Portal = "supplier" | "admin" | "platform";

export interface PortalConfig {
  key: Portal;
  /** Tam ad — buton ve başlıklarda. */
  title: string;
  /** Kısa ad — portal seçici kartında. */
  short: string;
  description: string;
  icon: LucideIcon;
  demo: string;
  target: string;
  buttonLabel: string;
}

export const PORTALS: PortalConfig[] = [
  {
    key: "supplier",
    title: "Tedarikçi Portalı",
    short: "Tedarikçi",
    description: "Randevu talep edin, takip edin",
    icon: Truck,
    demo: "tedarikci@anadoluun.com",
    target: "/supplier/appointments",
    buttonLabel: "Tedarikçi Portalı'na Giriş",
  },
  {
    key: "admin",
    title: "Yönetim Paneli",
    short: "Yönetim",
    description: "Takvim, onay ve tesis yönetimi",
    icon: Building2,
    demo: "admin@cakesbakes.com",
    target: "/admin/dashboard",
    buttonLabel: "Yönetim Paneli'ne Giriş",
  },
  {
    key: "platform",
    title: "Platform Yönetimi",
    short: "Platform",
    description: "Tenant, kullanım ve plan yönetimi",
    icon: Globe2,
    demo: "admin@logislot.com",
    target: "/platform/tenants",
    buttonLabel: "Platform Yönetimi'ne Giriş",
  },
];
