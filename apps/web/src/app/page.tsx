import { redirect } from "next/navigation";
import { LandingPage } from "@/components/landing/landing-page";
import { getPortalMode, getPortalUrls } from "@/lib/portal-mode";

/**
 * Kök sayfa — entry/all modunda premium landing page + public portal seçici
 * (yalnızca Tedarikçi + Yönetim; Platform BURADA YOK). Portal modlarında
 * middleware zaten /login'e çevirir; bu redirect savunma amaçlı ikinci kattır.
 * Runtime env okunduğu için dynamic (build-time'da mod sabitlenmez).
 */
export const dynamic = "force-dynamic";

export default function Home() {
  const mode = getPortalMode();
  if (mode === "supplier" || mode === "admin" || mode === "platform") {
    redirect("/login");
  }
  const urls = getPortalUrls();
  return <LandingPage supplierUrl={urls.supplier} adminUrl={urls.admin} />;
}
