"use client";

import { KeyRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Logo } from "@/components/domain/logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import {
  ApiError,
  authApi,
  getStoredPortal,
  getStoredToken,
  storeSession,
} from "@/lib/api/client";

const PORTAL_TARGETS = {
  supplier: "/supplier/appointments",
  admin: "/admin/dashboard",
  platform: "/platform/tenants",
} as const;

/**
 * Zorunlu/istege bagli parola degistirme (tum portallar icin ortak).
 * must_change_password kullanicilari login sonrasi buraya yonlendirilir;
 * API bu kullanicilara diger endpointleri 403 PASSWORD_CHANGE_REQUIRED
 * ile kapali tutar.
 */
export default function ChangePasswordPage() {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!getStoredToken()) {
      router.push("/login");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Yeni parolalar birbiriyle uyuşmuyor.");
      return;
    }
    setLoading(true);
    try {
      const portal = getStoredPortal() ?? "admin";
      // Basarida yeni token cifti doner; oturum kesintisiz devam eder.
      const tokens = await authApi.changePassword(currentPassword, newPassword);
      storeSession(tokens.access_token, portal, tokens.refresh_token);
      router.push(PORTAL_TARGETS[portal]);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Parola değiştirilemedi; tekrar deneyin.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-muted/40 p-4">
      <Logo />
      <Card className="w-full max-w-md">
        <CardContent className="pt-5">
          <div className="mb-4 flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10">
              <KeyRound className="h-4 w-4 text-primary" />
            </span>
            <div>
              <h1 className="text-base font-bold">Parola Değiştir</h1>
              <p className="text-xs text-muted-foreground">
                Geçici parolayla giriş yaptınız; devam etmek için yeni bir parola belirleyin.
              </p>
            </div>
          </div>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <Label htmlFor="current">Mevcut Parola</Label>
              <Input
                id="current"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </div>
            <div>
              <Label htmlFor="new">Yeni Parola</Label>
              <Input
                id="new"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
                required
              />
              <p className="mt-1 text-xs text-muted-foreground">
                En az 10 karakter; harf, rakam ve özel karakter içermeli.
              </p>
            </div>
            <div>
              <Label htmlFor="confirm">Yeni Parola (Tekrar)</Label>
              <Input
                id="confirm"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                required
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" size="lg" disabled={loading}>
              {loading ? "Kaydediliyor…" : "Parolayı Değiştir"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
