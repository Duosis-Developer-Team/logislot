"use client";

/**
 * Tedarikci iptal kurallari (yonetim ekrani).
 *
 * Musteri talebi (2026-10): tedarikci portaldan randevu iptal ederken sebep
 * ve alternatif gonderim tarihi girsin, randevuya belirli bir sureden az
 * kalinca iptal edemesin. Kural tesis genelinde tektir ve yalnizca tedarikci
 * iptallerine uygulanir.
 */

import { CalendarX } from "lucide-react";
import { SupplierCancellationPolicyForm } from "@/components/domain/supplier-cancellation-policy-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useSession } from "@/lib/auth/session";
import { useT } from "@/lib/i18n/provider";

export default function SupplierCancellationPage() {
  const t = useT();
  const { activeFacilityId, can } = useSession();

  if (!can("supplier.manage"))
    return (
      <p className="text-sm text-muted-foreground">
        {t.admin.supplierCancellation.needsPermission}
      </p>
    );

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-bold">{t.admin.supplierCancellation.title}</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          {t.admin.supplierCancellation.description}
        </p>
      </div>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarX className="h-4 w-4 text-primary" />{" "}
            {t.admin.supplierCancellation.policyTitle}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <SupplierCancellationPolicyForm facilityId={activeFacilityId} />
        </CardContent>
      </Card>
    </div>
  );
}
