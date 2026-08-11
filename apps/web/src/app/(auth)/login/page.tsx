import { redirect } from "next/navigation";
import { PortalLoginPage } from "@/components/auth/portal-login-page";
import { getPortalMode, getPortalUrls } from "@/lib/portal-mode";

/**
 * /login — deployment'ın portal moduna göre TEK portalın login'i render edilir
 * (3'lü portal switcher kaldırıldı). Entry/all modunda login'in portal bağlamı
 * olmadığından public selector'a yönlenir; portal login'leri all modunda
 * /login/<portal> altındadır.
 */
export const dynamic = "force-dynamic";

export default function LoginPage() {
  const mode = getPortalMode();
  if (mode === "entry" || mode === "all") redirect("/");
  const urls = getPortalUrls();
  // Hidden platform: entry'ye link YOK (public discovery yapılmaz).
  const entryUrl = mode === "platform" ? null : urls.entry;
  return <PortalLoginPage portal={mode} entryUrl={entryUrl} />;
}
