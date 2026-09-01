"use client";

import { Languages } from "lucide-react";
import { useRouter } from "next/navigation";
import { useLocale, useT } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";

/**
 * Dil anahtarı — tema anahtarıyla aynı davranış: tıklandığı anda TR <-> EN
 * arasında geçer, menü yok. İki dil olduğu sürece açılır liste fazladan tık.
 *
 * Kısaltma (TR/EN) ikonun yanında yazılır: yalnızca ikon, hangi dilde
 * olduğunuzu söylemez.
 *
 * `router.refresh()` ŞART: hukuki ve pazarlama sayfaları sunucuda, dili
 * cookie'den okuyarak render edilir. Yalnızca istemci durumunu değiştirmek
 * o sayfalarda metni eski dilde bırakırdı.
 */
export function LanguageToggle({ className }: { className?: string }) {
  const router = useRouter();
  const { locale, setLocale } = useLocale();
  const t = useT();
  const next = locale === "tr" ? "en" : "tr";

  return (
    <button
      onClick={() => {
        setLocale(next);
        router.refresh();
      }}
      aria-label={t.language.switchTo}
      title={t.language.switchTo}
      className={cn(
        "flex h-9 items-center gap-1.5 rounded-lg px-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
        className,
      )}
    >
      <Languages className="h-[18px] w-[18px]" />
      <span className="text-xs font-semibold uppercase">{locale}</span>
    </button>
  );
}
