import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ResetPasswordScreen } from "@/components/auth/account-recovery";
import { recoveryLoginUrl, resolveRecoveryPortal } from "@/lib/auth/recovery";
import { getPortalMode } from "@/lib/portal-mode";

/** E-postadaki bağlantının açtığı yeni şifre ekranı (platform ASLA). */
export const dynamic = "force-dynamic";

// URL'deki token'ın Referer başlığıyla dışarı sızmaması için.
export const metadata: Metadata = { referrer: "no-referrer" };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const mode = getPortalMode();
  const params = await searchParams;
  const portal = resolveRecoveryPortal(mode, params.portal);
  if (!portal) redirect("/login");
  const rawToken = Array.isArray(params.token) ? params.token[0] : params.token;
  return (
    <ResetPasswordScreen
      portal={portal}
      token={rawToken && rawToken.length >= 16 ? rawToken : null}
      loginUrl={recoveryLoginUrl(mode, portal)}
    />
  );
}
