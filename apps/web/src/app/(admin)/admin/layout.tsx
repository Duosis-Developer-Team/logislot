"use client";

import { useState } from "react";

import {
  CalendarDays,
  ClipboardList,
  LayoutDashboard,
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

const NAV: (AppNavItem & { permission?: string | string[] })[] = [
  { href: "/admin/dashboard", label: "Genel Bakış", icon: LayoutDashboard },
  { href: "/admin/calendar", label: "Takvim", icon: CalendarDays, permission: "appt.view" },
  {
    href: "/admin/appointments",
    label: "Randevular",
    icon: ClipboardList,
    permission: "appt.view",
  },
  { href: "/admin/series", label: "Seriler", icon: Repeat, permission: "appt.view" },
  { href: "/admin/reports", label: "Raporlar", icon: LineChart, permission: "report.view" },
  {
    href: "/admin/settings",
    label: "Yönetim",
    icon: Settings2,
    permission: SETTINGS_PERMISSIONS,
  },
];

function navAllowed(
  item: (typeof NAV)[number],
  can: (permission: string) => boolean,
): boolean {
  if (!item.permission) return true;
  const required = Array.isArray(item.permission) ? item.permission : [item.permission];
  return required.some((p) => can(p));
}

function AdminShell({ children }: { children: React.ReactNode }) {
  const session = useSession();
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const visibleNav = NAV.filter((item) => navAllowed(item, session.can));

  if (session.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <LoadingState label="Oturum doğrulanıyor…" />
      </div>
    );
  }

  if (session.isUnauthorized || (session.me && session.me.user_type !== "tenant")) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-4">
        <LogiSlotLogo size="lg" />
        <p className="text-sm text-muted-foreground">
          Bu panel için tenant yöneticisi girişi gerekli.
        </p>
        <Link href="/login">
          <Button>Giriş Ekranına Dön</Button>
        </Link>
      </div>
    );
  }

  if (session.error) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <ErrorState
          message={`API'ye ulaşılamadı: ${session.error}. Backend'in çalıştığından emin olun (docker compose up).`}
          onRetry={() => window.location.reload()}
        />
      </div>
    );
  }

  const facilitySwitcher =
    session.me && session.me.facilities.length > 0 ? (
      <Select
        className="h-9 w-auto max-w-[13rem] text-sm sm:max-w-72"
        value={session.activeFacilityId ?? ""}
        onChange={(e) => session.setActiveFacilityId(e.target.value)}
        aria-label="Aktif tesis"
      >
        {session.me.facilities.map((f) => (
          <option key={f.id} value={f.id}>
            {f.name}
          </option>
        ))}
      </Select>
    ) : null;

  return (
    <>
      <AppShell
        nav={visibleNav}
        roleLabel="Yönetim"
        brand={<LogiSlotLogo size="md" priority />}
        headerStart={facilitySwitcher}
        footer={`${session.me?.name} · LogiSlot`}
        headerActions={
          <>
            <NotificationBell variant="admin" facilityId={session.activeFacilityId} />
            <button
              onClick={() => setPreferencesOpen(true)}
              className="rounded-lg p-2 text-muted-foreground hover:bg-muted"
              aria-label="Bildirim Tercihleri"
              title="Bildirim tercihleri"
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
        title="Bildirim Tercihleri"
      >
        <NotificationPreferencesForm />
      </Dialog>
    </>
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <AdminShell>{children}</AdminShell>
    </SessionProvider>
  );
}
