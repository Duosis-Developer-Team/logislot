"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LoginFormCard } from "@/components/auth/login-form-card";
import { LoginHero } from "@/components/auth/login-hero";
import { PortalSelector } from "@/components/auth/portal-selector";
import { PORTALS, type Portal } from "@/components/auth/portals";
import { LogiSlotLogo } from "@/components/brand/logo";
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
    <main className="relative grid min-h-screen grid-cols-1 lg:grid-cols-[1.05fr_1fr]">
      <div className="absolute right-3 top-3 z-20">
        <ThemeToggle />
      </div>

      <LoginHero />

      {/* Giriş paneli */}
      <section className="flex items-center justify-center p-5 sm:p-8">
        <div className="w-full max-w-md">
          <div className="stagger">
            {/* Mobil marka başlığı */}
            <div className="mb-8 flex flex-col items-center gap-2.5 text-center lg:hidden">
              <LogiSlotLogo size="lg" priority />
              <p className="text-sm text-muted-foreground">
                Akıllı Mal Kabul &amp; Rampa Randevu Platformu
              </p>
            </div>

            <div className="mb-6">
              <h2 className="text-[1.7rem] font-bold tracking-tight">Giriş yap</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Portalınızı seçin ve hesabınızla devam edin.
              </p>
            </div>

            <div className="mb-5">
              <PortalSelector value={portal} onChange={selectPortal} />
            </div>
          </div>

          {/* Portal değişince form içeriği yeniden fade-in olsun (key) */}
          <div key={portal} className="animate-fade-in">
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
      </section>
    </main>
  );
}
