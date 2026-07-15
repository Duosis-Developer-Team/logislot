import { AlertTriangle } from "lucide-react";
import { MarketingPageShell } from "@/components/landing/marketing-page-shell";
import { getLandingConfig, getPortalUrls } from "@/lib/portal-mode";

/**
 * KVKK Aydınlatma Metinleri + Açık Rıza kalemleri.
 *
 * İçerik, "LogiSlot KVKK Uyum Rehberi & Örnek Metinler" dokümanındaki
 * şablonlara dayanır. Köşeli parantezli boşluklar yerine akıcı metin
 * kullanılır; ticari unvan/sicil gibi şirketleşmeyle netleşecek bilgiler
 * uydurulmaz, "yayımlandığında bu sayfada güncellenir" cümlesiyle taahhüt
 * edilir. Aydınlatma ile açık rıza AYRI sunulur; avukat incelemesi
 * tamamlanana kadar taslak bandı korunur.
 */
export const dynamic = "force-dynamic";

export const metadata = {
  title: "KVKK Aydınlatma Metni — LogiSlot",
  description:
    "LogiSlot kişisel verilerin korunması (KVKK) aydınlatma metinleri ve açık rıza bilgilendirmesi.",
};

function LegalSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-6 shadow-card sm:p-8">
      <h2 className="text-xl font-bold tracking-tight">{title}</h2>
      <div className="mt-4 space-y-3 text-sm leading-relaxed text-muted-foreground [&_strong]:text-foreground">
        {children}
      </div>
    </section>
  );
}

