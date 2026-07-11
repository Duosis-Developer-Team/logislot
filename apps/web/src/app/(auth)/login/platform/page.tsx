import { redirect } from "next/navigation";
import { PortalLoginPage } from "@/components/auth/portal-login-page";
import { getPortalMode } from "@/lib/portal-mode";

/**
 * Hidden platform login — YALNIZCA "all" (tek-instance lokal) modda bu yoldan
 * erişilir; dev/prod'da platform login'i ayrı hidden deployment'ın /login'idir
 * (public selector'dan LİNKLENMEZ). Entry'ye geri dön linki bilinçli yoktur.
 */
export const dynamic = "force-dynamic";

export default function PlatformLoginPage() {
  const mode = getPortalMode();
  if (mode === "entry") redirect("/");
  if (mode !== "all") redirect("/login");
  return <PortalLoginPage portal="platform" entryUrl={null} />;
}
