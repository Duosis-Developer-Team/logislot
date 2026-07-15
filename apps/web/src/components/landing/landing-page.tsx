import { FeatureGrid } from "@/components/landing/feature-grid";
import { HowItWorksTimeline } from "@/components/landing/how-it-works";
import { IntegrationSection } from "@/components/landing/integration-section";
import { LandingHero } from "@/components/landing/landing-hero";
import { FinalCTA, LandingFooter, LandingTopbar } from "@/components/landing/landing-shell";
import { ProblemSection, SolutionSection } from "@/components/landing/problem-solution";
import { ScenarioSection } from "@/components/landing/scenario-section";
import { SupportSection } from "@/components/landing/support-section";
import {
  ManagementPanelSection,
  OperationsTrustSection,
  SaaSArchitectureSection,
  SupplierPortalSection,
} from "@/components/landing/portal-sections";

/**
 * Public landing page + portal selector (entry modu, :30080).
 *
 * Bölüm sırası strateji dokümanına göre: problem → çözüm/akış → özellikler →
 * temsili senaryo + sektör benchmark'ı → ürün vitrinleri → güvenilir altyapı
 * (ince Duosis satırıyla) → entegrasyon işaretleri → kapanış CTA (demo +
 * portal seçimi). Platform Yönetimi bu sayfada HİÇBİR biçimde yer almaz
 * (hidden internal portal — bkz. docs/PORTAL_ISOLATION_AND_ROUTING.md).
 */
export function LandingPage({
  supplierUrl,
  adminUrl,
  duosisUrl,
  contactEmail,
}: {
  supplierUrl: string;
  adminUrl: string;
  duosisUrl: string | null;
  contactEmail: string;
}) {
  return (
    <div className="min-h-screen bg-background">
      <LandingTopbar supplierUrl={supplierUrl} adminUrl={adminUrl} />
      <main>
        <LandingHero supplierUrl={supplierUrl} adminUrl={adminUrl} />
        <ProblemSection />
        <SolutionSection />
        <FeatureGrid />
        <HowItWorksTimeline />
        <ScenarioSection />
        <ManagementPanelSection adminUrl={adminUrl} />
        <SupplierPortalSection supplierUrl={supplierUrl} />
        <SaaSArchitectureSection />
        <OperationsTrustSection duosisUrl={duosisUrl} />
        <IntegrationSection />
        <SupportSection contactEmail={contactEmail} />
        <FinalCTA supplierUrl={supplierUrl} adminUrl={adminUrl} />
      </main>
      <LandingFooter supplierUrl={supplierUrl} adminUrl={adminUrl} duosisUrl={duosisUrl} />
    </div>
  );
}
