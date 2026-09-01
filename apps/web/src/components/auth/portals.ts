import { Building2, Globe2, Truck, type LucideIcon } from "lucide-react";
import type { Dictionary } from "@/lib/i18n/dictionaries/tr";

export type Portal = "supplier" | "admin" | "platform";

export interface PortalConfig {
  key: Portal;
  /** Tam ad — buton ve başlıklarda. */
  title: string;
  /** Kısa ad — portal seçici kartında. */
  short: string;
  description: string;
  /** Portal-specific login sayfası alt başlığı. */
  subtitle: string;
  icon: LucideIcon;
  target: string;
  buttonLabel: string;
  /** Login sonrası /auth/me.user_type bu değer olmalı; değilse oturum düşer. */
  expectedUserType: "supplier" | "tenant" | "platform";
  /** Yanlış rol hata mesajı (client-side savunma katmanı). */
  wrongRoleMessage: string;
  /** Hidden portal: public entry'den linklenmez, mobile'da yoktur. */
  hidden?: boolean;
}

/** Yapisal alanlar — metinler dile gore `portals(t)` icinde eklenir. */
const STRUCTURE = {
  supplier: {
    icon: Truck,
    target: "/supplier/appointments",
    expectedUserType: "supplier",
  },
  admin: { icon: Building2, target: "/admin/dashboard", expectedUserType: "tenant" },
  platform: {
    icon: Globe2,
    target: "/platform/tenants",
    expectedUserType: "platform",
    hidden: true,
  },
} as const;

/** Portal tanimlari, secili dilde. */
export function portals(t: Dictionary): PortalConfig[] {
  return (["supplier", "admin", "platform"] as const).map((key) => ({
    key,
    ...STRUCTURE[key],
    title: t.auth.portals[key].title,
    short: t.auth.portals[key].short,
    description: t.auth.portals[key].description,
    subtitle: t.auth.portals[key].subtitle,
    buttonLabel: t.auth.portals[key].buttonLabel,
    wrongRoleMessage: t.auth.portals[key].wrongRole,
  }));
}
