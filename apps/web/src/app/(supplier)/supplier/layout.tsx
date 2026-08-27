"use client";

import { CalendarDays, CirclePlus, LifeBuoy, UserRound } from "lucide-react";
import Link from "next/link";
import { LoadingState } from "@/components/config/states";
import { LogiSlotLogo } from "@/components/brand/logo";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { AppShell, type AppNavItem } from "@/components/shell/app-shell";
import { Button } from "@/components/ui/button";
import { SessionProvider, useSession } from "@/lib/auth/session";

const NAV: AppNavItem[] = [
  { href: "/supplier/appointments", label: "Randevularım", icon: CalendarDays },
  { href: "/supplier/new-appointment", label: "Yeni Randevu", icon: CirclePlus },
  // Tedarikci portal izinleri rol tablosuyla degil sabit portal setiyle
  // yonetildiginden (bkz. SupplierPortalPermission.DEFAULT) menu kosulsuzdur;
  // yetki yine backend'de dogrulanir.
  { href: "/supplier/tickets", label: "Destek", icon: LifeBuoy },
  { href: "/supplier/profile", label: "Profil", icon: UserRound },
];

function SupplierShell({ children }: { children: React.ReactNode }) {
  const session = useSession();

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
        <LogiSlotLogo size="lg" />
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
    <AppShell
      nav={NAV}
      roleLabel="Tedarikçi"
      brand={<LogiSlotLogo size="lg" priority />}
      profileHref="/supplier/profile"
      footer="LogiSlot · Tedarikçi Portalı"
      headerActions={<NotificationBell variant="supplier" facilityId="self" />}
    >
      {children}
    </AppShell>
  );
}

export default function SupplierLayout({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <SupplierShell>{children}</SupplierShell>
    </SessionProvider>
  );
}
