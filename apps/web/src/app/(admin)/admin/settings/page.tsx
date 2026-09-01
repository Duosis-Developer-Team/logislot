"use client";

import {
  BellRing,
  Boxes,
  CalendarOff,
  GitFork,
  Handshake,
  Truck,
  Users2,
  Warehouse,
  MailWarning,
  ScrollText,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  conflictGroups,
  dockOverrides,
  docks,
  productCategories,
  vehicleCategories,
} from "@/lib/api/resources";
import { useSession } from "@/lib/auth/session";
import { useT } from "@/lib/i18n/provider";

export default function SettingsPage() {
  const t = useT();
  const { activeFacilityId, can } = useSession();
  const categories = productCategories.useList(activeFacilityId);
  const vehicles = vehicleCategories.useList(activeFacilityId);
  const dockList = docks.useList(activeFacilityId);
  const groups = conflictGroups.useList(activeFacilityId);
  const overrides = dockOverrides.useList(activeFacilityId);

  const count = (query: { data?: { length: number } }) =>
    query.data ? t.admin.settings.recordCount(query.data.length) : "…";

  const sections = [
    {
      icon: Boxes,
      title: t.admin.categories.title,
      description: t.admin.settings.cards.categories,
      stat: count(categories),
      href: "/admin/settings/categories",
      permission: "category.manage",
    },
    {
      icon: Truck,
      title: t.admin.vehicleCategories.title,
      description: t.admin.settings.cards.vehicleCategories,
      stat: count(vehicles),
      href: "/admin/settings/vehicle-categories",
      permission: "vehicle_category.manage",
    },
    {
      icon: Warehouse,
      title: t.nav.admin.settings,
      description: t.admin.settings.cards.docks,
      stat: count(dockList),
      href: "/admin/settings/docks",
      permission: "dock.manage",
    },
    {
      icon: GitFork,
      title: t.admin.conflictGroups.title,
      description: t.admin.settings.cards.conflictGroups,
      stat: count(groups),
      href: "/admin/settings/conflict-groups",
      permission: "dock_conflict_group.manage",
    },
    {
      icon: CalendarOff,
      title: t.admin.overrides.title,
      description: t.admin.settings.cards.overrides,
      stat: count(overrides),
      href: "/admin/settings/overrides",
      permission: "calendar.override",
    },
    {
      icon: Handshake,
      title: t.admin.suppliers.title,
      description: t.admin.settings.cards.suppliers,
      stat: t.admin.settings.manage,
      href: "/admin/settings/suppliers",
      permission: "supplier.manage",
    },
    {
      icon: BellRing,
      title: t.admin.supplierNotifications.title,
      description: t.admin.settings.cards.supplierNotifications,
      stat: "Politika",
      href: "/admin/settings/supplier-notifications",
      permission: "supplier.manage",
    },
    {
      icon: Users2,
      title: t.admin.users.title,
      description: t.admin.settings.cards.users,
      stat: t.admin.settings.view,
      href: "/admin/settings/users",
      permission: "user.manage",
    },
    {
      icon: MailWarning,
      title: t.admin.emailLogs.title,
      description: t.admin.settings.cards.emailLogs,
      stat: "Operasyon",
      href: "/admin/settings/email-logs",
      permission: "appt.view",
    },
    {
      icon: ScrollText,
      title: t.admin.auditLogs.title,
      description: t.admin.settings.cards.auditLogs,
      stat: t.admin.settings.inspect,
      href: "/admin/settings/audit-logs",
      permission: "audit.view",
    },
    // Izin bazli filtre: kullanicinin yetkisi olmayan kartlar gizlenir.
  ].filter((s) => can(s.permission));

  const upcoming: {
    icon: LucideIcon;
    title: string;
    description: string;
    sprint: string;
  }[] = [];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold">{t.admin.settings.title}</h1>
        <p className="text-sm text-muted-foreground">
          {t.admin.settings.description}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {sections.map((s) => {
          const Icon = s.icon;
          return (
            <Link key={s.title} href={s.href}>
              <Card className="h-full cursor-pointer transition-shadow hover:shadow-md">
                <CardContent className="flex flex-col gap-2 p-5">
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                    <Icon className="h-5 w-5 text-primary" />
                  </span>
                  <div className="font-semibold">{s.title}</div>
                  <p className="text-xs text-muted-foreground">{s.description}</p>
                  <span className="mt-1 w-fit rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                    {s.stat}
                  </span>
                </CardContent>
              </Card>
            </Link>
          );
        })}
        {upcoming.map((s) => {
          const Icon = s.icon;
          return (
            <Card key={s.title} className="h-full opacity-60">
              <CardContent className="flex flex-col gap-2 p-5">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                  <Icon className="h-5 w-5 text-muted-foreground" />
                </span>
                <div className="flex items-center gap-2 font-semibold">
                  {s.title}
                  <Badge className="bg-muted text-muted-foreground">{s.sprint}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">{s.description}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
