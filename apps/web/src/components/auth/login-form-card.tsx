"use client";

import { AlertCircle, ArrowRight, Eye, EyeOff, Loader2 } from "lucide-react";
import { useState } from "react";
import { DemoCredentials } from "@/components/auth/demo-credentials";
import { type PortalConfig } from "@/components/auth/portals";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { demoCredentialsFor } from "@/lib/demo-mode";
import { useT } from "@/lib/i18n/provider";

/**
 * Premium login form kartı — 48px inputlar, parola göster/gizle, buton durumları,
 * inline hata, demo hesap yardımcısı.
 */
export function LoginFormCard({
  active,
  email,
  setEmail,
  password,
  setPassword,
  loading,
  error,
  onSubmit,
}: {
  active: PortalConfig;
  email: string;
  setEmail: (v: string) => void;
  password: string;
  setPassword: (v: string) => void;
  loading: boolean;
  error: string | null;
  onSubmit: (e: React.FormEvent) => void;
}) {
  const [show, setShow] = useState(false);
  const t = useT();
  // Demo modu kapaliyken (prod build) null doner ve ipucu hic render edilmez.
  const demo = demoCredentialsFor(active.key);

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div>
        <Label htmlFor="email">{t.auth.email}</Label>
        <Input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          required
          className="h-12"
        />
      </div>

      <div>
        <Label htmlFor="password">{t.auth.password}</Label>
        <div className="relative">
          <Input
            id="password"
            type={show ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
            className="h-12 pr-11"
          />
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            aria-label={show ? t.auth.hidePassword : t.auth.showPassword}
            className="absolute right-1.5 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            {show ? <EyeOff className="h-[1.15rem] w-[1.15rem]" /> : <Eye className="h-[1.15rem] w-[1.15rem]" />}
          </button>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="flex animate-fade-in items-start gap-2.5 rounded-xl border border-destructive/30 bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <Button type="submit" size="lg" disabled={loading} className="mt-1 w-full">
        {loading ? (
          <>
            <Loader2 className="animate-spin" />
            {t.auth.signingIn}
          </>
        ) : (
          <>
            {active.buttonLabel}
            <ArrowRight />
          </>
        )}
      </Button>

      {demo ? (
        <DemoCredentials email={demo.email} password={demo.password} />
      ) : null}
    </form>
  );
}
