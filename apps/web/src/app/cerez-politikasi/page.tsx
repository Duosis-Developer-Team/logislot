import Link from "next/link";
import { MarketingPageShell } from "@/components/landing/marketing-page-shell";
import { getLandingConfig, getPortalUrls } from "@/lib/portal-mode";

/**
 * Çerez Politikası — ürünün BUGÜNKÜ gerçek durumunu yansıtır:
 * yalnızca zorunlu/işlevsel yerel depolama; analitik/pazarlama çerezi yok.
 * Zorunlu depolama için açık rıza gerekmediğinden banner bilgilendirme
 * amaçlıdır. Analitik/pazarlama eklenirse bu sayfa ve rıza akışı güncellenir.
 */
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Çerez Politikası — LogiSlot",
  description:
    "LogiSlot'ta kullanılan çerezler ve yerel depolama hakkında bilgilendirme.",
};

const STORAGE_ITEMS = [
  {
    key: "logislot.access_token / logislot.refresh_token",
    purpose: "Oturumunuzu güvenli biçimde sürdürmek (kimlik doğrulama)",
    type: "Zorunlu",
    duration: "Oturum süresi / yenilenene kadar",
  },
  {
    key: "logislot.portal",
    purpose: "Giriş yaptığınız portal bağlamını hatırlamak",
    type: "Zorunlu",
    duration: "Çıkış yapana kadar",
  },
  {
    key: "theme",
    purpose: "Açık/koyu tema tercihinizi hatırlamak",
    type: "İşlevsel",
    duration: "Siz değiştirene kadar",
  },
  {
    key: "logislot.cookie_notice_ack",
    purpose: "Bu bilgilendirmeyi gördüğünüzü hatırlamak",
    type: "İşlevsel",
    duration: "Kalıcı (tarayıcı verisi temizlenene kadar)",
  },
];

export default function CookiePolicyPage() {
  const urls = getPortalUrls();
  const landing = getLandingConfig();

  return (
    <MarketingPageShell
      supplierUrl={urls.supplier}
      adminUrl={urls.admin}
      duosisUrl={landing.duosisUrl}
      title="Çerez Politikası"
      description="Bu sayfa, LogiSlot web uygulamalarında kullanılan çerez ve benzeri yerel depolama teknolojilerini açıklar."
    >
      <div className="space-y-6 text-sm leading-relaxed text-muted-foreground [&_strong]:text-foreground">
        <section className="rounded-2xl border border-border bg-card p-6 shadow-card sm:p-8">
          <h2 className="text-xl font-bold tracking-tight text-foreground">Özet</h2>
          <p className="mt-3">
            LogiSlot, <strong>yalnızca hizmetin çalışması için zorunlu</strong> ve
            tercihinizi hatırlamaya yarayan işlevsel depolama kullanır.{" "}
            <strong>Analitik, reklam veya pazarlama amaçlı çerez kullanılmaz;</strong>{" "}
            üçüncü taraf izleme teknolojisi bulunmaz. Zorunlu çerez ve depolama
            için mevzuat gereği açık rıza aranmaz; bu nedenle sitedeki banner bir
            onay mekanizması değil, şeffaf bir bilgilendirmedir.
          </p>
        </section>

        <section className="rounded-2xl border border-border bg-card p-6 shadow-card sm:p-8">
          <h2 className="text-xl font-bold tracking-tight text-foreground">
            Kullanılan Depolama Kalemleri
          </h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[38rem] border-collapse text-left text-xs sm:text-sm">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="py-2 pr-4 font-semibold">Anahtar</th>
                  <th className="py-2 pr-4 font-semibold">Amaç</th>
                  <th className="py-2 pr-4 font-semibold">Tür</th>
                  <th className="py-2 font-semibold">Süre</th>
                </tr>
              </thead>
              <tbody className="[&_td]:py-2.5 [&_td]:pr-4 [&_tr]:border-b [&_tr]:border-border/60">
                {STORAGE_ITEMS.map((item) => (
                  <tr key={item.key}>
                    <td className="font-mono text-[11px] text-foreground sm:text-xs">
                      {item.key}
                    </td>
                    <td>{item.purpose}</td>
                    <td>{item.type}</td>
                    <td>{item.duration}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-4">
            Bu kalemler tarayıcınızın <strong>yerel depolamasında</strong> tutulur
            ve LogiSlot dışındaki hiçbir tarafla paylaşılmaz.
          </p>
        </section>

        <section className="rounded-2xl border border-border bg-card p-6 shadow-card sm:p-8">
          <h2 className="text-xl font-bold tracking-tight text-foreground">
            Gelecekteki Değişiklikler
          </h2>
          <p className="mt-3">
            İleride analitik veya pazarlama amaçlı bir teknoloji devreye alınırsa,
            bu politika güncellenecek ve ilgili kalemler için{" "}
            <strong>önceden işaretlenmemiş, ayrı ve geri alınabilir açık rıza</strong>{" "}
            mekanizması sunulacaktır. Kişisel verilerin işlenmesine ilişkin
            ayrıntılar için{" "}
            <Link
              href="/kvkk"
              className="font-medium text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground"
            >
              KVKK Aydınlatma Metni
            </Link>
            &apos;ne bakabilirsiniz.
          </p>
          <p className="mt-3">
            Sorularınız için: <strong>{landing.contactEmail}</strong>
          </p>
        </section>
      </div>
    </MarketingPageShell>
  );
}
