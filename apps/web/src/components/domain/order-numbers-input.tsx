"use client";

/**
 * Siparis numarasi girisi (cip listesi). Musteri karari 2026-11: bir
 * sevkiyatta birden fazla siparis olabilir.
 *
 * Enter, virgul veya noktali virgul numarayi ekler; yapistirilan liste
 * ("4500123, 4500124") otomatik bolunur. Sunucu da ayni normalizasyonu yapar
 * (kirpma, tekrar atma, sinirlar); burada yalnizca kullanici erken gorur.
 */

import { X } from "lucide-react";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { useT } from "@/lib/i18n/provider";

const SPLIT = /[,;\n\r\t]+/;
const MAX_LENGTH = 64;

export function OrderNumbersInput({
  value,
  onChange,
  max,
  id,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  max: number;
  id?: string;
}) {
  const t = useT();
  const copy = t.orderNumbers;
  const [draft, setDraft] = useState("");

  function add(raw: string) {
    const next = [...value];
    for (const part of raw.split(SPLIT)) {
      const item = part.trim().slice(0, MAX_LENGTH);
      if (!item) continue;
      if (next.some((v) => v.toLocaleLowerCase("tr-TR") === item.toLocaleLowerCase("tr-TR")))
        continue;
      if (next.length >= max) break;
      next.push(item);
    }
    onChange(next);
    setDraft("");
  }

  return (
    <div className="flex flex-col gap-2">
      <Input
        id={id}
        value={draft}
        maxLength={MAX_LENGTH * 4}
        disabled={value.length >= max}
        placeholder={value.length >= max ? copy.limitReached(max) : copy.placeholder}
        onChange={(e) => {
          const text = e.target.value;
          // Virgulle yazilan/yapistirilan liste aninda cipe donusur.
          if (SPLIT.test(text)) add(text);
          else setDraft(text);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            add(draft);
          } else if (e.key === "Backspace" && !draft && value.length > 0) {
            onChange(value.slice(0, -1));
          }
        }}
        onBlur={() => draft.trim() && add(draft)}
      />
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((item) => (
            <span
              key={item}
              className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 py-0.5 pl-2.5 pr-1 font-mono text-xs text-primary"
            >
              {item}
              <button
                type="button"
                aria-label={copy.remove(item)}
                onClick={() => onChange(value.filter((v) => v !== item))}
                className="rounded-full p-0.5 hover:bg-primary/20"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <p className="text-xs text-muted-foreground">{copy.hint}</p>
    </div>
  );
}

/** Liste/kart icin kisa gosterim: "Sipariş: 4500123, 4500124". */
export function OrderNumbersText({ value, className }: { value?: string[]; className?: string }) {
  const t = useT();
  if (!value || value.length === 0) return null;
  return (
    <span className={className}>
      {t.orderNumbers.short}: <span className="font-mono">{value.join(", ")}</span>
    </span>
  );
}
