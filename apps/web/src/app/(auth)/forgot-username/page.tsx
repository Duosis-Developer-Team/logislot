import { redirect } from "next/navigation";
import { ForgotUsernameScreen } from "@/components/auth/account-recovery";
import { recoveryLoginUrl, resolveRecoveryPortal } from "@/lib/auth/recovery";
import { getPortalMode } from "@/lib/portal-mode";

/** Kullanıcı adımı unuttum — tedarikçi: e-posta ile hatırlatma; yönetim: bilgi. */
export const dynamic = "force-dynamic";

export default async function ForgotUsernamePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const mode = getPortalMode();
  const portal = resolveRecoveryPortal(mode, (await searchParams).portal);
  if (!portal) redirect("/login");
  return <ForgotUsernameScreen portal={portal} loginUrl={recoveryLoginUrl(mode, portal)} />;
}
