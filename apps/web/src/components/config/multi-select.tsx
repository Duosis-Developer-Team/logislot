"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface Option {
  value: string;
  label: string;
}

interface MultiSelectChipsProps {
  options: Option[];
  value: string[];
  onChange: (value: string[]) => void;
  emptyHint?: string;
}

/** Cip tabanli coklu secim — rampa uyumluluklari ve tetik kosullari icin. */
export function MultiSelectChips({ options, value, onChange, emptyHint }: MultiSelectChipsProps) {
  function toggle(v: string) {
    onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  }
  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {options.map((option) => {
          const selected = value.includes(option.value);
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => toggle(option.value)}
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                selected
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-card text-muted-foreground hover:border-primary/40",
              )}
            >
              {selected && <Check className="h-3 w-3" />}
              {option.label}
            </button>
          );
        })}
        {options.length === 0 && (
          <span className="text-xs text-muted-foreground">Seçenek yok</span>
        )}
      </div>
      {emptyHint && value.length === 0 && (
        <p className="mt-1.5 text-xs text-accent-foreground/80 bg-accent/10 rounded-md px-2 py-1 inline-block">
          {emptyHint}
        </p>
      )}
    </div>
  );
}
