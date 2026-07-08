import { cn } from "@/lib/utils";

export function Logo({ className, light }: { className?: string; light?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-bold tracking-tight", className)}>
      <span
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-lg text-sm font-black shadow-sm",
          light ? "bg-white text-primary ring-1 ring-white/20" : "bg-primary text-primary-foreground",
        )}
      >
        LS
      </span>
      <span className={light ? "text-white" : "text-foreground"}>
        Logi<span className={light ? "text-accent" : "text-primary"}>Slot</span>
      </span>
    </span>
  );
}
