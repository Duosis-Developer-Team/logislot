import { CalendarClock, Mail, ShieldCheck } from "lucide-react";
import { DemoRequestForm } from "@/components/landing/demo-request-form";
import { MarketingPageShell } from "@/components/landing/marketing-page-shell";
import { getLandingConfig, getPortalUrls } from "@/lib/portal-mode";

/**
 * Demo / İletişim — strateji dokümanına göre huninin en yüksek dönüşüm etkili
 * sayfası: müşteri olmayan ziyaretçi login'e değil buraya yönlenir.
 */
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Demo Talep Et — LogiSlot",
  description:
    "LogiSlot mal kabul ve rampa randevu platformunu yakından görmek için demo talep edin.",
};

const EXPECTATIONS = [
  {
    icon: CalendarClock,
    title: "30 dakikalık canlı demo",
    text: "Tedarikçi randevu akışını, yönetim panelini ve tesis kurallarını kendi senaryonuz üzerinden görürsünüz.",
  },
  {
    icon: ShieldCheck,
    title: "Satış baskısı yok",
    text: "Amaç operasyonunuza uyup uymadığını birlikte anlamak; demo sonrası karar tamamen sizde.",
  },
  {
    icon: Mail,
    title: "1 iş günü içinde dönüş",
    text: "Talebiniz ekibimize e-posta ile ulaşır; uygun zamanı birlikte planlarız.",
  },
];

export default function DemoPage() {
  const urls = getPortalUrls();
  const landing = getLandingConfig();

  return (
    <MarketingPageShell
      supplierUrl={urls.supplier}
      adminUrl={urls.admin}
      duosisUrl={landing.duosisUrl}
      title="Demo Talep Et"
      description="Mal kabul operasyonunuzu LogiSlot üzerinde nasıl yöneteceğinizi görmek için kısa bir demo planlayalım."
      wide
    >
      <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:gap-14">
        <div className="space-y-4">
          {EXPECTATIONS.map((item) => {
            const Icon = item.icon;
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
            Formu kullanmak istemezseniz talebinizi doğrudan{" "}
            <a
              href={`mailto:${landing.contactEmail}`}
              className="font-medium text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground"
            >
              {landing.contactEmail}
            </a>{" "}
            adresine iletebilirsiniz.
          </p>
        </div>

        <div className="rounded-3xl border border-border bg-card p-6 shadow-card-hover sm:p-8">
          <DemoRequestForm contactEmail={landing.contactEmail} />
        </div>
      </div>
    </MarketingPageShell>
  );
}
