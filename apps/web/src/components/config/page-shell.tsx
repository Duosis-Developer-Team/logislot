"use client";

import { CheckCircle2, Plus, Search, XCircle } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type ActiveFilter = "all" | "active" | "inactive";

interface ConfigPageShellProps {
  title: string;
  description: string;
  createLabel: string;
  onCreate: () => void;
  search: string;
  onSearchChange: (value: string) => void;
  activeFilter: ActiveFilter;
  onActiveFilterChange: (value: ActiveFilter) => void;
  flash: FlashMessage | null;
  children: React.ReactNode;
}

export interface FlashMessage {
  kind: "success" | "error";
  text: string;
}

/** Basari/hata geri bildirimi — mutasyon sonrasi kisa sureli banner. */
export function useFlash() {
  const [flash, setFlash] = useState<FlashMessage | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showFlash = useCallback((kind: FlashMessage["kind"], text: string) => {
    if (timer.current) clearTimeout(timer.current);
    setFlash({ kind, text });
    timer.current = setTimeout(() => setFlash(null), 4000);
  }, []);
  return { flash, showFlash };
}

export function ConfigPageShell({
  title,
  description,
  createLabel,
  onCreate,
  search,
  onSearchChange,
  activeFilter,
  onActiveFilterChange,
  flash,
  children,
}: ConfigPageShellProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">{title}</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">{description}</p>
        </div>
        <Button onClick={onCreate}>
          <Plus className="h-4 w-4" /> {createLabel}
        </Button>
      </div>

      {flash && (
        <div
          className={cn(
            "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm",
            flash.kind === "success"
              ? "border-status-approved/40 bg-status-approved/10 text-status-approved"
              : "border-destructive/40 bg-destructive/10 text-destructive",
          )}
        >
          {flash.kind === "success" ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : (
            <XCircle className="h-4 w-4" />
          )}
          {flash.text}
        </div>
      )}

      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Ara…"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>
        <Select
          className="sm:w-44"
          value={activeFilter}
          onChange={(e) => onActiveFilterChange(e.target.value as ActiveFilter)}
        >
          <option value="all">Tümü</option>
          <option value="active">Aktif</option>
          <option value="inactive">Pasif</option>
        </Select>
      </div>

      {children}
    </div>
  );
}

/** Liste filtreleme yardimcisi: arama + aktif/pasif. */
export function filterRows<T extends { is_active: boolean }>(
  rows: T[],
  search: string,
  activeFilter: ActiveFilter,
  textOf: (row: T) => string,
): T[] {
  const query = search.trim().toLocaleLowerCase("tr");
  return rows.filter((row) => {
    if (activeFilter === "active" && !row.is_active) return false;
    if (activeFilter === "inactive" && row.is_active) return false;
    if (query && !textOf(row).toLocaleLowerCase("tr").includes(query)) return false;
    return true;
  });
}
