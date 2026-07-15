import { CalendarClock, PackageCheck, Truck } from "lucide-react";
import { Reveal } from "@/components/landing/reveal";

/**
 * 3 adımlı randevu akışı — tedarikçi sihirbazının gerçek sırası:
 * önce ürün/araç, sonra zaman. Desktop yatay, mobilde dikey zaman çizgisi.
 */

const STEPS = [
  {
    icon: PackageCheck,
    title: "Ürün ve kategori seçilir",
    text: "Tedarikçi ürün, miktar ve kategori bilgisini girer.",
    mock: (
      <div className="flex flex-wrap gap-1.5">
        <span className="rounded-full bg-primary px-2.5 py-1 text-[10px] font-semibold text-primary-foreground">
          Unlu Mamul
        </span>
        <span className="rounded-full border border-border px-2.5 py-1 text-[10px] text-muted-foreground">
          Soğuk Zincir
        </span>
        <span className="rounded-full border border-border px-2.5 py-1 text-[10px] text-muted-foreground">
          Ambalaj
        </span>
      </div>
    ),
  },
  {
    icon: Truck,
    title: "Araç ve teslimat tipi belirlenir",
    text: "Araç kategorisi, plaka, sürücü ve standart/kargo teslimat tipi seçilir.",
    mock: (
      <div className="flex items-center gap-1.5">
        <span className="rounded-lg bg-primary/10 px-2.5 py-1 text-[10px] font-semibold text-primary">
          TIR
        </span>
        <span className="rounded-lg border border-border px-2.5 py-1 font-mono text-[10px] text-muted-foreground">
          34 ABC 123
        </span>
        <span className="rounded-lg bg-cargo/15 px-2.5 py-1 text-[10px] font-semibold text-cargo">
          Standart
        </span>
      </div>
    ),
  },
  {
    icon: CalendarClock,
    title: "Gerçek müsaitlikten slot alınır",
    text: "Sistem rampa, araç ve çakışma kurallarını değerlendirerek uygun saatleri gösterir.",
    mock: (
      <div className="flex flex-wrap gap-1.5">
        <span className="rounded-lg border border-border px-2.5 py-1 text-[10px] text-muted-foreground line-through">
          08:30
        </span>
        <span className="rounded-lg bg-primary px-2.5 py-1 text-[10px] font-semibold text-primary-foreground">
          09:30
        </span>
        <span className="rounded-lg border border-border px-2.5 py-1 text-[10px] text-muted-foreground">
          11:00
        </span>
      </div>
    ),
  },
];

export function HowItWorksTimeline() {
  return (
    <section id="nasil-calisir" className="scroll-mt-20 border-y border-border bg-muted/40 dark:bg-muted/20">
      <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:py-24">
        <Reveal>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
            Nasıl çalışır
          </p>
          <h2 className="mt-2 max-w-2xl text-3xl font-bold tracking-tight sm:text-4xl">
            Randevu akışı sade, kurallar arka planda güçlü.
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
          {STEPS.map((step, i) => {
            const Icon = step.icon;
            return (
              <Reveal key={step.title} delay={i * 120} className="relative pl-16 md:pl-0">
                <div className="absolute left-0 top-0 z-10 flex h-12 w-12 items-center justify-center rounded-2xl border border-primary/30 bg-card text-primary shadow-card md:relative md:mb-4">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
                  <span className="text-xs font-bold text-primary">Adım {i + 1}</span>
                  <h3 className="mt-1 font-semibold">{step.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                    {step.text}
                  </p>
                  <div className="mt-4 rounded-xl border border-dashed border-border bg-muted/50 p-3 dark:bg-muted/30">
                    {step.mock}
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
