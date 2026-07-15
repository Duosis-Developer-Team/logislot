import { ArrowRight, Building2, CalendarPlus, Truck } from "lucide-react";
import Link from "next/link";
import { LogiSlotLogo } from "@/components/brand/logo";
import { PortalAccessCards } from "@/components/landing/portal-access-cards";
import { Reveal } from "@/components/landing/reveal";
import { ThemeToggle } from "@/components/shell/theme-toggle";

/**
 * Landing kabuğu: sticky topbar, final CTA ve footer.
 *
 * Strateji dokümanı kararları:
 *  - Hero/kapanışta iki birincil aksiyon: Demo Talep Et + portal seçimi
 *    (huni artık yalnızca login'e gitmez).
 *  - Footer'da yasal sayfa linkleri (KVKK, çerez) ve İNCE "Altyapı ortağı:
 *    Duosis" satırı — Duosis ürün kimliğine karışmaz, bağırmaz.
 *  - Platform Yönetimi'ne dair hiçbir link/metin YOKTUR (hidden portal).
 */

export function LandingTopbar({
  supplierUrl,
  adminUrl,
}: {
  supplierUrl: string;
  adminUrl: string;
}) {
  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-5 sm:px-8">
        <LogiSlotLogo size="md" priority />
        <div className="flex items-center gap-2">
          <a
            href={supplierUrl}
            className="hidden items-center gap-1.5 rounded-lg border border-border px-3.5 py-2 text-sm font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground md:inline-flex"
          >
            <Truck className="h-4 w-4" />
            Tedarikçi
          </a>
          <a
            href={adminUrl}
            className="hidden items-center gap-1.5 rounded-lg border border-border px-3.5 py-2 text-sm font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground md:inline-flex"
          >
            <Building2 className="h-4 w-4" />
            Yönetim
          </a>
          <Link
            href="/demo"
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground transition-all hover:opacity-90"
          >
            <CalendarPlus className="h-4 w-4" />
            Demo Talep Et
          </Link>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}

export function FinalCTA({
  supplierUrl,
  adminUrl,
}: {
  supplierUrl: string;
  adminUrl: string;
}) {
  return (
    <section className="relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-72 bg-gradient-to-t from-primary/10 to-transparent dark:from-primary/15"
      />
      <div className="relative mx-auto max-w-4xl px-5 py-16 text-center sm:px-8 lg:py-24">
        <Reveal>
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Mal kabul operasyonlarınızı daha kontrollü yönetin.
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
            Ürünü yakından görmek için demo talep edin; kullanıcıysanız
            portalınızı seçip devam edin.
          </p>
          <div className="mt-7 flex justify-center">
            <Link
              href="/demo"
              className="group inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3.5 text-sm font-semibold text-primary-foreground shadow-card transition-all duration-300 hover:-translate-y-0.5 hover:shadow-card-hover"
            >
              <CalendarPlus className="h-4 w-4" />
              Demo Talep Et
              <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
            </Link>
          </div>
        </Reveal>
        <Reveal delay={140} className="mx-auto mt-9 max-w-2xl text-left">
          <PortalAccessCards supplierUrl={supplierUrl} adminUrl={adminUrl} compact />
        </Reveal>
      </div>
    </section>
  );
}

export function LandingFooter({
  supplierUrl,
  adminUrl,
  duosisUrl,
}: {
  supplierUrl: string;
  adminUrl: string;
  duosisUrl: string | null;
}) {
  return (
    <footer className="border-t border-border bg-muted/40 dark:bg-muted/20">
      <div className="mx-auto grid max-w-7xl gap-10 px-5 py-12 sm:px-8 md:grid-cols-[1.2fr_1fr_1fr]">
        <div className="max-w-sm">
          <LogiSlotLogo size="md" />
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Fabrikaların ve depoların tedarikçi mal kabul süreçlerini
            dijitalleştiren modern operasyon platformu.
          </p>
        </div>
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Portallar
          </div>
          <ul className="mt-3 space-y-2 text-sm">
            <li>
              <a href={supplierUrl} className="text-muted-foreground transition-colors hover:text-foreground">
                Tedarikçi Portalı
              </a>
            </li>
            <li>
              <a href={adminUrl} className="text-muted-foreground transition-colors hover:text-foreground">
                Yönetim Paneli
              </a>
            </li>
            <li>
              <Link href="/demo" className="text-muted-foreground transition-colors hover:text-foreground">
                Demo Talep Et
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Yasal
          </div>
          <ul className="mt-3 space-y-2 text-sm">
            <li>
              <Link href="/kvkk" className="text-muted-foreground transition-colors hover:text-foreground">
                KVKK Aydınlatma Metni
              </Link>
            </li>
            <li>
              <Link
                href="/cerez-politikasi"
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                Çerez Politikası
              </Link>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-border/70">
        <div className="mx-auto flex max-w-7xl flex-col gap-1.5 px-5 py-5 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <p>© 2026 LogiSlot · Kurumsal lojistik operasyon platformu</p>
          <p>
            Altyapı ortağı:{" "}
            {duosisUrl ? (
              <a
                href={duosisUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-foreground/80 underline decoration-border underline-offset-2 transition-colors hover:text-foreground"
              >
                Duosis
              </a>
            ) : (
              <span className="font-medium text-foreground/80">Duosis</span>
            )}
          </p>
        </div>
      </div>
    </footer>
  );
}
