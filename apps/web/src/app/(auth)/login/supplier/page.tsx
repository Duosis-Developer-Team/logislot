import { redirect } from "next/navigation";
import { PortalLoginPage } from "@/components/auth/portal-login-page";
import { getPortalMode } from "@/lib/portal-mode";

/** Tedarikçi login — yalnızca "all" (tek-instance lokal) modda bu yoldan
 *  erişilir; portal modlarında middleware /login'e tekilleştirir. */
export const dynamic = "force-dynamic";

export default function SupplierLoginPage() {
  const mode = getPortalMode();
  if (mode === "entry") redirect("/");
  if (mode !== "all") redirect("/login");
  return <PortalLoginPage portal="supplier" entryUrl="/" />;
}
