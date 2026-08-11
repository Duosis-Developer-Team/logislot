import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Arama karsilastirmasi icin metni normalize eder.
 * - Turkce locale ile kucultur ("I" -> "ı", "İ" -> "i"),
 * - ardindan aksanli harfleri ASCII karsiliklarina indirger; boylece
 *   "urun" yazan kullanici "Ürün" kaydini da bulur.
 */
const SEARCH_FOLD: Record<string, string> = {
  ı: "i",
  ş: "s",
  ğ: "g",
  ü: "u",
  ö: "o",
  ç: "c",
  â: "a",
  î: "i",
  û: "u",
};

export function normalizeSearch(text: string): string {
  return text
    .toLocaleLowerCase("tr")
    .replace(/[ışğüöçâîû]/g, (ch) => SEARCH_FOLD[ch] ?? ch);
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("tr-TR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("tr-TR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("tr-TR", {
    day: "2-digit",
    month: "long",
    weekday: "short",
  });
}

/** "HH:MM" -> gunun dakikasi. */
export function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/** ISO zamani verilen timezone'da "HH:MM" olarak dondurur. */
export function timeInTz(iso: string, tz: string): string {
  return new Intl.DateTimeFormat("tr-TR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: tz,
  }).format(new Date(iso));
}

/** ISO zamanin verilen timezone'daki gun-ici dakikasi (takvim konumlama). */
export function minutesOfDayInTz(iso: string, tz: string): number {
  return hhmmToMinutes(timeInTz(iso, tz));
}

/** Facility timezone'undaki duvar saatini UTC ISO'ya cevirir (revize formu). */
export function isoFromWallClock(dateStr: string, timeStr: string, tz: string): string {
  const guess = new Date(`${dateStr}T${timeStr}:00Z`);
  const tzDate = new Date(guess.toLocaleString("en-US", { timeZone: tz }));
  const utcDate = new Date(guess.toLocaleString("en-US", { timeZone: "UTC" }));
  const offsetMs = tzDate.getTime() - utcDate.getTime();
  return new Date(guess.getTime() - offsetMs).toISOString();
}
