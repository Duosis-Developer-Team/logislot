import { TicketsScreen } from "@/components/tickets";
import { supplierTickets } from "@/api/tickets";

export default function SupplierTicketsScreen() {
  return (
    <TicketsScreen
      api={supplierTickets}
      title="Destek"
      description="Portalda yaşadığınız sorunları buradan iletebilir, yanıtları takip edebilirsiniz."
    />
  );
}
