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
  return "Bilinmiyor";
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

function detectDeviceClass(): string {
  if (typeof window === "undefined") return "bilinmiyor";
  if (window.innerWidth < 640) return "mobil";
  if (window.innerWidth < 1024) return "tablet";
  return "masaüstü";
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
export function describeDiagnostics(diagnostics: ClientDiagnostics): string[] {
  const labels: Record<keyof ClientDiagnostics, string> = {
    app_version: "Uygulama sürümü",
    environment: "Ortam",
    page_path: "Sayfa",
    browser: "Tarayıcı",
    os: "İşletim sistemi",
    locale: "Dil",
    timezone: "Saat dilimi",
    device_class: "Cihaz",
    client_timestamp: "Zaman",
  };
  return (Object.keys(labels) as (keyof ClientDiagnostics)[])
    .filter((key) => diagnostics[key])
    .map((key) => `${labels[key]}: ${diagnostics[key]}`);
}
