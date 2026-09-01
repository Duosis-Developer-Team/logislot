"use client";

import { authApi } from "@/lib/api/client";

/**
 * Oturumu tenant'a ozel (markali) alan adina devreder.
 *
 * Oturum `localStorage`'da ve ORIGIN'e baglidir; duz bir yonlendirme
 * kullaniciyi login ekranina geri dusururdu. Bunun yerine kisa omurlu, tek
 * kullanimlik bir kod alinir ve hedef alan adi onu token ile takas eder.
 * Token hicbir zaman URL'e konmaz.
 *
 * Hedef alan adini ISTEMCI SECMEZ: sunucu tenant kaydindan okur ve yanitinda
 * doner. Boylece saldirgan kendi kontrolundeki bir adrese gecerli kod
 * cikartamaz.
 *
 * Devir basarisiz olursa `false` doner ve cagiran BULUNDUGU alan adinda
 * devam eder — markali URL kozmetiktir, ugruna girisi bozmayiz.
 */
export async function handOffToBrandedHost(target: string): Promise<boolean> {
  try {
    const { code, host } = await authApi.issueHandoff();
    if (!host || host === window.location.host) return false;
    window.location.replace(
      `https://${host}/handoff?code=${encodeURIComponent(code)}&next=${encodeURIComponent(target)}`,
    );
    return true;
  } catch {
    // Markali alan adi tanimli degilse sunucu 400 doner; bu bir hata degil.
    return false;
  }
}
