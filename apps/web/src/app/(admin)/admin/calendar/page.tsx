"use client";

import { CalendarOff, Package } from "lucide-react";
import { useState } from "react";
import type { AppointmentStatus } from "@logislot/shared";
import { APPOINTMENT_STATUS_LABELS } from "@logislot/shared";
import {
  AdminCreateDrawer,
  type AdminCreateInitialValues,
} from "@/components/appointments/admin-create-drawer";
import { AppointmentDrawer } from "@/components/appointments/appointment-drawer";
import { WeekView } from "@/components/appointments/week-view";
import { useFlash } from "@/components/config/page-shell";
import { EmptyState, ErrorState, LoadingState } from "@/components/config/states";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useCalendarDay } from "@/lib/api/appointments";
import type { AppointmentDto } from "@/lib/api/types";
import { useSession } from "@/lib/auth/session";
import { cn, hhmmToMinutes, minutesOfDayInTz, timeInTz } from "@/lib/utils";

/**
 * Gunluk operasyon takvimi — rampalar sutun, saat cetveli satir; tamamen
 * gercek veriden. Iki gorsel sinyal birlikte: blok rengi = statu (ana),
 * cizgili doku + rozet = kargo uyari katmani (statuyu degistirmez).
 */

const HOUR_PX = 64;

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

