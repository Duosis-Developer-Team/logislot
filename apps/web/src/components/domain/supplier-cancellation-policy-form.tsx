"use client";

/**
 * Tedarikci iptal kurallari formu (yonetim ekrani).
 *
 * Musteri talebi (2026-10, Cakes&Bakes): tedarikci randevu iptalinde sabit
 * listeden sebep ve alternatif gonderim tarihi girsin; randevuya belirli bir
 * sureden az kalinca portaldan iptal edemesin. Kurallar tesis geneli tektir
 * (`/facilities/:id/supplier-cancellation-policy`) ve yalnizca tedarikci
 * iptallerine uygulanir — yonetim her zaman iptal edebilir.
 */

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { SUPPLIER_CANCELLATION_REASONS } from "@logislot/shared";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { apiRequest } from "@/lib/api/client";
import type { SupplierCancellationPolicyDto } from "@/lib/api/types";
import { useApiErrorMessage } from "@/lib/i18n/api-error";
import { useLabels } from "@/lib/i18n/labels";
import { useT } from "@/lib/i18n/provider";

interface PolicyResponse extends SupplierCancellationPolicyDto {
  /** false ise hic kural kaydedilmemis: eski davranis gecerli. */
  is_customized: boolean;
  max_notice_hours: number;
}

const policyKey = (facilityId: string) => [
  "config",
  "supplier-cancellation-policy",
  facilityId,
];

export function SupplierCancellationPolicyForm({ facilityId }: { facilityId: string | null }) {
  const t = useT();
  const copy = t.admin.supplierCancellation;
  const labels = useLabels();
  const errorMessage = useApiErrorMessage();
  const queryClient = useQueryClient();
  const policy = useQuery({
    queryKey: policyKey(facilityId ?? "none"),
    queryFn: () =>
      apiRequest<PolicyResponse>(`/facilities/${facilityId}/supplier-cancellation-policy`),
    enabled: facilityId !== null,
  });
  const [draft, setDraft] = useState<SupplierCancellationPolicyDto | null>(null);
  // Saat alani metin olarak tutulur: kullanici silip yeniden yazarken "0"a zorlanmasin.
  const [hours, setHours] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (policy.data && draft === null) {
      const { require_reason, require_alternative_date, min_notice_hours } = policy.data;
      setDraft({ require_reason, require_alternative_date, min_notice_hours });
      setHours(String(min_notice_hours));
    }
  }, [policy.data, draft]);

  const save = useMutation({
    mutationFn: (body: SupplierCancellationPolicyDto) =>
      apiRequest<PolicyResponse>(`/facilities/${facilityId}/supplier-cancellation-policy`, {
        method: "PATCH",
        body,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: policyKey(facilityId ?? "none") });
      setSaved(true);
    },
  });

  if (policy.isError) return <p className="text-sm text-destructive">{copy.loadError}</p>;
  if (policy.isLoading || draft === null)
    return <p className="text-sm text-muted-foreground">{copy.loading}</p>;

  const max = policy.data!.max_notice_hours;

  async function onSave() {
    setError(null);
    setSaved(false);
    const parsed = Number(hours);
    if (!/^\d+$/.test(hours.trim()) || parsed > max) {
      setError(copy.invalidHours(max));
      return;
    }
    try {
      await save.mutateAsync({ ...draft!, min_notice_hours: parsed });
    } catch (err) {
      setError(errorMessage(err, copy.saveFailed));
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {policy.data?.is_customized === false && (
        <p className="rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
          {copy.defaultPolicy}
        </p>
      )}

      <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
        <Switch
          checked={draft.require_reason}
          onChange={(v) => setDraft({ ...draft, require_reason: v })}
          label={copy.requireReason}
        />
        <p className="text-xs text-muted-foreground">{copy.requireReasonHint}</p>
        {draft.require_reason && (
          <div className="mt-1 border-t border-border pt-2">
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">
              {copy.reasonsTitle}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {SUPPLIER_CANCELLATION_REASONS.map((code) => (
                <span
                  key={code}
                  className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground"
                >
                  {labels.supplierCancellationReason[code]}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
        <Switch
          checked={draft.require_alternative_date}
          onChange={(v) => setDraft({ ...draft, require_alternative_date: v })}
          label={copy.requireAlternativeDate}
        />
        <p className="text-xs text-muted-foreground">{copy.requireAlternativeDateHint}</p>
      </div>

      <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
        <Label htmlFor="cancellation-min-notice" className="mb-0">
          {copy.minNotice}
        </Label>
        <div className="flex items-center gap-2">
          <Input
            id="cancellation-min-notice"
            type="number"
            inputMode="numeric"
            min={0}
            max={max}
            step={1}
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            className="w-28"
          />
          <span className="text-sm text-muted-foreground">{copy.hours}</span>
        </div>
        <p className="text-xs text-muted-foreground">{copy.minNoticeHint}</p>
      </div>

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
