"use client";

/**
 * Tedarikci iptal penceresi — tekil randevu ve seri iptalinin ORTAK formu.
 *
 * Hangi alanin zorunlu oldugunu tesisin iptal kurali belirler
 * (`profile.cancellation_policy`); kural sunucuda da zorlanir, buradaki
 * kontroller yalnizca kullaniciyi erken uyarir.
 *
 * 2026-11 toplantisi: sebep FIRMANIN listesinden secilir (aciklama sebep
 * bazinda zorunlu olabilir) ve telafi zorunluysa iptal, telafi randevusunun
 * gun/saati secilmeden gonderilemez — ikisi sunucuda tek islemde yapilir.
 * Kural kapali tesiste tekil iptal eski sade onay olarak kalir; seri iptali
 * eski serbest metin sebebini ister (`legacyReason`, Sprint 12 karari).
 */

import { CalendarClock } from "lucide-react";
import { useState } from "react";
import { CARGO_WINDOWS, type CargoWindow } from "@logislot/shared";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";
import { useSupplierAvailability, type SupplierCancelBody } from "@/lib/api/supplier";
import type {
  AppointmentDto,
  CancellationReasonOptionDto,
  SupplierCancellationPolicyDto,
} from "@/lib/api/types";
import { useLabels } from "@/lib/i18n/labels";
import { useT } from "@/lib/i18n/provider";
import { cn, timeInTz } from "@/lib/utils";

const NOTE_MIN_LENGTH = 3;
const MAKEUP_MAX_DAYS = 180;

