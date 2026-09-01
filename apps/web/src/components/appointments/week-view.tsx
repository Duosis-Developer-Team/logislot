"use client";

/** Haftalik operasyon ozeti — gun kartlari; tiklaninca gunluk gorunume gecer. */

import { CalendarOff, Clock4, Package } from "lucide-react";
import { EmptyState, ErrorState, LoadingState } from "@/components/config/states";
import { Card, CardContent } from "@/components/ui/card";
import { useCalendarWeek } from "@/lib/api/appointments";
import type { CalendarWeekDayDto } from "@/lib/api/types";
import { useFormat, useT } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";

interface WeekViewProps {
  facilityId: string | null;
  weekStart: string;
  onSelectDay: (date: string) => void;
}

function DayCard({
  day,
  onClick,
}: {
  day: CalendarWeekDayDto;
  onClick: () => void;
}) {
  const t = useT().components.weekView;
  const fmt = useFormat();
  const isToday = day.date === new Date().toLocaleDateString("sv-SE");
  const label = new Date(`${day.date}T12:00:00`).toLocaleDateString(fmt.tag, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  return (
    <Card
      className={cn(
        "cursor-pointer transition-shadow hover:shadow-md",
        isToday && "ring-2 ring-primary/40",
      )}
      onClick={onClick}
    >
      <CardContent className="flex flex-col gap-2 p-4">
        <div className="flex items-center justify-between">
          <span className={cn("text-sm font-semibold", isToday && "text-primary")}>
            {label}
          </span>
          <div className="flex items-center gap-1">
            {day.has_closed_override && (
              <CalendarOff className="h-3.5 w-3.5 text-status-cancelled" />
            )}
            {day.has_extra_hours && <Clock4 className="h-3.5 w-3.5 text-status-approved" />}
            {day.cargo > 0 && (
              <span className="flex items-center gap-0.5 rounded-full bg-cargo/15 px-1.5 py-0.5 text-[10px] font-semibold text-cargo">
                <Package className="h-3 w-3" /> {day.cargo}
              </span>
            )}
          </div>
        </div>

        <div className="text-2xl font-bold leading-none">
          {day.total}
          <span className="ml-1 text-xs font-normal text-muted-foreground">
            {t.appointmentsSuffix}
          </span>
        </div>

        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px]">
          {day.pending > 0 && (
            <span className="text-status-pending">● {t.pending(day.pending)}</span>
          )}
          {day.approved > 0 && (
            <span className="text-status-approved">● {t.approved(day.approved)}</span>
          )}
          {day.revision_pending > 0 && (
            <span className="text-status-revision">● {t.revision(day.revision_pending)}</span>
          )}
          {day.completed > 0 && (
            <span className="text-status-completed">● {t.completed(day.completed)}</span>
          )}
          {day.total === 0 && <span className="text-muted-foreground">{t.none}</span>}
        </div>

        {/* Doluluk cubugu */}
        <div>
          <div className="mb-0.5 flex justify-between text-[10px] text-muted-foreground">
            <span>{t.utilisation}</span>
            <span>%{day.utilization_percent}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                "h-full rounded-full",
                day.utilization_percent >= 80
                  ? "bg-status-rejected"
                  : day.utilization_percent >= 50
                    ? "bg-status-pending"
                    : "bg-status-approved",
              )}
              style={{ width: `${day.utilization_percent}%` }}
            />
          </div>
        </div>

        {day.top_docks.length > 0 && (
          <p className="truncate text-[10px] text-muted-foreground">
            {t.busiest(day.top_docks[0].dock_name ?? "—", day.top_docks[0].appointments)}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export function WeekView({ facilityId, weekStart, onSelectDay }: WeekViewProps) {
  const t = useT().components.weekView;
  const week = useCalendarWeek(facilityId, weekStart);

  if (week.isLoading) return <LoadingState label={t.loading} />;
  if (week.isError || !week.data)
    return <ErrorState message={t.loadError} onRetry={() => week.refetch()} />;

  const days = week.data.days;
  if (days.every((d) => d.total === 0)) {
    return (
      <>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7">
          {days.map((day) => (
            <DayCard key={day.date} day={day} onClick={() => onSelectDay(day.date)} />
          ))}
        </div>
        <EmptyState
          title={t.emptyTitle}
          description={t.emptyDescription}
        />
      </>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7">
      {days.map((day) => (
        <DayCard key={day.date} day={day} onClick={() => onSelectDay(day.date)} />
      ))}
    </div>
  );
}
