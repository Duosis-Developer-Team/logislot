"use client";

/**
 * Iptal sebebi listesi editoru (yonetim ekrani).
 *
 * 2026-11 toplantisi: tedarikci "daha onceden belirlenmis" listeden secer;
 * listeyi firma kendisi duzenler. Kaydet butonu listenin TAMAMINI gonderilen
 * sirayla yazar (PUT): sira oklarla degisir, cikarilan sebep silinir. Silmek
 * gecmisi bozmaz — randevu sebebin o anki adini kendi uzerinde tasir.
 */

import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { apiRequest } from "@/lib/api/client";
import type { CancellationReasonDto } from "@/lib/api/types";
import { useApiErrorMessage } from "@/lib/i18n/api-error";
import { useT } from "@/lib/i18n/provider";

interface DraftReason {
  /** Yeni satirda bos; kayitta sunucu id verir. */
  id?: string;
  key: string;
  label: string;
  note_required: boolean;
  is_active: boolean;
}

const MAX_REASONS = 30;
const reasonsKey = (facilityId: string) => ["config", "cancellation-reasons", facilityId];

function toDraft(rows: CancellationReasonDto[]): DraftReason[] {
  return rows.map((r) => ({
    id: r.id,
    key: r.id,
    label: r.label,
    note_required: r.note_required,
    is_active: r.is_active,
  }));
}

export function CancellationReasonsEditor({ facilityId }: { facilityId: string | null }) {
  const t = useT();
  const copy = t.admin.supplierCancellation.reasons;
  const errorMessage = useApiErrorMessage();
  const queryClient = useQueryClient();
  const list = useQuery({
    queryKey: reasonsKey(facilityId ?? "none"),
    queryFn: () =>
      apiRequest<CancellationReasonDto[]>(`/facilities/${facilityId}/cancellation-reasons`),
    enabled: facilityId !== null,
  });
  const [draft, setDraft] = useState<DraftReason[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (list.data && draft === null) setDraft(toDraft(list.data));
  }, [list.data, draft]);

  const save = useMutation({
    mutationFn: (rows: DraftReason[]) =>
      apiRequest<CancellationReasonDto[]>(`/facilities/${facilityId}/cancellation-reasons`, {
        method: "PUT",
        body: {
          reasons: rows.map(({ id, label, note_required, is_active }) => ({
            ...(id ? { id } : {}),
            label: label.trim(),
            note_required,
            is_active,
          })),
        },
      }),
    onSuccess: (rows) => {
      queryClient.setQueryData(reasonsKey(facilityId ?? "none"), rows);
      // Tedarikci profili sebepleri tasir; acik oturumlar tazelensin.
      queryClient.invalidateQueries({ queryKey: ["supplier", "profile"] });
      setDraft(toDraft(rows));
      setSaved(true);
    },
  });

  if (list.isError) return <p className="text-sm text-destructive">{copy.loadError}</p>;
  if (list.isLoading || draft === null)
    return <p className="text-sm text-muted-foreground">{t.common.loading}</p>;

  function update(index: number, patch: Partial<DraftReason>) {
    setSaved(false);
    setDraft((rows) => rows!.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function move(index: number, delta: number) {
    setSaved(false);
    setDraft((rows) => {
      const next = [...rows!];
      const [row] = next.splice(index, 1);
      next.splice(index + delta, 0, row);
      return next;
    });
  }

  async function onSave() {
    setError(null);
    setSaved(false);
    const rows = draft!;
    if (rows.some((r) => r.label.trim().length < 2)) return setError(copy.labelTooShort);
    const names = rows.map((r) => r.label.trim().toLocaleLowerCase("tr-TR"));
    if (new Set(names).size !== names.length) return setError(copy.duplicate);
    if (!rows.some((r) => r.is_active)) return setError(copy.noActive);
    try {
      await save.mutateAsync(rows);
    } catch (err) {
      setError(errorMessage(err, copy.saveFailed));
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground">{copy.hint}</p>
      <div className="flex flex-col gap-2">
        {draft.map((row, index) => (
          <div
            key={row.key}
            className="flex flex-col gap-2 rounded-lg border border-border p-2.5 sm:flex-row sm:items-center"
          >
            <div className="flex items-center gap-1">
              <span className="w-5 text-center text-xs font-semibold text-muted-foreground">
                {index + 1}
              </span>
              <button
                type="button"
                aria-label={copy.moveUp}
                disabled={index === 0}
                onClick={() => move(index, -1)}
                className="rounded p-1 text-muted-foreground hover:bg-muted disabled:opacity-30"
              >
                <ArrowUp className="h-4 w-4" />
              </button>
              <button
                type="button"
                aria-label={copy.moveDown}
                disabled={index === draft.length - 1}
                onClick={() => move(index, 1)}
                className="rounded p-1 text-muted-foreground hover:bg-muted disabled:opacity-30"
              >
                <ArrowDown className="h-4 w-4" />
              </button>
            </div>
            <Input
              value={row.label}
              maxLength={120}
              onChange={(e) => update(index, { label: e.target.value })}
              placeholder={copy.placeholder}
              aria-label={copy.labelField}
              className={row.is_active ? "flex-1" : "flex-1 opacity-60"}
            />
            <div className="flex items-center gap-3 sm:gap-4">
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={row.note_required}
                  onChange={(e) => update(index, { note_required: e.target.checked })}
                  className="h-4 w-4 accent-primary"
                />
                {copy.noteRequired}
              </label>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Switch
                  checked={row.is_active}
                  onChange={(v) => update(index, { is_active: v })}
                />
                {row.is_active ? copy.active : copy.inactive}
              </div>
              <button
                type="button"
                aria-label={copy.remove}
                onClick={() => {
                  setSaved(false);
                  setDraft((rows) => rows!.filter((_, i) => i !== index));
                }}
                className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
      <Button
        variant="secondary"
        size="sm"
        className="w-fit"
        disabled={draft.length >= MAX_REASONS}
        onClick={() => {
          setSaved(false);
          setDraft((rows) => [
            ...rows!,
            {
              key: `new-${Date.now()}`,
              label: "",
              note_required: false,
              is_active: true,
            },
          ]);
        }}
      >
        <Plus className="mr-1 h-4 w-4" />
        {copy.add}
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {saved && <p className="text-sm text-status-approved">{copy.saved}</p>}
      <div className="flex justify-end">
        <Button onClick={() => void onSave()} disabled={save.isPending}>
          {save.isPending ? t.common.saving : t.common.save}
        </Button>
      </div>
    </div>
  );
}
