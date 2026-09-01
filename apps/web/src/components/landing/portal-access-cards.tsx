"use client";

import { ArrowRight, Building2, Truck } from "lucide-react";
import { useT } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";

/**
 * Public portal erişim kartları — YALNIZCA Tedarikçi + Yönetim.
 * Platform Yönetimi burada BİLEREK yoktur (hidden internal portal; bkz.
 * docs/PORTAL_ISOLATION_AND_ROUTING.md). Landing'de hero ve final CTA'da
 * iki boyutta kullanılır.
 */

export function PortalAccessCards({
  supplierUrl,
  adminUrl,
  compact = false,
}: {
  supplierUrl: string;
  adminUrl: string;
  /** Final CTA için daha sıkı dikey ritim. */
  compact?: boolean;
}) {
  const t = useT();
  const portals = [
    {
      key: "supplier",
      title: t.auth.portals.supplier.title,
      description: t.auth.portals.supplier.subtitle,
      cta: t.landing.portalCards.supplierCta,
      icon: Truck,
      href: supplierUrl,
    },
    {
      key: "admin",
      title: t.auth.portals.admin.title,
      description: t.auth.portals.admin.subtitle,
      cta: t.landing.portalCards.adminCta,
      icon: Building2,
      href: adminUrl,
    },
  ];

  return (
    <div className={cn("grid gap-4 sm:grid-cols-2", compact && "gap-3")}>
      {portals.map((portal) => {
        const Icon = portal.icon;
        return (
          <a
            key={portal.key}
            href={portal.href}
            className={cn(
              "group relative flex flex-col gap-3 overflow-hidden rounded-2xl border border-border bg-card/90 shadow-card backdrop-blur-sm transition-all duration-300",
              "hover:-translate-y-1 hover:border-primary/40 hover:shadow-card-hover",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
              compact ? "p-5" : "p-5 sm:p-6",
            )}
          >
            {/* Hover'da beliren yumuşak glow */}
            <span
              aria-hidden
              className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-primary/10 opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-100 dark:bg-primary/20"
            />
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary transition-all duration-300 group-hover:scale-110 group-hover:bg-primary group-hover:text-primary-foreground">
              <Icon className="h-6 w-6" />
            </span>
            <div>
              <h3 className="text-base font-bold sm:text-lg">{portal.title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                {portal.description}
              </p>
            </div>
            <span className="mt-auto inline-flex items-center gap-1.5 pt-1 text-sm font-semibold text-primary">
              {portal.cta}
              <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
            </span>
          </a>
        );
      })}
    </div>
  );
}
