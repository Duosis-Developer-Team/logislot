import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "LogiSlot — Akıllı Mal Kabul & Rampa Randevu Platformu",
  description:
    "Fabrikaların tedarikçi mal kabul süreçlerini dijitalleştiren, rampa kullanımını optimize eden SaaS platformu",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
