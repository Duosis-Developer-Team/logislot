"use client";

import { Check, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { cn, normalizeSearch } from "@/lib/utils";
import { useT } from "@/lib/i18n/provider";

export interface PermissionItem {
  code: string;
  label: string;
}

export interface PermissionGroup {
  title: string;
  items: PermissionItem[];
}

interface PermissionPickerProps {
  /** Katalogla filtrelenmis gruplar; bos gruplar otomatik gizlenir. */
  groups: PermissionGroup[];
  value: string[];
  onChange: (value: string[]) => void;
  /** Sistem rolleri: izinler kilitli. */
  disabled?: boolean;
}

/**
 * Rol izin secici — gruplu liste + arama + grup bazli toplu sec/kaldir.
 *
 * Guvenlik notu: toplu secim YALNIZCA ekranda gorunen (katalogla filtrelenmis)
 * kodlari ekler; katalogda olmayan bir izin kodu bu bilesenden asla uretilmez.
 */
export function PermissionPicker({
  groups,
  value,
  onChange,
  disabled = false,
}: PermissionPickerProps) {
  const t = useT();
  const [query, setQuery] = useState("");

  const selectedSet = useMemo(() => new Set(value), [value]);
  const totalItems = useMemo(
    () => groups.reduce((sum, g) => sum + g.items.length, 0),
    [groups],
  );

  /**
   * Rolde olup bu ekranda listelenmeyen izinler (backend katalogu ilerideki bir
   * surumde yeni kod eklediginde). Bilgi amaclidir: kaydederken korunurlar,
   * guvenlik acisindan hassas olduklari icin otomatik SILINMEZLER.
   */
  const unmanagedCount = useMemo(() => {
    const known = new Set(groups.flatMap((g) => g.items.map((i) => i.code)));
    return value.filter((code) => !known.has(code)).length;
  }, [groups, value]);

  const visibleGroups = useMemo(() => {
    const q = normalizeSearch(query.trim());
    return groups
      .map((group) => ({
        ...group,
        items: q
          ? group.items.filter(
              (item) =>
                normalizeSearch(item.label).includes(q) ||
                normalizeSearch(item.code).includes(q),
            )
          : group.items,
      }))
      .filter((group) => group.items.length > 0);
  }, [groups, query]);

  function toggle(code: string) {
    if (disabled) return;
    onChange(
      selectedSet.has(code) ? value.filter((c) => c !== code) : [...value, code],
    );
  }

  function toggleGroup(items: PermissionItem[]) {
    if (disabled) return;
    const allSelected = items.every((i) => selectedSet.has(i.code));
    if (allSelected) {
      const codes = new Set(items.map((i) => i.code));
      onChange(value.filter((c) => !codes.has(c)));
      return;
    }
    const additions = items
      .map((i) => i.code)
      .filter((c) => !selectedSet.has(c));
    onChange([...value, ...additions]);
  }

  return (
    <div className={cn("flex flex-col gap-3", disabled && "opacity-60")}>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <span className="text-xs text-muted-foreground">
          {t.misc.permissions.countOf(value.length, totalItems)}
        </span>
        {!disabled && value.length > 0 && (
          <button
            type="button"
            onClick={() => onChange([])}
            className="text-xs font-medium text-muted-foreground transition-colors hover:text-destructive"
          >
            {t.misc.permissions.clearAll}
          </button>
        )}
      </div>

      {/* Arama kutusu her listede durur (kullanici karari); yalnizca hic
          izin yokken gizlenir. */}
      {totalItems > 0 && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-10 pl-9"
            placeholder={t.misc.permissions.search}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            // Form icinde Enter kaydi tetiklemesin; ESC drawer'i kapatir (genel davranis).
            onKeyDown={(e) => {
              if (e.key === "Enter") e.preventDefault();
            }}
          />
        </div>
      )}

      {unmanagedCount > 0 && (
        <p className="rounded-md bg-accent/10 px-2 py-1 text-xs text-accent-foreground/80">
          {t.misc.permissions.unmanaged(unmanagedCount)}
        </p>
      )}

      {visibleGroups.length === 0 ? (
        <p className="rounded-lg border border-border bg-card px-3 py-4 text-center text-xs text-muted-foreground">
          {totalItems === 0
            ? t.misc.permissions.noPermissions
            : t.components.multiSelect.noResults(query)}
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {visibleGroups.map((group) => {
            const selectedInGroup = group.items.filter((i) =>
              selectedSet.has(i.code),
            ).length;
            const allSelected = selectedInGroup === group.items.length;
            return (
              <div key={group.title} className="rounded-lg border border-border bg-card">
                <div className="flex items-center justify-between gap-2 border-b border-border/60 px-3 py-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {group.title}{" "}
                    <span className="font-normal normal-case tracking-normal">
                      ({selectedInGroup}/{group.items.length})
                    </span>
                  </p>
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.items)}
                    disabled={disabled}
                    className="text-xs font-medium text-primary transition-opacity hover:opacity-70 disabled:opacity-40"
                  >
                    {allSelected ? t.misc.permissions.removeGroup : t.components.multiSelect.selectAll}
                  </button>
                </div>
                <ul>
                  {group.items.map((item) => {
                    const selected = selectedSet.has(item.code);
                    return (
                      <li key={item.code} className="border-b border-border/60 last:border-0">
                        <button
                          type="button"
                          role="checkbox"
                          aria-checked={selected}
                          disabled={disabled}
                          onClick={() => toggle(item.code)}
                          className={cn(
                            "flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors",
                            selected ? "text-foreground" : "text-muted-foreground",
                            !disabled && "hover:bg-muted/60",
                            disabled && "cursor-not-allowed",
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
                          <span className="flex-1 truncate">{item.label}</span>
                          <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                            {item.code}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
