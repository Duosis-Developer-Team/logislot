/**
 * Dil secimi — tema ile ayni model: cookie + context, YONLENDIRME YOK.
 *
 * URL onegi (/en/...) yerine cookie secildi cunku portal izolasyonu
 * middleware'de yola gore karar veriyor; her route'a dil onegi eklemek o
 * mantigi ve tum ic linkleri elden gecirmeyi gerektirirdi. Bunun bedeli
 * landing page'in Google'da tek dil gorunmesidir (bilincli kabul).
 */

export const LOCALES = ["tr", "en"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "tr";

/** Cookie: sunucu da okuyabilsin diye (ilk render'da dil yanip sonmesin). */
export const LOCALE_COOKIE = "logislot.lang";

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

export function parseLocale(value: string | undefined | null): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

/** `Intl` API'lerine verilecek etiket. */
export const INTL_LOCALE: Record<Locale, string> = {
  tr: "tr-TR",
  en: "en-GB",
};
