"use client";

import {
  ArrowRight,
  BellRing,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  History,
  Lock,
  ServerCog,
  ShieldCheck,
  Smartphone,
  Users,
} from "lucide-react";
import { Reveal } from "@/components/landing/reveal";
import { useT } from "@/lib/i18n/provider";

/**
 * Yönetim Paneli ve Tedarikçi Portalı vitrin bölümleri — metin + madde listesi
 * + saf HTML/CSS ürün mock'u ve ilgili portala CTA. Platform bölümü YOKTUR.
 */

export function ManagementPanelSection({ adminUrl }: { adminUrl: string }) {
  const t = useT();
  return (
    <section id="yonetim" className="mx-auto max-w-7xl scroll-mt-20 px-5 py-16 sm:px-8 lg:py-24">
      <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
        <Reveal>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
            {t.landing.adminSection.eyebrow}
          </p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
            {t.landing.adminSection.title}
          </h2>
          <ul className="mt-6 space-y-2.5">
            {t.landing.adminSection.items.map((item) => (
              <li key={item} className="flex items-start gap-2.5 text-sm">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-status-approved" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
          <a
            href={adminUrl}
            className="group mt-8 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-card transition-all duration-300 hover:-translate-y-0.5 hover:shadow-card-hover"
          >
            {t.landing.portalCards.adminCta}
            <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
          </a>
        </Reveal>

        {/* Dashboard mock */}
        <Reveal delay={120}>
          <div className="rounded-2xl border border-border bg-card p-5 shadow-card-hover">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <span className="text-sm font-semibold">{t.landing.adminSection.mockTitle}</span>
              <span className="rounded-full bg-status-pending/15 px-2.5 py-1 text-[10px] font-semibold text-status-pending">
                {t.landing.adminSection.mockPending}
              </span>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2.5">
              {t.landing.adminSection.mockStats.map((label, index) => (
                <div key={label} className="rounded-xl border border-border bg-muted/40 p-3 dark:bg-muted/20">
                  <div className="text-lg font-bold">{["12", "8", "2"][index]}</div>
                  <div className="text-[10px] text-muted-foreground">{label}</div>
                </div>
              ))}
            </div>
            <div className="mt-3 space-y-2">
              {t.landing.adminSection.mockRows.map(({ name, slot, status }, index) => (
                <div
                  key={name}
                  className="flex items-center justify-between rounded-xl border border-border px-3.5 py-2.5"
                >
                  <div>
                    <div className="text-xs font-semibold">{name}</div>
                    <div className="text-[10px] text-muted-foreground">{slot}</div>
                  </div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${MOCK_TONES[index]}`}
                  >
                    {status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/** Mock satirlarinin durum rozeti renkleri — metin degil, gorsel tondur. */
const MOCK_TONES = [
  "text-status-approved bg-status-approved/15",
  "text-status-pending bg-status-pending/15",
  "text-status-revision bg-status-revision/15",
];

const SUPPLIER_ICONS = [ClipboardCheck, BellRing, History, Smartphone];

export function SupplierPortalSection({ supplierUrl }: { supplierUrl: string }) {
  const t = useT();
  return (
    <section id="tedarikci" className="scroll-mt-20 border-y border-border bg-muted/40 dark:bg-muted/20">
      <div className="mx-auto grid max-w-7xl items-center gap-10 px-5 py-16 sm:px-8 lg:grid-cols-2 lg:gap-16 lg:py-24">
        {/* Wizard mock — mobilde sona düşer */}
        <Reveal delay={120} className="order-2 lg:order-1">
          <div className="mx-auto max-w-sm rounded-2xl border border-border bg-card p-5 shadow-card-hover">
            <div className="flex gap-1.5">
              {t.landing.supplierSection.steps.map((step, i) => (
                <div key={step} className="flex-1">
                  <div
                    className={`h-1.5 rounded-full ${i < 2 ? "bg-primary" : "bg-border"}`}
                  />
                  <div
                    className={`mt-1 text-[10px] font-semibold ${
                      i < 2 ? "text-primary" : "text-muted-foreground"
                    }`}
                  >
                    {step}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 space-y-2.5">
              <div className="rounded-xl border border-border p-3">
                <div className="text-[10px] text-muted-foreground">
                  {t.landing.supplierSection.mockProductLabel}
                </div>
                <div className="text-xs font-semibold">
                  {t.landing.supplierSection.mockProductValue}
                </div>
              </div>
              <div className="rounded-xl border border-border p-3">
                <div className="text-[10px] text-muted-foreground">
                  {t.landing.supplierSection.mockVehicleLabel}
                </div>
                <div className="text-xs font-semibold">
                  {t.landing.supplierSection.mockVehicleValue}
                </div>
              </div>
              <div className="rounded-xl border border-primary/40 bg-primary/5 p-3 dark:bg-primary/10">
                <div className="text-[10px] text-primary">
                  {t.landing.supplierSection.mockSuggested}
                </div>
                <div className="text-xs font-semibold">
                  {t.landing.supplierSection.mockSuggestedValue}
                </div>
              </div>
              <div className="rounded-xl bg-primary py-2.5 text-center text-xs font-semibold text-primary-foreground">
                {t.landing.supplierSection.mockCta}
              </div>
            </div>
          </div>
        </Reveal>

        <Reveal className="order-1 lg:order-2">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
            {t.landing.supplierSection.eyebrow}
          </p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
            {t.landing.supplierSection.title}
          </h2>
          <ul className="mt-6 space-y-3">
            {t.landing.supplierSection.items.map((text, index) => {
              const Icon = SUPPLIER_ICONS[index];
              return (
                <li key={text} className="flex items-start gap-3 text-sm">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="pt-1.5">{text}</span>
                </li>
              );
            })}
          </ul>
          <a
            href={supplierUrl}
            className="group mt-8 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-card transition-all duration-300 hover:-translate-y-0.5 hover:shadow-card-hover"
          >
            {t.landing.portalCards.supplierCta}
            <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
          </a>
        </Reveal>
      </div>
    </section>
  );
}

/** SaaS mimarisi — tenant→tesis ayrışması; sade anlatım, giriş linki YOK. */
export function SaaSArchitectureSection() {
  const t = useT();
  return (
    <section className="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:py-24">
      <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
        <Reveal>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
            {t.landing.saas.eyebrow}
          </p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
            {t.landing.saas.title}
          </h2>
          <p className="mt-4 max-w-xl leading-relaxed text-muted-foreground">
            {t.landing.saas.text}
          </p>
        </Reveal>

        {/* Tenant→Facility diyagramı */}
        <Reveal delay={120}>
          <div className="rounded-2xl border border-border bg-card p-6 shadow-card">
            <div className="mx-auto w-fit rounded-xl border border-primary/40 bg-primary/10 px-5 py-2.5 text-center">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-primary">
                {t.landing.saas.tenantLabel}
              </div>
              <div className="text-sm font-bold">{t.landing.saas.tenantName}</div>
            </div>
            <div className="mx-auto h-6 w-px bg-border" />
            <div className="grid grid-cols-2 gap-3">
              {t.landing.saas.facilities.map((facility) => (
                <div key={facility} className="rounded-xl border border-border bg-muted/40 p-3.5 dark:bg-muted/20">
                  <div className="text-xs font-semibold">{facility}</div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {t.landing.saas.chips.map(
                      (chip) => (
                        <span
                          key={chip}
                          className="rounded-full border border-border bg-card px-2 py-0.5 text-[9px] text-muted-foreground"
                        >
                          {chip}
                        </span>
                      ),
                    )}
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-4 text-center text-[11px] text-muted-foreground">
              {t.landing.saas.isolationNote}
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

const TRUST_ICONS = [CalendarDays, CheckCircle2, History, Users, ShieldCheck, Lock];

/**
 * Güvenilir altyapı — operasyonel güven maddeleri + dibinde İNCE Duosis
 * güven cümlesi (strateji dokümanı: ayrı büyük bölüm DEĞİL, tek satır +
 * link; URL Duosis tarafıyla teyit edilene kadar env'den gelir, yoksa
 * cümle linksiz gösterilir).
 */
export function OperationsTrustSection({ duosisUrl }: { duosisUrl: string | null }) {
  const t = useT();
  return (
    <section id="altyapi" className="scroll-mt-20 border-y border-border bg-muted/40 dark:bg-muted/20">
      <div className="mx-auto max-w-7xl px-5 py-14 sm:px-8 lg:py-20">
        <Reveal>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
            {t.landing.trust.eyebrow}
          </p>
          <h2 className="mt-2 max-w-2xl text-2xl font-bold tracking-tight sm:text-3xl">
            {t.landing.trust.title}
          </h2>
        </Reveal>
        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {t.landing.trust.items.map((text, i) => {
            const Icon = TRUST_ICONS[i];
            return (
              <Reveal key={text} delay={(i % 3) * 70}>
                <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3.5 shadow-card">
                  <Icon className="h-5 w-5 shrink-0 text-primary" />
                  <span className="text-sm font-medium">{text}</span>
                </div>
              </Reveal>
            );
          })}
        </div>
        {/* İnce Duosis güven satırı — bağırmayan tek cümle */}
        <Reveal delay={240}>
          <p className="mt-8 flex items-center gap-2 text-sm text-muted-foreground">
            <ServerCog className="h-4 w-4 shrink-0 text-primary" />
            <span>
              {t.landing.trust.infraLead}{" "}
              {duosisUrl ? (
                <a
                  href={duosisUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-foreground underline decoration-border underline-offset-2 transition-colors hover:decoration-foreground"
                >
                  Duosis
                </a>
              ) : (
                <span className="font-medium text-foreground">Duosis</span>
              )}{" "}
              {t.landing.trust.infraTail}
            </span>
          </p>
        </Reveal>
      </div>
    </section>
  );
}
