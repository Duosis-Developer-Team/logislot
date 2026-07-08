"use client";

/**
 * Facility branding'ini CSS degiskenlerine uygular.
 *
 * YALNIZCA marka degiskenlerine dokunur: --primary, --primary-hover, --accent.
 * Statu (--status-*) ve kargo (--cargo) anlam renkleri BILINCLI olarak
 * kapsam disidir — operasyon anlami markadan etkilenmez.
 * Unmount'ta (portal degisimi) degiskenler temizlenir -> platform paneli
 * her zaman LogiSlot varsayilaninda kalir.
 */

import { useEffect } from "react";
import type { BrandingDto } from "@/lib/api/branding";

export function hexToHslTriplet(hex: string): string | null {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!match) return null;
  const value = parseInt(match[1], 16);
  const r = ((value >> 16) & 255) / 255;
  const g = ((value >> 8) & 255) / 255;
  const b = (value & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

function darkerHsl(triplet: string, delta = 7): string {
  const parts = triplet.split(" ");
  const lightness = Math.max(0, parseInt(parts[2]) - delta);
  return `${parts[0]} ${parts[1]} ${lightness}%`;
}

const BRAND_VARS = ["--primary", "--primary-hover", "--accent"] as const;

export function ApplyBranding({ branding }: { branding: BrandingDto | undefined }) {
  useEffect(() => {
    const root = document.documentElement;
    if (branding?.is_customized) {
      const primary = hexToHslTriplet(branding.primary_color);
      const accent = hexToHslTriplet(branding.accent_color);
      if (primary) {
        root.style.setProperty("--primary", primary);
        root.style.setProperty("--primary-hover", darkerHsl(primary));
      }
      if (accent) root.style.setProperty("--accent", accent);
    } else {
      for (const name of BRAND_VARS) root.style.removeProperty(name);
    }
    return () => {
      // Portal degisiminde LogiSlot varsayilanina don
      for (const name of BRAND_VARS) root.style.removeProperty(name);
    };
  }, [branding]);
  return null;
}

/** Marka adi/logo gosterimi — default'ta LogiSlot logosu kullanilir. */
export function BrandMark({
  branding,
  fallback,
}: {
  branding: BrandingDto | undefined;
  fallback: React.ReactNode;
}) {
  if (!branding?.is_customized) return <>{fallback}</>;
  return (
    <span className="inline-flex items-center gap-2 font-bold tracking-tight">
      {branding.logo_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={branding.logo_url}
          alt={branding.brand_name}
          className="h-8 w-8 rounded-lg object-contain"
        />
      ) : (
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-sm font-black text-primary-foreground">
          {branding.brand_name.slice(0, 2).toUpperCase()}
        </span>
      )}
      <span className="text-foreground">{branding.brand_name}</span>
    </span>
  );
}
