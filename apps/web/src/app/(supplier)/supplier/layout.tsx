"use client";

import { CalendarDays, CirclePlus, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LoadingState } from "@/components/config/states";
import { ApplyBranding, BrandMark } from "@/components/domain/apply-branding";
import { Logo } from "@/components/domain/logo";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { Button } from "@/components/ui/button";
import { useBranding } from "@/lib/api/branding";
import { SessionProvider, useSession } from "@/lib/auth/session";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/supplier/appointments", label: "Randevularım", icon: CalendarDays },
  { href: "/supplier/new-appointment", label: "Yeni Randevu", icon: CirclePlus },
  { href: "/supplier/profile", label: "Profil", icon: UserRound },
];

function SupplierShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const session = useSession();
  // Tedarikcinin tesisi = me.default_facility_id; markasi portala uygulanir
  const branding = useBranding(
    session.me?.user_type === "supplier" ? session.me.default_facility_id : null,
  );

  if (session.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <LoadingState label="Oturum doğrulanıyor…" />
      </div>
    );
  }

  // Portal yalnizca tedarikci kullanicilarina aciktir.
  if (session.isUnauthorized || (session.me && session.me.user_type !== "supplier")) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-4">
        <Logo className="text-xl" />
        <p className="text-center text-sm text-muted-foreground">
          Tedarikçi portalı için tedarikçi hesabıyla giriş yapın.
        </p>
        <Link href="/login">
          <Button>Giriş Ekranına Dön</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col bg-background">
      <ApplyBranding branding={branding.data} />
      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-border bg-card/95 px-4 py-3 backdrop-blur">
        <BrandMark branding={branding.data} fallback={<Logo />} />
        <div className="flex items-center gap-1">
          <NotificationBell variant="supplier" facilityId="self" />
          <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
            Tedarikçi
          </span>
        </div>
      </header>

      <main className="flex-1 px-4 pb-24 pt-4">{children}</main>

      {/* Mobile-first alt gezinme cubugu */}
      <nav className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-md border-t border-border bg-card/95 backdrop-blur">
        <div className="grid grid-cols-3">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const active = pathname.startsWith(tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={cn(
                  "flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                <Icon className="h-5 w-5" />
                {tab.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

export default function SupplierLayout({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <SupplierShell>{children}</SupplierShell>
    </SessionProvider>
  );
}
