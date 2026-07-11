import { redirect } from "next/navigation";
import { EntrySelector } from "@/components/auth/entry-selector";
import { getPortalMode, getPortalUrls } from "@/lib/portal-mode";

/**
 * Kök sayfa — entry/all modunda public portal seçici (yalnızca Tedarikçi +
 * Yönetim; Platform BURADA YOK). Portal modlarında middleware zaten /login'e
 * çevirir; bu redirect savunma amaçlı ikinci kattır.
 * Runtime env okunduğu için dynamic (build-time'da mod sabitlenmez).
 */
export const dynamic = "force-dynamic";

export default function Home() {
  const mode = getPortalMode();
  if (mode === "supplier" || mode === "admin" || mode === "platform") {
    redirect("/login");
  }
  const urls = getPortalUrls();
  return <EntrySelector supplierUrl={urls.supplier} adminUrl={urls.admin} />;
}
