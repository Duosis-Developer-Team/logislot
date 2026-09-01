"use client";

import { Suspense } from "react";
import { LoadingState } from "@/components/config/states";
import { TicketsPage } from "@/components/tickets/tickets-page";
import { supplierTickets } from "@/lib/api/tickets";
import { useT } from "@/lib/i18n/provider";

export default function SupplierTicketsPage() {
  const t = useT();
  return (
    <Suspense fallback={<LoadingState />}>
      <TicketsPage
        api={supplierTickets}
        title="Destek"
        description={t.supplier.tickets.description}
      />
    </Suspense>
  );
}
