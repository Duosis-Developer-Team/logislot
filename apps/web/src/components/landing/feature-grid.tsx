import {
  Building2,
  GitBranch,
  Layers,
  PackageOpen,
  Route,
  Settings2,
} from "lucide-react";
import { Reveal } from "@/components/landing/reveal";
import { useT } from "@/lib/i18n/provider";

/** Özellik vitrini — 6 çekirdek yetenek, premium grid. */

/** Ikonlar yapisaldir; basliklar ve metinler sozlukten gelir. */
const FEATURE_ICONS = [Route, Settings2, GitBranch, Building2, PackageOpen, Layers];

export function FeatureGrid() {
  const t = useT();
  return (
    <section id="ozellikler" className="mx-auto max-w-7xl scroll-mt-20 px-5 py-16 sm:px-8 lg:py-24">
      <Reveal>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
          {t.landing.features.eyebrow}
        </p>
        <h2 className="mt-2 max-w-2xl text-3xl font-bold tracking-tight sm:text-4xl">
          {t.landing.features.title}
        </h2>
      </Reveal>
      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {t.landing.features.items.map((feature, i) => {
          const Icon = FEATURE_ICONS[i];
          return (
            <Reveal key={feature.title} delay={(i % 3) * 80}>
              <div className="group h-full rounded-2xl border border-border bg-card p-6 shadow-card transition-all duration-300 hover:-translate-y-1 hover:border-primary/35 hover:shadow-card-hover">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors duration-300 group-hover:bg-primary group-hover:text-primary-foreground">
                  <Icon className="h-5 w-5" />
                </span>
                <h3 className="mt-4 font-semibold">{feature.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {feature.text}
                </p>
              </div>
            </Reveal>
          );
        })}
      </div>
    </section>
  );
}
