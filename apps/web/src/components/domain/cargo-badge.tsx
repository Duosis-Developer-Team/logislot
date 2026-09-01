"use client";

import { Package } from "lucide-react";
import { type CargoWindow } from "@logislot/shared";
import { Badge } from "@/components/ui/badge";
import { useLabels } from "@/lib/i18n/labels";
import { useT } from "@/lib/i18n/provider";
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
  const t = useT();
  const labels = useLabels();
  return (
    <Badge className={cn("bg-cargo/15 text-cargo", className)}>
      <Package className="h-3 w-3" />
      {t.common.cargo}
      {window ? ` · ${labels.cargoWindow[window]}` : ""}
    </Badge>
  );
}
