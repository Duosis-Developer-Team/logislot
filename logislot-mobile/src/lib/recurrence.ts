/**
 * Outlook tarzi tekrar deseni -> occurrence tarihleri.
 *
 * apps/api/app/services/recurrence.py'nin BIREBIR aynasi; web'deki
 * apps/web/src/lib/recurrence.ts'nin KOPYASI (mobil, web paketini import
 * edemez). Algoritma degisirse UC yer birlikte degisir. Tarihler "YYYY-MM-DD" dizeleri; gunler 0=Pzt .. 6=Paz.
 * Ayda X. gun yoksa (orn. 31) ayin SON gunune kirpilir.
 */

export type RecurrenceType = "daily" | "weekly" | "monthly";
export type MonthlyMode = "day_of_month" | "nth_weekday";
export type WeekOfMonth = 1 | 2 | 3 | 4 | -1;

export interface RecurrenceRule {
  type: RecurrenceType;
  interval: number;
  weekdays_only?: boolean;
  weekdays?: number[];
  monthly_mode?: MonthlyMode;
  day_of_month?: number | null;
  week_of_month?: WeekOfMonth | null;
  weekday?: number | null;
  end_type: "count" | "until";
  count?: number | null;
  until?: string | null;
}

export const MAX_OCCURRENCES = 52;
export const MAX_HORIZON_DAYS = 366;

export type RecurrenceErrorCode = "too_many" | "too_long" | "invalid" | "too_few";

export interface RecurrenceResult {
  dates: string[];
  error: RecurrenceErrorCode | null;
}

// --- tarih yardimcilari (UTC tabanli; saat dilimi kaymasi yok)
function parse(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
function fmt(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86_400_000);
}
/** 0=Pzt .. 6=Paz */
export function isoWeekday(iso: string): number {
  return (parse(iso).getUTCDay() + 6) % 7;
}
function wd(d: Date): number {
  return (d.getUTCDay() + 6) % 7;
}
function daysInMonth(year: number, month0: number): number {
  return new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
}
function nthWeekday(year: number, month0: number, week: WeekOfMonth, weekday: number): Date {
  if (week === -1) {
    const last = new Date(Date.UTC(year, month0, daysInMonth(year, month0)));
    return addDays(last, -((wd(last) - weekday + 7) % 7));
  }
  const first = new Date(Date.UTC(year, month0, 1));
  return addDays(first, ((weekday - wd(first) + 7) % 7) + 7 * (week - 1));
}

/** Backend normalize_recurrence ile ayni: bos alanlari baslangictan doldurur. */
export function normalizeRule(rule: RecurrenceRule, start: string): RecurrenceRule {
  const s = parse(start);
  const out: RecurrenceRule = { ...rule, interval: Math.max(1, Math.floor(rule.interval || 1)) };
  if (out.type === "weekly" && !(out.weekdays && out.weekdays.length)) out.weekdays = [wd(s)];
  if (out.type === "monthly") {
    if (out.monthly_mode === "nth_weekday") {
      if (out.weekday == null) out.weekday = wd(s);
      if (out.week_of_month == null)
        out.week_of_month = Math.min(Math.floor((s.getUTCDate() - 1) / 7) + 1, 4) as WeekOfMonth;
    } else {
      out.monthly_mode = "day_of_month";
      if (!out.day_of_month) out.day_of_month = s.getUTCDate();
    }
  }
  return out;
}

function* candidates(start: Date, rule: RecurrenceRule): Generator<Date> {
  const interval = Math.max(1, rule.interval || 1);
  if (rule.type === "daily") {
    let day = start;
    for (;;) {
      if (!rule.weekdays_only || wd(day) < 5) yield day;
      day = addDays(day, rule.weekdays_only ? 1 : interval);
    }
  } else if (rule.type === "weekly") {
    const days = [...new Set(rule.weekdays?.length ? rule.weekdays : [wd(start)])].sort();
    let weekStart = addDays(start, -wd(start));
    for (;;) {
      for (const d of days) {
        const day = addDays(weekStart, d);
        if (day >= start) yield day;
      }
      weekStart = addDays(weekStart, 7 * interval);
    }
  } else {
    let year = start.getUTCFullYear();
    let month0 = start.getUTCMonth();
    for (;;) {
      const day =
        rule.monthly_mode === "nth_weekday"
          ? nthWeekday(year, month0, rule.week_of_month ?? 1, rule.weekday ?? wd(start))
          : new Date(
              Date.UTC(
                year,
                month0,
                Math.min(rule.day_of_month || start.getUTCDate(), daysInMonth(year, month0)),
              ),
            );
      if (day >= start) yield day;
      month0 += interval;
      year += Math.floor(month0 / 12);
      month0 %= 12;
    }
  }
}

