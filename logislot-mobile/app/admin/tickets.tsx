import { TicketsScreen } from "@/components/tickets";
import { adminTickets } from "@/api/tickets";

export default function AdminTicketsScreen() {
  return (
    <TicketsScreen
      api={adminTickets}
      title="Destek Talepleri"
      description="Uygulamada yaşadığınız sorunları ve iyileştirme taleplerini destek ekibimize iletin."
      showRequester
    />
  );
}
