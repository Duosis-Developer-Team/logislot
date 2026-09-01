"use client";

/**
 * Tedarikci bildirim politikasi (yonetim ekrani).
 *
 * Urun karari (2026-08): tedarikciye hangi bildirimin gidecegine YONETIM karar
 * verir; tedarikcinin kendi panelinde bu tercihler YOKTUR. Politika tesis
 * genelinde tektir (1 tenant = 1 tesis) ve tum tedarikcilere uygulanir.
 */

import { BellRing } from "lucide-react";
import { SupplierNotificationPolicyForm } from "@/components/domain/notification-preferences";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useSession } from "@/lib/auth/session";
import { useT } from "@/lib/i18n/provider";

export default function SupplierNotificationsPage() {
  const t = useT();
  const { activeFacilityId, can } = useSession();

  if (!can("supplier.manage"))
    return (
      <p className="text-sm text-muted-foreground">
        {t.admin.supplierNotifications.needsPermission}
      </p>
    );

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-bold">{t.admin.supplierNotifications.title}</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          {t.admin.supplierNotifications.description}
        </p>
      </div>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BellRing className="h-4 w-4 text-primary" />{" "}
            {t.admin.supplierNotifications.policyTitle}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <SupplierNotificationPolicyForm facilityId={activeFacilityId} />
        </CardContent>
      </Card>
    </div>
  );
}
