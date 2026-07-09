import { CalendarCheck2, Radar, ShieldCheck, type LucideIcon } from "lucide-react";
import { LogiSlotLogo } from "@/components/brand/logo";
import { FloatingLogisticsVisual } from "@/components/auth/floating-logistics-visual";

const HIGHLIGHTS: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: CalendarCheck2,
    title: "Tek takvimde rampa randevuları",
    body: "Tüm tesislerin mal kabul planını gerçek zamanlı görün.",
  },
  {
    icon: ShieldCheck,
    title: "Kurallı otomatik onay",
    body: "Tedarikçi taleplerini kapasite ve kurallara göre onaylayın.",
  },
  {
    icon: Radar,
    title: "Çakışma ve kargo öngörüsü",
    body: "Yoğunluğu ve kargo pencerelerini önceden görün.",
  },
];

/**
 * Login sol hero sahnesi — animasyonlu navy zemin (aurora orb'lar, nokta deseni,
 * rota çizgisi), marka, headline, operasyon görseli ve özellik kartları.
 * Her iki temada sabit navy (bg-brand-navy).
 */
export function LoginHero() {
  return (
    <section className="relative hidden overflow-hidden bg-brand-navy text-white lg:flex lg:flex-col lg:justify-between lg:p-12 xl:p-14">
      {/* Zemin katmanları */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-gradient-to-br from-white/[0.06] via-transparent to-transparent" />
        <div className="animate-aurora absolute -left-28 -top-28 h-96 w-96 rounded-full bg-accent/25 blur-3xl" />
        <div
          className="animate-aurora absolute bottom-0 right-0 h-[30rem] w-[30rem] translate-x-1/4 translate-y-1/4 rounded-full bg-sky-500/20 blur-3xl"
          style={{ animationDelay: "5s" }}
        />
        <div
          className="absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, white 1px, transparent 0)",
            backgroundSize: "30px 30px",
          }}
        />
        {/* Soyut rota çizgisi */}
        <svg
          className="absolute bottom-10 left-0 h-40 w-full opacity-20"
          viewBox="0 0 600 160"
          fill="none"
          preserveAspectRatio="none"
        >
          <path
            d="M-20 150 C 140 150, 180 40, 340 60 C 460 76, 520 20, 640 30"
            stroke="url(#routeGrad)"
            strokeWidth="2.5"
            strokeDasharray="2 10"
            strokeLinecap="round"
          />
          <defs>
            <linearGradient id="routeGrad" x1="0" y1="0" x2="600" y2="0">
              <stop stopColor="hsl(var(--accent))" stopOpacity="0" />
              <stop offset="0.5" stopColor="hsl(var(--accent))" />
              <stop offset="1" stopColor="hsl(var(--accent))" stopOpacity="0" />
            </linearGradient>
          </defs>
        </svg>
      </div>

      {/* Marka */}
      <div className="relative">
        <LogiSlotLogo variant="dark" size="xl" priority />
      </div>

      {/* İçerik */}
      <div className="stagger relative flex max-w-md flex-col gap-6">
        <div>
          <h1 className="text-3xl font-bold leading-[1.12] tracking-tight xl:text-[2.6rem]">
            Mal kabul operasyonlarını
            <br />
            <span className="bg-gradient-to-r from-white to-accent/90 bg-clip-text text-transparent">
              tek takvimde
            </span>{" "}
            yönetin.
          </h1>
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-white/65">
            Tedarikçi randevularını, rampa uygunluğunu ve teslimat akışını modern bir
            operasyon panelinde birleştirin.
          </p>
        </div>

        <FloatingLogisticsVisual className="my-2 w-full max-w-xs" />

        <ul className="flex flex-col gap-3">
          {HIGHLIGHTS.map((h) => {
            const Icon = h.icon;
            return (
              <li
                key={h.title}
                className="flex items-start gap-3.5 rounded-xl border border-white/10 bg-white/[0.04] p-3 backdrop-blur-sm transition-colors hover:bg-white/[0.07]"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/10 text-accent ring-1 ring-inset ring-white/15">
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <div className="text-sm font-semibold">{h.title}</div>
                  <div className="text-xs text-white/55">{h.body}</div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Alt bilgi */}
      <div className="relative text-xs text-white/45">
        © 2026 LogiSlot · Kurumsal lojistik operasyon platformu
      </div>
    </section>
  );
}
