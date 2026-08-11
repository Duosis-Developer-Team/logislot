"use client";

import { Check, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { cn, normalizeSearch } from "@/lib/utils";

export interface MultiSelectOption {
  value: string;
  label: string;
}

interface MultiSelectFieldProps {
  options: MultiSelectOption[];
  value: string[];
  onChange: (value: string[]) => void;
  /** value bosken gosterilen aciklama (or. "bos = tumu kabul edilir"). */
  emptyHint?: string;
  searchPlaceholder?: string;
}

/** Tek seferde DOM'a basilan maksimum satir; gerisi arama ile daraltilir. */
const MAX_RENDERED = 100;

/**
 * Aranabilir coklu secim — rampa uyumluluklari, rol/rampa yetkileri, tetik
 * kosullari gibi alanlar icin ortak alan.
 *
 * Tasarim kararlari:
 * - Secili kayitlar listenin USTUNDE cip olarak durur; liste sirasi tiklamayla
 *   DEGISMEZ (secili olani basa tasimak, tiklanan satirin zipladigi bir UX
 *   yaratiyordu).
 * - "Tumunu sec" yalnizca o an filtrelenmis sonuclara uygulanir; filtre disinda
 *   kalan secimlere dokunmaz.
 * - Cok uzun listelerde ilk MAX_RENDERED satir basilir; kalan sayi bilgi olarak
 *   yazilir (sanal liste bagimliligi eklemeden hem hizli hem seffaf).
 */
export function MultiSelectField({
  options,
  value,
  onChange,
  emptyHint,
  searchPlaceholder = "Ara…",
}: MultiSelectFieldProps) {
  const [query, setQuery] = useState("");

  const selectedSet = useMemo(() => new Set(value), [value]);
  const byValue = useMemo(
    () => new Map(options.map((o) => [o.value, o] as const)),
    [options],
  );

  const filtered = useMemo(() => {
    const q = normalizeSearch(query.trim());
    if (!q) return options;
    return options.filter((o) => normalizeSearch(o.label).includes(q));
  }, [options, query]);

  const visible = filtered.slice(0, MAX_RENDERED);
  const hiddenCount = filtered.length - visible.length;

  /** Secim sirasini korur; secenek listesinde olmayan id'ler ayri raporlanir. */
  const selectedOptions = value
    .map((v) => byValue.get(v))
    .filter((o): o is MultiSelectOption => o !== undefined);
  /**
   * Secili ama secenekler arasinda olmayan kayit (pasiflestirilmis kategori
   * vb.). options bosken (query yuklenirken) YANLIS alarm vermemek icin
   * yalnizca liste doluyken raporlanir.
   */
  const orphanCount =
    options.length > 0 ? value.length - selectedOptions.length : 0;

  const allFilteredSelected =
    filtered.length > 0 && filtered.every((o) => selectedSet.has(o.value));

  function toggle(v: string) {
    onChange(selectedSet.has(v) ? value.filter((x) => x !== v) : [...value, v]);
  }

  function toggleFiltered() {
    if (allFilteredSelected) {
      const filteredSet = new Set(filtered.map((o) => o.value));
      onChange(value.filter((v) => !filteredSet.has(v)));
      return;
    }
    const additions = filtered
      .map((o) => o.value)
      .filter((v) => !selectedSet.has(v));
    onChange([...value, ...additions]);
  }

  // Arama kutusu HER listede durur (kullanici karari): kisa listelerde de
  // yazarak secmek, goz ile taramaktan hizli ve tutarli bir etkilesim.
  // Yalnizca hic secenek yokken gizlenir (aranacak bir sey yok).
  const showSearch = options.length > 0;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <span className="text-xs text-muted-foreground">
          {value.length} / {options.length} seçili
        </span>
        {options.length > 0 && (
          <div className="flex items-center gap-3 text-xs font-medium">
            <button
              type="button"
              onClick={toggleFiltered}
              disabled={filtered.length === 0}
              className="text-primary transition-opacity hover:opacity-70 disabled:opacity-40"
            >
              {allFilteredSelected
                ? query
                  ? "Sonuçları kaldır"
                  : "Tümünü kaldır"
                : query
                  ? "Sonuçları seç"
                  : "Tümünü seç"}
            </button>
            {value.length > 0 && (
              <button
                type="button"
                onClick={() => onChange([])}
                className="text-muted-foreground transition-colors hover:text-destructive"
              >
                Temizle
              </button>
            )}
          </div>
        )}
      </div>

      {selectedOptions.length > 0 && (
        <div className="flex max-h-24 flex-wrap gap-1.5 overflow-y-auto rounded-lg bg-muted/40 p-2">
          {selectedOptions.map((option) => (
            <span
              key={option.value}
              className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 py-1 pl-2.5 pr-1.5 text-xs font-medium text-primary"
            >
              {option.label}
              <button
                type="button"
                onClick={() => toggle(option.value)}
                aria-label={`${option.label} seçimini kaldır`}
                className="rounded-full p-0.5 transition-colors hover:bg-primary/20"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {showSearch && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-10 pl-9"
            placeholder={searchPlaceholder}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            // Form icinde Enter kaydi tetiklemesin (arama kutusu form icindedir).
            // ESC bilerek ele alinmaz: uygulamanin her yerinde drawer'i kapatir.
            onKeyDown={(e) => {
              if (e.key === "Enter") e.preventDefault();
            }}
          />
        </div>
      )}

      <div className="max-h-64 overflow-y-auto rounded-lg border border-border bg-card">
        {options.length === 0 ? (
          <p className="px-3 py-4 text-center text-xs text-muted-foreground">
            Seçenek yok
          </p>
        ) : visible.length === 0 ? (
          <p className="px-3 py-4 text-center text-xs text-muted-foreground">
            “{query}” için sonuç yok
          </p>
        ) : (
          <ul>
            {visible.map((option) => {
              const selected = selectedSet.has(option.value);
              return (
                <li key={option.value} className="border-b border-border/60 last:border-0">
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={selected}
                    onClick={() => toggle(option.value)}
                    className={cn(
                      "flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors",
                      selected
                        ? "bg-primary/5 text-foreground"
                        : "text-muted-foreground hover:bg-muted/60",
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
                        selected
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-card",
                      )}
                    >
                      {selected && <Check className="h-3 w-3" />}
                    </span>
                    <span className="truncate">{option.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {hiddenCount > 0 && (
        <p className="text-xs text-muted-foreground">
          {hiddenCount} sonuç daha var — aramayla daraltın.
        </p>
      )}

      {orphanCount > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-md bg-accent/10 px-2 py-1 text-xs text-accent-foreground/80">
          <span>
            {orphanCount} seçim listede olmayan (pasifleştirilmiş/silinmiş) bir kayda
            ait; kaydedildiğinde korunur.
          </span>
          <button
            type="button"
            onClick={() => onChange(value.filter((v) => byValue.has(v)))}
            className="font-medium text-destructive transition-opacity hover:opacity-70"
          >
            Kaldır
          </button>
        </div>
      )}

      {emptyHint && value.length === 0 && (
        <p className="inline-block rounded-md bg-accent/10 px-2 py-1 text-xs text-accent-foreground/80">
          {emptyHint}
        </p>
      )}
    </div>
  );
}
