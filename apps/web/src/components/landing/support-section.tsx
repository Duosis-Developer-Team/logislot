import { ArrowRight, ChevronDown, LifeBuoy, Mail } from "lucide-react";
import Link from "next/link";
import { Reveal } from "@/components/landing/reveal";
import type { Dictionary } from "@/lib/i18n/dictionaries/tr";
import { useT } from "@/lib/i18n/provider";

/**
 * Destek bölümü — SSS (JS'siz erişilebilir details/summary akordeonu) +
 * iletişim kartı. Yanıtlar dürüst yetenek dilindedir; olmayan SLA/kanal
 * iddia edilmez.
 */

/** SSS iceriginin bir kismi link tasidigi icin metin degil JSX'tir; sorular ve
 *  duz yanitlar sozlukten, baglantilar burada birlestirilir. */
function faqItems(t: Dictionary): { q: string; a: React.ReactNode }[] {
  return [
    { q: t.landing.support.faq.setupQ, a: t.landing.support.faq.setupA },
    {
      q: t.landing.support.faq.securityQ,
      a: (
        <>
          {t.landing.support.faq.securityLead}{" "}
          <Link
            href="/kvkk"
            className="font-medium text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground"
          >
            {t.landing.support.faq.securityLink}
          </Link>
          {t.landing.support.faq.securityTail}
        </>
      ),
    },
    {
      q: t.landing.support.faq.integrationQ,
      a: (
        <>
          {t.landing.support.faq.integrationLead}{" "}
          <a
            href="#entegrasyon"
            className="font-medium text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground"
          >
            {t.landing.support.faq.integrationLink}
          </a>{" "}
          {t.landing.support.faq.integrationTail}
        </>
      ),
    },
    { q: t.landing.support.faq.supplierQ, a: t.landing.support.faq.supplierA },
    { q: t.landing.support.faq.helpQ, a: t.landing.support.faq.helpA },
  ];
}

export function SupportSection({ contactEmail }: { contactEmail: string }) {
  const t = useT();
  return (
    <section
      id="destek"
      className="scroll-mt-20 border-y border-border bg-muted/40 dark:bg-muted/20"
    >
      <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:py-24">
        <Reveal>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
            {t.landing.support.eyebrow}
          </p>
          <h2 className="mt-2 max-w-2xl text-3xl font-bold tracking-tight sm:text-4xl">
            {t.landing.support.title}
          </h2>
        </Reveal>

        <div className="mt-10 grid items-start gap-8 lg:grid-cols-[1.15fr_0.85fr] lg:gap-12">
          <Reveal delay={80}>
            <div className="space-y-3">
              {faqItems(t).map((item) => (
                <details
                  key={item.q}
                  className="group rounded-2xl border border-border bg-card shadow-card transition-colors open:border-primary/35"
                >
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-sm font-semibold [&::-webkit-details-marker]:hidden sm:text-base">
                    {item.q}
                    <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-300 group-open:rotate-180" />
                  </summary>
                  <div className="px-5 pb-5 text-sm leading-relaxed text-muted-foreground">
                    {item.a}
                  </div>
                </details>
              ))}
            </div>
          </Reveal>

          <Reveal delay={160}>
            <div className="rounded-2xl border border-border bg-card p-6 shadow-card-hover sm:p-8">
              <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <LifeBuoy className="h-6 w-6" />
              </span>
              <h3 className="mt-4 text-lg font-bold">{t.landing.support.contactTitle}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {t.landing.support.contactLead}{" "}
                <strong className="text-foreground">
                  {t.landing.support.contactHighlight}
                </strong>
                {t.landing.support.contactTail}
              </p>
              <a
                href={`mailto:${contactEmail}`}
                className="mt-5 flex items-center gap-2.5 rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm font-medium transition-colors hover:border-primary/40 dark:bg-muted/20"
              >
                <Mail className="h-4 w-4 shrink-0 text-primary" />
                {contactEmail}
              </a>
              <Link
                href="/demo"
                className="group mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-primary"
              >
                {t.landing.support.contactDemo}
                <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
              </Link>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
