"use client";

/**
 * Saat + dakika seciciler ("HH:MM").
 *
 * Serbest `<input type="time">` 01:19 gibi degerlere izin veriyordu; calisma
 * saatlerinde dakika YALNIZCA ceyrek saat olabilir. Backend de ayni kurali
 * zorlar (app/schemas/config.py QUARTER_HOUR_MINUTES) — bu bilesen kurali
 * kullaniciya gorunur kilar, tek savunma hatti degildir.
 */

import { Select } from "@/components/ui/input";

export const QUARTER_HOUR_MINUTES = ["00", "15", "30", "45"] as const;

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));

/** "8:5" / bozuk deger gelse bile ekran kirilmasin diye normalize edilir. */
function split(value: string): { hour: string; minute: string } {
  const [h = "", m = ""] = value.split(":");
  const hour = HOURS.includes(h) ? h : "08";
  // Ceyrek saate yuvarla: eski kayitlarda 01:19 gibi degerler olabilir.
  const parsed = Number(m);
  const minute = Number.isFinite(parsed)
    ? QUARTER_HOUR_MINUTES[Math.min(3, Math.floor(parsed / 15))]
    : "00";
  return { hour, minute };
}

export function TimeSelect({
  value,
  onChange,
  ariaLabel,
}: {
  value: string;
  onChange: (next: string) => void;
  ariaLabel?: string;
}) {
  const { hour, minute } = split(value);
  return (
    <span className="flex items-center gap-1">
      <Select
        aria-label={ariaLabel ? `${ariaLabel} saat` : "Saat"}
        className="h-8 w-[4.5rem] text-xs"
        value={hour}
        onChange={(e) => onChange(`${e.target.value}:${minute}`)}
      >
        {HOURS.map((h) => (
          <option key={h} value={h}>
            {h}
          </option>
        ))}
      </Select>
      <span className="text-xs text-muted-foreground">:</span>
      <Select
        aria-label={ariaLabel ? `${ariaLabel} dakika` : "Dakika"}
        className="h-8 w-[4.5rem] text-xs"
        value={minute}
        onChange={(e) => onChange(`${hour}:${e.target.value}`)}
      >
        {QUARTER_HOUR_MINUTES.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </Select>
    </span>
  );
}
