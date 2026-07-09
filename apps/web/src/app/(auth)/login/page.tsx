"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LoginBackground } from "@/components/auth/login-background";
import { LoginFormCard } from "@/components/auth/login-form-card";
import { PortalSelector } from "@/components/auth/portal-selector";
import { PORTALS, type Portal } from "@/components/auth/portals";
import { LogiSlotIcon, LogiSlotLogo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { authApi, storeSession } from "@/lib/api/client";

export default function LoginPage() {
  const router = useRouter();
  const [portal, setPortal] = useState<Portal>("supplier");
  const [email, setEmail] = useState(PORTALS[0].demo);
  const [password, setPassword] = useState("Demo123!");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const active = PORTALS.find((p) => p.key === portal)!;

  function selectPortal(next: Portal) {
    const cfg = PORTALS.find((p) => p.key === next)!;
    setPortal(next);
    setEmail(cfg.demo);
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const tokens = await authApi.login(portal, email, password);
      storeSession(tokens.access_token, portal, tokens.refresh_token);
      // Gecici parola akisi: once parola degistirilmeli (API zaten 403'ler)
      router.push(tokens.must_change_password ? "/change-password" : active.target);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Giriş başarısız — API'nin çalıştığından emin olun.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center gap-8 overflow-hidden bg-gradient-to-br from-white via-sky-50 to-sky-100 px-5 py-10 dark:from-background dark:via-background dark:to-background sm:px-6 lg:gap-14 xl:gap-24">
      <LoginBackground />

      <div className="absolute right-3 top-3 z-20">
        <ThemeToggle />
      </div>

      {/* Büyük marka ikonu — sol (yalnızca masaüstü) */}
      <div className="relative z-10 hidden shrink-0 items-center justify-center lg:flex">
        <LogiSlotIcon
          variant="auto"
          priority
          className="animate-float h-64 w-64 drop-shadow-2xl xl:h-80 xl:w-80 2xl:h-[26rem] 2xl:w-[26rem]"
        />
      </div>

      <div className="relative z-10 w-full max-w-md shrink-0">
        <div className="animate-scale-in rounded-3xl border border-border bg-card/95 p-6 shadow-pop backdrop-blur-xl sm:p-8">
          <div className="stagger">
            <div className="flex flex-col items-center gap-3 text-center">
              <LogiSlotLogo size="lg" priority />
            </div>

            <div className="mt-6 text-center">
              <h1 className="text-2xl font-bold tracking-tight">Giriş yap</h1>
              <p className="mt-1.5 text-sm text-muted-foreground">
                Portalınızı seçin ve hesabınızla devam edin.
              </p>
            </div>

            <div className="mt-6">
              <PortalSelector value={portal} onChange={selectPortal} />
            </div>
          </div>

          {/* Portal değişince form yeniden fade-in olsun (key) */}
          <div key={portal} className="mt-4 animate-fade-in">
            <LoginFormCard
              active={active}
              email={email}
              setEmail={setEmail}
              password={password}
              setPassword={setPassword}
              loading={loading}
              error={error}
              onSubmit={handleSubmit}
            />
          </div>
        </div>

        <p className="mt-5 text-center text-xs text-muted-foreground">
          © 2026 LogiSlot · Kurumsal lojistik operasyon platformu
        </p>
      </div>
    </main>
  );
}
