"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { DEFAULT_LOCALE, INTL_LOCALE, LOCALE_COOKIE, type Locale } from "@/lib/i18n/locale";
import { en } from "@/lib/i18n/dictionaries/en";
import { tr } from "@/lib/i18n/dictionaries/tr";

/** Sozluk NESNE olarak kullanilir: `t.admin.appointments.title`.
 *
 * Dize anahtar ("admin.appointments.title") yerine dogrudan nesne erisimi
 * secildi: eksik/yanlis anahtar DERLEMEDE yakalanir, calisma aninda degil.
 * `en` sozlugu `typeof tr` olarak tiplendigi icin bir anahtar unutulursa
 * TypeScript hata verir. */
const DICTIONARIES = { tr, en } as const;

export type Dictionary = typeof tr;

interface I18nValue {
  locale: Locale;
  t: Dictionary;
  setLocale: (next: Locale) => void;
}

const I18nContext = createContext<I18nValue | null>(null);

/** Cookie'yi yazar. Sunucu ilk render'da okur, boylece dil yanip sonmez. */
function persist(locale: Locale) {
  // 1 yil; portal alt alanlari ayni cookie'yi paylassin diye path=/.
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=31536000; samesite=lax`;
}

export function I18nProvider({
  initialLocale,
  children,
}: {
  initialLocale: Locale;
  children: React.ReactNode;
}) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);

  const setLocale = useCallback((next: Locale) => {
    persist(next);
    setLocaleState(next);
    // `<html lang>` ekran okuyucu ve tarayici ceviri ipucu icin guncellenir.
    document.documentElement.lang = next;
  }, []);

  const value = useMemo<I18nValue>(
    () => ({ locale, t: DICTIONARIES[locale], setLocale }),
    [locale, setLocale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

function useI18n(): I18nValue {
  const context = useContext(I18nContext);
  if (context === null) {
    // Saglayici yoksa cokmek yerine varsayilan dil ile devam et: tek bir
    // eksik saglayici tum ekrani karartmasin.
    return { locale: DEFAULT_LOCALE, t: DICTIONARIES[DEFAULT_LOCALE], setLocale: () => {} };
  }
  return context;
}

/** Metinler: `const t = useT();` -> `t.common.save` */
export function useT(): Dictionary {
  return useI18n().t;
}

export function useLocale(): { locale: Locale; setLocale: (next: Locale) => void } {
  const { locale, setLocale } = useI18n();
  return { locale, setLocale };
}

/** Tarih/saat/sayi bicimleyicileri — secili dile bagli.
 *
 * `lib/utils.ts` icindeki surumler "tr-TR" sabitiydi; Ingilizce'de tarihler
 * yine Turkce bicimde cikardi. */
export function useFormat() {
  const { locale } = useI18n();
  const tag = INTL_LOCALE[locale];
  return useMemo(
    () => ({
      dateTime: (iso: string) =>
        new Date(iso).toLocaleString(tag, {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }),
      date: (iso: string) =>
        new Date(iso).toLocaleDateString(tag, {
          day: "2-digit",
          month: "long",
          year: "numeric",
        }),
      time: (iso: string) =>
        new Date(iso).toLocaleTimeString(tag, { hour: "2-digit", minute: "2-digit" }),
      number: (value: number) => new Intl.NumberFormat(tag).format(value),
      tag,
    }),
    [tag],
  );
}