/** Tarayicinin yerel gunu "YYYY-MM-DD" olarak (date input min/max icin). */
function localIsoDate(offsetDays = 0): string {
  const day = new Date();
  day.setDate(day.getDate() + offsetDays);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`;
}

interface SupplierCancelFormProps {
  onClose: () => void;
  intro: React.ReactNode;
  policy: SupplierCancellationPolicyDto | undefined;
  reasons: CancellationReasonOptionDto[];
  /** Telafi icin iptal edilen randevu (tekil iptal). Seri iptalinde verilmez. */
  appointment?: AppointmentDto;
  timezone?: string;
  /** Kural sebep istemese de serbest metin sebep zorunluysa (seri iptali). */
  legacyReason?: { label: string; placeholder: string; minError: string };
  confirmLabel: string;
  pending: boolean;
  error: string | null;
  onSubmit: (body: SupplierCancelBody) => void;
}

export function SupplierCancelDialog({
  open,
  title,
  ...form
}: SupplierCancelFormProps & { open: boolean; title: string }) {
  // Form yalnizca acikken mount edilir: her acilista temiz durumla dogar,
  // onceki randevunun secimi tasinmaz.
  return (
    <Dialog open={open} onClose={form.onClose} title={title} className="max-w-xl">
      <SupplierCancelForm {...form} />
    </Dialog>
  );
}

function SupplierCancelForm({
  onClose,
  intro,
  policy,
  reasons,
  appointment,
  timezone = "Europe/Istanbul",
  legacyReason,
  confirmLabel,
  pending,
  error,
  onSubmit,
}: SupplierCancelFormProps) {
  const t = useT();
  const copy = t.components.supplierCancelDialog;
  const [reasonId, setReasonId] = useState("");
  const [note, setNote] = useState("");
  const [makeupDate, setMakeupDate] = useState("");
  const [makeupStart, setMakeupStart] = useState<string | null>(null);
  const [makeupWindow, setMakeupWindow] = useState<CargoWindow | null>(
    (appointment?.cargo_window as CargoWindow | null) ?? null,
  );
  const [localError, setLocalError] = useState<string | null>(null);

  const showPicker = (policy?.require_reason ?? false) && reasons.length > 0;
  const showMakeup = (policy?.require_makeup ?? false) && appointment !== undefined;
  const showLegacy = !showPicker && legacyReason !== undefined;
  const selectedReason = reasons.find((r) => r.id === reasonId);
  const noteRequired = selectedReason?.note_required ?? false;
  const isCargo = appointment?.delivery_type === "cargo";

  function submit() {
    const trimmed = note.trim();
    if (showPicker && !reasonId) return setLocalError(copy.reasonRequired);
    if (showPicker && noteRequired && trimmed.length < NOTE_MIN_LENGTH)
      return setLocalError(copy.noteRequired);
    if (showLegacy && trimmed.length < NOTE_MIN_LENGTH)
      return setLocalError(legacyReason!.minError);
    if (showMakeup && (!makeupDate || (isCargo ? !makeupWindow : !makeupStart)))
      return setLocalError(copy.makeupRequired);
    setLocalError(null);
    onSubmit({
      ...(showPicker ? { reason_id: reasonId } : {}),
      ...(trimmed ? { reason: trimmed } : {}),
      ...(showMakeup
        ? {
            makeup: isCargo
              ? { target_date: makeupDate, cargo_window: makeupWindow! }
              : { target_date: makeupDate, start_at: makeupStart! },
          }
        : {}),
    });
  }

  const message = localError ?? error;

  return (
    <div className="flex flex-col gap-4">
      <div className="text-sm text-muted-foreground">{intro}</div>

      {showPicker && (
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium text-foreground">
            {copy.reasonLabel}{" "}
            <span className="text-xs font-normal text-muted-foreground">({copy.required})</span>
          </legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {reasons.map((reason) => (
              <label
                key={reason.id}
                className={cn(
                  "flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2.5 text-sm transition-colors",
                  reasonId === reason.id
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border hover:bg-muted",
                )}
              >
                <input
                  type="radio"
                  name="supplier-cancel-reason"
                  value={reason.id}
                  checked={reasonId === reason.id}
                  onChange={() => setReasonId(reason.id)}
                  className="h-4 w-4 accent-primary"
                />
                {reason.label}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {showPicker && (
        <div>
          <Label htmlFor="supplier-cancel-note">
            {noteRequired ? copy.noteLabelRequired : copy.noteLabelOptional}
          </Label>
          <textarea
            id="supplier-cancel-note"
            value={note}
            maxLength={500}
            rows={2}
            onChange={(e) => setNote(e.target.value)}
            placeholder={copy.notePlaceholder}
            className="w-full rounded-lg border border-border bg-card px-3.5 py-2.5 text-sm shadow-soft placeholder:text-muted-foreground/70 focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/25"
          />
        </div>
      )}

      {showLegacy && (
        <div>
          <Label htmlFor="supplier-cancel-legacy">{legacyReason!.label}</Label>
          <Input
            id="supplier-cancel-legacy"
            value={note}
            maxLength={500}
            onChange={(e) => setNote(e.target.value)}
            placeholder={legacyReason!.placeholder}
          />
        </div>
      )}

      {showMakeup && (
        <MakeupPicker
          appointment={appointment!}
          timezone={timezone}
          date={makeupDate}
          start={makeupStart}
          window={makeupWindow}
          onDate={(value) => {
            setMakeupDate(value);
            setMakeupStart(null);
          }}
          onStart={setMakeupStart}
          onWindow={setMakeupWindow}
        />
      )}

      {message && <p className="text-sm text-destructive">{message}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          {t.common.cancel}
        </Button>
        <Button variant="destructive" disabled={pending} onClick={submit}>
          {confirmLabel}
        </Button>
      </div>
    </div>
  );
}

/** Telafi randevusunun gun + saat (kargoda pencere) secimi; gercek musaitlikle. */
function MakeupPicker({
  appointment,
  timezone,
  date,
  start,
  window,
  onDate,
  onStart,
  onWindow,
}: {
  appointment: AppointmentDto;
  timezone: string;
  date: string;
  start: string | null;
  window: CargoWindow | null;
  onDate: (value: string) => void;
  onStart: (value: string) => void;
  onWindow: (value: CargoWindow) => void;
}) {
  const t = useT();
  const copy = t.components.supplierCancelDialog;
  const labels = useLabels();
  const isCargo = appointment.delivery_type === "cargo";
  const slots = useSupplierAvailability(
    date && !isCargo
      ? {
          product_category_id: appointment.product_category_id,
          vehicle_category_id: appointment.vehicle_category_id,
          target_date: date,
          duration_minutes: appointment.duration_minutes,
        }
      : null,
  );
  const open = (slots.data ?? []).filter(
    (slot) => slot.status !== "full" && new Date(slot.start).getTime() > Date.now(),
  );

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-primary/30 bg-primary/5 p-3.5">
      <div>
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <CalendarClock className="h-4 w-4 text-primary" />
          {copy.makeupTitle}{" "}
          <span className="text-xs font-normal text-muted-foreground">({copy.required})</span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{copy.makeupHint}</p>
      </div>
      <div>
        <Label htmlFor="makeup-date">{copy.makeupDate}</Label>
        <Input
          id="makeup-date"
          type="date"
          min={localIsoDate()}
          max={localIsoDate(MAKEUP_MAX_DAYS)}
          value={date}
          onChange={(e) => onDate(e.target.value)}
          className="sm:w-56"
        />
      </div>
      {date && isCargo && (
        <div>
          <Label>{copy.makeupWindow}</Label>
          <div className="flex flex-wrap gap-2">
            {CARGO_WINDOWS.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => onWindow(value)}
                className={cn(
                  "rounded-lg border px-3 py-1.5 text-sm transition-colors",
                  window === value
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card hover:bg-muted",
                )}
              >
                {labels.cargoWindow[value]}
              </button>
            ))}
          </div>
        </div>
      )}
      {date && !isCargo && (
        <div>
          <Label>{copy.makeupTime}</Label>
          {slots.isLoading ? (
            <p className="text-xs text-muted-foreground">{t.common.loading}</p>
          ) : open.length === 0 ? (
            <p className="text-xs text-muted-foreground">{copy.makeupNoSlots}</p>
          ) : (
            <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6">
              {open.map((slot) => (
                <button
                  key={slot.start}
                  type="button"
                  onClick={() => onStart(slot.start)}
                  className={cn(
                    "rounded-lg border px-2 py-1.5 text-sm tabular-nums transition-colors",
                    start === slot.start
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card hover:bg-muted",
                  )}
                >
                  {timeInTz(slot.start, timezone)}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
