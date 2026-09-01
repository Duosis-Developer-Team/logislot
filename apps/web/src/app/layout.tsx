import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { CookieNotice } from "@/components/landing/cookie-notice";
import { Providers } from "./providers";
import { LOCALE_COOKIE, parseLocale } from "@/lib/i18n/locale";
import { getDictionary } from "@/lib/i18n/server";

/**
 * Ortak tipografi — tum portallar ayni fontu kullanir.
 * Plus Jakarta Sans: modern, temiz SaaS hissi; Turkce (latin-ext) destekli.
 */
const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-sans",
  display: "swap",
});

/** Baslik/aciklama SUNUCUDA secilen dile gore uretilir; sabit `metadata`
 *  nesnesi kullanilsaydi Ingilizce oturumda sekme basligi Turkce kalirdi. */
export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getDictionary();
  const meta = t.misc.siteMeta;
  return {
    title: meta.title,
    description: meta.description,
    manifest: "/site.webmanifest",
    applicationName: "LogiSlot",
    appleWebApp: { capable: true, title: "LogiSlot", statusBarStyle: "black-translucent" },
  };
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#0a1b33" },
    { media: "(prefers-color-scheme: dark)", color: "#070c14" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Dil SUNUCUDA okunur: istemcide okunsaydi Ingilizce kullanici ilk boyamada
  // Turkce metni gorur, sonra ekran degisirdi (hydration uyusmazligi + goz
  // rahatsiz eden sicrama).
  const locale = parseLocale((await cookies()).get(LOCALE_COOKIE)?.value);
  return (
    <html
      lang={locale}
      // Bölüm çapalarına yumuşak kaydırma (reduced-motion tercihine saygılı)
      className={`${jakarta.variable} motion-safe:scroll-smooth`}
      suppressHydrationWarning
    >
      <body className="font-sans antialiased">
        <Providers locale={locale}>
          {children}
          {/* KVKK: zorunlu çerez/yerel depolama bilgilendirmesi (tüm portallar) */}
          <CookieNotice />
        </Providers>
      </body>
    </html>
  );
}
