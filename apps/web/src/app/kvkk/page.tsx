import { AlertTriangle } from "lucide-react";
import type { Metadata } from "next";
import { MarketingPageShell } from "@/components/landing/marketing-page-shell";
import { getDictionary } from "@/lib/i18n/server";
import { emphasise } from "@/lib/i18n/rich-text";
import { getLandingConfig, getPortalUrls } from "@/lib/portal-mode";

/**
 * KVKK Aydınlatma Metinleri + Açık Rıza kalemleri.
 *
 * İçerik, "LogiSlot KVKK Uyum Rehberi & Örnek Metinler" dokümanındaki
 * şablonlara dayanır. Köşeli parantezli boşluklar yerine akıcı metin
 * kullanılır; ticari unvan/sicil gibi şirketleşmeyle netleşecek bilgiler
 * uydurulmaz, "yayımlandığında bu sayfada güncellenir" cümlesiyle taahhüt
 * edilir. Aydınlatma ile açık rıza AYRI sunulur; avukat incelemesi
 * tamamlanana kadar taslak bandı korunur.
 *
 * Metin İngilizce de sunulur: KVKK Türk hukukudur ama muhatabı yabancı
 * tedarikçi/sürücü de olabilir — anlamadığı bir aydınlatma metni aydınlatma
 * yükümlülüğünü karşılamaz.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getDictionary();
  return {
    title: t.legal.kvkk.metaTitle,
    description: t.legal.kvkk.metaDescription,
  };
}

function LegalSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-6 shadow-card sm:p-8">
      <h2 className="text-xl font-bold tracking-tight">{title}</h2>
      <div className="mt-4 space-y-3 text-sm leading-relaxed text-muted-foreground [&_strong]:text-foreground">
        {children}
      </div>
    </section>
  );
}

export default async function KvkkPage() {
  const { t } = await getDictionary();
  const copy = t.legal.kvkk;
  const urls = getPortalUrls();
  const landing = getLandingConfig();
  const contact = landing.contactEmail;

  return (
    <MarketingPageShell
      supplierUrl={urls.supplier}
      adminUrl={urls.admin}
      duosisUrl={landing.duosisUrl}
      title={copy.title}
      description={copy.description}
    >
      <div className="space-y-6">
        {/* Taslak uyarısı — avukat onayına kadar */}
        <div className="flex items-start gap-3 rounded-2xl border border-status-pending/40 bg-status-pending/10 p-4 text-sm leading-relaxed">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-status-pending" />
          <p className="text-muted-foreground [&_strong]:text-foreground">
            {emphasise(copy.draftNotice)}
          </p>
        </div>

        <LegalSection title={copy.controller.heading}>
          <p>{emphasise(copy.controller.intro)}</p>
          <p>
            {copy.controller.contactLead}{" "}
            <a
              href={`mailto:${contact}`}
              className="font-medium text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground"
            >
              {contact}
            </a>
            {copy.controller.contactTail}
          </p>
        </LegalSection>

        <LegalSection title={copy.tenantUser.heading}>
          {copy.tenantUser.items.map((item) => (
            <p key={item}>{emphasise(item)}</p>
          ))}
        </LegalSection>

        <LegalSection title={copy.supplierDriver.heading}>
          {copy.supplierDriver.items.map((item) => (
            <p key={item}>{emphasise(item)}</p>
          ))}
        </LegalSection>

        <LegalSection title={copy.consent.heading}>
          <p>{emphasise(copy.consent.intro)}</p>
          <ul className="list-disc space-y-2 pl-5">
            {copy.consent.bullets.map((bullet) => (
              <li key={bullet}>{emphasise(bullet)}</li>
            ))}
          </ul>
          <p>{copy.consent.iysNote}</p>
        </LegalSection>

        <LegalSection title={copy.basis.heading}>
          <p>{copy.basis.intro}</p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] border-collapse text-left text-xs sm:text-sm">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="py-2 pr-4 font-semibold">{copy.basis.colType}</th>
                  <th className="py-2 pr-4 font-semibold">{copy.basis.colExample}</th>
                  <th className="py-2 font-semibold">{copy.basis.colBasis}</th>
                </tr>
              </thead>
              <tbody className="[&_td]:py-2.5 [&_td]:pr-4 [&_tr]:border-b [&_tr]:border-border/60">
                {copy.basis.rows.map((row) => (
                  <tr key={row.type}>
                    <td className="font-medium text-foreground">{row.type}</td>
                    <td>{row.example}</td>
                    <td>{row.basis}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>{copy.basis.anonNote}</p>
        </LegalSection>
      </div>
    </MarketingPageShell>
  );
}