export default function CalendarPage() {
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
  const hours: number[] = [];
  for (let m = gridStart; m < gridEnd; m += 60) hours.push(m);

  // Sprint 12 micro UX: bos slota tiklayinca on-dolu "Yeni Randevu" drawer'i
  const [createInitial, setCreateInitial] = useState<AdminCreateInitialValues | null>(null);

  function openCreateAt(dockId: string, minutes: number) {
    if (!can("appt.create")) return;
    const hh = String(Math.floor(minutes / 60)).padStart(2, "0");
    setCreateInitial({ date, time: `${hh}:00`, dockId });
  }

  function blockPosition(a: AppointmentDto) {
    const startMin = minutesOfDayInTz(a.scheduled_start_at, tz);
    const top = ((startMin - gridStart) / 60) * HOUR_PX;
    const height = Math.max((a.duration_minutes / 60) * HOUR_PX, 28);
    return { top, height };
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
          <h1 className="text-xl font-bold">Takvim</h1>
          <p className="text-sm text-muted-foreground">
            {view === "day"
              ? dateLabel
              : `${new Date(`${weekStart}T12:00:00`).toLocaleDateString("tr-TR", {
                  day: "numeric",
                  month: "long",
                })} haftası`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Gunluk / haftalik gecis */}
          <div className="flex rounded-lg bg-muted p-0.5">
            {(
              [
                ["day", "Günlük"],
                ["week", "Haftalık"],
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
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setDate(shiftDate(date, view === "day" ? -1 : -7))}
          >
            ← Önceki
          </Button>
          <Input
            type="date"
            className="h-8 w-40 text-sm"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
          <Button variant="secondary" size="sm" onClick={() => setDate(todayISO())}>
            Bugün
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setDate(shiftDate(date, view === "day" ? 1 : 7))}
          >
            Sonraki →
          </Button>
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
        <LoadingState label="Takvim yükleniyor…" />
      ) : day.isError || !data ? (
        <ErrorState message="Takvim yüklenemedi." onRetry={() => day.refetch()} />
      ) : data.docks.length === 0 ? (
        <EmptyState
          title="Görüntülenecek rampa yok"
          description="Bu tesiste aktif rampa yok ya da yetkiniz olan rampa bulunmuyor."
        />
      ) : (
        <>
          {/* Kargo uyari seridi — statuden bagimsiz tavsiye katmani */}
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
            <CardContent className="overflow-x-auto p-0">
              <div style={{ minWidth: 160 + data.docks.length * 180 }}>
                {/* Baslik: rampa sutunlari */}
                <div
                  className="sticky top-0 z-10 grid border-b border-border bg-muted/60 backdrop-blur"
                  style={{
                    gridTemplateColumns: `64px repeat(${data.docks.length}, 1fr)`,
                  }}
                >
                  <div />
                  {data.docks.map((dock) => (
                    <div key={dock.id} className="border-l border-border px-3 py-2">
                      <div className="flex items-center gap-1.5 text-sm font-semibold">
                        {dock.name}
                        {dock.has_cargo_warning && (
                          <Package className="h-3.5 w-3.5 text-cargo" />
                        )}
                        {dock.day_window === null && (
                          <CalendarOff className="h-3.5 w-3.5 text-status-cancelled" />
                        )}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {dock.day_window
                          ? `${dock.day_window.start}–${dock.day_window.end}`
                          : "Bugün kapalı"}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Izgara */}
                <div
                  className="relative grid"
                  style={{
                    gridTemplateColumns: `64px repeat(${data.docks.length}, 1fr)`,
                  }}
                >
                  <div>
                    {hours.map((m) => (
                      <div
                        key={m}
                        className="border-b border-border pr-2 text-right text-xs text-muted-foreground"
                        style={{ height: HOUR_PX }}
                      >
                        <span className="relative -top-2">
                          {`${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`}
                        </span>
                      </div>
                    ))}
                  </div>

                  {data.docks.map((dock) => {
                    const window = dock.day_window;
                    const blocked = data.blocked_slots.filter(
                      (b) => b.dock_id === dock.id,
                    );
                    return (
                      <div key={dock.id} className="relative border-l border-border">
                        {hours.map((m) => (
                          <div
                            key={m}
                            className={cn(
                              "border-b border-border/60",
                              can("appt.create") &&
                                "cursor-pointer transition-colors hover:bg-primary/5",
                            )}
                            style={{ height: HOUR_PX }}
                            title={can("appt.create") ? "Bu saate randevu oluştur" : undefined}
                            onClick={() => openCreateAt(dock.id, m)}
                          />
                        ))}

                        {/* Calisma penceresi disi golgeleme */}
                        {window === null ? (
                          <div className="absolute inset-0 bg-muted/70" />
                        ) : (
                          <>
                            {hhmmToMinutes(window.start) > gridStart && (
                              <div
                                className="absolute inset-x-0 top-0 bg-muted/70"
                                style={{
                                  height:
                                    ((hhmmToMinutes(window.start) - gridStart) / 60) *
                                    HOUR_PX,
                                }}
                              />
                            )}
                            {hhmmToMinutes(window.end) < gridEnd && (
                              <div
                                className="absolute inset-x-0 bottom-0 bg-muted/70"
                                style={{
                                  height:
                                    ((gridEnd - hhmmToMinutes(window.end)) / 60) * HOUR_PX,
                                }}
                              />
                            )}
                          </>
                        )}

                        {/* Closed override bloklari */}
                        {blocked.map((b, i) => (
                          <div
                            key={i}
                            className="absolute inset-x-1 flex items-center justify-center rounded-md border border-dashed border-status-cancelled/50 bg-status-cancelled/10 text-[10px] font-medium text-status-cancelled"
                            style={{
                              top:
                                ((hhmmToMinutes(b.start) - gridStart) / 60) * HOUR_PX,
                              height:
                                ((hhmmToMinutes(b.end) - hhmmToMinutes(b.start)) / 60) *
                                HOUR_PX,
                            }}
                            title={b.note ?? "Kapalı"}
                          >
                            <CalendarOff className="mr-1 h-3 w-3" />
                            {b.note ?? "Kapalı"}
                          </div>
                        ))}

                        {/* Randevu bloklari */}
                        {data.appointments
                          .filter((a) => a.dock_id === dock.id)
                          .map((a) => {
                            const { top, height } = blockPosition(a);
                            return (
                              <button
                                key={a.id}
                                onClick={() => setSelectedId(a.id)}
                                className={cn(
                                  "absolute inset-x-1 rounded-md border-l-4 p-1.5 text-left text-xs shadow-sm transition-transform hover:scale-[1.01]",
                                  STATUS_BLOCK[a.status as AppointmentStatus],
                                  a.delivery_type === "cargo" && "cargo-overlay",
                                )}
                                style={{ top, height }}
                              >
                                <div className="flex items-center gap-1 truncate font-semibold">
                                  {a.delivery_type === "cargo" && (
                                    <Package className="h-3 w-3 shrink-0 text-cargo" />
                                  )}
                                  {timeInTz(a.scheduled_start_at, tz)} {a.supplier_name}
                                </div>
                                <div className="truncate opacity-80">{a.product_name}</div>
                              </button>
                            );
                          })}
                      </div>
                    );
                  })}
                </div>
              </div>
            </CardContent>
          </Card>

          {data.appointments.length === 0 && (
            <EmptyState
              title="Bu gün randevu yok"
              description="Farklı bir gün seçin ya da tedarikçi portalından talep bekleyin."
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
              Kargo uyarısı (statüden bağımsız)
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-sm border border-dashed border-status-cancelled/60 bg-status-cancelled/10" />
              Kapalı (override)
            </span>
          </div>
        </>
      ))}

      <AdminCreateDrawer
        open={createInitial !== null}
        onClose={() => setCreateInitial(null)}
        onSuccess={() => setCreateInitial(null)}
        initial={createInitial}
      />

      <AppointmentDrawer
        appointmentId={selectedId}
        onClose={() => setSelectedId(null)}
        onActionSuccess={(message) => showFlash("success", message)}
      />
    </div>
  );
}
