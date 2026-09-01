/**
 * Ticket formuna eklenen GUVENLI tarayici baglami.
 *
 * ALLOWLIST'tir: yalnizca asagidaki alanlar toplanir. Cookie, JWT/Authorization,
 * localStorage, form degerleri ve URL query parametreleri BILEREK yoktur —
 * bir ekran goruntusu talebinin yaninda oturum bilgisi tasimak, destek
 * kaydini gizli veri deposuna cevirirdi (00_SHARED_PLATFORM/05, bolum 4).
 *
 * Backend AYNI filtreyi tekrar uygular; buradaki temizlik kullaniciya ne
 * gonderildigini GOSTEREBILMEK icindir, tek savunma hatti degildir.
 */

import type { Dictionary } from "@/lib/i18n/dictionaries/tr";

export interface ClientDiagnostics {
  app_version?: string;
  environment?: string;
  page_path?: string;
  browser?: string;
  os?: string;
  locale?: string;
  timezone?: string;
  device_class?: string;
  client_timestamp?: string;
}

function detectBrowser(agent: string): string {
  const matchers: [RegExp, string][] = [
    [/Edg\/([\d.]+)/, "Edge"],
    [/OPR\/([\d.]+)/, "Opera"],
    [/Chrome\/([\d.]+)/, "Chrome"],
    [/Firefox\/([\d.]+)/, "Firefox"],
    [/Version\/([\d.]+).*Safari/, "Safari"],
  ];
  for (const [pattern, name] of matchers) {
    const found = agent.match(pattern);
    if (found) return `${name} ${found[1].split(".")[0]}`;
  }
  return "Unknown";
}

function detectOs(agent: string): string {
  if (/Windows NT 10/.test(agent)) return "Windows 10/11";
  if (/Windows/.test(agent)) return "Windows";
  if (/Mac OS X/.test(agent)) return "macOS";
  if (/Android/.test(agent)) return "Android";
  if (/iPhone|iPad|iPod/.test(agent)) return "iOS";
  if (/Linux/.test(agent)) return "Linux";
  return "Bilinmiyor";
}

/** Kararli KOD dondurur ("desktop"); ekranda sozlukten cevrilir. Deger
 *  Hermes'e de boyle gider — destek ekibi dilden bagimsiz okur. */
function detectDeviceClass(): string {
  if (typeof window === "undefined") return "unknown";
  if (window.innerWidth < 640) return "mobile";
  if (window.innerWidth < 1024) return "tablet";
  return "desktop";
}

export function collectDiagnostics(): ClientDiagnostics {
  if (typeof window === "undefined") return {};
  const agent = window.navigator.userAgent;
  return {
    app_version: process.env.NEXT_PUBLIC_APP_VERSION || undefined,
    environment: process.env.NEXT_PUBLIC_ENVIRONMENT || undefined,
    // Query string ve fragment KALDIRILIR: filtre/arama parametreleri
    // musteri verisi tasiyabilir.
    page_path: window.location.pathname,
    browser: detectBrowser(agent),
    os: detectOs(agent),
    locale: window.navigator.language,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    device_class: detectDeviceClass(),
    client_timestamp: new Date().toISOString(),
  };
}

/** Kullaniciya "ne gonderiliyor" ozetini gostermek icin okunabilir satirlar. */
export function describeDiagnostics(
  t: Dictionary,
  diagnostics: ClientDiagnostics,
): string[] {
  const { labels, deviceClass } = t.tickets.diagnostics;
  return (Object.keys(labels) as (keyof ClientDiagnostics)[])
    .filter((key) => diagnostics[key])
    .map((key) => {
      const raw = String(diagnostics[key]);
      const value = key === "device_class" ? deviceClass[raw] ?? raw : raw;
      return `${labels[key]}: ${value}`;
    });
}
