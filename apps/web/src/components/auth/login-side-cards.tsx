import { Clock3, PackageCheck, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Login'in sol ve sağındaki iki büyük animasyonlu "operasyon" kartı — dekoratif
 * görsel storytelling (aria-hidden). Tema-uyumlu (tokenlar); yalnızca xl+ ekran.
 */

const SLOTS = [
  { time: "08:30", dock: "Rampa 2", status: "Onaylandı", tone: "text-status-approved", dot: "bg-status-approved" },
  { time: "09:15", dock: "Rampa 1", status: "Bekliyor", tone: "text-status-pending", dot: "bg-status-pending" },
  { time: "10:00", dock: "Rampa 3", status: "Kargo", tone: "text-cargo", dot: "bg-cargo" },
];

const WEEK = [48, 62, 55, 72, 66, 40, 28];

function CardShell({
  className,
  delay,
  children,
}: {
  className?: string;
  delay: string;
  children: React.ReactNode;
}) {
  return (
    <div
      aria-hidden
      className={cn(
        "animate-float absolute top-1/2 z-0 hidden w-72 -translate-y-1/2 xl:block 2xl:w-80",
        className,
      )}
      style={{ animationDelay: delay }}
    >
      <div className="rounded-2xl border border-border bg-card/80 p-4 shadow-pop backdrop-blur-xl">
        {children}
      </div>
    </div>
  );
}

export function LoginSideCards() {
  return (
    <>
      {/* SOL — bugünkü rampa akışı */}
      <CardShell className="left-[3%] 2xl:left-[6%]" delay="0.4s">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm font-semibold text-foreground">Bugünkü rampa akışı</span>
          <span className="flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-status-approved opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-status-approved" />
            </span>
            canlı
          </span>
        </div>
        <div className="flex flex-col gap-2">
          {SLOTS.map((s) => (
            <div
              key={s.time}
              className="flex items-center gap-3 rounded-lg bg-muted/60 px-2.5 py-2"
            >
              <Clock3 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="w-10 font-mono text-xs font-semibold text-foreground">
                {s.time}
              </span>
              <span className="flex-1 text-xs text-muted-foreground">{s.dock}</span>
              <span className={cn("flex items-center gap-1.5 text-[11px] font-medium", s.tone)}>
                <span className={cn("h-1.5 w-1.5 rounded-full", s.dot)} />
                {s.status}
              </span>
            </div>
          ))}
        </div>
        <div className="mt-3.5">
          <div className="mb-1.5 flex items-center justify-between text-[11px] text-muted-foreground">
            <span>Rampa doluluğu</span>
            <span className="font-semibold text-foreground">%72</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full w-[72%] rounded-full bg-gradient-to-r from-accent to-primary" />
          </div>
        </div>
      </CardShell>

      {/* SAĞ — haftalık doluluk + özet */}
      <CardShell className="right-[3%] 2xl:right-[6%]" delay="1.6s">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm font-semibold text-foreground">Haftalık doluluk</span>
          <TrendingUp className="h-4 w-4 text-accent" />
        </div>
        <div className="flex h-24 items-end gap-2">
          {WEEK.map((v, i) => (
            <div
              key={i}
              className="flex h-full flex-1 flex-col items-center justify-end gap-1.5"
            >
              <div
                className={cn(
                  "w-full rounded-md transition-all",
                  i === 3 ? "bg-primary" : "bg-primary/35",
                )}
                style={{ height: `${v}%` }}
              />
              <span className="text-[9px] text-muted-foreground">
                {["Pt", "Sa", "Ça", "Pe", "Cu", "Ct", "Pz"][i]}
              </span>
            </div>
          ))}
        </div>
        <div className="mt-3.5 grid grid-cols-2 gap-2">
          <div className="rounded-lg bg-muted/60 px-3 py-2">
            <div className="text-lg font-bold leading-none text-foreground">12</div>
            <div className="mt-1 text-[11px] text-muted-foreground">Onaylanan</div>
          </div>
          <div className="rounded-lg bg-muted/60 px-3 py-2">
            <div className="flex items-center gap-1.5 text-lg font-bold leading-none text-foreground">
              <PackageCheck className="h-4 w-4 text-status-approved" />3
            </div>
            <div className="mt-1 text-[11px] text-muted-foreground">Bekleyen</div>
          </div>
        </div>
      </CardShell>
    </>
  );
}
