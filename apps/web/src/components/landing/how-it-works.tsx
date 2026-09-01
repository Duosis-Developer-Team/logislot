"use client";

import { CalendarClock, PackageCheck, Truck } from "lucide-react";
import { Reveal } from "@/components/landing/reveal";
import { useT } from "@/lib/i18n/provider";

/**
 * 3 adımlı randevu akışı — tedarikçi sihirbazının gerçek sırası:
 * önce ürün/araç, sonra zaman. Desktop yatay, mobilde dikey zaman çizgisi.
 */

/** Ikon ve rozet stilleri yapisaldir; metinler sozlukten gelir. */
const STEP_ICONS = [PackageCheck, Truck, CalendarClock];

/** Her adimin ornek rozetlerinin gorsel stili (vurgulu / notr / ustu cizili). */
const CHIP_STYLES = [
  [
    "rounded-full bg-primary px-2.5 py-1 text-[10px] font-semibold text-primary-foreground",
    "rounded-full border border-border px-2.5 py-1 text-[10px] text-muted-foreground",
    "rounded-full border border-border px-2.5 py-1 text-[10px] text-muted-foreground",
  ],
  [
    "rounded-lg bg-primary/10 px-2.5 py-1 text-[10px] font-semibold text-primary",
    "rounded-lg border border-border px-2.5 py-1 font-mono text-[10px] text-muted-foreground",
    "rounded-lg bg-cargo/15 px-2.5 py-1 text-[10px] font-semibold text-cargo",
  ],
  [
    "rounded-lg border border-border px-2.5 py-1 text-[10px] text-muted-foreground line-through",
    "rounded-lg bg-primary px-2.5 py-1 text-[10px] font-semibold text-primary-foreground",
    "rounded-lg border border-border px-2.5 py-1 text-[10px] text-muted-foreground",
  ],
];

export function HowItWorksTimeline() {
  const t = useT();
  return (
    <section id="nasil-calisir" className="scroll-mt-20 border-y border-border bg-muted/40 dark:bg-muted/20">
      <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:py-24">
        <Reveal>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
            {t.landing.howItWorks.eyebrow}
          </p>
          <h2 className="mt-2 max-w-2xl text-3xl font-bold tracking-tight sm:text-4xl">
            {t.landing.howItWorks.title}
          </h2>
        </Reveal>

        <div className="relative mt-12 grid gap-10 md:grid-cols-3 md:gap-6">
          {/* Bağlayıcı çizgi (desktop yatay) */}
          <div
            aria-hidden
            className="absolute left-6 top-0 hidden h-px w-[calc(100%-3rem)] translate-y-6 bg-gradient-to-r from-primary/50 via-border to-primary/50 md:block"
          />
          {/* Bağlayıcı çizgi (mobil dikey) */}
          <div
            aria-hidden
            className="absolute left-6 top-2 h-[calc(100%-2rem)] w-px bg-gradient-to-b from-primary/50 via-border to-primary/50 md:hidden"
          />
          {t.landing.howItWorks.steps.map((step, i) => {
            const Icon = STEP_ICONS[i];
            return (
              <Reveal key={step.title} delay={i * 120} className="relative pl-16 md:pl-0">
                <div className="absolute left-0 top-0 z-10 flex h-12 w-12 items-center justify-center rounded-2xl border border-primary/30 bg-card text-primary shadow-card md:relative md:mb-4">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
                  <span className="text-xs font-bold text-primary">
                    {t.landing.howItWorks.step(i + 1)}
                  </span>
                  <h3 className="mt-1 font-semibold">{step.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                    {step.text}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-1.5 rounded-xl border border-dashed border-border bg-muted/50 p-3 dark:bg-muted/30">
                    {step.chips.map((chip, chipIndex) => (
                      <span key={chip} className={CHIP_STYLES[i][chipIndex]}>
                        {chip}
                      </span>
                    ))}
                  </div>
                </div>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
