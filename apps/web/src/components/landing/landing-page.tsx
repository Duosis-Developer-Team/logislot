import { FeatureGrid } from "@/components/landing/feature-grid";
import { HowItWorksTimeline } from "@/components/landing/how-it-works";
import { LandingHero } from "@/components/landing/landing-hero";
import { FinalCTA, LandingFooter, LandingTopbar } from "@/components/landing/landing-shell";
import { ProblemSection, SolutionSection } from "@/components/landing/problem-solution";
import {
  ManagementPanelSection,
  OperationsTrustSection,
  SaaSArchitectureSection,
  SupplierPortalSection,
} from "@/components/landing/portal-sections";

/**
 * Public landing page + portal selector (entry modu, :30080).
 *
 * Hem LogiSlot'u anlatır hem de Tedarikçi/Yönetim portallarına geçiş sağlar.
 * Platform Yönetimi bu sayfada HİÇBİR biçimde yer almaz (hidden internal
 * portal — bkz. docs/PORTAL_ISOLATION_AND_ROUTING.md).
 */
export function LandingPage({
  supplierUrl,
  adminUrl,
}: {
  supplierUrl: string;
  adminUrl: string;
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
        <ManagementPanelSection adminUrl={adminUrl} />
        <SupplierPortalSection supplierUrl={supplierUrl} />
        <SaaSArchitectureSection />
        <OperationsTrustSection />
        <FinalCTA supplierUrl={supplierUrl} adminUrl={adminUrl} />
      </main>
      <LandingFooter supplierUrl={supplierUrl} adminUrl={adminUrl} />
    </div>
  );
}
