import type { Dictionary } from "@/lib/i18n/dictionaries/tr";

/**
 * E-posta log alanlarinin okunabilir etiketleri — ham kod isimleri
 * (appointment_approved, log_only, sent…) yerine kullanilir.
 *
 * Etiketler SOZLUKTEN gelir; burada yalnizca "sozlukte yoksa ne yapilacagi"
 * karari var: bilinmeyen bir kod ekrani bos birakmasin diye insan okunur hale
 * getirilir.
 */

function humanize(key: string): string {
  return key
    .replace(/[_.]+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function emailTemplateLabel(t: Dictionary, key: string): string {
  return (t.misc.email.templates as Record<string, string>)[key] ?? humanize(key);
}

export function emailStatusLabel(t: Dictionary, status: string): string {
  return (t.misc.email.status as Record<string, string>)[status] ?? humanize(status);
}

export function emailProviderLabel(t: Dictionary, provider: string): string {
  return (t.misc.email.mode as Record<string, string>)[provider] ?? humanize(provider);
}
