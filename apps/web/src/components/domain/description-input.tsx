"use client";

/**
 * Randevu aciklamasi (musteri karari 2026-11): ayni sevkiyatta birden fazla
 * urun geldigi icin serbest metin. Urun adi alani aynen kalir. Gorunurlugu
 * tesisin randevu formu ayari belirler (gizli / istege bagli / zorunlu);
 * sunucu da zorlar. Tedarikci sihirbazi ve yonetim adina olusturma ayni alani
 * kullanir.
 */

import { Label } from "@/components/ui/input";
import type { FormFieldMode } from "@/lib/api/types";
import { useT } from "@/lib/i18n/provider";

export const DESCRIPTION_MAX_LENGTH = 1000;

/** Zorunlu modda bos aciklama gecersizdir (sunucu da reddeder). */
export function descriptionMissing(mode: FormFieldMode, value: string): boolean {
  return mode === "required" && value.trim().length === 0;
}

/** Gonderilecek deger: gizliyse null, bos metin null. */
export function descriptionPayload(mode: FormFieldMode, value: string): string | null {
  return mode === "hidden" ? null : value.trim() || null;
}

export function DescriptionField({
  id,
  mode,
  value,
  onChange,
  maxLength = DESCRIPTION_MAX_LENGTH,
}: {
  id: string;
  mode: FormFieldMode;
  value: string;
  onChange: (value: string) => void;
  maxLength?: number;
}) {
  const t = useT();
  const copy = t.appointmentDescription;
  if (mode === "hidden") return null;
  return (
    <div>
      <Label htmlFor={id}>
        {copy.label}{" "}
        <span className="text-xs font-normal text-muted-foreground">
          ({mode === "required" ? copy.required : copy.optional})
        </span>
      </Label>
      <textarea
        id={id}
        value={value}
        maxLength={maxLength}
        rows={3}
        onChange={(e) => onChange(e.target.value)}
        placeholder={copy.placeholder}
        className="w-full resize-y rounded-lg border border-border bg-card px-3.5 py-2.5 text-sm shadow-soft placeholder:text-muted-foreground/70 focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/25"
      />
    </div>
  );
}
