/**
 * Portal izolasyonu — RUNTIME modu (build-time DEĞİL).
 *
 * Tek web image'ı 4 farklı deployment'ta farklı LOGISLOT_PORTAL_MODE env'i ile
 * çalışır (entry/supplier/admin/platform). NEXT_PUBLIC_* build-time olduğu
 * için BİLEREK kullanılmadı: mod server-side okunur, sayfalara server
 * component wrapper'larından prop olarak geçer; middleware route izolasyonunu
 * uygular. Böylece 4 ayrı image build'i gerekmez.
 *
 * "all" modu: lokal geliştirme/compose için — tüm portal login route'ları
 * açıktır ama public entry yine YALNIZCA supplier+admin gösterir (platform
 * hiçbir modda public selector'da görünmez).
 */

export type PortalMode = "entry" | "supplier" | "admin" | "platform" | "all";

const VALID_MODES: PortalMode[] = ["entry", "supplier", "admin", "platform", "all"];

export function getPortalMode(): PortalMode {
  const raw = (process.env.LOGISLOT_PORTAL_MODE ?? "all").toLowerCase();
  return (VALID_MODES as string[]).includes(raw) ? (raw as PortalMode) : "all";
}

export interface PortalUrls {
  /** Public entry (portal seçici) URL'i — portal login "geri dön" linki. */
  entry: string;
  /** Entry selector kart hedefleri. Platform URL'i BİLEREK yok. */
  supplier: string;
  admin: string;
}

/**
 * Entry kartlarının hedefleri ve "geri dön" linki.
 * Port-bazlı dev'de mutlak URL'ler env'den gelir; "all" modunda (tek instance)
 * boş bırakılır ve göreli /login/<portal> yolları kullanılır.
 */
export function getPortalUrls(): PortalUrls {
  return {
    entry: process.env.LOGISLOT_ENTRY_URL ?? "/",
    supplier: process.env.LOGISLOT_SUPPLIER_URL ?? "/login/supplier",
    admin: process.env.LOGISLOT_ADMIN_URL ?? "/login/admin",
  };
}
