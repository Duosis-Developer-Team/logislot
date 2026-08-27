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

/**
 * Platform (vendor) paneli — tenant paneliyle ayni webapp kabugunu kullanir.
 * Ayirt edici sinyal artik ayri bir koyu tema degil; ortak tasarim dilinde
 * "Platform" rol rozeti ve platforma ozgu (yalnizca AGREGAT) menudur.
 */
const NAV: AppNavItem[] = [
  { href: "/platform/tenants", label: "Müşteri Hesapları", icon: Building2 },
  { href: "/platform/usage", label: "Kullanım & Sağlık", icon: Gauge },
  { href: "/platform/plans", label: "Planlar", icon: CreditCard },
  { href: "/platform/support", label: "Sistem Sağlığı", icon: LifeBuoy },
  { href: "/platform/ticket-routing", label: "Ticket Yönlendirmesi", icon: Ticket },
  { href: "/platform/audit-logs", label: "Denetim İzleri", icon: ScrollText },
];

function PlatformShell({ children }: { children: React.ReactNode }) {
  const session = useSession();

  if (session.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <LoadingState label="Oturum doğrulanıyor…" />
      </div>
    );
  }

  // Platform paneli yalnizca platform (vendor) kullanicilarina aciktir.
  if (session.isUnauthorized || (session.me && session.me.user_type !== "platform")) {
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
      nav={NAV}
      roleLabel="Platform"
      footer="LogiSlot · Vendor / Süper-Admin"
    >
      {children}
    </AppShell>
  );
}

export default function PlatformLayout({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <PlatformShell>{children}</PlatformShell>
    </SessionProvider>
  );
}
