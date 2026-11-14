"use client";

/**
 * Ek e-posta listesi girisi (cip). Musteri karari 2026-11: tedarikci kartina
 * 10'a kadar ek bildirim adresi yazilabilir.
 *
 * Enter / virgul / bosluk adresi ekler; yapistirilan liste bolunur. Bicim
 * burada da kontrol edilir (sunucu ayrica dogrular), hatali adres eklenmez.
 */

import { X } from "lucide-react";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { useT } from "@/lib/i18n/provider";

const SPLIT = /[,;\s]+/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function EmailListInput({
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
  const copy = t.admin.suppliers.additionalEmails;
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  function add(raw: string) {
    const next = [...value];
    let invalid: string | null = null;
    for (const part of raw.split(SPLIT)) {
      const email = part.trim();
      if (!email) continue;
      if (!EMAIL.test(email)) {
        invalid = email;
        continue;
      }
      if (next.some((v) => v.toLowerCase() === email.toLowerCase())) continue;
      if (next.length >= max) break;
      next.push(email);
    }
    onChange(next);
    setError(invalid ? copy.invalid(invalid) : null);
    setDraft(invalid ?? "");
  }

  return (
    <div className="flex flex-col gap-2">
      <Input
        id={id}
        type="email"
        value={draft}
        disabled={value.length >= max}
        placeholder={value.length >= max ? copy.limitReached(max) : copy.placeholder}
        onChange={(e) => {
          const text = e.target.value;
          if (SPLIT.test(text.trim()) || /[,;]$/.test(text)) add(text);
          else setDraft(text);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            add(draft);
          }
        }}
        onBlur={() => draft.trim() && add(draft)}
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((email) => (
            <span
              key={email}
              className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 py-0.5 pl-2.5 pr-1 text-xs text-primary"
            >
              {email}
              <button
                type="button"
                aria-label={copy.remove(email)}
                onClick={() => onChange(value.filter((v) => v !== email))}
                className="rounded-full p-0.5 hover:bg-primary/20"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <p className="text-xs text-muted-foreground">{copy.hint(max)}</p>
    </div>
  );
}
