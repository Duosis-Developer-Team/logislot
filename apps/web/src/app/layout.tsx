import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

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

export const metadata: Metadata = {
  title: "LogiSlot — Akıllı Mal Kabul & Rampa Randevu Platformu",
  description:
    "Fabrikaların tedarikçi mal kabul süreçlerini dijitalleştiren, rampa kullanımını optimize eden SaaS platformu",
  manifest: "/site.webmanifest",
  applicationName: "LogiSlot",
  appleWebApp: { capable: true, title: "LogiSlot", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#0a1b33" },
    { media: "(prefers-color-scheme: dark)", color: "#070c14" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr" className={jakarta.variable} suppressHydrationWarning>
      <body className="font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
