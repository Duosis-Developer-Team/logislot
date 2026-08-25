"use client";

import { Suspense } from "react";
import { LoadingState } from "@/components/config/states";
import { TicketsPage } from "@/components/tickets/tickets-page";
import { adminTickets } from "@/lib/api/tickets";

export default function AdminTicketsPage() {
  // useSearchParams (bildirim derin baglantisi) Suspense sinirini zorunlu kilar.
  return (
    <Suspense fallback={<LoadingState />}>
      <TicketsPage
        api={adminTickets}
        title="Destek Talepleri"
        description="Uygulamada yaşadığınız sorunları ve iyileştirme taleplerini destek ekibimize iletin."
        showRequester
      />
    </Suspense>
  );
}
