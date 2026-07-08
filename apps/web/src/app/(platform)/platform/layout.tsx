"use client";

import { Building2, CreditCard, Factory, Gauge,
  LifeBuoy,
  ScrollText,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LoadingState } from "@/components/config/states";
import { Logo } from "@/components/domain/logo";
import { Button } from "@/components/ui/button";
import { SessionProvider, useSession } from "@/lib/auth/session";
import { cn } from "@/lib/utils";

/**
 * Platform (vendor) paneli — tenant paneliyle karismamasi icin farkli
 * gorsel vurgu: koyu ust serit. Yalnizca AGREGAT veri gosterir.
 */
const NAV = [
  { href: "/platform/tenants", label: "Tenant Dizini", icon: Building2 },
  { href: "/platform/facilities", label: "Tesisler", icon: Factory },
  { href: "/platform/usage", label: "Kullanım & Sağlık", icon: Gauge },
  { href: "/platform/plans", label: "Planlar", icon: CreditCard },
  { href: "/platform/support", label: "Destek", icon: LifeBuoy },
  { href: "/platform/audit-logs", label: "Denetim İzleri", icon: ScrollText },
];

function PlatformShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
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
        <Logo className="text-xl" />
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
    <div className="min-h-screen bg-background">
      <header className="border-b border-slate-800 bg-slate-950 text-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Logo light />
            <span className="rounded-full bg-white/10 px-2.5 py-1 text-xs font-medium">
              Platform Yönetimi
            </span>
          </div>
          <span className="text-xs text-slate-400">Vendor / Süper-Admin</span>
        </div>
        <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4">
          {NAV.map((item) => {
            const Icon = item.icon;
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
                  active
                    ? "border-white text-white"
                    : "border-transparent text-slate-400 hover:text-white",
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>
      <main className="mx-auto max-w-6xl p-4 lg:p-6">{children}</main>
    </div>
  );
}

export default function PlatformLayout({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <PlatformShell>{children}</PlatformShell>
    </SessionProvider>
  );
}
