"use client";

import { Suspense } from "react";
import { LoadingState } from "@/components/config/states";
import { TicketsPage } from "@/components/tickets/tickets-page";
import { adminTickets } from "@/lib/api/tickets";
import { useT } from "@/lib/i18n/provider";

export default function AdminTicketsPage() {
  const t = useT();
  // useSearchParams (bildirim derin baglantisi) Suspense sinirini zorunlu kilar.
  return (
    <Suspense fallback={<LoadingState />}>
      <TicketsPage
        api={adminTickets}
        title="Destek Talepleri"
        description={t.admin.tickets.description}
        showRequester
      />
    </Suspense>
  );
}
