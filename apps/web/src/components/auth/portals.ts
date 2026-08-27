import { Building2, Globe2, Truck, type LucideIcon } from "lucide-react";

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

export const PORTALS: PortalConfig[] = [
  {
    key: "supplier",
    title: "Tedarikçi Portalı",
    short: "Tedarikçi",
    description: "Randevu talep edin, takip edin",
    subtitle:
      "Teslimat randevularınızı oluşturun, takip edin ve güncel durumları görüntüleyin.",
    icon: Truck,
    target: "/supplier/appointments",
    buttonLabel: "Tedarikçi Portalı'na Giriş",
    expectedUserType: "supplier",
    wrongRoleMessage:
      "Bu hesap Tedarikçi Portalı için yetkili değil. Lütfen doğru portal üzerinden giriş yapın.",
  },
  {
    key: "admin",
    title: "Yönetim Paneli",
    short: "Yönetim",
    description: "Takvim, onay ve tesis yönetimi",
    subtitle: "Rampa takvimini, onay süreçlerini ve tesis operasyonlarını yönetin.",
    icon: Building2,
    target: "/admin/dashboard",
    buttonLabel: "Yönetim Paneli'ne Giriş",
    expectedUserType: "tenant",
    wrongRoleMessage:
      "Bu hesap Yönetim Paneli için yetkili değil. Lütfen doğru portal üzerinden giriş yapın.",
  },
  {
    key: "platform",
    title: "Platform Yönetimi",
    short: "Platform",
    description: "Tenant, kullanım ve plan yönetimi",
    subtitle: "Tenant, tesis, plan ve sistem sağlığı süreçlerini yönetin.",
    icon: Globe2,
    target: "/platform/tenants",
    buttonLabel: "Platform Yönetimi'ne Giriş",
    expectedUserType: "platform",
    wrongRoleMessage: "Bu hesap Platform Yönetimi için yetkili değil.",
    hidden: true,
  },
];
