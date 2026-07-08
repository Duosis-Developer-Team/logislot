"use client";

import { CalendarDays, CirclePlus, UserRound } from "lucide-react";
import Link from "next/link";
import { LoadingState } from "@/components/config/states";
import { ApplyBranding, BrandMark } from "@/components/domain/apply-branding";
import { Logo } from "@/components/domain/logo";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { AppShell, type AppNavItem } from "@/components/shell/app-shell";
import { Button } from "@/components/ui/button";
import { useBranding } from "@/lib/api/branding";
import { SessionProvider, useSession } from "@/lib/auth/session";

const NAV: AppNavItem[] = [
  { href: "/supplier/appointments", label: "Randevularım", icon: CalendarDays },
  { href: "/supplier/new-appointment", label: "Yeni Randevu", icon: CirclePlus },
  { href: "/supplier/profile", label: "Profil", icon: UserRound },
];

function SupplierShell({ children }: { children: React.ReactNode }) {
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
    <>
      <ApplyBranding branding={branding.data} />
      <AppShell
        nav={NAV}
        roleLabel="Tedarikçi"
        brand={<BrandMark branding={branding.data} fallback={<Logo />} />}
        profileHref="/supplier/profile"
        footer="LogiSlot · Tedarikçi Portalı"
        headerActions={<NotificationBell variant="supplier" facilityId="self" />}
      >
        {children}
      </AppShell>
    </>
  );
}

export default function SupplierLayout({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <SupplierShell>{children}</SupplierShell>
    </SessionProvider>
  );
}
