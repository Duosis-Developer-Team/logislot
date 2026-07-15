import {
  Building2,
  GitBranch,
  Layers,
  PackageOpen,
  Route,
  Settings2,
} from "lucide-react";
import { Reveal } from "@/components/landing/reveal";

/** Özellik vitrini — 6 çekirdek yetenek, premium grid. */

const FEATURES = [
  {
    icon: Route,
    title: "Akıllı Rampa Yönlendirme",
    text: "Ürün kategorisi, araç kategorisi ve tesis kuralları birlikte değerlendirilir; tedarikçiye gerçek müsaitlik gösterilir.",
  },
  {
    icon: Settings2,
    title: "Tesis Bazlı Kurallar",
    text: "Her tesis kendi rampalarını, çalışma düzenini, kategori sürelerini ve araç uygunluklarını konfigüre eder.",
  },
  {
    icon: GitBranch,
    title: "Rampa Çakışma Grupları",
    text: "Yan yana rampalar veya fiziksel kapasite paylaşan alanlar kurallarla modellenir; çakışmalar otomatik engellenir.",
  },
  {
    icon: Building2,
    title: "Tedarikçi Portalı",
    text: "Tedarikçiler randevu oluşturur, durumları takip eder ve gerektiğinde iptal/yanıt akışlarına katılır.",
  },
  {
    icon: PackageOpen,
    title: "Kargo Uyarı Katmanı",
    text: "Belirsiz varışlı kargolar takvimde ayrı bir uyarı katmanı olarak görünür; planlamacı önceden farkındalık kazanır.",
  },
  {
    icon: Layers,
    title: "Çok Tesisli SaaS Mimari",
    text: "Tenant ve tesis yapısıyla farklı müşteriler ve lokasyonlar güvenli şekilde ayrıştırılır.",
  },
];

export function FeatureGrid() {
  return (
    <section id="ozellikler" className="mx-auto max-w-7xl scroll-mt-20 px-5 py-16 sm:px-8 lg:py-24">
      <Reveal>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
          Neler yapar
        </p>
        <h2 className="mt-2 max-w-2xl text-3xl font-bold tracking-tight sm:text-4xl">
          Sahadaki kuralları bilen bir randevu motoru
        </h2>
      </Reveal>
      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((feature, i) => {
          const Icon = feature.icon;
          return (
            <Reveal key={feature.title} delay={(i % 3) * 80}>
              <div className="group h-full rounded-2xl border border-border bg-card p-6 shadow-card transition-all duration-300 hover:-translate-y-1 hover:border-primary/35 hover:shadow-card-hover">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors duration-300 group-hover:bg-primary group-hover:text-primary-foreground">
                  <Icon className="h-5 w-5" />
                </span>
                <h3 className="mt-4 font-semibold">{feature.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {feature.text}
                </p>
              </div>
            </Reveal>
          );
        })}
      </div>
    </section>
  );
}
