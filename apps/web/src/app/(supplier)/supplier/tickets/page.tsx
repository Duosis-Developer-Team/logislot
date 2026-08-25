"use client";

import { Suspense } from "react";
import { LoadingState } from "@/components/config/states";
import { TicketsPage } from "@/components/tickets/tickets-page";
import { supplierTickets } from "@/lib/api/tickets";

export default function SupplierTicketsPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <TicketsPage
        api={supplierTickets}
        title="Destek"
        description="Portalda yaşadığınız sorunları buradan iletebilir, yanıtları takip edebilirsiniz."
      />
    </Suspense>
  );
}
