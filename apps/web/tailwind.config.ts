import type { Config } from "tailwindcss";

/**
 * LogiSlot tasarim sistemi (premium refresh).
 * Renkler CSS degiskenlerinden gelir (globals.css) — white-label icin
 * tenant/facility bazli override, degiskenleri degistirerek yapilir.
 * Font next/font ile --font-sans degiskenine baglanir (layout.tsx).
 */
const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}", "../../packages/shared/src/**/*.ts"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      colors: {
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: "hsl(var(--card))",
        "card-foreground": "hsl(var(--card-foreground))",
        muted: "hsl(var(--muted))",
        "muted-foreground": "hsl(var(--muted-foreground))",
        border: "hsl(var(--border))",
        ring: "hsl(var(--ring))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
          hover: "hsl(var(--primary-hover))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        "brand-navy": "hsl(var(--brand-navy))",
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
        lg: "0.75rem",
        xl: "1rem",
        "2xl": "1.25rem",
        "3xl": "1.5rem",
      },
      boxShadow: {
        // Cok yumusak, katmanli, uzun golgeler (premium his)
        card: "0 1px 2px 0 hsl(222 47% 11% / 0.04), 0 12px 28px -18px hsl(222 47% 11% / 0.16)",
        "card-hover":
          "0 2px 6px 0 hsl(222 47% 11% / 0.06), 0 24px 48px -24px hsl(222 47% 11% / 0.26)",
        pop: "0 8px 24px -6px hsl(222 47% 11% / 0.12), 0 18px 48px -12px hsl(222 47% 11% / 0.18)",
        soft: "0 1px 2px 0 hsl(222 47% 11% / 0.05), 0 4px 12px -6px hsl(222 47% 11% / 0.1)",
        "primary-glow": "0 8px 24px -8px hsl(var(--primary) / 0.5)",
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "fade-up": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "scale-in": {
          from: { opacity: "0", transform: "scale(0.97)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
        "slide-in-right": {
          from: { transform: "translateX(100%)" },
          to: { transform: "translateX(0)" },
        },
        "slide-in-left": {
          from: { transform: "translateX(-100%)" },
          to: { transform: "translateX(0)" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.25s ease-out both",
        "fade-up": "fade-up 0.35s cubic-bezier(0.16, 1, 0.3, 1) both",
        "scale-in": "scale-in 0.2s cubic-bezier(0.16, 1, 0.3, 1) both",
        "slide-in-right": "slide-in-right 0.28s cubic-bezier(0.16, 1, 0.3, 1) both",
        "slide-in-left": "slide-in-left 0.28s cubic-bezier(0.16, 1, 0.3, 1) both",
      },
    },
  },
  plugins: [],
};

export default config;
