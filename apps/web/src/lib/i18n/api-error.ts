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
      const detailed = detailedMessage(t, error);
      if (detailed) return detailed;
      return t.errors.byCode[error.code] ?? error.message ?? fallback ?? t.errors.unexpected;
    }
    if (error instanceof Error && error.message) return error.message;
    return fallback ?? t.errors.unexpected;
  };
}

type Dict = ReturnType<typeof useT>;

/** Ayrinti tasiyan hatalar: kodun genel metni yerine sayilarla aciklama. */
function detailedMessage(t: Dict, error: ApiError): string | null {
  if (error.code === "SUPPLIER_MINUTE_LIMIT_EXCEEDED") {
    const d = error.details as
      | { dimension?: string; limit?: number; used?: number; requested?: number }
      | undefined;
    if (d?.dimension && d.limit != null && d.used != null && d.requested != null) {
      const fmt = (m: number) => t.minuteLimits.duration(Math.floor(m / 60), m % 60);
      return t.minuteLimits.errorDetail(
        t.minuteLimits.dimensions[d.dimension] ?? d.dimension,
        fmt(d.limit),
        fmt(d.used),
        fmt(d.requested),
      );
    }
  }
  return null;
}
