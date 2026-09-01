"use client";

import { useState } from "react";

import {
  CalendarDays,
  ClipboardList,
  LayoutDashboard,
  LifeBuoy,
  LineChart,
  Repeat,
  Settings2,
  SlidersHorizontal,
} from "lucide-react";
import Link from "next/link";
import { LogiSlotLogo } from "@/components/brand/logo";
import { ErrorState, LoadingState } from "@/components/config/states";
import { NotificationPreferencesForm } from "@/components/domain/notification-preferences";
import { AppShell, type AppNavItem } from "@/components/shell/app-shell";
import { Dialog } from "@/components/ui/dialog";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { SessionProvider, useSession } from "@/lib/auth/session";
import type { Dictionary } from "@/lib/i18n/dictionaries/tr";
import { useT } from "@/lib/i18n/provider";

/** Yonetim modulu izinlerinden herhangi biri varsa "Yonetim" menusu gorunur. */
const SETTINGS_PERMISSIONS = [
  "category.manage",
  "vehicle_category.manage",
  "dock.manage",
  "dock_conflict_group.manage",
  "calendar.override",
  "supplier.manage",
  "user.manage",
];

type AdminNavItem = AppNavItem & { permission?: string | string[] };

function navItems(t: Dictionary): AdminNavItem[] {
  return [
    {
      href: "/admin/dashboard",
      label: t.nav.admin.dashboard,
      icon: LayoutDashboard,
    },
    {
      href: "/admin/calendar",
      label: t.nav.admin.calendar,
      icon: CalendarDays,
      permission: "appt.view",
    },
    {
      href: "/admin/appointments",
      label: t.nav.admin.appointments,
      icon: ClipboardList,
      permission: "appt.view",
    },
    {
      href: "/admin/series",
      label: t.nav.admin.series,
      icon: Repeat,
      permission: "appt.view",
    },
    {
      href: "/admin/reports",
      label: t.nav.admin.reports,
      icon: LineChart,
      permission: "report.view",
    },
    {
      href: "/admin/tickets",
      label: t.nav.admin.tickets,
      icon: LifeBuoy,
      permission: "ticket.view",
    },
    {
      href: "/admin/settings",
      label: t.nav.admin.settings,
      icon: Settings2,
      permission: SETTINGS_PERMISSIONS,
    },
  ];
}

function navAllowed(
  item: AdminNavItem,
  can: (permission: string) => boolean,
): boolean {
  if (!item.permission) return true;
  const required = Array.isArray(item.permission)
    ? item.permission
    : [item.permission];
  return required.some((p) => can(p));
}

function AdminShell({ children }: { children: React.ReactNode }) {
  const t = useT();
  const session = useSession();
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const visibleNav = navItems(t).filter((item) =>
    navAllowed(item, session.can),
  );

  if (session.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <LoadingState label={t.states.verifyingSession} />
      </div>
    );
  }

  if (
    session.isUnauthorized ||
    (session.me && session.me.user_type !== "tenant")
  ) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-4">
        <LogiSlotLogo size="lg" />
        <p className="text-sm text-muted-foreground">
          {t.admin.layout.wrongPortal}
        </p>
        <Link href="/login">
          <Button>{t.admin.layout.backToLogin}</Button>
        </Link>
      </div>
    );
  }

  if (session.error) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <ErrorState
          message={t.admin.layout.apiUnreachable(session.error)}
          onRetry={() => window.location.reload()}
        />
      </div>
    );
  }

  // 1 tenant = 1 tesis (urun karari): tek kapsam varsa SECICI gosterilmez;
  // yalnizca hangi hesapta calisildigini belirten sade bir etiket kalir.
  // Coklu kapsam yalnizca eski/istisnai kayitlarda olusabilir; o durumda
  // secici geri gelir (veri kaybi/kilitlenme riski olmasin diye).
  const facilities = session.me?.facilities ?? [];
  const facilitySwitcher =
    facilities.length > 1 ? (
      <Select
        className="h-9 w-auto max-w-[13rem] text-sm sm:max-w-72"
        value={session.activeFacilityId ?? ""}
        onChange={(e) => session.setActiveFacilityId(e.target.value)}
        aria-label={t.admin.layout.activeScope}
      >
        {facilities.map((f) => (
          <option key={f.id} value={f.id}>
            {f.name}
          </option>
        ))}
      </Select>
    ) : facilities.length === 1 ? (
      <span className="max-w-[13rem] truncate text-sm font-medium sm:max-w-72">
        {facilities[0].name}
      </span>
    ) : null;

  return (
    <>
      <AppShell
        nav={visibleNav}
        roleLabel={t.nav.role.admin}
        brand={<LogiSlotLogo size="lg" priority />}
        headerStart={facilitySwitcher}
        footer={`${session.me?.name} · LogiSlot`}
        headerActions={
          <>
            <NotificationBell
              variant="admin"
              facilityId={session.activeFacilityId}
            />
            <button
              onClick={() => setPreferencesOpen(true)}
              className="rounded-lg p-2 text-muted-foreground hover:bg-muted"
              aria-label={t.admin.layout.notificationPreferences}
              title={t.admin.layout.notificationPreferences}
            >
              <SlidersHorizontal className="h-5 w-5" />
            </button>
          </>
        }
      >
        {children}
      </AppShell>

      <Dialog
        open={preferencesOpen}
        onClose={() => setPreferencesOpen(false)}
        title={t.admin.layout.notificationPreferences}
      >
        <NotificationPreferencesForm />
      </Dialog>
    </>
  );
}

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SessionProvider>
      <AdminShell>{children}</AdminShell>
    </SessionProvider>
  );
}
