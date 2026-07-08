"use client";

/**
 * Ortak kullanici menusu — her uc portalin sag-ust kosesinde ayni bilesen.
 * Kullanici adi + rol rozetini gosterir; acilir menude Profil (varsa) ve
 * GORUNUR "Cikis Yap" bulunur. Cikis, session.logout ortak yardimcisini cagirir
 * (backend /auth/logout + token temizligi + query cache temizligi + /login).
 */

import { ChevronDown, LogOut, UserRound } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useSession } from "@/lib/auth/session";
import { cn } from "@/lib/utils";

const ROLE_LABELS: Record<string, string> = {
  platform: "Platform Yöneticisi",
  tenant: "Tesis Yöneticisi",
  supplier: "Tedarikçi",
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function UserMenu({ profileHref }: { profileHref?: string }) {
  const session = useSession();
  const [open, setOpen] = useState(false);
  const me = session.me;
  const name = me?.name ?? "Kullanıcı";
  const roleLabel = me ? ROLE_LABELS[me.user_type] ?? me.user_type : "";

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-xl py-1 pl-1 pr-1.5 text-left transition-colors hover:bg-muted sm:pr-2"
        aria-label="Kullanıcı menüsü"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary-hover text-xs font-bold text-primary-foreground shadow-sm ring-1 ring-black/5">
          {initials(name)}
        </span>
        <span className="hidden min-w-0 flex-col leading-tight sm:flex">
          <span className="truncate text-sm font-semibold">{name}</span>
          <span className="truncate text-[11px] text-muted-foreground">{roleLabel}</span>
        </span>
        <ChevronDown
          className={cn(
            "hidden h-4 w-4 shrink-0 text-muted-foreground transition-transform sm:block",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            role="menu"
            className="absolute right-0 z-50 mt-2 w-64 origin-top-right overflow-hidden rounded-2xl border border-border bg-card shadow-pop animate-scale-in"
          >
            <div className="border-b border-border px-4 py-3">
              <p className="truncate text-sm font-semibold">{name}</p>
              {me?.email && (
                <p className="truncate text-xs text-muted-foreground">{me.email}</p>
              )}
              <span className="mt-1.5 inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                {roleLabel}
              </span>
            </div>
            <div className="p-1.5">
              {profileHref && (
                <Link
                  href={profileHref}
                  onClick={() => setOpen(false)}
                  role="menuitem"
                  className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                >
                  <UserRound className="h-4 w-4 text-muted-foreground" />
                  Profil
                </Link>
              )}
              <button
                onClick={() => {
                  setOpen(false);
                  session.logout();
                }}
                role="menuitem"
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  "text-destructive hover:bg-destructive/10",
                )}
              >
                <LogOut className="h-4 w-4" />
                Çıkış Yap
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
