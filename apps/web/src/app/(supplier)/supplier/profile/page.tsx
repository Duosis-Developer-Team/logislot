"use client";

/**
 * Tedarikçi profili — firma bilgisi + izinli kategoriler + çıkış.
 *
 * Bildirim tercihleri BURADA YOKTUR: tedarikçiye hangi bildirimin gideceğine
 * tesis yönetimi karar verir (yönetim panelindeki "Tedarikçi Bildirimleri").
 */

import { BadgeCheck, LogOut } from "lucide-react";
import { ErrorState, LoadingState } from "@/components/config/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useSupplierCatalog, useSupplierProfile } from "@/lib/api/supplier";
import { useSession } from "@/lib/auth/session";

export default function SupplierProfilePage() {
  const session = useSession();
  const profile = useSupplierProfile();
  const catalog = useSupplierCatalog();

  if (profile.isLoading) return <LoadingState />;
  if (profile.isError || !profile.data)
    return (
      <ErrorState message="Profil yüklenemedi." onRetry={() => profile.refetch()} />
    );

  const data = profile.data;
  const allowedNames =
    catalog.data?.product_categories.map((c) => c.display_name) ?? [];

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>{data.company_name}</CardTitle>
          <p className="text-xs text-muted-foreground">{data.facility.name}</p>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Tedarikçi Kodu</dt>
            <dd className="font-mono">{data.code}</dd>
            {data.category_label && (
              <>
                <dt className="text-muted-foreground">Kategori</dt>
                <dd>{data.category_label}</dd>
              </>
            )}
            <dt className="text-muted-foreground">İletişim</dt>
            <dd>{data.contact_name ?? "—"}</dd>
            <dt className="text-muted-foreground">E-posta</dt>
            <dd className="break-all">{data.contact_email ?? "—"}</dd>
            <dt className="text-muted-foreground">Süre Limiti</dt>
            <dd>
              {data.min_block_minutes ?? "—"}–{data.max_block_minutes ?? "—"} dk
            </dd>
            <dt className="text-muted-foreground">Kota</dt>
            <dd>
              {data.weekly_quota ?? "∞"}/hafta · {data.monthly_quota ?? "∞"}/ay
            </dd>
          </dl>
          {data.auto_approval_enabled && (
            <Badge className="w-fit bg-status-approved/15 text-status-approved">
              <BadgeCheck className="h-3.5 w-3.5" /> Otomatik onay yetkisi aktif
            </Badge>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>İzinli Kategoriler</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {allowedNames.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Henüz izinli kategori tanımlanmamış; randevu için tesisinizle iletişime geçin.
            </p>
          ) : (
            allowedNames.map((name) => (
              <Badge key={name} className="bg-primary/10 text-primary">
                {name}
              </Badge>
            ))
          )}
        </CardContent>
      </Card>

      <Button
        variant="secondary"
        className="w-full sm:w-fit"
        onClick={session.logout}
      >
        <LogOut className="h-4 w-4" /> Oturumu Kapat
      </Button>
    </div>
  );
}
