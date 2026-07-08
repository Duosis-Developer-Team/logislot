import { type LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Tone = "primary" | "accent" | "cargo" | "approved" | "pending" | "completed";

const TONES: Record<Tone, string> = {
  primary: "bg-primary/10 text-primary",
  accent: "bg-accent/15 text-accent",
  cargo: "bg-cargo/15 text-cargo",
  approved: "bg-status-approved/15 text-status-approved",
  pending: "bg-status-pending/15 text-status-pending",
  completed: "bg-status-completed/15 text-status-completed",
};

/**
 * Ortak metrik karti — dashboard KPI ve sayaclarin premium ortak gorunumu.
 */
export function MetricCard({
  icon: Icon,
  label,
  value,
  tone = "primary",
  className,
}: {
  icon: LucideIcon;
  label: React.ReactNode;
  value: React.ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <Card className={cn("p-4 sm:p-5", className)}>
      <div className="flex items-start justify-between gap-2.5">
        <div className="min-w-0">
          <div className="text-2xl font-bold leading-none tracking-tight text-foreground sm:text-[1.75rem]">
            {value}
          </div>
          <div className="mt-2 text-xs font-medium leading-snug text-muted-foreground sm:text-[0.8rem]">
            {label}
          </div>
        </div>
        <span
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl sm:h-10 sm:w-10",
            TONES[tone],
          )}
        >
          <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
        </span>
      </div>
    </Card>
  );
}
