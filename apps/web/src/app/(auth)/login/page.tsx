"use client";

import { Building2, Globe2, Truck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Logo } from "@/components/domain/logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-4">
      <div className="flex flex-col items-center gap-2">
        <Logo className="text-2xl" />
        <p className="text-sm text-muted-foreground">
          Akıllı Mal Kabul &amp; Rampa Randevu Platformu
        </p>
      </div>

      <div className="grid w-full max-w-3xl gap-3 sm:grid-cols-3">
        {PORTALS.map((p) => {
          const Icon = p.icon;
          const selected = portal === p.key;
          return (
            <button
              key={p.key}
              onClick={() => {
                setPortal(p.key);
                setEmail(p.demo);
              }}
              className={cn(
                "rounded-xl border p-4 text-left transition-all",
                selected
                  ? "border-primary bg-primary/5 ring-2 ring-primary/30"
                  : "border-border bg-card hover:border-primary/40",
              )}
            >
              <Icon className={cn("mb-2 h-6 w-6", selected ? "text-primary" : "text-muted-foreground")} />
              <div className="text-sm font-semibold">{p.title}</div>
              <div className="mt-0.5 text-xs text-muted-foreground">{p.description}</div>
            </button>
          );
        })}
      </div>

      <Card className="w-full max-w-md">
        <CardContent className="pt-5">
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
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
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" size="lg" disabled={loading}>
              {loading ? "Giriş yapılıyor…" : `${active.title}'na Giriş`}
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              Demo hesap: {active.demo} / Demo123!
            </p>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
