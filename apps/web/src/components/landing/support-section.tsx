import { ArrowRight, ChevronDown, LifeBuoy, Mail } from "lucide-react";
import Link from "next/link";
import { Reveal } from "@/components/landing/reveal";

/**
 * Destek bölümü — SSS (JS'siz erişilebilir details/summary akordeonu) +
 * iletişim kartı. Yanıtlar dürüst yetenek dilindedir; olmayan SLA/kanal
 * iddia edilmez.
 */

const FAQ: { q: string; a: React.ReactNode }[] = [
  {
    q: "Kuruluma nasıl başlıyoruz?",
    a: "Demo sonrasında tesisinizin kuralları (rampalar, ürün ve araç kategorileri, çalışma saatleri, kullanıcılar) birlikte tanımlanır. Konfigürasyon hazır olduğunda tedarikçileriniz portala davet edilir ve randevu trafiği tek akışta toplanmaya başlar.",
  },
  {
    q: "Verilerimiz güvende mi?",
    a: (
      <>
        Her müşteri ayrı tenant olarak yönetilir; kategoriler, rampalar,
        kullanıcılar ve randevular tesis seviyesinde izole edilir. Erişim rol
        bazlıdır ve kritik işlemler denetim kaydına işlenir. Altyapı 7/24
        izlenir. Kişisel verilerin işlenmesine ilişkin ayrıntılar için{" "}
        <Link
          href="/kvkk"
          className="font-medium text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground"
        >
          KVKK Aydınlatma Metni
        </Link>
        &apos;ne bakabilirsiniz.
      </>
    ),
  },
  {
    q: "Mevcut sistemlerimize bağlanır mı?",
    a: (
      <>
        LogiSlot tüm işlevlerini API üzerinden sunar; ERP, WMS/TMS ve
        e-posta/takvim bağlantıları kurulum projesi kapsamında birlikte
        planlanır. Ayrıntı için{" "}
        <a
          href="#entegrasyon"
          className="font-medium text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground"
        >
          entegrasyon bölümüne
        </a>{" "}
        göz atın.
      </>
    ),
  },
  {
    q: "Tedarikçilerimiz için kullanımı zor mu?",
    a: "Hayır — tedarikçi tarafı birkaç adımlık bir randevu sihirbazıdır: ürün, araç ve zaman seçilir; sistem yalnızca gerçekten uygun saatleri gösterir. Portal mobil uyumludur ve tedarikçileriniz hesaplarıyla davet edilir.",
  },
  {
    q: "Destek nasıl sağlanıyor?",
    a: "Destek talepleri e-posta üzerinden alınır ve 1 iş günü içinde yanıtlanır; mal kabulünü durduran operasyonel sorunlar öncelikli ele alınır. Altyapı Duosis tarafından 7/24 izlenir.",
  },
];

export function SupportSection({ contactEmail }: { contactEmail: string }) {
  return (
    <section
      id="destek"
      className="scroll-mt-20 border-y border-border bg-muted/40 dark:bg-muted/20"
    >
      <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:py-24">
        <Reveal>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
            Destek
          </p>
          <h2 className="mt-2 max-w-2xl text-3xl font-bold tracking-tight sm:text-4xl">
            Sık sorulan sorular
          </h2>
        </Reveal>

        <div className="mt-10 grid items-start gap-8 lg:grid-cols-[1.15fr_0.85fr] lg:gap-12">
          <Reveal delay={80}>
            <div className="space-y-3">
              {FAQ.map((item) => (
                <details
                  key={item.q}
                  className="group rounded-2xl border border-border bg-card shadow-card transition-colors open:border-primary/35"
                >
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-sm font-semibold [&::-webkit-details-marker]:hidden sm:text-base">
                    {item.q}
                    <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-300 group-open:rotate-180" />
                  </summary>
                  <div className="px-5 pb-5 text-sm leading-relaxed text-muted-foreground">
                    {item.a}
                  </div>
                </details>
              ))}
            </div>
          </Reveal>

          <Reveal delay={160}>
            <div className="rounded-2xl border border-border bg-card p-6 shadow-card-hover sm:p-8">
              <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <LifeBuoy className="h-6 w-6" />
              </span>
              <h3 className="mt-4 text-lg font-bold">Sorunuz mu var?</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Aradığınız yanıtı bulamadıysanız yazın; talebinize{" "}
                <strong className="text-foreground">1 iş günü</strong> içinde
                dönüş yapılır.
              </p>
              <a
                href={`mailto:${contactEmail}`}
                className="mt-5 flex items-center gap-2.5 rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm font-medium transition-colors hover:border-primary/40 dark:bg-muted/20"
              >
                <Mail className="h-4 w-4 shrink-0 text-primary" />
                {contactEmail}
              </a>
              <Link
                href="/demo"
                className="group mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-primary"
              >
                Ürünü yakından görmek için demo talep edin
                <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
              </Link>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
