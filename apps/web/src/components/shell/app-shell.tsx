"use client";

/**
 * Ortak webapp kabugu — uc portal da (Yonetim, Tedarikci, Platform) ayni
 * yapiyi kullanir; yalnizca nav icerigi, rol rozeti ve header aksiyonlari degisir.
 *
 * Responsive davranis:
 *  - lg ve uzeri: solda sabit sidebar (w-60) + ust serit.
 *  - lg alti: sidebar gizli; ust seritteki hamburger sol drawer'i acar.
 *    Mobilde ALT-NAV yoktur — webapp hissi icin drawer tercih edildi.
 *
 * Cikis her boyutta gorunur: ust seritte UserMenu, mobil drawer'in altinda
 * ayrica bir "Cikis Yap" butonu bulunur.
 */

import { LogOut, Menu, X, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { LogiSlotLogo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { UserMenu } from "@/components/shell/user-menu";
import { useSession } from "@/lib/auth/session";
import { cn } from "@/lib/utils";

export interface AppNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

interface AppShellProps {
  nav: AppNavItem[];
  /** Ust seritte gorunen rol rozeti — "Yönetim" | "Tedarikçi" | "Platform". */
  roleLabel: string;
  /** Sidebar/drawer basligindaki marka; verilmezse LogiSlot logosu. */
  brand?: React.ReactNode;
  /** Ust serit sol slotu (or. tesis secici). */
  headerStart?: React.ReactNode;
  /** Ust serit sag slotu, UserMenu'nun solunda (or. bildirim zili). */
  headerActions?: React.ReactNode;
  /** UserMenu'de Profil linki (yalnizca portalda profil sayfasi varsa). */
  profileHref?: string;
  /** Sidebar alt bilgi metni/dugumu. */
  footer?: React.ReactNode;
  /** Branding sidebar rengi gibi opsiyonel stil. */
  sidebarStyle?: React.CSSProperties;
  children: React.ReactNode;
}

function NavLinks({
  nav,
  onNavigate,
}: {
  nav: AppNavItem[];
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
      {nav.map((item) => {
        const Icon = item.icon;
        const active = pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all duration-150",
              active
                ? "bg-primary/10 font-semibold text-primary ring-1 ring-inset ring-primary/10"
                : "font-medium text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon
              className={cn(
                "h-[1.15rem] w-[1.15rem] shrink-0 transition-colors",
                active ? "text-primary" : "text-muted-foreground group-hover:text-foreground",
              )}
            />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Mobil drawer alt bilgisi: kullanici ozeti + gorunur cikis. */
function MobileUserFooter() {
  const session = useSession();
  const name = session.me?.name ?? "Kullanıcı";
  return (
    <div className="border-t border-border p-3">
      <div className="px-1 pb-2">
        <p className="truncate text-sm font-medium">{name}</p>
        {session.me?.email && (
          <p className="truncate text-xs text-muted-foreground">{session.me.email}</p>
        )}
      </div>
      <button
        onClick={session.logout}
        className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
      >
        <LogOut className="h-4 w-4" />
        Çıkış Yap
      </button>
    </div>
  );
}

export function AppShell({
  nav,
  roleLabel,
  brand,
  headerStart,
  headerActions,
  profileHref,
  footer,
  sidebarStyle,
  children,
}: AppShellProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const homeHref = nav[0]?.href ?? "/";
  const brandNode = (
    <Link
      href={homeHref}
      aria-label="Ana sayfa"
      className="inline-flex items-center rounded-lg outline-none transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring/40"
    >
      {brand ?? <LogiSlotLogo size="lg" priority />}
    </Link>
  );
  // Sidebar markası — daha büyük ve ortalı.
  const sidebarBrand = (
    <Link
      href={homeHref}
      aria-label="Ana sayfa"
      className="inline-flex items-center rounded-lg outline-none transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring/40"
    >
      <LogiSlotLogo size="xl" priority className="h-14 w-auto" />
    </Link>
  );

  // Rota degisince mobil drawer kapanir.
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  return (
    <div className="flex min-h-screen bg-background">
      {/* Masaustu sidebar */}
      <aside
        className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-border bg-card lg:flex"
        style={sidebarStyle}
      >
        <div className="flex h-20 items-center justify-center border-b border-border px-4">
          {sidebarBrand}
        </div>
        <NavLinks nav={nav} />
        {footer && (
          <div className="border-t border-border p-3 text-xs text-muted-foreground">
            {footer}
          </div>
        )}
      </aside>

      {/* Mobil drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-slate-900/25 backdrop-blur-[2px] dark:bg-slate-950/60"
            onClick={() => setMobileOpen(false)}
          />
          <div
            className="absolute inset-y-0 left-0 flex w-72 max-w-[85%] flex-col border-r border-border bg-card shadow-pop animate-slide-in-left"
            style={sidebarStyle}
          >
            <div className="flex h-20 items-center justify-between border-b border-border px-4">
              {brandNode}
              <button
                onClick={() => setMobileOpen(false)}
                aria-label="Menüyü kapat"
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <NavLinks nav={nav} onNavigate={() => setMobileOpen(false)} />
            <MobileUserFooter />
          </div>
        </div>
      )}

      {/* Ana kolon */}
      <div className="flex min-w-0 flex-1 flex-col lg:pl-60">
        <header className="sticky top-0 z-30 flex h-20 items-center justify-between gap-3 border-b border-border bg-card/80 px-4 backdrop-blur-xl lg:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <button
              onClick={() => setMobileOpen(true)}
              aria-label="Menü"
              className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted lg:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>
            <span className="lg:hidden">{brandNode}</span>
            {headerStart}
          </div>
          <div className="flex items-center gap-1 sm:gap-2">
            <span className="hidden rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary ring-1 ring-inset ring-primary/15 md:inline">
              {roleLabel}
            </span>
            {headerActions}
            <ThemeToggle />
            <UserMenu profileHref={profileHref} />
          </div>
        </header>

        <main className="mx-auto w-full max-w-[96rem] flex-1 p-4 sm:p-5 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
