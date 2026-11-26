"use client";

import { Repeat } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { useT } from "@/lib/i18n/provider";
import {
  MAX_OCCURRENCES,
  type RecurrenceResult,
  type RecurrenceRule,
  type WeekOfMonth,
  describeRule,
  generateOccurrenceDates,
  normalizeRule,
} from "@/lib/recurrence";
import { cn } from "@/lib/utils";

/** Secili kural icin onizleme sonucu (sayi, tarihler, hata). */
export function useRecurrencePreview(startDate: string, rule: RecurrenceRule): RecurrenceResult {
  return useMemo(() => generateOccurrenceDates(startDate, rule), [startDate, rule]);
}

function formatDay(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString("tr-TR", {
    weekday: "short",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function PreviewList({ result }: { result: RecurrenceResult }) {
  const t = useT();
  const c = t.recurrence;
  const errorText =
    result.error === "too_many"
      ? c.errorTooMany(MAX_OCCURRENCES)
      : result.error === "too_long"
        ? c.errorTooLong
        : result.error === "too_few"
          ? c.errorTooFew
          : result.error === "invalid"
            ? c.errorInvalid
            : null;
  return (
    <div className="rounded-lg border border-border bg-muted/40 px-3 py-2">
      {errorText ? (
        <p className="text-xs font-semibold text-destructive">{errorText}</p>
      ) : (
        <p className="mb-1 text-xs font-semibold">{c.previewTitle(result.dates.length)}</p>
      )}
      {!errorText && (
        <ul className="grid max-h-48 grid-cols-2 gap-x-4 gap-y-0.5 overflow-y-auto text-xs text-muted-foreground">
          {result.dates.map((d, i) => (
            <li key={d}>
              {i + 1}. {formatDay(d)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Radio({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: () => void;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-wrap items-center gap-2 text-sm">
      <input
        type="radio"
        checked={checked}
        onChange={onChange}
        className="h-4 w-4 accent-primary"
      />
      {children}
    </label>
  );
}

function NumberBox({
  value,
  onChange,
  min = 1,
  max = 99,
  disabled,
}: {
  value: number | null | undefined;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  disabled?: boolean;
}) {
  return (
    <Input
      type="number"
      min={min}
      max={max}
      disabled={disabled}
      value={value ?? ""}
      onChange={(e) => onChange(Math.max(min, Math.min(max, Number(e.target.value) || min)))}
      className="h-9 w-20"
    />
  );
}

/** Outlook'taki "Tekrarı ayarla" diyalogunun govdesi (desen + aralik + onizleme). */
function RecurrenceForm({
  startDate,
  rule,
  onChange,
}: {
  startDate: string;
  rule: RecurrenceRule;
  onChange: (r: RecurrenceRule) => void;
}) {
  const t = useT();
  const c = t.recurrence;
  const r = normalizeRule(rule, startDate);
  const result = useRecurrencePreview(startDate, rule);
  const set = (patch: Partial<RecurrenceRule>) => onChange({ ...r, ...patch });

  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold">{c.pattern}</h3>
        <div className="flex flex-col gap-4 sm:flex-row">
          <div className="flex gap-3 sm:w-32 sm:flex-col sm:border-r sm:border-border sm:pr-3">
            {(["daily", "weekly", "monthly"] as const).map((type) => (
              <Radio key={type} checked={r.type === type} onChange={() => set({ type })}>
                {c[type]}
              </Radio>
            ))}
          </div>
          <div className="flex flex-1 flex-col gap-3">
            {r.type === "daily" && (
              <>
                <Radio checked={!r.weekdays_only} onChange={() => set({ weekdays_only: false })}>
                  {c.everyNDays}
                  <NumberBox
                    value={r.interval}
                    disabled={r.weekdays_only}
                    onChange={(interval) => set({ interval })}
                  />
                  {c.daysUnit}
                </Radio>
                <Radio checked={!!r.weekdays_only} onChange={() => set({ weekdays_only: true })}>
                  {c.everyWeekday}
                </Radio>
              </>
            )}
            {r.type === "weekly" && (
              <>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  {c.every}
                  <NumberBox value={r.interval} onChange={(interval) => set({ interval })} />
                  {c.weeksUnit}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {c.weekdaysShort.map((label, day) => {
                    const on = (r.weekdays ?? []).includes(day);
                    return (
                      <button
                        key={label}
                        type="button"
                        aria-pressed={on}
                        onClick={() => {
                          const current = r.weekdays ?? [];
                          const next = on ? current.filter((d) => d !== day) : [...current, day];
                          if (next.length > 0) set({ weekdays: next.sort() });
                        }}
                        className={cn(
                          "h-9 min-w-11 rounded-lg border px-2 text-xs font-semibold transition-colors",
                          on
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-card text-muted-foreground hover:bg-muted",
                        )}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
            {r.type === "monthly" && (
              <>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  {c.every}
                  <NumberBox value={r.interval} onChange={(interval) => set({ interval })} />
                  {c.monthsUnit}
                </div>
                <Radio
                  checked={r.monthly_mode !== "nth_weekday"}
                  onChange={() => set({ monthly_mode: "day_of_month" })}
                >
                  {c.dayOfMonth}
                  <NumberBox
                    value={r.day_of_month}
                    max={31}
                    disabled={r.monthly_mode === "nth_weekday"}
                    onChange={(day_of_month) => set({ day_of_month })}
                  />
                  {c.dayOfMonthTail}
                </Radio>
                <Radio
                  checked={r.monthly_mode === "nth_weekday"}
                  onChange={() =>
                    onChange(normalizeRule({ ...r, monthly_mode: "nth_weekday" }, startDate))
                  }
                >
                  {c.nthWeekday}
                  <Select
                    className="h-9 w-28"
                    disabled={r.monthly_mode !== "nth_weekday"}
                    value={String(r.week_of_month ?? 1)}
                    onChange={(e) => set({ week_of_month: Number(e.target.value) as WeekOfMonth })}
                  >
                    {[1, 2, 3, 4, -1].map((w, i) => (
                      <option key={w} value={w}>
                        {c.ordinals[i]}
                      </option>
                    ))}
                  </Select>
                  <Select
                    className="h-9 w-32"
                    disabled={r.monthly_mode !== "nth_weekday"}
                    value={String(r.weekday ?? 0)}
                    onChange={(e) => set({ weekday: Number(e.target.value) })}
                  >
                    {c.weekdaysLong.map((label, day) => (
                      <option key={label} value={day}>
                        {label}
                      </option>
                    ))}
                  </Select>
                  {c.nthWeekdayTail}
                </Radio>
                <p className="text-[11px] text-muted-foreground">{c.monthEndNote}</p>
              </>
            )}
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-3 border-t border-border pt-4">
        <h3 className="text-sm font-semibold">{c.range}</h3>
        <div className="grid gap-3 sm:grid-cols-[8rem_1fr]">
          <div>
            <Label>{c.start}</Label>
            <Input value={startDate} readOnly disabled className="h-9" />
          </div>
          <div className="flex flex-col gap-2 sm:pt-5">
            <Radio checked={r.end_type === "count"} onChange={() => set({ end_type: "count" })}>
              {c.endAfter}
              <NumberBox
                value={r.count ?? 4}
                min={2}
                max={MAX_OCCURRENCES}
                disabled={r.end_type !== "count"}
                onChange={(count) => set({ count })}
              />
              {c.occurrencesUnit}
            </Radio>
            <Radio
              checked={r.end_type === "until"}
              onChange={() => set({ end_type: "until", until: r.until ?? result.dates.at(-1) ?? startDate })}
            >
              {c.endBy}
              <Input
                type="date"
                min={startDate}
                disabled={r.end_type !== "until"}
                value={r.until ?? ""}
                onChange={(e) => set({ until: e.target.value })}
                className="h-9 w-40"
              />
            </Radio>
          </div>
        </div>
      </section>

      <PreviewList result={result} />
    </div>
  );
}

/**
 * Tekrar ozeti + "Tekrari ayarla" modali. Yalnizca kural durumunu yonetir;
 * gonderim (toPayload) cagiran formdadir.
 */
export function RecurrenceEditor({
  startDate,
  value,
  onChange,
  children,
}: {
  startDate: string;
  value: RecurrenceRule;
  onChange: (rule: RecurrenceRule) => void;
  /** Onizlemenin altinda gosterilecek ek metin (orn. hep-ya-hic notu). */
  children?: React.ReactNode;
}) {
  const t = useT();
  const c = t.recurrence;
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<RecurrenceRule>(value);
  const result = useRecurrencePreview(startDate, value);
  const draftResult = useRecurrencePreview(startDate, draft);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2">
        <span className="flex items-center gap-2 text-sm font-medium">
          <Repeat className="h-4 w-4 text-primary" />
          {describeRule(value, c, startDate)}
        </span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => {
            setDraft(normalizeRule(value, startDate));
            setOpen(true);
          }}
        >
          {c.edit}
        </Button>
      </div>
      <PreviewList result={result} />
      {children}
      <Modal open={open} onClose={() => setOpen(false)} title={c.title} className="max-w-xl">
        <RecurrenceForm startDate={startDate} rule={draft} onChange={setDraft} />
        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
            {t.common.cancel}
          </Button>
          <Button
            type="button"
            disabled={draftResult.error !== null}
            onClick={() => {
              onChange(draft);
              setOpen(false);
            }}
          >
            {c.apply}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
