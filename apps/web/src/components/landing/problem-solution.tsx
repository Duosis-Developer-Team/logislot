"use client";

import {
  CalendarX2,
  EyeOff,
  Mails,
  PackageSearch,
  Truck,
  Users,
} from "lucide-react";
import { Reveal } from "@/components/landing/reveal";
import { useT } from "@/lib/i18n/provider";

/** Problem + Çözüm bölümleri — soft-warning kartlar ve 3 kolonlu çözüm. */

/** Ikonlar yapisaldir; basliklar ve metinler sozlukten gelir. */
const PROBLEM_ICONS = [Mails, EyeOff, Truck, PackageSearch, Users];

export function ProblemSection() {
  const t = useT();
  return (
    <section className="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:py-24">
      <Reveal>
        <h2 className="max-w-2xl text-3xl font-bold tracking-tight sm:text-4xl">
          {t.landing.problems.title}
        </h2>
        <p className="mt-3 max-w-2xl text-muted-foreground">
          {t.landing.problems.subtitle}
        </p>
      </Reveal>
      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {t.landing.problems.items.map((problem, i) => {
          const Icon = PROBLEM_ICONS[i];
          return (
            <Reveal key={problem.title} delay={i * 70}>
              <div className="group h-full rounded-2xl border border-status-pending/25 bg-status-pending/[0.04] p-5 transition-colors duration-300 hover:border-status-pending/45 dark:bg-status-pending/[0.06]">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-status-pending/15 text-status-pending">
                  <Icon className="h-5 w-5" />
                </span>
                <h3 className="mt-3 font-semibold">{problem.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                  {problem.text}
                </p>
              </div>
            </Reveal>
          );
        })}
        <Reveal delay={t.landing.problems.items.length * 70}>
          <div className="flex h-full flex-col justify-center rounded-2xl border border-primary/25 bg-primary/[0.05] p-5 dark:bg-primary/[0.09]">
            <CalendarX2 className="h-5 w-5 text-primary" />
            <p className="mt-3 text-sm font-semibold leading-relaxed">
              {t.landing.problems.footnote}
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

export function SolutionSection() {
  const t = useT();
  return (
    <section className="border-y border-border bg-muted/40 dark:bg-muted/20">
      <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:py-24">
        <Reveal>
          <h2 className="max-w-2xl text-3xl font-bold tracking-tight sm:text-4xl">
            {t.landing.solution.title}
          </h2>
          <p className="mt-3 max-w-3xl text-muted-foreground">
            {t.landing.solution.subtitle}
          </p>
        </Reveal>
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {t.landing.solution.columns.map((column, i) => (
            <Reveal key={column.title} delay={i * 90}>
              <div className="h-full rounded-2xl border border-border bg-card p-6 shadow-card transition-all duration-300 hover:-translate-y-0.5 hover:shadow-card-hover">
                <span className="text-xs font-bold text-primary">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h3 className="mt-2 font-semibold leading-snug">{column.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {column.text}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
