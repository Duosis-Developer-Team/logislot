import {
  ArrowRight,
  BellRing,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  History,
  ShieldCheck,
  Smartphone,
  Users,
} from "lucide-react";
import { Reveal } from "@/components/landing/reveal";

/**
 * Yönetim Paneli ve Tedarikçi Portalı vitrin bölümleri — metin + madde listesi
 * + saf HTML/CSS ürün mock'u ve ilgili portala CTA. Platform bölümü YOKTUR.
 */

const MANAGEMENT_ITEMS = [
  "Rampa takvimi ve bekleyen randevu onayları",
  "Revize / reddet / tamamla aksiyonları",
  "Kategori, araç kategorisi ve rampa konfigürasyonu",
  "Çakışma grubu yönetimi",
  "Kullanıcı ve rol yönetimi",
  "Raporlar ve denetim kayıtları",
];

export function ManagementPanelSection({ adminUrl }: { adminUrl: string }) {
  return (
    <section className="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:py-24">
      <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
        <Reveal>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
            Yönetim Paneli
          </p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
            Yönetim paneliyle tüm tesis operasyonu kontrol altında.
          </h2>
          <ul className="mt-6 space-y-2.5">
            {MANAGEMENT_ITEMS.map((item) => (
              <li key={item} className="flex items-start gap-2.5 text-sm">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-status-approved" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
          <a
            href={adminUrl}
            className="group mt-8 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-card transition-all duration-300 hover:-translate-y-0.5 hover:shadow-card-hover"
          >
            Yönetim Paneline Git
            <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
          </a>
        </Reveal>

        {/* Dashboard mock */}
        <Reveal delay={120}>
          <div className="rounded-2xl border border-border bg-card p-5 shadow-card-hover">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <span className="text-sm font-semibold">Genel Bakış</span>
              <span className="rounded-full bg-status-pending/15 px-2.5 py-1 text-[10px] font-semibold text-status-pending">
                3 onay bekliyor
              </span>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2.5">
              {[
                ["Bugünkü", "12"],
                ["Tamamlanan", "8"],
                ["Kargo uyarılı", "2"],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl border border-border bg-muted/40 p-3 dark:bg-muted/20">
                  <div className="text-lg font-bold">{value}</div>
                  <div className="text-[10px] text-muted-foreground">{label}</div>
                </div>
              ))}
            </div>
            <div className="mt-3 space-y-2">
              {[
                ["Anadolu Un A.Ş.", "Rampa 2 · 09:30", "Onaylandı", "text-status-approved bg-status-approved/15"],
                ["Hızlı Kargo Lojistik", "Rampa 3 · Sabah", "Bekliyor", "text-status-pending bg-status-pending/15"],
                ["Ege Ambalaj", "Rampa 1 · 14:00", "Revize", "text-status-revision bg-status-revision/15"],
              ].map(([name, slot, status, tone]) => (
                <div
                  key={name as string}
                  className="flex items-center justify-between rounded-xl border border-border px-3.5 py-2.5"
                >
                  <div>
                    <div className="text-xs font-semibold">{name}</div>
                    <div className="text-[10px] text-muted-foreground">{slot}</div>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${tone}`}>
                    {status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

const SUPPLIER_ITEMS = [
  { icon: ClipboardCheck, text: "Birkaç adımda randevu talebi oluşturma" },
  { icon: BellRing, text: "Randevu durumlarını anlık takip etme" },
  { icon: History, text: "Revize taleplerini görme, iptal ve geçmiş takibi" },
  { icon: Smartphone, text: "Mobil uyumlu, sahada da çalışan deneyim" },
];

export function SupplierPortalSection({ supplierUrl }: { supplierUrl: string }) {
  return (
    <section className="border-y border-border bg-muted/40 dark:bg-muted/20">
      <div className="mx-auto grid max-w-7xl items-center gap-10 px-5 py-16 sm:px-8 lg:grid-cols-2 lg:gap-16 lg:py-24">
        {/* Wizard mock — mobilde sona düşer */}
        <Reveal delay={120} className="order-2 lg:order-1">
          <div className="mx-auto max-w-sm rounded-2xl border border-border bg-card p-5 shadow-card-hover">
            <div className="flex gap-1.5">
              {["Ürün", "Araç", "Zaman"].map((step, i) => (
                <div key={step} className="flex-1">
                  <div
                    className={`h-1.5 rounded-full ${i < 2 ? "bg-primary" : "bg-border"}`}
                  />
                  <div
                    className={`mt-1 text-[10px] font-semibold ${
                      i < 2 ? "text-primary" : "text-muted-foreground"
                    }`}
                  >
                    {step}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 space-y-2.5">
              <div className="rounded-xl border border-border p-3">
                <div className="text-[10px] text-muted-foreground">Ürün</div>
                <div className="text-xs font-semibold">Çavdar Unu · 10 Palet</div>
              </div>
              <div className="rounded-xl border border-border p-3">
                <div className="text-[10px] text-muted-foreground">Araç</div>
                <div className="text-xs font-semibold">TIR · 34 UNL 300</div>
              </div>
              <div className="rounded-xl border border-primary/40 bg-primary/5 p-3 dark:bg-primary/10">
                <div className="text-[10px] text-primary">Önerilen saat</div>
                <div className="text-xs font-semibold">Perşembe · 09:30–10:30</div>
              </div>
              <div className="rounded-xl bg-primary py-2.5 text-center text-xs font-semibold text-primary-foreground">
                Randevu Talep Et
              </div>
            </div>
          </div>
        </Reveal>

        <Reveal className="order-1 lg:order-2">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
            Tedarikçi Portalı
          </p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
            Tedarikçiler için hızlı ve net randevu deneyimi.
          </h2>
          <ul className="mt-6 space-y-3">
            {SUPPLIER_ITEMS.map((item) => {
              const Icon = item.icon;
              return (
                <li key={item.text} className="flex items-start gap-3 text-sm">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="pt-1.5">{item.text}</span>
                </li>
              );
            })}
          </ul>
          <a
            href={supplierUrl}
            className="group mt-8 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-card transition-all duration-300 hover:-translate-y-0.5 hover:shadow-card-hover"
          >
            Tedarikçi Portalına Git
            <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
          </a>
        </Reveal>
      </div>
    </section>
  );
}

/** SaaS mimarisi — tenant→tesis ayrışması; sade anlatım, giriş linki YOK. */
export function SaaSArchitectureSection() {
  return (
    <section className="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:py-24">
      <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
        <Reveal>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
            SaaS mimarisi
          </p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
            Tek müşteri prototipinden ölçeklenebilir SaaS mimarisine.
          </h2>
          <p className="mt-4 max-w-xl leading-relaxed text-muted-foreground">
            Her müşteri ayrı tenant olarak yönetilir. Bir tenant birden fazla
            tesise sahip olabilir. Kategoriler, rampalar, kullanıcılar ve
            randevular tesis seviyesinde izole edilir; her lokasyon kendi
            operasyon kurallarıyla çalışır.
          </p>
        </Reveal>

        {/* Tenant→Facility diyagramı */}
        <Reveal delay={120}>
          <div className="rounded-2xl border border-border bg-card p-6 shadow-card">
            <div className="mx-auto w-fit rounded-xl border border-primary/40 bg-primary/10 px-5 py-2.5 text-center">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-primary">
                Tenant
              </div>
              <div className="text-sm font-bold">Müşteri A</div>
            </div>
            <div className="mx-auto h-6 w-px bg-border" />
            <div className="grid grid-cols-2 gap-3">
              {["Tesis — İstanbul", "Tesis — İzmir"].map((facility) => (
                <div key={facility} className="rounded-xl border border-border bg-muted/40 p-3.5 dark:bg-muted/20">
                  <div className="text-xs font-semibold">{facility}</div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {["Rampalar", "Kategoriler", "Kullanıcılar", "Randevular"].map(
                      (chip) => (
                        <span
                          key={chip}
                          className="rounded-full border border-border bg-card px-2 py-0.5 text-[9px] text-muted-foreground"
                        >
                          {chip}
                        </span>
                      ),
                    )}
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-4 text-center text-[11px] text-muted-foreground">
              Operasyonel veri tesis seviyesinde izole edilir.
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

const TRUST_ITEMS = [
  { icon: CalendarDays, text: "Gerçek müsaitlik" },
  { icon: CheckCircle2, text: "Rampa uyumluluğu" },
  { icon: History, text: "Onay geçmişi ve revizyon takibi" },
  { icon: Users, text: "Rol bazlı erişim" },
  { icon: ShieldCheck, text: "Denetim (audit) kayıtları" },
  { icon: BellRing, text: "Bildirim altyapısı" },
];

export function OperationsTrustSection() {
  return (
    <section className="border-y border-border bg-muted/40 dark:bg-muted/20">
      <div className="mx-auto max-w-7xl px-5 py-14 sm:px-8 lg:py-20">
        <Reveal>
          <h2 className="max-w-2xl text-2xl font-bold tracking-tight sm:text-3xl">
            Operasyon ekipleri için güvenilir karar desteği.
          </h2>
        </Reveal>
        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {TRUST_ITEMS.map((item, i) => {
            const Icon = item.icon;
            return (
              <Reveal key={item.text} delay={(i % 3) * 70}>
                <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3.5 shadow-card">
                  <Icon className="h-5 w-5 shrink-0 text-primary" />
                  <span className="text-sm font-medium">{item.text}</span>
                </div>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
