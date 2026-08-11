import {
  CalendarX2,
  EyeOff,
  Mails,
  PackageSearch,
  Truck,
  Users,
} from "lucide-react";
import { Reveal } from "@/components/landing/reveal";

/** Problem + Çözüm bölümleri — soft-warning kartlar ve 3 kolonlu çözüm. */

const PROBLEMS = [
  {
    icon: Mails,
    title: "Dağınık talepler",
    text: "Tedarikçi talepleri e-posta ve telefonla dağılıyor; kayıt tek yerde toplanmıyor.",
  },
  {
    icon: EyeOff,
    title: "Görünmeyen doluluk",
    text: "Rampa doluluğu gerçek zamanlı görünmüyor; plan tahminle yapılıyor.",
  },
  {
    icon: Truck,
    title: "Geç fark edilen uyumsuzluk",
    text: "Araç tipi ve rampa uygunluğu araç kapıya geldiğinde fark ediliyor.",
  },
  {
    icon: PackageSearch,
    title: "Kargo belirsizliği",
    text: "Kargo geliş saatleri belli olmuyor; operasyon planı gün içinde bozuluyor.",
  },
  {
    icon: Users,
    title: "Kopuk ekipler",
    text: "Planlama, depo ve tedarikçi aynı bilgiye bakamıyor; herkesin listesi farklı.",
  },
];

export function ProblemSection() {
  return (
    <section className="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:py-24">
      <Reveal>
        <h2 className="max-w-2xl text-3xl font-bold tracking-tight sm:text-4xl">
          Mal kabul operasyonları hâlâ dağınık mı yönetiliyor?
        </h2>
        <p className="mt-3 max-w-2xl text-muted-foreground">
          Randevusuz araçlar, dolu rampalar ve son dakika sürprizleri günün planını
          belirliyorsa sorun kişilerde değil, akışın kendisindedir.
        </p>
      </Reveal>
      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {PROBLEMS.map((problem, i) => {
          const Icon = problem.icon;
          return (
            <Reveal key={problem.title} delay={i * 70}>
              <div className="group h-full rounded-2xl border border-status-pending/25 bg-status-pending/[0.04] p-5 transition-colors duration-300 hover:border-status-pending/45 dark:bg-status-pending/[0.06]">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-status-pending/15 text-status-pending">
                  <Icon className="h-5 w-5" />
                </span>
                <h3 className="mt-3 font-semibold">{problem.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                  {problem.text}
                </p>
              </div>
            </Reveal>
          );
        })}
        <Reveal delay={PROBLEMS.length * 70}>
          <div className="flex h-full flex-col justify-center rounded-2xl border border-primary/25 bg-primary/[0.05] p-5 dark:bg-primary/[0.09]">
            <CalendarX2 className="h-5 w-5 text-primary" />
            <p className="mt-3 text-sm font-semibold leading-relaxed">
              Sonuç: bekleyen araçlar, boşa geçen rampa saatleri ve telefonla
              yönetilen bir gün.
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

const SOLUTION_COLUMNS = [
  {
    title: "Tedarikçi için kolay randevu talebi",
    text: "Ürün, araç ve teslimat bilgisi birkaç adımda girilir; uygun saatler anında görünür.",
  },
  {
    title: "Yönetim için kurallı onay ve takvim",
    text: "Onay, revize ve iptal akışları tek takvim üzerinde; her aksiyon kayıt altında.",
  },
  {
    title: "Tesis için gerçek kapasite ve çakışma kontrolü",
    text: "Rampa uygunluğu, çalışma saatleri ve fiziksel kısıtlar otomatik değerlendirilir.",
  },
];

export function SolutionSection() {
  return (
    <section className="border-y border-border bg-muted/40 dark:bg-muted/20">
      <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:py-24">
        <Reveal>
          <h2 className="max-w-2xl text-3xl font-bold tracking-tight sm:text-4xl">
            LogiSlot tüm randevu trafiğini tek akışta toplar.
          </h2>
          <p className="mt-3 max-w-3xl text-muted-foreground">
            Tedarikçi ürünü, araç tipini ve teslimat bilgisini girer; sistem tesis
            kurallarına göre gerçek müsaitliği gösterir. Yönetim paneli onay,
            revize, takvim ve operasyon takibini tek yerden yürütür.
          </p>
        </Reveal>
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {SOLUTION_COLUMNS.map((column, i) => (
            <Reveal key={column.title} delay={i * 90}>
              <div className="h-full rounded-2xl border border-border bg-card p-6 shadow-card transition-all duration-300 hover:-translate-y-0.5 hover:shadow-card-hover">
                <span className="text-xs font-bold text-primary">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h3 className="mt-2 font-semibold leading-snug">{column.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {column.text}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
