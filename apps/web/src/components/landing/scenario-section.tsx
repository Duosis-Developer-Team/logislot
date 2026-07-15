import { BarChart3, PhoneOff, TimerReset } from "lucide-react";
import { Reveal } from "@/components/landing/reveal";

/**
 * Örnek senaryo + sektör benchmark'ı — strateji dokümanının anlatım dili
 * kararına birebir uyar:
 *  - Uydurma "%80 verimlilik" tarzı İDDİA YOK; omurga yetenek dilidir.
 *  - Senaryo AÇIKÇA "temsili örnek" etiketlidir (gerçek müşteri iddiası değil).
 *  - Sayısal vurgu yalnızca kaynaklı SEKTÖR benchmark'ı olarak verilir
 *    (%30–50 bekleme/detention azalması). İlk gerçek müşteri ölçümü
 *    geldiğinde bu bölümün yerini alır.
 */

const SCENARIO_POINTS = [
  {
    icon: PhoneOff,
    title: "Telefon trafiği takvime taşınır",
    text: "Gün içinde dağınık arama ve e-postalarla yürüyen randevu pazarlığı, tek bir kurallı takvimde toplanır.",
  },
  {
    icon: TimerReset,
    title: "Kapıda sürpriz kalmaz",
    text: "Araç tipi, rampa uygunluğu ve çakışmalar randevu anında değerlendirildiği için araç kapıya geldiğinde plan bellidir.",
  },
  {
    icon: BarChart3,
    title: "Doluluk görünür olur",
    text: "Planlama, depo ve tedarikçi aynı gerçek müsaitliğe bakar; boş rampa saatleri kendiliğinden ortaya çıkar.",
  },
];

export function ScenarioSection() {
  return (
    <section className="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:py-24">
      <div className="grid items-start gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:gap-16">
        {/* Temsili senaryo — açıkça etiketli */}
        <Reveal>
          <span className="inline-flex items-center rounded-full border border-primary/30 bg-primary/5 px-3 py-1 text-xs font-semibold text-primary dark:bg-primary/10">
            Temsili örnek senaryo
          </span>
          <h2 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">
            Günde 40 araç kabul eden bir tesiste neler değişir?
          </h2>
          <p className="mt-4 max-w-xl leading-relaxed text-muted-foreground">
            Aşağıdaki akış, gerçek bir müşteri ölçümü değil; günde ~40 araç
            kabul eden orta ölçekli bir üretim/gıda tesisi üzerinden kurgulanmış
            temsili bir modeldir. LogiSlot&apos;un operasyona nasıl oturduğunu
            somutlaştırmak için paylaşıyoruz.
          </p>
          <div className="mt-8 space-y-4">
            {SCENARIO_POINTS.map((point, i) => {
              const Icon = point.icon;
              return (
                <Reveal key={point.title} delay={i * 90}>
                  <div className="flex items-start gap-4 rounded-2xl border border-border bg-card p-4 shadow-card">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <Icon className="h-5 w-5" />
                    </span>
                    <div>
                      <h3 className="font-semibold">{point.title}</h3>
                      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                        {point.text}
                      </p>
                    </div>
                  </div>
                </Reveal>
              );
            })}
          </div>
        </Reveal>

        {/* Sektör benchmark'ı — kendi sonucumuz değil, kaynaklı sektör gerçeği */}
        <Reveal delay={140}>
          <div className="rounded-2xl border border-border bg-card p-6 shadow-card-hover sm:p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Sektör benchmark&apos;ı
            </p>
            <div className="mt-4 flex items-end gap-2">
              <span className="bg-gradient-to-r from-primary to-sky-500 bg-clip-text text-5xl font-extrabold tracking-tight text-transparent dark:to-sky-400">
                %30–50
              </span>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Rampa/dock randevu çözümleri, sektörde araç bekleme ve{" "}
              <span className="font-medium text-foreground">
                detention (araç bekletme) maliyetlerinde
              </span>{" "}
              tipik olarak bu aralıkta azalma bildirir.
            </p>
            <div className="mt-5 rounded-xl border border-dashed border-border bg-muted/40 p-3.5 text-xs leading-relaxed text-muted-foreground dark:bg-muted/20">
              Bu rakam LogiSlot&apos;un kendi ölçümü değil, sektör genelinin
              bildirdiği aralıktır. İlk müşterilerimizle ölçülen gerçek sonuçlar
              yayınlandığında bu bölüm güncellenecektir.
            </div>
            <p className="mt-4 text-[11px] text-muted-foreground">
              Kaynaklar:{" "}
              <a
                href="https://www.c3solutions.com"
                target="_blank"
                rel="noopener noreferrer"
                className="underline decoration-border underline-offset-2 transition-colors hover:text-foreground"
              >
                C3 Solutions — Detention Pay &amp; Dock Scheduling
              </a>
              {" · "}
              <a
                href="https://www.opendock.com"
                target="_blank"
                rel="noopener noreferrer"
                className="underline decoration-border underline-offset-2 transition-colors hover:text-foreground"
              >
                Opendock — Dock Scheduling Efficiency
              </a>
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
