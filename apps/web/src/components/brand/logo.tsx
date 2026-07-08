import { cn } from "@/lib/utils";

/**
 * LogiSlot marka logosu (full: ikon + wordmark) ve ikon-only bileşenleri.
 *
 * variant:
 *  - "auto"  (varsayılan) → aktif temaya göre doğru asset (CSS ile, JS/hydration
 *    bağımlılığı yok: light asset `dark:hidden`, dark asset `hidden dark:block`).
 *  - "light" → yalnızca light asset (koyu wordmark) — açık zeminler için.
 *  - "dark"  → yalnızca dark asset (beyaz wordmark) — koyu zeminler için (login hero).
 *
 * Assetler şeffaf PNG (public/brand). Ratio korunur; layout shift olmaz.
 */

type Variant = "auto" | "light" | "dark";
type Size = "sm" | "md" | "lg" | "xl";

const LOGO_H: Record<Size, string> = {
  sm: "h-6",
  md: "h-8",
  lg: "h-10",
  xl: "h-12",
};

const ICON_S: Record<Size, string> = {
  sm: "h-6 w-6",
  md: "h-8 w-8",
  lg: "h-10 w-10",
  xl: "h-12 w-12",
};

const LOGO_LIGHT = "/brand/logislot-logo-light.png";
const LOGO_DARK = "/brand/logislot-logo-dark.png";
const ICON_LIGHT = "/brand/logislot-icon-light.png";
const ICON_DARK = "/brand/logislot-icon-dark.png";

export function LogiSlotLogo({
  variant = "auto",
  size = "md",
  className,
  priority,
}: {
  variant?: Variant;
  size?: Size;
  className?: string;
  priority?: boolean;
}) {
  const h = LOGO_H[size];
  const base = cn("w-auto select-none object-contain", h, className);
  const loading = priority ? "eager" : "lazy";

  if (variant === "light") {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={LOGO_LIGHT} width={713} height={220} alt="LogiSlot" loading={loading} className={base} />;
  }
  if (variant === "dark") {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={LOGO_DARK} width={713} height={220} alt="LogiSlot" loading={loading} className={base} />;
  }
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={LOGO_LIGHT} width={713} height={220} alt="LogiSlot" loading={loading} className={cn(base, "dark:hidden")} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={LOGO_DARK} width={713} height={220} alt="LogiSlot" loading={loading} className={cn(base, "hidden dark:block")} />
    </>
  );
}

export function LogiSlotIcon({
  variant = "auto",
  size = "md",
  className,
  priority,
}: {
  variant?: Variant;
  size?: Size;
  className?: string;
  priority?: boolean;
}) {
  const s = ICON_S[size];
  const base = cn("select-none object-contain", s, className);
  const loading = priority ? "eager" : "lazy";

  if (variant === "light") {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={ICON_LIGHT} width={512} height={512} alt="LogiSlot" loading={loading} className={base} />;
  }
  if (variant === "dark") {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={ICON_DARK} width={512} height={512} alt="LogiSlot" loading={loading} className={base} />;
  }
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={ICON_LIGHT} width={512} height={512} alt="LogiSlot" loading={loading} className={cn(base, "dark:hidden")} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={ICON_DARK} width={512} height={512} alt="LogiSlot" loading={loading} className={cn(base, "hidden dark:block")} />
    </>
  );
}
