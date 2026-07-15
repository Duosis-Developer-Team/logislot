import { NextRequest, NextResponse } from "next/server";

/**
 * Portal route izolasyonu — deployment'ın LOGISLOT_PORTAL_MODE'una göre
 * yanlış portala ait route'lar kendi login/entry'sine yönlendirilir.
 *
 * Bu bir UI izolasyonudur; gerçek güvenlik backend RBAC'tedir (bkz.
 * docs/PORTAL_ISOLATION_AND_ROUTING.md). Entry modunda platform'a dair
 * HİÇBİR route servis edilmez (hidden portal 30086'da ayrı deployment'tır).
 */

type Mode = "entry" | "supplier" | "admin" | "platform" | "all";

function mode(): Mode {
  const raw = (process.env.LOGISLOT_PORTAL_MODE ?? "all").toLowerCase();
  return (["entry", "supplier", "admin", "platform", "all"] as const).includes(raw as Mode)
    ? (raw as Mode)
    : "all";
}

export function middleware(request: NextRequest) {
  const m = mode();
  if (m === "all") return NextResponse.next();

  const { pathname } = request.nextUrl;
  const redirect = (to: string) =>
    NextResponse.redirect(new URL(to, request.url));

  if (m === "entry") {
    // Entry, landing + public pazarlama/yasal sayfaları servis eder;
    // uygulama (portal) route'ları burada YOK.
    const publicPaths = ["/", "/demo", "/kvkk", "/cerez-politikasi"];
    if (!publicPaths.includes(pathname)) return redirect("/");
    return NextResponse.next();
  }

  // Portal modları: kendi alanı + /login + /change-password serbest.
  const own =
    m === "supplier" ? "/supplier" : m === "admin" ? "/admin" : "/platform";
  const foreign = ["/supplier", "/admin", "/platform"].filter((p) => p !== own);

  if (pathname === "/") return redirect("/login");
  // /login/<x> alt yolları portal modunda tekilleştirilir (switcher yok).
  if (pathname.startsWith("/login/")) return redirect("/login");
  if (foreign.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return redirect("/login");
  }
  return NextResponse.next();
}

export const config = {
  // Statik varlıklar ve Next iç yolları hariç tüm sayfa istekleri.
  matcher: ["/((?!_next|api|favicon\\.ico|icon\\.png|apple-icon\\.png|site\\.webmanifest|brand|images|assets).*)"],
};
