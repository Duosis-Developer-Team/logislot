"use client";

import {
  Building2,
  CreditCard,
  Gauge,
  LifeBuoy,
  ScrollText,
  Ticket,
} from "lucide-react";
import Link from "next/link";
import { LoadingState } from "@/components/config/states";
import { LogiSlotLogo } from "@/components/brand/logo";
import { AppShell, type AppNavItem } from "@/components/shell/app-shell";
import { Button } from "@/components/ui/button";
import { SessionProvider, useSession } from "@/lib/auth/session";
import type { Dictionary } from "@/lib/i18n/dictionaries/tr";
import { useT } from "@/lib/i18n/provider";

/**
 * Platform (vendor) paneli — tenant paneliyle ayni webapp kabugunu kullanir.
 * Ayirt edici sinyal artik ayri bir koyu tema degil; ortak tasarim dilinde
 * "Platform" rol rozeti ve platforma ozgu (yalnizca AGREGAT) menudur.
 */
function navItems(t: Dictionary): AppNavItem[] {
  return [
    {
      href: "/platform/tenants",
      label: t.nav.platform.tenants,
      icon: Building2,
    },
    { href: "/platform/usage", label: t.nav.platform.usage, icon: Gauge },
    { href: "/platform/plans", label: t.nav.platform.plans, icon: CreditCard },
    {
      href: "/platform/support",
      label: t.nav.platform.support,
      icon: LifeBuoy,
    },
    {
      href: "/platform/ticket-routing",
      label: t.nav.platform.ticketRouting,
      icon: Ticket,
    },
    {
      href: "/platform/audit-logs",
      label: t.nav.platform.auditLogs,
      icon: ScrollText,
    },
  ];
}

function PlatformShell({ children }: { children: React.ReactNode }) {
  const t = useT();
  const session = useSession();

  if (session.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <LoadingState label={t.states.verifyingSession} />
      </div>
    );
  }

  // Platform paneli yalnizca platform (vendor) kullanicilarina aciktir.
  if (
    session.isUnauthorized ||
    (session.me && session.me.user_type !== "platform")
  ) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-4">
        <LogiSlotLogo size="lg" />
        <p className="text-sm text-muted-foreground">
          Bu panel için platform yöneticisi girişi gerekli.
        </p>
        <Link href="/login">
          <Button>Giriş Ekranına Dön</Button>
        </Link>
      </div>
    );
  }

  return (
    <AppShell
      nav={navItems(t)}
      roleLabel={t.nav.role.platform}
      footer="LogiSlot · Vendor / Süper-Admin"
    >
      {children}
    </AppShell>
  );
}

export default function PlatformLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SessionProvider>
      <PlatformShell>{children}</PlatformShell>
    </SessionProvider>
  );
}
