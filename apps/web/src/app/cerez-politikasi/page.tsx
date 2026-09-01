import Link from "next/link";
import type { Metadata } from "next";
import { MarketingPageShell } from "@/components/landing/marketing-page-shell";
import { getDictionary } from "@/lib/i18n/server";
import { emphasise } from "@/lib/i18n/rich-text";
import { getLandingConfig, getPortalUrls } from "@/lib/portal-mode";

/**
 * Çerez Politikası — ürünün BUGÜNKÜ gerçek durumunu yansıtır:
 * yalnızca zorunlu/işlevsel yerel depolama; analitik/pazarlama çerezi yok.
 * Zorunlu depolama için açık rıza gerekmediğinden banner bilgilendirme
 * amaçlıdır. Analitik/pazarlama eklenirse bu sayfa ve rıza akışı güncellenir.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getDictionary();
  return {
    title: t.legal.cookies.metaTitle,
    description: t.legal.cookies.metaDescription,
  };
}

export default async function CookiePolicyPage() {
  const { t } = await getDictionary();
  const copy = t.legal.cookies;
  const urls = getPortalUrls();
  const landing = getLandingConfig();

  return (
    <MarketingPageShell
      supplierUrl={urls.supplier}
      adminUrl={urls.admin}
      duosisUrl={landing.duosisUrl}
      title={copy.title}
      description={copy.description}
    >
      <div className="space-y-6 text-sm leading-relaxed text-muted-foreground [&_strong]:text-foreground">
        <section className="rounded-2xl border border-border bg-card p-6 shadow-card sm:p-8">
          <h2 className="text-xl font-bold tracking-tight text-foreground">
            {copy.summaryHeading}
          </h2>
          <p className="mt-3">{emphasise(copy.summaryText)}</p>
        </section>

        <section className="rounded-2xl border border-border bg-card p-6 shadow-card sm:p-8">
          <h2 className="text-xl font-bold tracking-tight text-foreground">
            {copy.itemsHeading}
          </h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[38rem] border-collapse text-left text-xs sm:text-sm">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="py-2 pr-4 font-semibold">{copy.colKey}</th>
                  <th className="py-2 pr-4 font-semibold">{copy.colPurpose}</th>
                  <th className="py-2 pr-4 font-semibold">{copy.colType}</th>
                  <th className="py-2 font-semibold">{copy.colDuration}</th>
                </tr>
              </thead>
              <tbody className="[&_td]:py-2.5 [&_td]:pr-4 [&_tr]:border-b [&_tr]:border-border/60">
                {copy.items.map((item) => (
                  <tr key={item.key}>
                    <td className="font-mono text-[11px] text-foreground sm:text-xs">
                      {item.key}
                    </td>
                    <td>{item.purpose}</td>
                    <td>{item.required ? copy.typeRequired : copy.typeFunctional}</td>
                    <td>{item.duration}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-4">{emphasise(copy.storageNote)}</p>
        </section>

        <section className="rounded-2xl border border-border bg-card p-6 shadow-card sm:p-8">
          <h2 className="text-xl font-bold tracking-tight text-foreground">
            {copy.changesHeading}
          </h2>
          <p className="mt-3">
            {emphasise(copy.changesLead)}{" "}
            <Link
              href="/kvkk"
              className="font-medium text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground"
            >
              {copy.kvkkLink}
            </Link>
            {copy.changesTail}
          </p>
          <p className="mt-3">
            {copy.questions} <strong>{landing.contactEmail}</strong>
          </p>
        </section>
      </div>
    </MarketingPageShell>
  );
}
