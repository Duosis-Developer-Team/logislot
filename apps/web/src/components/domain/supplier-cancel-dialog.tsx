"use client";

/**
 * Tedarikci iptal penceresi — tekil randevu ve seri iptalinin ORTAK formu.
 *
 * Hangi alanin zorunlu oldugunu tesisin iptal kurali belirler
 * (`profile.cancellation_policy`, musteri talebi 2026-10); kural sunucuda da
 * zorlanir, buradaki kontroller yalnizca kullaniciyi erken uyarir. Kural
 * kapali tesiste tekil iptal eski sade onay olarak kalir; seri iptali eski
 * serbest metin sebebini ister (`legacyReason`, Sprint 12 karari).
 */

import { useState } from "react";
import { SUPPLIER_CANCELLATION_REASONS } from "@logislot/shared";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";
import type { SupplierCancelBody } from "@/lib/api/supplier";
import type { SupplierCancellationPolicyDto } from "@/lib/api/types";
import { useLabels } from "@/lib/i18n/labels";
import { useT } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";

const NOTE_MIN_LENGTH = 3;
const MAX_ALTERNATIVE_DAYS = 365;

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
    <Dialog open={open} onClose={form.onClose} title={title}>
      <SupplierCancelForm {...form} />
    </Dialog>
  );
}

function SupplierCancelForm({
  onClose,
  intro,
  policy,
  legacyReason,
  confirmLabel,
  pending,
  error,
  onSubmit,
}: SupplierCancelFormProps) {
  const t = useT();
  const copy = t.components.supplierCancelDialog;
  const labels = useLabels();
  const [reasonCode, setReasonCode] = useState("");
  const [note, setNote] = useState("");
  const [alternativeDate, setAlternativeDate] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const showPicker = policy?.require_reason ?? false;
  const showDate = policy?.require_alternative_date ?? false;
  const showLegacy = !showPicker && legacyReason !== undefined;
  const minDate = localIsoDate();
  const maxDate = localIsoDate(MAX_ALTERNATIVE_DAYS);

  function submit() {
    const trimmed = note.trim();
    if (showPicker && !reasonCode) return setLocalError(copy.reasonRequired);
    if (showPicker && reasonCode === "other" && trimmed.length < NOTE_MIN_LENGTH)
      return setLocalError(copy.noteRequired);
    if (showLegacy && trimmed.length < NOTE_MIN_LENGTH)
      return setLocalError(legacyReason!.minError);
    if (showDate && !alternativeDate) return setLocalError(copy.alternativeDateRequired);
    if (alternativeDate && (alternativeDate < minDate || alternativeDate > maxDate))
      return setLocalError(copy.alternativeDateInvalid);
    setLocalError(null);
    onSubmit({
      ...(showPicker ? { reason_code: reasonCode } : {}),
      ...(trimmed ? { reason: trimmed } : {}),
      ...(showDate ? { alternative_date: alternativeDate } : {}),
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
            {SUPPLIER_CANCELLATION_REASONS.map((code) => (
              <label
                key={code}
                className={cn(
                  "flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2.5 text-sm transition-colors",
                  reasonCode === code
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border hover:bg-muted",
                )}
              >
                <input
                  type="radio"
                  name="supplier-cancel-reason"
                  value={code}
                  checked={reasonCode === code}
                  onChange={() => setReasonCode(code)}
                  className="h-4 w-4 accent-primary"
                />
                {labels.supplierCancellationReason[code]}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {showPicker && (
        <div>
          <Label htmlFor="supplier-cancel-note">
            {reasonCode === "other" ? copy.noteLabelRequired : copy.noteLabelOptional}
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

      {showDate && (
        <div>
          <Label htmlFor="supplier-cancel-date">
            {copy.alternativeDateLabel}{" "}
            <span className="text-xs font-normal text-muted-foreground">({copy.required})</span>
          </Label>
          <Input
            id="supplier-cancel-date"
            type="date"
            min={minDate}
            max={maxDate}
            value={alternativeDate}
            onChange={(e) => setAlternativeDate(e.target.value)}
          />
          <p className="mt-1 text-xs text-muted-foreground">{copy.alternativeDateHint}</p>
        </div>
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
