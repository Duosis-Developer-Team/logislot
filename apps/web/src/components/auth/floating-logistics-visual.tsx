import { CheckCheck, Package, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Dekoratif "operasyon akışı" görseli — login hero'da görsel storytelling.
 * Gerçek veri değildir (aria-hidden); rampa randevu akışını soyutlar.
 */

const SLOTS = [
  { time: "08:30", dock: "Rampa 2", status: "Onaylandı", tone: "bg-emerald-400" },
  { time: "09:15", dock: "Rampa 1", status: "Bekliyor", tone: "bg-amber-400" },
  { time: "10:00", dock: "Rampa 3", status: "Kargo", tone: "bg-orange-400" },
];

export function FloatingLogisticsVisual({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn("relative select-none", className)}>
      {/* Ana cam kart */}
      <div className="animate-float rounded-2xl border border-white/15 bg-white/[0.07] p-4 shadow-2xl backdrop-blur-md">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-xs font-semibold text-white">Bugünkü rampa akışı</span>
          <span className="flex items-center gap-1.5 text-[10px] font-medium text-white/60">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
            </span>
            canlı
          </span>
        </div>

        <div className="flex flex-col gap-2">
          {SLOTS.map((s) => (
            <div
              key={s.time}
              className="flex items-center gap-3 rounded-lg bg-white/[0.06] px-2.5 py-2 ring-1 ring-inset ring-white/10"
            >
              <span className="w-10 font-mono text-xs font-semibold text-white">
                {s.time}
              </span>
              <span className="flex-1 text-xs text-white/75">{s.dock}</span>
              <span className="flex items-center gap-1.5 text-[11px] font-medium text-white/85">
                <span className={cn("h-1.5 w-1.5 rounded-full", s.tone)} />
                {s.status}
              </span>
            </div>
          ))}
        </div>

        <div className="mt-3.5">
          <div className="mb-1.5 flex items-center justify-between text-[11px] text-white/60">
            <span>Rampa doluluğu</span>
            <span className="font-semibold text-white/85">%72</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
            <div className="h-full w-[72%] rounded-full bg-gradient-to-r from-accent to-emerald-400" />
          </div>
        </div>
      </div>

      {/* Yüzen aksan çipleri */}
      <div
        className="animate-float-sm absolute -right-3 -top-7 flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-lg backdrop-blur-md"
        style={{ animationDelay: "0.8s" }}
      >
        <TrendingUp className="h-3.5 w-3.5 text-emerald-300" />
        +3 yeni talep
      </div>
      <div
        className="animate-float-sm absolute -bottom-4 -left-5 flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-lg backdrop-blur-md"
        style={{ animationDelay: "1.6s" }}
      >
        <CheckCheck className="h-3.5 w-3.5 text-accent" />
        Otomatik onaylandı
      </div>
      <div
        className="animate-float-sm absolute -right-6 bottom-8 flex h-9 w-9 items-center justify-center rounded-xl border border-white/15 bg-white/10 text-accent shadow-lg backdrop-blur-md"
        style={{ animationDelay: "2.2s" }}
      >
        <Package className="h-4 w-4" />
      </div>
    </div>
  );
}
