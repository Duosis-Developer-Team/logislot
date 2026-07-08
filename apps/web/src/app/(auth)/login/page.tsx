"use client";

import {
  Building2,
  CalendarCheck2,
  Globe2,
  Radar,
  ShieldCheck,
  Truck,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { LogiSlotLogo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { authApi, storeSession } from "@/lib/api/client";
import { cn } from "@/lib/utils";

type Portal = "supplier" | "admin" | "platform";

const PORTALS: {
  key: Portal;
  title: string;
  description: string;
  icon: typeof Truck;
  demo: string;
  target: string;
}[] = [
  {
    key: "supplier",
    title: "Tedarikçi Portalı",
    description: "Randevu talep edin, takip edin",
    icon: Truck,
    demo: "tedarikci@anadoluun.com",
    target: "/supplier/appointments",
  },
  {
    key: "admin",
    title: "Yönetim Paneli",
    description: "Takvim, onay ve tesis yönetimi",
    icon: Building2,
    demo: "admin@cakesbakes.com",
    target: "/admin/dashboard",
  },
  {
    key: "platform",
    title: "Platform Yönetimi",
    description: "Tenant, kullanım ve plan yönetimi",
    icon: Globe2,
    demo: "admin@logislot.com",
    target: "/platform/tenants",
  },
];

const HIGHLIGHTS = [
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

export default function LoginPage() {
  const router = useRouter();
  const [portal, setPortal] = useState<Portal>("supplier");
  const [email, setEmail] = useState(PORTALS[0].demo);
  const [password, setPassword] = useState("Demo123!");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const active = PORTALS.find((p) => p.key === portal)!;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const tokens = await authApi.login(portal, email, password);
      storeSession(tokens.access_token, portal, tokens.refresh_token);
      // Gecici parola akisi: once parola degistirilmeli (API zaten 403'ler)
      router.push(tokens.must_change_password ? "/change-password" : active.target);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Giriş başarısız — API'nin çalıştığından emin olun.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <div className="absolute right-3 top-3 z-20">
        <ThemeToggle />
      </div>
      {/* Marka hero paneli — masaustu (her iki temada sabit navy) */}
      <section className="relative hidden overflow-hidden bg-brand-navy text-white lg:flex lg:flex-col lg:justify-between lg:p-12">
        {/* Dekoratif isik katmanlari */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -left-24 -top-24 h-96 w-96 rounded-full bg-white/10 blur-3xl" />
          <div className="absolute bottom-0 right-0 h-[28rem] w-[28rem] translate-x-1/4 translate-y-1/4 rounded-full bg-accent/20 blur-3xl" />
          <div
            className="absolute inset-0 opacity-[0.07]"
            style={{
              backgroundImage:
                "radial-gradient(circle at 1px 1px, white 1px, transparent 0)",
              backgroundSize: "28px 28px",
            }}
          />
        </div>

        <div className="relative">
          <LogiSlotLogo variant="dark" size="xl" priority />
        </div>

        <div className="relative max-w-md">
          <h1 className="text-3xl font-bold leading-tight tracking-tight xl:text-4xl">
            Akıllı mal kabul ve rampa randevu platformu
          </h1>
          <p className="mt-3 text-sm text-white/70">
            Tedarikçiden tesise, tüm randevu operasyonunu tek bir modern panelde
            yönetin.
          </p>

          <ul className="mt-9 flex flex-col gap-5">
            {HIGHLIGHTS.map((h) => {
              const Icon = h.icon;
              return (
                <li key={h.title} className="flex items-start gap-3.5">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 ring-1 ring-inset ring-white/15 backdrop-blur">
                    <Icon className="h-5 w-5" />
                  </span>
                  <div>
                    <div className="text-sm font-semibold">{h.title}</div>
                    <div className="text-sm text-white/60">{h.body}</div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="relative text-xs text-white/50">
          © {new Date().getFullYear()} LogiSlot · Kurumsal lojistik operasyon platformu
        </div>
      </section>

      {/* Giris paneli */}
      <section className="flex items-center justify-center p-5 sm:p-8">
        <div className="w-full max-w-md animate-fade-up">
          <div className="mb-8 flex flex-col items-center gap-2 text-center lg:hidden">
            <LogiSlotLogo size="lg" priority />
            <p className="text-sm text-muted-foreground">
              Akıllı Mal Kabul &amp; Rampa Randevu Platformu
            </p>
          </div>

          <div className="mb-6">
            <h2 className="text-2xl font-bold tracking-tight">Giriş yap</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Portalınızı seçin ve hesabınızla devam edin.
            </p>
          </div>

          <div className="mb-5 grid gap-2.5 sm:grid-cols-3">
            {PORTALS.map((p) => {
              const Icon = p.icon;
              const selected = portal === p.key;
              return (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => {
                    setPortal(p.key);
                    setEmail(p.demo);
                  }}
                  className={cn(
                    "flex flex-col items-start gap-2 rounded-2xl border p-3 text-left transition-all duration-150",
                    selected
                      ? "border-primary bg-primary/5 shadow-soft ring-1 ring-primary/30"
                      : "border-border bg-card hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-soft",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-9 w-9 items-center justify-center rounded-xl transition-colors",
                      selected
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <span
                    className={cn(
                      "text-xs font-semibold leading-tight",
                      selected ? "text-primary" : "text-foreground",
                    )}
                  >
                    {p.title}
                  </span>
                </button>
              );
            })}
          </div>

          <form
            onSubmit={handleSubmit}
            className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-card sm:p-6"
          >
            <div>
              <Label htmlFor="email">E-posta</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
            </div>
            <div>
              <Label htmlFor="password">Parola</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </div>
            {error && (
              <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            )}
            <Button type="submit" size="lg" disabled={loading} className="w-full">
              {loading ? "Giriş yapılıyor…" : `${active.title}'na Giriş`}
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              Demo hesap:{" "}
              <span className="font-medium text-foreground">{active.demo}</span> / Demo123!
            </p>
          </form>
        </div>
      </section>
    </main>
  );
}
