"use client";

import { ApiError } from "@/lib/api/client";
import { useT } from "@/lib/i18n/provider";

/**
 * API hatasini secili dilde metne cevirir.
 *
 * Backend her hatada STABIL bir kod dondurur (`DUPLICATE_EMAIL`, ...), mesaj
 * ise Turkcedir. Ceviri koda gore burada yapilir; boylece sunucuda kullanici
 * dili tutmak, `Accept-Language` islemek veya her `raise` noktasina dokunmak
 * gerekmez.
 *
 * Bilinmeyen kod icin SUNUCUNUN mesaji gosterilir: yeni bir hata kodu
 * eklendiginde kullanici bos ekran yerine (Turkce de olsa) aciklama gorur.
 */
export function useApiErrorMessage() {
  const t = useT();
  return (error: unknown, fallback?: string): string => {
    if (error instanceof ApiError) {
      return t.errors.byCode[error.code] ?? error.message ?? fallback ?? t.errors.unexpected;
    }
    if (error instanceof Error && error.message) return error.message;
    return fallback ?? t.errors.unexpected;
  };
}
