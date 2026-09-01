"use client";

import { Switch } from "@/components/ui/switch";
import { TimeSelect } from "@/components/ui/time-select";
import type { WorkingHours } from "@/lib/api/types";

const DAYS: { key: string; label: string }[] = [
  { key: "mon", label: "Pazartesi" },
  { key: "tue", label: "Salı" },
  { key: "wed", label: "Çarşamba" },
  { key: "thu", label: "Perşembe" },
  { key: "fri", label: "Cuma" },
  { key: "sat", label: "Cumartesi" },
  { key: "sun", label: "Pazar" },
];

export const DEFAULT_WORKING_HOURS: WorkingHours = {
  mon: { start: "08:00", end: "17:00" },
  tue: { start: "08:00", end: "17:00" },
  wed: { start: "08:00", end: "17:00" },
  thu: { start: "08:00", end: "17:00" },
  fri: { start: "08:00", end: "17:00" },
  sat: null,
  sun: null,
};

interface WorkingHoursEditorProps {
  value: WorkingHours;
  onChange: (value: WorkingHours) => void;
}

export function WorkingHoursEditor({ value, onChange }: WorkingHoursEditorProps) {
  function setDay(key: string, day: { start: string; end: string } | null) {
    onChange({ ...value, [key]: day });
  }

  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-border p-3">
      {DAYS.map(({ key, label }) => {
        const day = value[key] ?? null;
        const open = day !== null;
        return (
          // `flex-wrap`: saatler sigmazsa alt satira gecer. Sabit genislikli
          // grid kolonunda kalsalardi kap daraldikca seciciler ezilirdi.
          <div key={key} className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
            <span className="w-24 shrink-0 text-sm font-medium">{label}</span>
            <Switch
              checked={open}
              onChange={(checked) =>
                setDay(key, checked ? { start: "08:00", end: "17:00" } : null)
              }
              label={open ? "Açık" : "Kapalı"}
            />
            {open && day && (
              <div className="flex items-center gap-1.5">
                <TimeSelect
                  ariaLabel={`${label} başlangıç`}
                  value={day.start}
                  onChange={(next) => setDay(key, { ...day, start: next })}
                />
                <span className="text-xs text-muted-foreground">–</span>
                <TimeSelect
                  ariaLabel={`${label} bitiş`}
                  value={day.end}
                  onChange={(next) => setDay(key, { ...day, end: next })}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Liste gorunumu icin kisa ozet: "Hafta içi 08:00–18:00 · Cmt 08:00–13:00" */
export function summarizeWorkingHours(hours: WorkingHours | null): string {
  if (!hours) return "Tesis varsayılanı";
  const openDays = DAYS.filter((d) => hours[d.key]);
  if (openDays.length === 0) return "Tüm günler kapalı";
  const first = hours[openDays[0].key]!;
  const allSame = openDays.every(
    (d) => hours[d.key]!.start === first.start && hours[d.key]!.end === first.end,
  );
  if (allSame && openDays.length === 7) return `Her gün ${first.start}–${first.end}`;
  if (allSame) return `${openDays.length} gün ${first.start}–${first.end}`;
  return `${openDays.length} gün açık`;
}