export function generateOccurrenceDates(start: string, rawRule: RecurrenceRule): RecurrenceResult {
  if (!start) return { dates: [], error: "invalid" };
  const rule = normalizeRule(rawRule, start);
  const s = parse(start);
  let limit: number | null = null;
  let until: Date | null = null;
  if (rule.end_type === "until") {
    if (!rule.until || !/^\d{4}-\d{2}-\d{2}$/.test(rule.until)) return { dates: [], error: "invalid" };
    until = parse(rule.until);
    if (until < s) return { dates: [], error: "invalid" };
    if ((until.getTime() - s.getTime()) / 86_400_000 > MAX_HORIZON_DAYS)
      return { dates: [], error: "too_long" };
  } else {
    if (!rule.count || rule.count < 1) return { dates: [], error: "invalid" };
    if (rule.count > MAX_OCCURRENCES) return { dates: [], error: "too_many" };
    limit = rule.count;
  }
  const dates: string[] = [];
  for (const day of candidates(s, rule)) {
    if (until && day > until) break;
    dates.push(fmt(day));
    if (limit !== null && dates.length >= limit) break;
    if (dates.length > MAX_OCCURRENCES) return { dates: dates.slice(0, MAX_OCCURRENCES), error: "too_many" };
  }
  if (dates.length < 2) return { dates, error: "too_few" };
  return { dates, error: null };
}

export function defaultRule(): RecurrenceRule {
  return { type: "weekly", interval: 1, weekdays: [], end_type: "count", count: 4 };
}

/** API'ye giden payload (bos/ilgisiz alanlar ayiklanir). */
export function toPayload(rule: RecurrenceRule, start: string): RecurrenceRule {
  const r = normalizeRule(rule, start);
  return {
    type: r.type,
    interval: r.interval,
    weekdays_only: r.type === "daily" ? !!r.weekdays_only : false,
    weekdays: r.type === "weekly" ? r.weekdays : [],
    monthly_mode: r.type === "monthly" ? r.monthly_mode : "day_of_month",
    day_of_month: r.type === "monthly" && r.monthly_mode === "day_of_month" ? r.day_of_month : null,
    week_of_month: r.type === "monthly" && r.monthly_mode === "nth_weekday" ? r.week_of_month : null,
    weekday: r.type === "monthly" && r.monthly_mode === "nth_weekday" ? r.weekday : null,
    end_type: r.end_type,
    count: r.end_type === "count" ? r.count : null,
    until: r.end_type === "until" ? r.until : null,
  };
}

export interface RecurrenceCopy {
  weekdaysShort: string[];
  weekdaysLong: string[];
  ordinals: string[]; // [1., 2., 3., 4., son]
  descDaily: (n: number) => string;
  descWeekdays: string;
  descWeekly: (n: number, days: string) => string;
  descMonthlyDay: (n: number, day: number) => string;
  descMonthlyNth: (n: number, ordinal: string, weekday: string) => string;
  descCount: (count: number) => string;
  descUntil: (date: string) => string;
}

function ordinalIndex(week: WeekOfMonth | null | undefined): number {
  return week === -1 ? 4 : Math.max(0, (week ?? 1) - 1);
}

/** "Her 2 haftada bir Pzt, Per · 10 tekrar" */
export function describeRule(rule: RecurrenceRule, copy: RecurrenceCopy, start?: string): string {
  const r = start ? normalizeRule(rule, start) : rule;
  const n = Math.max(1, r.interval || 1);
  let pattern: string;
  if (r.type === "daily") pattern = r.weekdays_only ? copy.descWeekdays : copy.descDaily(n);
  else if (r.type === "weekly")
    pattern = copy.descWeekly(
      n,
      [...(r.weekdays ?? [])].sort().map((d) => copy.weekdaysShort[d]).join(", "),
    );
  else if (r.monthly_mode === "nth_weekday")
    pattern = copy.descMonthlyNth(
      n,
      copy.ordinals[ordinalIndex(r.week_of_month)],
      copy.weekdaysLong[r.weekday ?? 0],
    );
  else pattern = copy.descMonthlyDay(n, r.day_of_month ?? 1);
  const end =
    r.end_type === "until" && r.until
      ? copy.descUntil(r.until.split("-").reverse().join("."))
      : copy.descCount(r.count ?? 0);
  return `${pattern} · ${end}`;
}

/** Mobil uygulama Turkce sabit metin kullanir (web: t.recurrence). */
export const RECURRENCE_COPY_TR: RecurrenceCopy = {
  weekdaysShort: ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"],
  weekdaysLong: ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"],
  ordinals: ["ilk", "ikinci", "üçüncü", "dördüncü", "son"],
  descDaily: (n) => (n === 1 ? "Her gün" : `Her ${n} günde bir`),
  descWeekdays: "Her iş günü",
  descWeekly: (n, days) =>
    `${n === 1 ? "Her hafta" : `Her ${n} haftada bir`}${days ? ` ${days}` : ""}`,
  descMonthlyDay: (n, day) => `${n === 1 ? "Her ay" : `Her ${n} ayda bir`}, ayın ${day}. günü`,
  descMonthlyNth: (n, ordinal, weekday) =>
    `${n === 1 ? "Her ay" : `Her ${n} ayda bir`}, ayın ${ordinal} ${weekday} günü`,
  descCount: (count) => `${count} tekrar`,
  descUntil: (date) => `${date} tarihine kadar`,
};

export const RECURRENCE_ERRORS_TR: Record<RecurrenceErrorCode, string> = {
  too_many: `En fazla ${MAX_OCCURRENCES} tekrar oluşturulabilir.`,
  too_long: "Bitiş tarihi başlangıçtan en fazla 1 yıl sonra olabilir.",
  too_few: "Seri en az 2 randevu içermeli.",
  invalid: "Tekrar ayarlarını kontrol edin.",
};