export default function KvkkPage() {
  const urls = getPortalUrls();
  const landing = getLandingConfig();
  const contact = landing.contactEmail;

  return (
    <MarketingPageShell
      supplierUrl={urls.supplier}
      adminUrl={urls.admin}
      duosisUrl={landing.duosisUrl}
      title="KVKK Aydınlatma Metni"
      description="6698 sayılı Kişisel Verilerin Korunması Kanunu (7499 sayılı Kanun ile değişik) kapsamında bilgilendirme."
    >
      <div className="space-y-6">
        {/* Taslak uyarısı — avukat onayına kadar */}
        <div className="flex items-start gap-3 rounded-2xl border border-status-pending/40 bg-status-pending/10 p-4 text-sm leading-relaxed">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-status-pending" />
          <p className="text-muted-foreground">
            <strong className="text-foreground">Taslak metin.</strong> Bu sayfa,
            KVKK uyum çalışması kapsamında hazırlanan metinleri içerir; uzman
            avukat incelemesi ve VERBİS beyanıyla uyum kontrolü tamamlandığında
            nihai hâliyle güncellenecektir.
          </p>
        </div>

        <LegalSection title="Veri Sorumlusu ve Başvuru">
          <p>
            LogiSlot, <strong>Duosis</strong> tarafından işletilmektedir ve bu
            metinler kapsamındaki veri sorumlusu Duosis&apos;tir. Ticari unvan,
            adres ve sicil (MERSİS/VKN) bilgileri, süren şirketleşme çalışması
            tamamlandığında bu sayfada yayımlanacaktır.
          </p>
          <p>
            KVKK kapsamındaki tüm bilgi ve başvuru talepleriniz için:{" "}
            <a
              href={`mailto:${contact}`}
              className="font-medium text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground"
            >
              {contact}
            </a>
            . Başvurular mevzuattaki süreler içinde yanıtlanır.
          </p>
        </LegalSection>

        <LegalSection title="Aydınlatma Metni — Tesis / Yönetim Kullanıcısı">
          <p>
            <strong>İşlenen veriler:</strong> ad-soyad, kurumsal e-posta, telefon,
            unvan/rol, çalıştığı tesis, sistem kullanım kayıtları.
          </p>
          <p>
            <strong>İşleme amaçları:</strong> hesap oluşturma ve kimlik doğrulama,
            randevu ve rampa operasyonunun yürütülmesi, yetki/rol yönetimi,
            güvenlik ve denetim kayıtlarının tutulması, sözleşmesel ve yasal
            yükümlülüklerin yerine getirilmesi.
          </p>
          <p>
            <strong>Aktarım:</strong> veriler; hizmetin sunulması için altyapı ve
            barındırma sağlayıcılarına ve yasal olarak yetkili kurum ve
            kuruluşlara aktarılabilir. Kişisel verilerin yurt dışına aktarılması
            hâlinde KVKK m.9 kapsamındaki uygun güvenceler (ör. standart
            sözleşme) sağlanır ve gerekli bildirimler yapılır.
          </p>
          <p>
            <strong>Toplama yöntemi ve hukuki sebep:</strong> veriler elektronik
            ortamda, uygulama ve web üzerinden; KVKK m.5 kapsamında sözleşmenin
            ifası, hukuki yükümlülük ve meşru menfaat sebeplerine dayanılarak
            toplanır.
          </p>
          <p>
            <strong>Haklarınız (KVKK m.11):</strong> kişisel verilerinizin işlenip
            işlenmediğini öğrenme, bilgi talep etme, amaca uygun kullanılıp
            kullanılmadığını öğrenme, düzeltme, silme, aktarıldığı üçüncü kişileri
            öğrenme ve zararın giderilmesini talep etme. Başvurular yukarıdaki
            iletişim kanalından alınır.
          </p>
        </LegalSection>

        <LegalSection title="Aydınlatma Metni — Tedarikçi / Sürücü (Mobil Uygulama)">
          <p>
            <strong>İşlenen veriler:</strong> ad-soyad, telefon/e-posta, firma
            bilgisi, araç ve plaka, sürücü bilgisi, teslimat/randevu geçmişi,
            uygulama kullanım kayıtları; açık rıza vermeniz halinde konum verisi
            ve güvenilirlik skoruna esas davranış verisi.
          </p>
          <p>
            <strong>İşleme amaçları:</strong> randevu oluşturma ve takibi,
            tesislere teslimat akışının yürütülmesi; açık rızaya dayalı olarak
            konumdan varış tahmini, güvenilirlik skorunun hesaplanması ve size
            özel bilgilendirme/kampanyalar.
          </p>
          <p>
            <strong>Aktarım:</strong> randevu aldığınız tesis işletmecisine (ör.
            teslimat durumu ve zamanlaması), altyapı/barındırma sağlayıcılarına ve
            yasal yetkili mercilere aktarılabilir. Kiminle çalıştığınıza dair
            ticari sır niteliğindeki bilgiler, yalnızca
            anonimleştirilmiş/toplulaştırılmış biçimde analiz amacıyla kullanılır.
          </p>
          <p>
            <strong>Toplama yöntemi ve hukuki sebep:</strong> mobil uygulama
            üzerinden elektronik ortamda; sözleşmenin ifası ve meşru menfaat,
            konum-profilleme-pazarlama bakımından ise açık rıza (m.5/1) sebebine
            dayanılarak.
          </p>
          <p>
            <strong>Haklarınız (KVKK m.11):</strong> yukarıdaki bölümde sayılan
            haklar aynen geçerlidir; başvurular yukarıdaki iletişim kanalından
            alınır.
          </p>
        </LegalSection>

        <LegalSection title="Açık Rıza Bilgilendirmesi (Ayrı Onay)">
          <p>
            Aydınlatma yükümlülüğü ile açık rıza <strong>ayrı ayrı</strong> yerine
            getirilir. Aşağıdaki her kalem, uygulama içinde{" "}
            <strong>önceden işaretlenmemiş ayrı onay kutularıyla</strong> ve hizmet
            şartı koşulmadan sunulur; her biri dilediğiniz an, hizmeti
            kaybetmeden geri alınabilir:
          </p>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong>Konum verisi:</strong> &quot;Randevularımın varış tahmininin
              hesaplanması amacıyla, uygulama açıkken konum verimin işlenmesine
              açık rıza veriyorum.&quot;
            </li>
            <li>
              <strong>Profilleme / skor:</strong> &quot;Teslimat davranışıma dayalı
              bir güvenilirlik skoru oluşturulmasına ve bu skorun randevu aldığım
              tesislerle paylaşılmasına açık rıza veriyorum.&quot;
            </li>
            <li>
              <strong>Pazarlama iletişimi:</strong> &quot;Tarafıma kampanya,
              promosyon ve bilgilendirme amacıyla ticari elektronik ileti
              gönderilmesine açık rıza veriyorum.&quot;
            </li>
          </ul>
          <p>
            Ticari elektronik ileti için ayrıca İleti Yönetim Sistemi (İYS)
            yükümlülükleri geçerlidir.
          </p>
        </LegalSection>

        <LegalSection title="Hangi Veri, Hangi Hukuki Dayanakla İşlenir?">
          <p>
            Açık rıza, KVKK&apos;daki dayanaklardan yalnızca biridir; hizmetin özünü
            oluşturan işlemler açık rızaya bağlanmaz. Böylece verdiğiniz bir
            rızayı geri aldığınızda hizmet çalışmaya devam eder.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] border-collapse text-left text-xs sm:text-sm">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="py-2 pr-4 font-semibold">Veri türü</th>
                  <th className="py-2 pr-4 font-semibold">Örnek</th>
                  <th className="py-2 font-semibold">Hukuki dayanak</th>
                </tr>
              </thead>
              <tbody className="[&_td]:py-2.5 [&_td]:pr-4 [&_tr]:border-b [&_tr]:border-border/60">
                <tr>
                  <td className="font-medium text-foreground">Randevu &amp; operasyon</td>
                  <td>Ürün, araç, plaka, teslimat zamanı</td>
                  <td>Sözleşmenin ifası</td>
                </tr>
                <tr>
                  <td className="font-medium text-foreground">Hesap &amp; kimlik</td>
                  <td>Ad, e-posta, firma, rol</td>
                  <td>Sözleşme / meşru menfaat</td>
                </tr>
                <tr>
                  <td className="font-medium text-foreground">Yasal saklama</td>
                  <td>Fatura, işlem kaydı</td>
                  <td>Hukuki yükümlülük</td>
                </tr>
                <tr>
                  <td className="font-medium text-foreground">Konum / GPS</td>
                  <td>Sürücü canlı konumu, varış tahmini</td>
                  <td>Açık rıza (geri alınabilir)</td>
                </tr>
                <tr>
                  <td className="font-medium text-foreground">Profilleme / skor</td>
                  <td>Güvenilirlik skoru</td>
                  <td>Açık rıza</td>
                </tr>
                <tr>
                  <td className="font-medium text-foreground">Pazarlama</td>
                  <td>Kampanya iletişimi</td>
                  <td>Açık rıza (+ İYS)</td>
                </tr>
                <tr>
                  <td className="font-medium text-foreground">Ürün içi analitik</td>
                  <td>Kullanım metrikleri</td>
                  <td>Meşru menfaat (mümkünse anonim)</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p>
            Kişiye bağlanamayan, geri döndürülemez biçimde anonimleştirilmiş veri
            KVKK kapsamı dışındadır; takma adlı (pseudonim) veri ise kişisel veri
            olmaya devam eder.
          </p>
        </LegalSection>
      </div>
    </MarketingPageShell>
  );
}
