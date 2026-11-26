"use client";

import { RotateCcw } from "lucide-react";
import { useT } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";

/** Telafi randevusu isareti (musteri karari 2026-11: telafiler bayrakla isaretlenir). */
export function MakeupBadge({ className }: { className?: string }) {
  const t = useT();
  return (
    <span
      className={cn(
        "inline-flex w-fit shrink-0 items-center gap-1 rounded-full border border-status-revision/40 bg-status-revision/10 px-2 py-0.5 text-[11px] font-semibold text-status-revision",
        className,
      )}
      title={t.makeup.badgeHint}
    >
      <RotateCcw className="h-3 w-3" />
      {t.makeup.badge}
    </span>
  );
}
