/** Tarih/saat yardımcıları — web lib/utils.ts karşılıkları. */

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("tr-TR", {
    day: "2-digit",
    month: "long",
    weekday: "short",
  });
}

export function timeInTz(iso: string, tz: string): string {
  return new Date(iso).toLocaleTimeString("tr-TR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: tz,
  });
}

export function todayISO(): string {
  return new Date().toLocaleDateString("sv-SE");
}

export function addDaysISO(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString("sv-SE");
}

export function dayLabel(dateStr: string): string {
  return new Date(`${dateStr}T12:00:00`).toLocaleDateString("tr-TR", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

/** date (YYYY-MM-DD) + time (HH:mm) + IANA tz → UTC ISO string.
 *  Web'deki lib/utils.ts isoFromWallClock ile birebir aynı algoritma. */
export function isoFromWallClock(dateStr: string, timeStr: string, tz: string): string {
  const guess = new Date(`${dateStr}T${timeStr}:00Z`);
  const tzDate = new Date(guess.toLocaleString("en-US", { timeZone: tz }));
  const utcDate = new Date(guess.toLocaleString("en-US", { timeZone: "UTC" }));
  const offsetMs = tzDate.getTime() - utcDate.getTime();
  return new Date(guess.getTime() - offsetMs).toISOString();
}
