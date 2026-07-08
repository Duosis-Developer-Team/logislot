import {
  APPOINTMENT_STATUS_LABELS,
  type AppointmentStatus,
} from "@logislot/shared";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * Randevu statu rozeti — takvim ve listelerin ANA sinyali.
 * Kargo gostergesi ayri bir bilesendir (CargoBadge); statu rengini degistirmez.
 */
const STATUS_CLASSES: Record<AppointmentStatus, string> = {
  pending: "bg-status-pending/15 text-status-pending",
  approved: "bg-status-approved/15 text-status-approved",
  revision_pending: "bg-status-revision/15 text-status-revision",
  rejected: "bg-status-rejected/15 text-status-rejected",
  completed: "bg-status-completed/15 text-status-completed",
  cancelled: "bg-status-cancelled/15 text-status-cancelled",
};

export function StatusBadge({
  status,
  className,
}: {
  status: AppointmentStatus;
  className?: string;
}) {
  return (
    <Badge className={cn(STATUS_CLASSES[status], className)}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {APPOINTMENT_STATUS_LABELS[status]}
    </Badge>
  );
}
