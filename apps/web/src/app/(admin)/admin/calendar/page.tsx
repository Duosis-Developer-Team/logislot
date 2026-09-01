"use client";

import { CalendarOff, ChevronLeft, ChevronRight, Package } from "lucide-react";
import { useEffect, useState } from "react";
import type { AppointmentStatus } from "@logislot/shared";
import { APPOINTMENT_STATUS_LABELS } from "@logislot/shared";
import {
  AdminCreateDrawer,
  type AdminCreateInitialValues,
} from "@/components/appointments/admin-create-drawer";
import { AppointmentDrawer } from "@/components/appointments/appointment-drawer";
import { WeekView } from "@/components/appointments/week-view";
import {
  OverrideDrawer,
  type OverrideDrawerInitial,
} from "@/components/config/override-drawer";
import { useFlash } from "@/components/config/page-shell";
import { EmptyState, ErrorState, LoadingState } from "@/components/config/states";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useCalendarDay } from "@/lib/api/appointments";
import { useFormat, useT } from "@/lib/i18n/provider";
import type { AppointmentDto } from "@/lib/api/types";
import { useSession } from "@/lib/auth/session";
import { cn, hhmmToMinutes, minutesOfDayInTz, timeInTz } from "@/lib/utils";

/**
 * Günlük operasyon takvimi — YATAY ZAMAN ÇİZELGESİ (timeline):
 * her RAMPA bir SATIR, saat ekseni yataydır. Böylece rampa sayısı arttıkça
 * yalnızca satır eklenir (satır başına 64px) ve görünüm kompakt/ölçeklenebilir
 * kalır — eski rampa-sütunlu ızgaranın iki eksende büyüme sorunu giderildi.
 *
 * Görsel sinyaller korunur: blok rengi = statü (ana), çizgili doku + rozet =
 * kargo uyarı katmanı, kesikli bant = kapalı/override, gri bant = pencere dışı.
 * Boş alana tıklamak o rampa+saate (30 dk hassasiyet) ön-dolu "Yeni Randevu"
 * drawer'ını açar; bloğa tıklamak randevu detayını açar.
 */

const HOUR_W = 110; // px / saat (30 dk = 55px)
const ROW_H = 64; // rampa satırı yüksekliği
const LEFT_W = 176; // sticky rampa kolonu genişliği

const STATUS_BLOCK: Record<AppointmentStatus, string> = {
  pending: "bg-status-pending/20 border-status-pending text-status-pending",
  approved: "bg-status-approved/20 border-status-approved text-status-approved",
  revision_pending: "bg-status-revision/20 border-status-revision text-status-revision",
  rejected: "bg-status-rejected/20 border-status-rejected text-status-rejected",
  completed: "bg-status-completed/20 border-status-completed text-status-completed",
  cancelled: "bg-status-cancelled/20 border-status-cancelled text-status-cancelled",
};

function todayISO(): string {
  return new Date().toLocaleDateString("sv-SE");
}

function shiftDate(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString("sv-SE");
}

