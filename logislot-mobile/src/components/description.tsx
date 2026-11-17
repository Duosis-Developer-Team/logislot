/**
 * Randevu açıklaması — web components/domain/description-input.tsx karşılığı.
 * Müşteri kararı 2026-11: aynı sevkiyatta birden fazla ürün olduğu için serbest
 * metin. Ürün adı alanı aynen kalır. Görünürlüğü tesisin randevu formu ayarı
 * belirler; sunucu da zorlar.
 */

import type { FormFieldMode } from "@/api/types";
import { Field } from "@/components/ui";

export const DESCRIPTION_MAX_LENGTH = 1000;

/** Zorunlu modda boş açıklama geçersizdir (sunucu da reddeder). */
export function descriptionMissing(mode: FormFieldMode, value: string): boolean {
  return mode === "required" && value.trim().length === 0;
}

/** Gönderilecek değer: gizliyse null, boş metin null. */
export function descriptionPayload(mode: FormFieldMode, value: string): string | null {
  return mode === "hidden" ? null : value.trim() || null;
}

export function DescriptionField({
  mode,
  value,
  onChange,
  maxLength = DESCRIPTION_MAX_LENGTH,
}: {
  mode: FormFieldMode;
  value: string;
  onChange: (next: string) => void;
  maxLength?: number;
}) {
  if (mode === "hidden") return null;
  return (
    <Field
      label={`Açıklama ${mode === "required" ? "(zorunlu)" : "(isteğe bağlı)"}`}
      value={value}
      onChangeText={onChange}
      placeholder="Sevkiyattaki ürünler, notlar…"
      multiline
      maxLength={maxLength}
      textAlignVertical="top"
      style={{ height: 96, paddingTop: 12, paddingBottom: 12 }}
    />
  );
}
