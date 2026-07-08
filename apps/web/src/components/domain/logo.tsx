import { cn } from "@/lib/utils";

export function Logo({ className, light }: { className?: string; light?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-bold tracking-tight", className)}>
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-sm font-black text-primary-foreground">
        LS
      </span>
      <span className={light ? "text-white" : "text-foreground"}>
        Logi<span className="text-primary">Slot</span>
      </span>
    </span>
  );
}
