import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useT } from "@/lib/i18n/provider";
import { LandingFooter, LandingTopbar } from "@/components/landing/landing-shell";

/**
 * Yan sayfa (demo/yasal) kabuğu — landing ile aynı topbar/footer, ortada
 * dar içerik kolonu ve "ana sayfaya dön" kırıntısı.
 */
export function MarketingPageShell({
  supplierUrl,
  adminUrl,
  duosisUrl,
  title,
  description,
  children,
  wide = false,
}: {
  supplierUrl: string;
  adminUrl: string;
  duosisUrl: string | null;
  title: string;
  description?: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  const t = useT();
  return (
    <div className="min-h-screen bg-background">
      <LandingTopbar supplierUrl={supplierUrl} adminUrl={adminUrl} />
      <main className={`mx-auto px-5 py-12 sm:px-8 lg:py-16 ${wide ? "max-w-5xl" : "max-w-3xl"}`}>
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          {t.landing.shell.backHome}
        </Link>
        <h1 className="mt-5 text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1>
        {description && (
          <p className="mt-3 max-w-2xl leading-relaxed text-muted-foreground">{description}</p>
        )}
        <div className="mt-10">{children}</div>
      </main>
      <LandingFooter supplierUrl={supplierUrl} adminUrl={adminUrl} duosisUrl={duosisUrl} />
    </div>
  );
}