function mondayOf(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00`);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.toLocaleDateString("sv-SE");
}

/** Dakikayı "HH:MM" yazar. */
function fmtMin(m: number): string {
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

export default function CalendarPage() {
  const t = useT();
  const fmt = useFormat();
  const { activeFacilityId, can } = useSession();
  const [view, setView] = useState<"day" | "week">("day");
  const [date, setDate] = useState(todayISO);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const day = useCalendarDay(view === "day" ? activeFacilityId : null, date);
  const { flash, showFlash } = useFlash();
  const weekStart = mondayOf(date);

  const data = day.data;
  const tz = data?.facility.timezone ?? "Europe/Istanbul";
  const gridStart = data ? hhmmToMinutes(data.working_window.start) : 480;
  const gridEnd = data ? hhmmToMinutes(data.working_window.end) : 1080;
  const totalMin = gridEnd - gridStart;
  const bodyW = (totalMin / 60) * HOUR_W;
  const hours: number[] = [];
  for (let m = gridStart; m < gridEnd; m += 60) hours.push(m);

  const minToX = (m: number) => ((m - gridStart) / 60) * HOUR_W;

  // "Şimdi" çizgisi — yalnızca bugün ve pencere içindeyken; dakikada bir tazelenir.
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  const nowMin = minutesOfDayInTz(new Date(nowTick).toISOString(), tz);
  const showNow = date === todayISO() && nowMin >= gridStart && nowMin <= gridEnd;

  // Boş slota tıklayınca ön-dolu "Yeni Randevu" drawer'ı (30 dk hassasiyet).
  const [createInitial, setCreateInitial] = useState<AdminCreateInitialValues | null>(null);

  // Takvimden tek tıkla istisna: görüntülenen gün ön-seçili, tip "kapalı".
  const [overrideInitial, setOverrideInitial] = useState<OverrideDrawerInitial | null>(null);
  const canOverride = can("calendar.override");
  function openOverride(dockId?: string) {
    setOverrideInitial({ date, type: "closed", dockIds: dockId ? [dockId] : [] });
  }

  function rowClick(dockId: string, e: React.MouseEvent<HTMLDivElement>) {
    if (!can("appt.create")) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const minutes = gridStart + Math.floor((e.clientX - rect.left) / (HOUR_W / 60));
    const snapped = Math.max(gridStart, Math.min(gridEnd - 30, Math.floor(minutes / 30) * 30));
    setCreateInitial({ date, time: fmtMin(snapped), dockId });
  }

  function blockGeom(a: AppointmentDto) {
    const startMin = minutesOfDayInTz(a.scheduled_start_at, tz);
    const left = minToX(Math.max(startMin, gridStart));
    const width = Math.max((a.duration_minutes / 60) * HOUR_W - 2, 34);
    return { left, width };
  }

  const dateLabel = new Date(`${date}T12:00:00`).toLocaleDateString("tr-TR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">{t.nav.admin.calendar}</h1>
          <p className="text-sm text-muted-foreground">
            {view === "day"
              ? dateLabel
              : t.admin.calendar.weekOf(
                  new Date(`${weekStart}T12:00:00`).toLocaleDateString(fmt.tag, {
                    day: "numeric",
                    month: "long",
                  }),
                )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg bg-muted p-0.5">
            {(
              [
                ["day", t.admin.calendar.viewDay],
                ["week", t.admin.calendar.viewWeek],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setView(key)}
                className={cn(
                  "rounded-md px-3 py-1 text-xs font-medium transition-colors",
                  view === key ? "bg-card shadow-sm" : "text-muted-foreground",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              variant="secondary"
              size="icon"
              className="h-9 w-9"
              aria-label={view === "day" ? t.admin.calendar.prevDay : t.admin.calendar.prevWeek}
              title={view === "day" ? t.admin.calendar.prevDay : t.admin.calendar.prevWeek}
              onClick={() => setDate(shiftDate(date, view === "day" ? -1 : -7))}
            >
              <ChevronLeft />
            </Button>
            <Input
              type="date"
              className="h-9 w-40 text-sm"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
            <Button
              variant="secondary"
              size="icon"
              className="h-9 w-9"
              aria-label={view === "day" ? t.admin.calendar.nextDay : t.admin.calendar.nextWeek}
              title={view === "day" ? t.admin.calendar.nextDay : t.admin.calendar.nextWeek}
              onClick={() => setDate(shiftDate(date, view === "day" ? 1 : 7))}
            >
              <ChevronRight />
            </Button>
          </div>
          <Button variant="secondary" size="sm" onClick={() => setDate(todayISO())}>
            {t.admin.calendar.today}
          </Button>
          {canOverride && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => openOverride()}
              title={t.admin.calendar.addOverrideTitle(dateLabel)}
            >
              <CalendarOff className="mr-1.5 h-4 w-4" />
              {t.admin.calendar.addOverride}
            </Button>
          )}
        </div>
      </div>

      {view === "week" && (
        <WeekView
          facilityId={activeFacilityId}
          weekStart={weekStart}
          onSelectDay={(selectedDate) => {
            setDate(selectedDate);
            setView("day");
          }}
        />
      )}

      {flash && (
        <div
          className={cn(
            "rounded-lg border px-3 py-2 text-sm",
            flash.kind === "success"
              ? "border-status-approved/40 bg-status-approved/10 text-status-approved"
              : "border-destructive/40 bg-destructive/10 text-destructive",
          )}
        >
          {flash.text}
        </div>
      )}

      {view === "day" &&
        (day.isLoading ? (
          <LoadingState label={t.admin.calendar.loading} />
        ) : day.isError || !data ? (
          <ErrorState message={t.admin.calendar.loadError} onRetry={() => day.refetch()} />
        ) : data.docks.length === 0 ? (
          <EmptyState
            title={t.admin.calendar.noDocks}
            description="Aktif rampa yok ya da yetkiniz olan rampa bulunmuyor."
          />
        ) : (
          <>
            {/* Kargo uyarı şeridi — statüden bağımsız tavsiye katmanı */}
            {data.cargo_advisories.length > 0 && (
              <div className="flex flex-col gap-1 rounded-lg border border-cargo/40 bg-cargo/10 px-3 py-2 text-sm text-cargo">
                {data.cargo_advisories.map((advisory) => (
                  <span key={advisory.appointment_id} className="flex items-center gap-2">
                    <Package className="h-4 w-4 shrink-0" />
                    {advisory.message}
                  </span>
                ))}
              </div>
            )}

            <Card>
              <CardContent className="relative overflow-x-auto p-0">
                <div style={{ width: LEFT_W + bodyW }} className="relative">
                  {/* Saat cetveli */}
                  <div className="sticky top-0 z-20 flex border-b border-border bg-muted/70 backdrop-blur">
                    <div
                      className="sticky left-0 z-10 shrink-0 border-r border-border bg-muted/90 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground backdrop-blur"
                      style={{ width: LEFT_W }}
                    >
                      Rampalar ({data.docks.length})
                    </div>
                    <div className="relative" style={{ width: bodyW, height: 34 }}>
                      {hours.map((m) => (
                        <span
                          key={m}
                          className="absolute top-2 -translate-x-1/2 text-xs text-muted-foreground first:translate-x-0"
                          style={{ left: minToX(m) }}
                        >
                          {fmtMin(m)}
                        </span>
                      ))}
                      {/* Pencere bitişi etiketi */}
                      <span
                        className="absolute right-0 top-2 text-xs text-muted-foreground"
                        style={{ left: undefined }}
                      >
                        {fmtMin(gridEnd)}
                      </span>
                    </div>
                  </div>

                  {/* Rampa satırları */}
                  {data.docks.map((dock) => {
                    const window = dock.day_window;
                    const blocked = data.blocked_slots.filter((b) => b.dock_id === dock.id);
                    const appts = data.appointments.filter((a) => a.dock_id === dock.id);
                    return (
                      <div key={dock.id} className="flex border-b border-border/70 last:border-b-0">
                        {/* Sol sabit rampa hücresi */}
                        <div
                          className="sticky left-0 z-10 flex shrink-0 flex-col justify-center gap-0.5 border-r border-border bg-card px-3"
                          style={{ width: LEFT_W, height: ROW_H }}
                        >
                          <div className="flex items-center gap-1.5 truncate text-sm font-semibold">
                            <span className="truncate">{dock.name}</span>
                            {dock.has_cargo_warning && (
                              <Package className="h-3.5 w-3.5 shrink-0 text-cargo" />
                            )}
                            {window === null && (
                              <CalendarOff className="h-3.5 w-3.5 shrink-0 text-status-cancelled" />
                            )}
                            {canOverride && (
                              <button
                                type="button"
                                onClick={() => openOverride(dock.id)}
                                aria-label={t.admin.calendar.dockOverrideLabel(dock.name)}
                                title={t.admin.calendar.dockOverrideTitle(dock.name, dateLabel)}
                                className="ml-auto shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                              >
                                <CalendarOff className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                          <div className="truncate text-[11px] text-muted-foreground">
                            {window ? `${window.start}–${window.end}` : t.admin.calendar.closedToday}
                          </div>
                        </div>

                        {/* Zaman şeridi */}
                        <div
                          className={cn(
                            "relative",
                            can("appt.create") && window !== null && "cursor-pointer",
                          )}
                          style={{
                            width: bodyW,
                            height: ROW_H,
                            // 30dk (ince) + saat başı (belirgin) dikey kılavuzlar
                            backgroundImage:
                              "repeating-linear-gradient(to right, hsl(var(--border)/0.45) 0 1px, transparent 1px " +
                              HOUR_W / 2 +
                              "px), repeating-linear-gradient(to right, hsl(var(--border)) 0 1px, transparent 1px " +
                              HOUR_W +
                              "px)",
                          }}
                          title={
                            can("appt.create") && window !== null
                              ? t.admin.calendar.clickEmptyHint
                              : undefined
                          }
                          onClick={(e) => window !== null && rowClick(dock.id, e)}
                        >
                          {/* Pencere dışı gölgeleme / kapalı gün */}
                          {window === null ? (
                            <div className="absolute inset-0 z-[1] bg-muted/80" />
                          ) : (
                            <>
                              {hhmmToMinutes(window.start) > gridStart && (
                                <div
                                  className="absolute inset-y-0 left-0 z-[1] bg-muted/80"
                                  style={{ width: minToX(hhmmToMinutes(window.start)) }}
                                />
                              )}
                              {hhmmToMinutes(window.end) < gridEnd && (
                                <div
                                  className="absolute inset-y-0 right-0 z-[1] bg-muted/80"
                                  style={{ width: bodyW - minToX(hhmmToMinutes(window.end)) }}
                                />
                              )}
                            </>
                          )}

                          {/* Kapalı override bantları */}
                          {blocked.map((b, i) => (
                            <div
                              key={i}
                              className="absolute inset-y-1.5 z-[2] flex items-center justify-center gap-1 overflow-hidden rounded-md border border-dashed border-status-cancelled/50 bg-status-cancelled/10 px-1 text-[10px] font-medium text-status-cancelled"
                              style={{
                                left: minToX(hhmmToMinutes(b.start)),
                                width:
                                  minToX(hhmmToMinutes(b.end)) - minToX(hhmmToMinutes(b.start)),
                              }}
                              title={b.note ?? t.admin.calendar.closed}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <CalendarOff className="h-3 w-3 shrink-0" />
                              <span className="truncate">{b.note ?? t.admin.calendar.closed}</span>
                            </div>
                          ))}

                          {/* Randevu blokları */}
                          {appts.map((a) => {
                            const { left, width } = blockGeom(a);
                            return (
                              <button
                                key={a.id}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedId(a.id);
                                }}
                                className={cn(
                                  "absolute inset-y-1.5 z-[3] overflow-hidden rounded-md border-l-4 px-1.5 py-1 text-left text-xs shadow-sm transition-transform hover:z-[4] hover:scale-[1.02]",
                                  STATUS_BLOCK[a.status as AppointmentStatus],
                                  a.delivery_type === "cargo" && "cargo-overlay",
                                )}
                                style={{ left, width }}
                                title={`${timeInTz(a.scheduled_start_at, tz)} · ${a.supplier_name ?? ""} · ${a.product_name}`}
                              >
                                <div className="flex items-center gap-1 truncate font-semibold leading-tight">
                                  {a.delivery_type === "cargo" && (
                                    <Package className="h-3 w-3 shrink-0 text-cargo" />
                                  )}
                                  <span className="truncate">
                                    {timeInTz(a.scheduled_start_at, tz)} {a.supplier_name}
                                  </span>
                                </div>
                                <div className="truncate leading-tight opacity-80">
                                  {a.product_name}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}

                  {/* Şimdi çizgisi — tüm satırları keser */}
                  {showNow && (
                    <div
                      aria-hidden
                      className="pointer-events-none absolute bottom-0 top-[34px] z-[5]"
                      style={{ left: LEFT_W + minToX(nowMin) }}
                    >
                      <div className="h-full w-px bg-primary" />
                      <div className="absolute -left-[3px] -top-1 h-2 w-2 rounded-full bg-primary" />
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {data.appointments.length === 0 && (
              <EmptyState
                title={t.admin.calendar.emptyDayTitle}
                description={t.admin.calendar.emptyDayDescription}
              />
            )}

            {/* Lejant */}
            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              {(Object.keys(APPOINTMENT_STATUS_LABELS) as AppointmentStatus[]).map((s) => (
                <span key={s} className="flex items-center gap-1">
                  <span className={cn("h-2.5 w-2.5 rounded-sm border-l-2", STATUS_BLOCK[s])} />
                  {APPOINTMENT_STATUS_LABELS[s]}
                </span>
              ))}
              <span className="flex items-center gap-1">
                <span className="cargo-overlay h-2.5 w-2.5 rounded-sm border border-cargo/50" />
                {t.admin.calendar.legendCargo}
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded-sm border border-dashed border-status-cancelled/60 bg-status-cancelled/10" />
                {t.admin.calendar.legendClosed}
              </span>
              {showNow && (
                <span className="flex items-center gap-1">
                  <span className="h-2.5 w-0.5 rounded bg-primary" />
                  {t.admin.calendar.legendNow}
                </span>
              )}
            </div>
          </>
        ))}

      <AdminCreateDrawer
        open={createInitial !== null}
        onClose={() => setCreateInitial(null)}
        onSuccess={() => setCreateInitial(null)}
        initial={createInitial}
      />

      <OverrideDrawer
        open={overrideInitial !== null}
        initial={overrideInitial}
        onClose={() => setOverrideInitial(null)}
        onSaved={(message) => showFlash("success", message)}
      />

      <AppointmentDrawer
        appointmentId={selectedId}
        onClose={() => setSelectedId(null)}
        onActionSuccess={(message) => showFlash("success", message)}
      />
    </div>
  );
}
