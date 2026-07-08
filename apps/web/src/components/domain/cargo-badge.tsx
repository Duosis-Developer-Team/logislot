import { Package } from "lucide-react";
import { CARGO_WINDOW_LABELS, type CargoWindow } from "@logislot/shared";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * Kargo uyari rozeti — statuden BAGIMSIZ ikinci gorsel sinyal.
 * Takvimde overlay/rozet olarak statu renginin YANINDA gosterilir;
 * asla statu renginin yerine gecmez (v2.0 kurali).
 */
export function CargoBadge({
  window,
  className,
}: {
  window?: CargoWindow | null;
  className?: string;
}) {
  return (
    <Badge className={cn("bg-cargo/15 text-cargo", className)}>
      <Package className="h-3 w-3" />
      Kargo{window ? ` · ${CARGO_WINDOW_LABELS[window]}` : ""}
    </Badge>
  );
}
