"use client";

import { Loader2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { LogiSlotLogo } from "@/components/brand/logo";
import { Card, CardContent } from "@/components/ui/card";
import { authApi, storeSession } from "@/lib/api/client";

/** Yalnizca uygulama ICI yollara gidilir — acik yonlendirme acigi olmasin. */
function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/";
  return raw;
}

const PORTAL_BY_PREFIX: Array<[string, "supplier" | "admin" | "platform"]> = [
  ["/supplier", "supplier"],
  ["/admin", "admin"],
  ["/platform", "platform"],
];

/**
 * Markali alan adina oturum devri.
 *
 * Kullanici genel alan adinda (orn. yonetim.logislot.io) giris yapti; oturum
 * `localStorage`'da ve ORIGIN'e bagli oldugu icin bu alan adi onu OKUYAMAZ.
 * Kaynak origin tek kullanimlik bir kod uretti, burada token ile takas edilir.
 *
 * Kod adres cubugunda kalmaz: takastan hemen sonra hedef sayfaya gecilir.
 */
function HandoffInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const code = params.get("code");
    const next = safeNext(params.get("next"));
    if (!code) {
      setFailed(true);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const tokens = await authApi.consumeHandoff(code);
        if (cancelled) return;
        const portal =
          PORTAL_BY_PREFIX.find(([prefix]) => next.startsWith(prefix))?.[1] ?? "admin";
        storeSession(tokens.access_token, portal, tokens.refresh_token);
        // replace: kod tarayici gecmisinde KALMAZ ve geri tusu buraya donmez.
        router.replace(next);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [params, router]);

  return (
    <Card className="w-full max-w-sm">
      <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
        <LogiSlotLogo className="h-8" />
        {failed ? (
          <>
            <p className="text-sm text-muted-foreground">
              Oturum devri tamamlanamadı. Bağlantının süresi dolmuş olabilir.
            </p>
            <a href="/login" className="text-sm font-medium text-primary underline">
              Giriş sayfasına dön
            </a>
          </>
        ) : (
          <>
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Oturumunuz açılıyor…</p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default function HandoffPage() {
  return (
    <Suspense fallback={null}>
      <HandoffInner />
    </Suspense>
  );
}
