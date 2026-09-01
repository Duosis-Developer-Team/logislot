import { cookies } from "next/headers";
import { en } from "@/lib/i18n/dictionaries/en";
import { tr } from "@/lib/i18n/dictionaries/tr";
import { LOCALE_COOKIE, parseLocale, type Locale } from "@/lib/i18n/locale";
import type { Dictionary } from "@/lib/i18n/dictionaries/tr";

const DICTIONARIES = { tr, en } as const;

/**
 * Sunucu bilesenleri icin sozluk.
 *
 * `useT()` bir hook'tur ve yalnizca istemci bileseninde calisir; pazarlama ve
 * hukuki sayfalar sunucuda render edilir. Dil COOKIE'den okunur — istemcide
 * secilseydi sayfa once Turkce boyanir, sonra degisirdi.
 */
export async function getDictionary(): Promise<{ locale: Locale; t: Dictionary }> {
  const locale = parseLocale((await cookies()).get(LOCALE_COOKIE)?.value);
  return { locale, t: DICTIONARIES[locale] };
}
