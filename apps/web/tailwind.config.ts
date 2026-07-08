import type { Config } from "tailwindcss";

/**
 * LogiSlot tasarim sistemi.
 * Renkler CSS degiskenlerinden gelir (globals.css) — white-label icin
 * tenant/facility bazli override, degiskenleri degistirerek yapilacak.
 */
const config: Config = {
  content: ["./src/**/*.{ts,tsx}", "../../packages/shared/src/**/*.ts"],
  theme: {
    extend: {
      colors: {
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: "hsl(var(--card))",
        "card-foreground": "hsl(var(--card-foreground))",
        muted: "hsl(var(--muted))",
        "muted-foreground": "hsl(var(--muted-foreground))",
        border: "hsl(var(--border))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
          hover: "hsl(var(--primary-hover))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: "hsl(var(--destructive))",
        // Statu renkleri: takvim ve rozetlerin ana sinyali
        status: {
          pending: "hsl(var(--status-pending))",
          approved: "hsl(var(--status-approved))",
          revision: "hsl(var(--status-revision))",
          rejected: "hsl(var(--status-rejected))",
          completed: "hsl(var(--status-completed))",
          cancelled: "hsl(var(--status-cancelled))",
        },
        // Kargo overlay: statuden BAGIMSIZ ikinci sinyal
        cargo: "hsl(var(--cargo))",
      },
      borderRadius: {
        lg: "0.625rem",
        xl: "0.875rem",
      },
      boxShadow: {
        card: "0 1px 2px 0 rgb(15 23 42 / 0.05), 0 1px 3px 0 rgb(15 23 42 / 0.08)",
      },
    },
  },
  plugins: [],
};

export default config;
