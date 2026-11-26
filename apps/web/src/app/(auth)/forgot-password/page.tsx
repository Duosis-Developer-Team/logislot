import { redirect } from "next/navigation";
import { ForgotPasswordScreen } from "@/components/auth/account-recovery";
import { recoveryLoginUrl, resolveRecoveryPortal } from "@/lib/auth/recovery";
import { getPortalMode } from "@/lib/portal-mode";

/** Şifremi unuttum — tedarikçi/yönetim portalları (platform ASLA). */
export const dynamic = "force-dynamic";

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const mode = getPortalMode();
  const portal = resolveRecoveryPortal(mode, (await searchParams).portal);
  if (!portal) redirect("/login");
  return <ForgotPasswordScreen portal={portal} loginUrl={recoveryLoginUrl(mode, portal)} />;
}
