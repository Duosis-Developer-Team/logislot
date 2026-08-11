"use client";

import { Cookie } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

/**
 * Çerez/yerel depolama bilgilendirme banner'ı (KVKK rehberi, kontrol listesi).
 *
 * LogiSlot bugün YALNIZCA hizmetin çalışması için zorunlu depolama kullanır
 * (oturum token'ları, tema tercihi); analitik/pazarlama çerezi YOKTUR.
 * Zorunlu çerezler için açık rıza gerekmez — bu nedenle banner "kabul/reddet"
 * ikilisi değil, şeffaf bir BİLGİLENDİRME + politika linkidir. İleride
 * analitik/pazarlama eklenirse ayrı, önceden işaretlenmemiş rıza akışına
 * genişletilmelidir (bkz. docs + /cerez-politikasi).
 */

const STORAGE_KEY = "logislot.cookie_notice_ack";

export function CookieNotice() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (!window.localStorage.getItem(STORAGE_KEY)) setVisible(true);
    } catch {
      // Depolama erişilemiyorsa (gizli mod vb.) banner'ı gösterme.
    }
  }, []);

  function acknowledge() {
    try {
      window.localStorage.setItem(STORAGE_KEY, new Date().toISOString());
    } catch {
      // yut — kullanıcı kapattı, oturum boyunca gizle
    }
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div
      role="region"
      aria-label="Çerez bilgilendirmesi"
      // Sarmalayıcı tıklamaları YUTMAZ; yalnızca kartın kendisi etkileşimlidir
      // (altta kalan sayfa butonları banner varken de tıklanabilir kalır).
      // z-40: modal perdesi (z-50) DAİMA bu bandın üstünde kalmalı — aksi halde
      // banner açık modalın üzerine binip "arkada tuhaf katman" izlenimi verir.
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 p-3 sm:p-4"
    >
      <div className="pointer-events-auto mx-auto flex max-w-3xl flex-col gap-3 rounded-2xl border border-border bg-card/95 p-4 shadow-card-hover backdrop-blur-xl sm:flex-row sm:items-center sm:gap-4">
        <Cookie className="hidden h-5 w-5 shrink-0 text-primary sm:block" />
        <p className="flex-1 text-xs leading-relaxed text-muted-foreground sm:text-[13px]">
          Bu sitede yalnızca hizmetin çalışması için <strong>zorunlu</strong>{" "}
          çerezler ve yerel depolama kullanılır (oturum ve tema tercihi).
          Analitik veya pazarlama çerezi kullanılmaz. Ayrıntılar için{" "}
          <Link
            href="/cerez-politikasi"
            className="font-medium text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground"
          >
            Çerez Politikası
          </Link>
          &apos;na bakabilirsiniz.
        </p>
        <button
          type="button"
          onClick={acknowledge}
          className="shrink-0 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90"
        >
          Anladım
        </button>
      </div>
    </div>
  );
}
