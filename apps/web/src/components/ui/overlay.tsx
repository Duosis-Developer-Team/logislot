"use client";

import { useEffect } from "react";

/**
 * Modal katmanı ortak davranışları (Drawer + Dialog).
 *
 * Görsel karar: overlay rengi eskiden `bg-foreground/40` idi — `--foreground`
 * mavimsi navy olduğu için açık temada sayfa "kirli mavi-gri" bir perdeye
 * dönüyordu (ölçüm: arka plan rgb(153,159,167)). Artık NÖTR slate ve daha
 * hafif: açık temada %28, koyu temada %60 (koyu zeminde ayrışma için).
 * Blur da 4px'ten 2px'e indirildi; panel gölgesi ayrımı zaten sağlıyor.
 */
// DIKKAT: opaklik degeri Tailwind skalasinda OLMALI (…/25, /30). Skala disi bir
// deger (or. /28) sessizce HIC kural uretmez ve perde tamamen seffaf kalir.
export const OVERLAY_CLASS =
  "fixed inset-0 z-50 bg-slate-900/25 backdrop-blur-[2px] dark:bg-slate-950/60 animate-fade-in";

/** ESC ile kapatma + açıkken arka plan kaydırmasını kilitleme. */
export function useModalBehavior(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);

    // Scroll kilidi: kaydırma çubuğu kaybolunca içerik zıplamasın diye
    // genişlik farkı padding ile telafi edilir.
    const { body } = document;
    const prevOverflow = body.style.overflow;
    const prevPadding = body.style.paddingRight;
    const scrollbar = window.innerWidth - document.documentElement.clientWidth;
    body.style.overflow = "hidden";
    if (scrollbar > 0) body.style.paddingRight = `${scrollbar}px`;

    return () => {
      document.removeEventListener("keydown", onKey);
      body.style.overflow = prevOverflow;
      body.style.paddingRight = prevPadding;
    };
  }, [open, onClose]);
}
