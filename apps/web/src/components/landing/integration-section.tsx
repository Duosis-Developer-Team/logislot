import { Boxes, CalendarRange, MessageSquareText, Plug2, Warehouse } from "lucide-react";
import { Reveal } from "@/components/landing/reveal";

/**
 * Entegrasyon / güven işaretleri — kurumsal alıcının ilk sorusu olan
 * "mevcut sistemime bağlanır mı?" sorusuna KISA ve dürüst yanıt.
 * Yetenek dili kullanılır; olmayan hazır konektör iddia edilmez —
 * API-öncelikli mimari + kurulum kapsamında planlanan bağlantılar anlatılır.
 */

const CHANNELS = [
  { icon: Boxes, label: "ERP" },
  { icon: Warehouse, label: "WMS / TMS" },
  { icon: CalendarRange, label: "E-posta & takvim" },
  { icon: MessageSquareText, label: "Bildirim kanalları" },
];

export function IntegrationSection() {
  return (
    <section id="entegrasyon" className="mx-auto max-w-7xl scroll-mt-20 px-5 py-16 sm:px-8 lg:py-20">
      <div className="rounded-3xl border border-border bg-card p-8 shadow-card sm:p-10">
        <div className="grid items-center gap-8 lg:grid-cols-[1fr_auto]">
          <Reveal>
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Plug2 className="h-5 w-5" />
              </span>
              <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
                Mevcut sistemlerinize bağlanır mı?
              </h2>
            </div>
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
              LogiSlot, tüm işlevlerini API üzerinden sunan modern bir mimariyle
              geliştirildi. Randevu, tedarikçi ve rampa verisi dışa kapalı bir
              kutuda kalmaz; ERP, WMS/TMS ve e-posta/takvim sistemlerinizle
              bağlantı, kurulum projesi kapsamında birlikte planlanır. E-posta
              bildirimleri üründe hazırdır; ek bildirim kanalları ihtiyaca göre
              devreye alınır.
            </p>
          </Reveal>
          <Reveal delay={120}>
            <div className="grid grid-cols-2 gap-3">
              {CHANNELS.map((channel) => {
                const Icon = channel.icon;
                return (
                  <div
                    key={channel.label}
                    className="flex items-center gap-2.5 rounded-xl border border-border bg-muted/40 px-4 py-3 dark:bg-muted/20"
                  >
                    <Icon className="h-4 w-4 shrink-0 text-primary" />
                    <span className="text-sm font-medium">{channel.label}</span>
                  </div>
                );
              })}
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
