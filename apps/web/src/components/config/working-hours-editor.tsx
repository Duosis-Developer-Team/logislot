"use client";

import { Switch } from "@/components/ui/switch";
import { TimeSelect } from "@/components/ui/time-select";
import type { WorkingHours } from "@/lib/api/types";
import type { Dictionary } from "@/lib/i18n/dictionaries/tr";
import { useLocale, useT } from "@/lib/i18n/provider";

/** Gun anahtarlari sabittir; adlar Intl'den gelir, sozluge yazilmaz.
 *  2024-01-01 bir Pazartesi; oradan sirayla 7 gun uretilir. */
const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

function dayNames(locale: string): string[] {
  const formatter = new Intl.DateTimeFormat(locale, { weekday: "long" });
  return DAY_KEYS.map((_, index) =>
    formatter.format(new Date(Date.UTC(2024, 0, 1 + index))),
  );
}

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
  const t = useT();
  const { locale } = useLocale();
  const names = dayNames(locale);
  function setDay(key: string, day: { start: string; end: string } | null) {
    onChange({ ...value, [key]: day });
  }

  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-border p-3">
      {DAY_KEYS.map((key, index) => {
        const label = names[index];
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
              label={open ? t.common.active : t.admin.overrides.closed}
            />
            {open && day && (
              <div className="flex items-center gap-1.5">
                <TimeSelect
                  ariaLabel={`${label} ${t.components.overrideDrawer.start}`}
                  value={day.start}
                  onChange={(next) => setDay(key, { ...day, start: next })}
                />
                <span className="text-xs text-muted-foreground">–</span>
                <TimeSelect
                  ariaLabel={`${label} ${t.components.overrideDrawer.end}`}
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
export function summarizeWorkingHours(
  t: Dictionary,
  hours: WorkingHours | null,
): string {
  if (!hours) return t.components.workingHours.facilityDefault;
  const openKeys = DAY_KEYS.filter((key) => hours[key]);
  if (openKeys.length === 0) return t.components.workingHours.allClosed;
  const first = hours[openKeys[0]]!;
  const allSame = openKeys.every(
    (key) => hours[key]!.start === first.start && hours[key]!.end === first.end,
  );
  if (allSame && openKeys.length === 7) {
    return t.components.workingHours.everyDay(first.start, first.end);
  }
  if (allSame) {
    return t.components.workingHours.someDays(openKeys.length, first.start, first.end);
  }
  return t.components.workingHours.daysOpen(openKeys.length);
}
