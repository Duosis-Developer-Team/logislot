"use client";

import { useState } from "react";

import {
  CalendarDays,
  ClipboardList,
  LayoutDashboard,
  LineChart,
  LogOut,
  Repeat,
  Settings2,
  SlidersHorizontal,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ApplyBranding, BrandMark } from "@/components/domain/apply-branding";
import { Logo } from "@/components/domain/logo";
import { ErrorState, LoadingState } from "@/components/config/states";
import { NotificationPreferencesForm } from "@/components/domain/notification-preferences";
import { Dialog } from "@/components/ui/dialog";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { useBranding } from "@/lib/api/branding";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { SessionProvider, useSession } from "@/lib/auth/session";
import { cn } from "@/lib/utils";

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

const NAV: {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  permission?: string | string[];
}[] = [
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
  const pathname = usePathname();
  const session = useSession();
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const visibleNav = NAV.filter((item) => navAllowed(item, session.can));
  const branding = useBranding(session.activeFacilityId);

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
        <Logo className="text-xl" />
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

  const sidebarStyle = branding.data?.is_customized && branding.data.sidebar_color
    ? { backgroundColor: branding.data.sidebar_color }
    : undefined;

  return (
    <div className="flex min-h-screen">
      <ApplyBranding branding={branding.data} />
      <aside
        className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-border bg-card lg:flex"
        style={sidebarStyle}
      >
        <div className="border-b border-border p-4">
          <BrandMark branding={branding.data} fallback={<Logo />} />
        </div>
        <nav className="flex flex-1 flex-col gap-1 p-3">
          {visibleNav.map((item) => {
            const Icon = item.icon;
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-border p-3 text-xs text-muted-foreground">
          {branding.data?.custom_footer_text ?? `${session.me?.name} · LogiSlot`}
        </div>
      </aside>

      <div className="flex flex-1 flex-col lg:pl-60">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-border bg-card/95 px-4 py-3 backdrop-blur lg:px-6">
          <div className="flex items-center gap-3">
            <span className="lg:hidden">
              <Logo />
            </span>
            {/* Facility switcher — /auth/me'den gelen gercek uyelikler */}
            {session.me && session.me.facilities.length > 0 && (
              <Select
                className="h-9 w-auto max-w-72 text-sm"
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
            )}
          </div>
          <div className="flex items-center gap-1">
            <NotificationBell variant="admin" facilityId={session.activeFacilityId} />
            <button
              onClick={() => setPreferencesOpen(true)}
              className="rounded-lg p-2 text-muted-foreground hover:bg-muted"
              aria-label="Bildirim Tercihleri"
              title="Bildirim tercihleri"
            >
              <SlidersHorizontal className="h-5 w-5" />
            </button>
            <button
              onClick={session.logout}
              className="rounded-lg p-2 text-muted-foreground hover:bg-muted"
              aria-label="Çıkış"
              title="Oturumu kapat"
            >
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 pb-20 lg:p-6 lg:pb-6">{children}</main>

        <Dialog
          open={preferencesOpen}
          onClose={() => setPreferencesOpen(false)}
          title="Bildirim Tercihleri"
        >
          <NotificationPreferencesForm />
        </Dialog>

        <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 backdrop-blur lg:hidden">
          <div className="grid grid-cols-5">
            {visibleNav.map((item) => {
              const Icon = item.icon;
              const active = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium",
                    active ? "text-primary" : "text-muted-foreground",
                  )}
                >
                  <Icon className="h-5 w-5" />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </nav>
      </div>
    </div>
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <AdminShell>{children}</AdminShell>
    </SessionProvider>
  );
}
