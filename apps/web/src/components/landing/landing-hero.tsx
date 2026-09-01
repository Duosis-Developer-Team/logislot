import { ArrowRight, CalendarCheck2, CalendarPlus, Package, Truck } from "lucide-react";
import Link from "next/link";
import { LogiSlotIcon } from "@/components/brand/logo";
import { PortalAccessCards } from "@/components/landing/portal-access-cards";
import { useT } from "@/lib/i18n/provider";

/**
 * Hero — ürün mesajı + public portal seçimi + büyük marka ikonu etrafında
 * soyut operasyon görseli (mini rampa kartları, kargo uyarısı, slot ızgarası).
 * Gerçek screenshot yerine premium abstract product visual (saf HTML/CSS).
 */


export function LandingHero({
  supplierUrl,
  adminUrl,
}: {
  supplierUrl: string;
  adminUrl: string;
}) {
  const t = useT();
  return (
    <section className="relative overflow-hidden">
      {/* Arkaplan: yumuşak grid + aurora glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(hsl(var(--border)/0.55)_1px,transparent_1px),linear-gradient(90deg,hsl(var(--border)/0.55)_1px,transparent_1px)] bg-[size:44px_44px] [mask-image:radial-gradient(ellipse_75%_65%_at_50%_0%,black_35%,transparent_78%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -top-44 left-1/2 h-[34rem] w-[54rem] -translate-x-1/2 animate-aurora rounded-full bg-gradient-to-r from-primary/15 via-sky-400/10 to-primary/15 blur-3xl"
      />

      <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-5 pb-16 pt-14 sm:px-8 lg:grid-cols-[1.05fr_0.95fr] lg:gap-8 lg:pb-24 lg:pt-20">
        {/* Sol: mesaj + portal seçimi */}
        <div className="stagger">
          {/* Mobilde büyük marka ikonu (desktop'ta sağ kolonda) */}
          <div className="mb-6 flex justify-center md:hidden">
            <div className="relative">
              <div
                aria-hidden
                className="absolute -inset-6 rounded-full bg-primary/10 blur-2xl dark:bg-primary/15"
              />
              <LogiSlotIcon
                variant="auto"
                priority
                className="animate-float relative h-32 w-auto drop-shadow-xl"
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {t.landing.hero.chips.map((item) => (
              <span
                key={item}
                className="rounded-full border border-border bg-card/70 px-3 py-1 text-xs font-medium text-muted-foreground backdrop-blur-sm"
              >
                {item}
              </span>
            ))}
          </div>

          <h1 className="mt-6 text-4xl font-extrabold leading-[1.08] tracking-tight sm:text-5xl xl:text-[3.4rem]">
            {t.landing.hero.titleLead}{" "}
            <span className="bg-gradient-to-r from-primary via-sky-500 to-primary bg-clip-text text-transparent dark:via-sky-400">
              {t.landing.hero.titleAccent}
            </span>{" "}
            {t.landing.hero.titleTail}
          </h1>

          <p className="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            {t.landing.hero.subtitle}
          </p>

          {/* Birincil aksiyon: demo hunisi (müşteri olmayanlar için) */}
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Link
              href="/demo"
              className="group inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-card transition-all duration-300 hover:-translate-y-0.5 hover:shadow-card-hover"
            >
              <CalendarPlus className="h-4 w-4" />
              {t.landing.hero.requestDemo}
              <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
            </Link>
            <span className="text-xs text-muted-foreground">
              {t.landing.hero.alreadyUser}
            </span>
          </div>

          <div className="mt-7">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {t.landing.hero.choosePortal}
            </p>
            <PortalAccessCards supplierUrl={supplierUrl} adminUrl={adminUrl} />
          </div>
        </div>

        {/* Sağ: büyük marka ikonu + yüzen operasyon kartları */}
        <div className="relative mx-auto hidden aspect-square w-full max-w-[30rem] items-center justify-center md:flex">
          {/* Halka + glow zemin */}
          <div
            aria-hidden
            className="absolute inset-6 rounded-full border border-border/70 bg-gradient-to-b from-card/80 to-transparent"
          />
          <div
            aria-hidden
            className="absolute inset-16 rounded-full border border-dashed border-primary/25"
          />
          <div
            aria-hidden
            className="absolute inset-0 rounded-full bg-primary/5 blur-3xl dark:bg-primary/10"
          />

          <LogiSlotIcon
            variant="auto"
            priority
            className="animate-float relative z-10 h-52 w-auto drop-shadow-2xl lg:h-64"
          />

          {/* Mini operasyon kartları — hafif yüzer */}
          <div className="animate-float-sm absolute left-0 top-10 z-20 flex items-center gap-2.5 rounded-xl border border-border bg-card/95 px-3.5 py-2.5 shadow-card backdrop-blur">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-status-approved/15 text-status-approved">
              <CalendarCheck2 className="h-4 w-4" />
            </span>
            <div className="text-xs">
              <div className="font-semibold">{t.landing.hero.cardDockTime}</div>
              <div className="text-status-approved">{t.landing.hero.cardApproved}</div>
            </div>
          </div>

          <div
            className="animate-float-sm absolute right-0 top-24 z-20 flex items-center gap-2.5 rounded-xl border border-border bg-card/95 px-3.5 py-2.5 shadow-card backdrop-blur"
            style={{ animationDelay: "1.2s" }}
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-cargo/15 text-cargo">
              <Package className="h-4 w-4" />
            </span>
            <div className="text-xs">
              <div className="font-semibold">{t.landing.hero.cardCargoTitle}</div>
              <div className="text-muted-foreground">{t.landing.hero.cardCargoWindow}</div>
            </div>
          </div>

          <div
            className="animate-float-sm absolute bottom-24 left-2 z-20 flex items-center gap-2 rounded-full border border-border bg-card/95 px-3.5 py-2 shadow-card backdrop-blur"
            style={{ animationDelay: "2.1s" }}
          >
            <Truck className="h-4 w-4 text-primary" />
            <span className="text-xs font-semibold">{t.landing.hero.cardVehicle}</span>
          </div>

          {/* Mini slot ızgarası */}
          <div
            className="animate-float-sm absolute bottom-8 right-4 z-20 rounded-xl border border-border bg-card/95 p-3 shadow-card backdrop-blur"
            style={{ animationDelay: "0.6s" }}
          >
            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {t.landing.hero.cardSlotsToday}
            </div>
            <div className="grid grid-cols-6 gap-1">
              {[
                "bg-status-approved/70",
                "bg-status-approved/70",
                "bg-primary/30",
                "bg-status-pending/70",
                "bg-primary/30",
                "bg-primary/30",
                "bg-status-approved/70",
                "bg-primary/30",
                "bg-cargo/70",
                "bg-primary/30",
                "bg-status-approved/70",
                "bg-primary/30",
              ].map((tone, i) => (
                <span key={i} className={`h-2.5 w-4 rounded-sm ${tone}`} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
