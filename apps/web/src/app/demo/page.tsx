import { CalendarClock, Mail, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import { DemoRequestForm } from "@/components/landing/demo-request-form";
import { MarketingPageShell } from "@/components/landing/marketing-page-shell";
import { getDictionary } from "@/lib/i18n/server";
import { getLandingConfig, getPortalUrls } from "@/lib/portal-mode";

/**
 * Demo / İletişim — strateji dokümanına göre huninin en yüksek dönüşüm etkili
 * sayfası: müşteri olmayan ziyaretçi login'e değil buraya yönlenir.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getDictionary();
  return {
    title: t.misc.demoPage.metaTitle,
    description: t.misc.demoPage.metaDescription,
  };
}

/** Ikon sirasi sozlukteki madde sirasiyla ESLESIR. */
const ICONS = [CalendarClock, ShieldCheck, Mail];

export default async function DemoPage() {
  const { t } = await getDictionary();
  const copy = t.misc.demoPage;
  const urls = getPortalUrls();
  const landing = getLandingConfig();

  return (
    <MarketingPageShell
      supplierUrl={urls.supplier}
      adminUrl={urls.admin}
      duosisUrl={landing.duosisUrl}
      title={copy.title}
      description={copy.description}
      wide
    >
      <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:gap-14">
        <div className="space-y-4">
          {copy.points.map((item, index) => {
            const Icon = ICONS[index] ?? CalendarClock;
            return (
              <div
                key={item.title}
                className="flex items-start gap-4 rounded-2xl border border-border bg-card p-5 shadow-card"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="font-semibold">{item.title}</h2>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    {item.text}
                  </p>
                </div>
              </div>
            );
          })}
          <p className="px-1 text-sm text-muted-foreground">
            {copy.directContact}{" "}
            <a
              href={`mailto:${landing.contactEmail}`}
              className="font-medium text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground"
            >
              {landing.contactEmail}
            </a>{" "}
            {copy.directContactTail}
          </p>
        </div>

        <div className="rounded-3xl border border-border bg-card p-6 shadow-card-hover sm:p-8">
          <DemoRequestForm contactEmail={landing.contactEmail} />
        </div>
      </div>
    </MarketingPageShell>
  );
}
