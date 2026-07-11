"use client";

/**
 * Public portal seçici — YALNIZCA kullanıcı portalları (Tedarikçi + Yönetim).
 * Platform Yönetimi burada BİLEREK yoktur ve hiçbir şekilde referans edilmez
 * (hidden internal portal; bkz. docs/PORTAL_ISOLATION_AND_ROUTING.md).
 * Email/parola bu ekranda yoktur; kart seçimi ilgili portal login'ine götürür.
 */

import { ArrowRight, Building2, Truck, type LucideIcon } from "lucide-react";
import { LoginBackground } from "@/components/auth/login-background";
import { LogiSlotLogo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/shell/theme-toggle";

interface EntryPortal {
  key: "supplier" | "admin";
  title: string;
  description: string;
  icon: LucideIcon;
  href: string;
}

export function EntrySelector({
  supplierUrl,
  adminUrl,
}: {
  supplierUrl: string;
  adminUrl: string;
}) {
  const portals: EntryPortal[] = [
    {
      key: "supplier",
      title: "Tedarikçi Portalı",
      description: "Tesise teslimat randevusu oluşturun ve takip edin.",
      icon: Truck,
      href: supplierUrl,
    },
    {
      key: "admin",
      title: "Yönetim Paneli",
      description: "Rampa takvimi, onaylar ve operasyon yönetimi.",
      icon: Building2,
      href: adminUrl,
    },
  ];

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-white via-sky-50 to-sky-100 px-5 py-10 dark:from-background dark:via-background dark:to-background">
      <LoginBackground />

      <div className="absolute right-3 top-3 z-20">
        <ThemeToggle />
      </div>

      <div className="relative z-10 w-full max-w-3xl">
        <div className="animate-scale-in flex flex-col items-center gap-3 text-center">
          <LogiSlotLogo size="lg" priority />
          <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
            LogiSlot&apos;a hoş geldiniz
          </h1>
          <p className="max-w-xl text-sm text-muted-foreground sm:text-base">
            Mal kabul ve rampa randevu operasyonlarınız için doğru portala devam edin.
          </p>
        </div>

        <div className="stagger mt-10 grid gap-4 sm:grid-cols-2">
          {portals.map((portal) => {
            const Icon = portal.icon;
            return (
              <a
                key={portal.key}
                href={portal.href}
                className="group relative flex flex-col gap-4 rounded-3xl border border-border bg-card/95 p-6 shadow-pop backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-2xl sm:p-8"
              >
                <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary transition-all duration-300 group-hover:scale-110 group-hover:bg-primary group-hover:text-primary-foreground">
                  <Icon className="h-7 w-7" />
                </span>
                <div>
                  <h2 className="text-lg font-bold">{portal.title}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {portal.description}
                  </p>
                </div>
                <span className="mt-auto inline-flex items-center gap-1.5 text-sm font-semibold text-primary">
                  Devam et
                  <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
                </span>
              </a>
            );
          })}
        </div>

        <p className="mt-10 text-center text-xs text-muted-foreground">
          © 2026 LogiSlot · Kurumsal lojistik operasyon platformu
        </p>
      </div>
    </main>
  );
}
