"use client";

/**
 * Portal-specific login sayfası — PORTAL SWITCHER YOKTUR.
 * Her deployment kendi portal kimliğini bilir; kullanıcı yalnızca o portalın
 * login'ini görür. Login sonrası client rol doğrulaması yapılır: /auth/me
 * user_type portal ile uyuşmazsa oturum temizlenir ve net hata gösterilir
 * (backend endpoint ayrımı zaten cross-portal login'i engeller; bu katman
 * savunma derinliğidir).
 */

import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { LoginBackground } from "@/components/auth/login-background";
import { LoginFormCard } from "@/components/auth/login-form-card";
import { portals, type Portal } from "@/components/auth/portals";
import { LogiSlotIcon, LogiSlotLogo } from "@/components/brand/logo";
import { LanguageToggle } from "@/components/shell/language-toggle";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { apiRequest, authApi, clearSession, storeSession } from "@/lib/api/client";
import type { MeDto } from "@/lib/api/types";
import { demoCredentialsFor } from "@/lib/demo-mode";
import { useT } from "@/lib/i18n/provider";

export function PortalLoginPage({
  portal,
  entryUrl,
}: {
  portal: Portal;
  /** "Ana portal seçimine geri dön" hedefi; null = link gösterme (hidden platform). */
  entryUrl: string | null;
}) {
  const t = useT();
  const router = useRouter();
  const config = portals(t).find((p) => p.key === portal)!;
  // Demo modu kapaliyken (prod) form bos baslar.
  const demo = demoCredentialsFor(portal);
  const [email, setEmail] = useState(demo?.email ?? "");
  const [password, setPassword] = useState(demo?.password ?? "");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  /** Tenant'in markali alan adi varsa oturumu oraya DEVREDER.
   *
   * Oturum `localStorage`'da ve ORIGIN'e bagli oldugu icin duz bir yonlendirme
   * kullaniciyi login ekranina geri dusururdu. Bunun yerine kisa omurlu, tek
   * kullanimlik bir kod alinir; hedef alan adi onu token ile takas eder. Token
   * hicbir zaman URL'e konmaz.
   *
   * Devir basarisiz olursa (kod alinamadi, alan adi yanlis girilmis) kullanici
   * BULUNDUGU alan adinda calismaya devam eder — markali URL kozmetiktir,
   * ugruna girisi bozmayiz.
   */
  async function handOffToBrandedHost(
    brandedHost: string | null,
    target: string,
  ): Promise<boolean> {
    if (!brandedHost || brandedHost === window.location.host) return false;
    try {
      const { code } = await authApi.issueHandoff();
      const next = encodeURIComponent(target);
      window.location.replace(
        `https://${brandedHost}/handoff?code=${encodeURIComponent(code)}&next=${next}`,
      );
      return true;
    } catch {
      return false;
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const tokens = await authApi.login(portal, email, password);
      storeSession(tokens.access_token, portal, tokens.refresh_token);
      if (tokens.must_change_password) {
        router.push("/change-password");
        return;
      }
      // Rol doğrulaması: bu portal için yetkili değilse oturumu düşür.
      const me = await apiRequest<MeDto>("/auth/me");
      if (me.user_type !== config.expectedUserType) {
        clearSession();
        setError(config.wrongRoleMessage);
        return;
      }
      if (await handOffToBrandedHost(tokens.branded_host, config.target)) {
        return; // tarayıcı markalı alan adına gidiyor
      }
      router.push(config.target);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : t.auth.failed,
      );
    } finally {
      setLoading(false);
    }
  }

  const Icon = config.icon;

  return (
    <main className="relative flex min-h-screen items-center justify-center gap-6 overflow-hidden bg-gradient-to-br from-white via-sky-50 to-sky-100 px-5 py-10 dark:from-background dark:via-background dark:to-background sm:px-6 lg:gap-10 xl:gap-16">
      <LoginBackground />

      <div className="absolute right-3 top-3 z-20">
        <LanguageToggle />
          <ThemeToggle />
      </div>

      {/* Büyük marka ikonu — sol (yalnızca masaüstü) */}
      <div className="relative z-10 hidden shrink-0 items-center justify-center lg:flex">
        <LogiSlotIcon
          variant="auto"
          priority
          className="animate-float w-auto drop-shadow-2xl lg:h-[26rem] xl:h-[32rem] 2xl:h-[36rem]"
        />
      </div>

      <div className="relative z-10 w-full max-w-md shrink-0">
        <div className="animate-scale-in rounded-3xl border border-border bg-card/95 p-6 shadow-pop backdrop-blur-xl sm:p-8">
          <div className="stagger">
            <div className="flex flex-col items-center gap-3 text-center">
              <LogiSlotLogo size="lg" priority />
            </div>

            <div className="mt-6 flex flex-col items-center gap-2 text-center">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Icon className="h-5 w-5" />
              </span>
              <h1 className="text-2xl font-bold tracking-tight">{config.title}</h1>
              <p className="text-sm text-muted-foreground">{config.subtitle}</p>
            </div>
          </div>

          <div className="mt-6 animate-fade-in">
            <LoginFormCard
              active={config}
              email={email}
              setEmail={setEmail}
              password={password}
              setPassword={setPassword}
              loading={loading}
              error={error}
              onSubmit={handleSubmit}
            />
          </div>

          {entryUrl && (
            <a
              href={entryUrl}
              className="mt-5 flex items-center justify-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
              {t.auth.backToPortals}
            </a>
          )}
        </div>

        <p className="mt-5 text-center text-xs text-muted-foreground">
          {t.auth.loginFooter}
        </p>
      </div>
    </main>
  );
}
