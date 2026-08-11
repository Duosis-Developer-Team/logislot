"use client";

import { cn } from "@/lib/utils";

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
}

/**
 * Anahtar (toggle). Etiket SOLDA, kontrol SAĞDA (iOS ayar satırı deseni) —
 * etiket ile kontrol ayrı flex öğeleridir, üst üste binmez.
 */
export function Switch({ checked, onChange, label, disabled }: SwitchProps) {
  const control = (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        disabled && "cursor-not-allowed opacity-50",
        checked ? "bg-primary" : "bg-muted-foreground/25",
      )}
    >
      <span
        className={cn(
          "inline-block h-5 w-5 rounded-full bg-white shadow-sm ring-1 ring-black/5 transition-transform duration-200",
          checked ? "translate-x-[1.375rem]" : "translate-x-0.5",
        )}
      />
    </button>
  );

  if (!label) return control;

  return (
    <label
      className={cn(
        "flex w-full cursor-pointer items-center justify-between gap-3 text-sm font-medium",
        disabled && "cursor-not-allowed opacity-70",
      )}
    >
      <span className="min-w-0">{label}</span>
      {control}
    </label>
  );
}
