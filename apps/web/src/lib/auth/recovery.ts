/**
 * Self-servis hesap kurtarma (şifremi/kullanıcı adımı unuttum) — SERVER
 * yardımcıları. Portal bağlamı deployment modundan gelir; yalnızca tek
 * instance'lık modlarda (entry/all) `?portal=` parametresine bakılır.
 *
 * Platform (gizli portal) bu akışa HİÇ girmez: platform modunda null döner ve
 * sayfa /login'e yönlenir.
 */

import { getPortalUrls, type PortalMode } from "@/lib/portal-mode";

export type RecoveryPortal = "supplier" | "admin";

export function resolveRecoveryPortal(
  mode: PortalMode,
  raw: string | string[] | undefined,
): RecoveryPortal | null {
  if (mode === "platform") return null;
  if (mode === "supplier" || mode === "admin") return mode;
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value === "admin" ? "admin" : "supplier";
}

/** "Girişe dön" hedefi — moda göre portalın login adresi. */
export function recoveryLoginUrl(mode: PortalMode, portal: RecoveryPortal): string {
  if (mode === "supplier" || mode === "admin") return "/login";
  if (mode === "all") return `/login/${portal}`;
  return getPortalUrls()[portal];
}
