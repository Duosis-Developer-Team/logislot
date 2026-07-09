import { CheckCheck, Clock3, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Login için tema-uyumlu animasyonlu arka plan (tek parça/ortalı tasarım).
 * Sürüklenen aurora orb'lar + nokta deseni + geniş ekranlarda ortam "lojistik"
 * çipleri (dekoratif). Light ve dark modda token'larla uyumlu.
 */

const CHIPS: {
  className: string;
  delay: string;
  icon: typeof Clock3;
  iconClass: string;
  title: string;
  meta: string;
  metaClass: string;
}[] = [
  {
    className: "left-[6%] top-[18%]",
    delay: "0s",
    icon: Clock3,
    iconClass: "text-status-approved",
    title: "08:30 · Rampa 2",
    meta: "Onaylandı",
    metaClass: "text-status-approved",
  },
  {
    className: "right-[7%] top-[24%]",
    delay: "1.4s",
    icon: TrendingUp,
    iconClass: "text-accent",
    title: "Doluluk %72",
    meta: "3 rampa aktif",
    metaClass: "text-muted-foreground",
  },
  {
    className: "bottom-[16%] left-[10%]",
    delay: "2.2s",
    icon: CheckCheck,
    iconClass: "text-accent",
    title: "Otomatik onay",
    meta: "kurallı akış",
    metaClass: "text-muted-foreground",
  },
];

export function LoginBackground() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* Sürüklenen orb'lar */}
      <div className="animate-aurora absolute -left-40 -top-40 h-[34rem] w-[34rem] rounded-full bg-primary/15 blur-3xl dark:bg-primary/25" />
      <div
        className="animate-aurora absolute -bottom-48 -right-40 h-[36rem] w-[36rem] rounded-full bg-accent/15 blur-3xl dark:bg-accent/20"
        style={{ animationDelay: "6s" }}
      />
      <div className="absolute left-1/2 top-[-10%] h-[26rem] w-[46rem] -translate-x-1/2 rounded-full bg-primary/[0.06] blur-3xl dark:bg-primary/10" />

      {/* Nokta deseni (kenarları maskeli) */}
      <div
        className="absolute inset-0 opacity-60"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, hsl(var(--foreground) / 0.06) 1px, transparent 0)",
          backgroundSize: "30px 30px",
          maskImage:
            "radial-gradient(ellipse 80% 70% at 50% 45%, black, transparent 78%)",
          WebkitMaskImage:
            "radial-gradient(ellipse 80% 70% at 50% 45%, black, transparent 78%)",
        }}
      />

      {/* Ortam lojistik çipleri — yalnızca geniş ekran, dekoratif */}
      {CHIPS.map((c) => {
        const Icon = c.icon;
        return (
          <div
            key={c.title}
            className={cn(
              "animate-float absolute hidden items-center gap-2.5 rounded-2xl border border-border bg-card/70 px-3.5 py-2.5 shadow-card backdrop-blur-md xl:flex",
              c.className,
            )}
            style={{ animationDelay: c.delay }}
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted">
              <Icon className={cn("h-4 w-4", c.iconClass)} />
            </span>
            <span className="leading-tight">
              <span className="block text-xs font-semibold text-foreground">{c.title}</span>
              <span className={cn("block text-[11px] font-medium", c.metaClass)}>
                {c.meta}
              </span>
            </span>
          </div>
        );
      })}
    </div>
  );
}
