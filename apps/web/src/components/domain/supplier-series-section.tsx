"use client";

/**
 * Tedarikci portali "Tekrarlayan Randevular" bolumu (Sprint 12).
 * Seri kartlari + occurrence detayi + GUCLU onayli gelecek-iptal.
 */

import { Repeat } from "lucide-react";
import { useState } from "react";
import { APPOINTMENT_STATUS_LABELS } from "@logislot/shared";
import { StatusBadge } from "@/components/domain/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";
import { ApiError } from "@/lib/api/client";
import {
  useSupplierSeries,
  useSupplierSeriesCancel,
  useSupplierSeriesDetail,
  type SupplierSeriesRowDto,
} from "@/lib/api/supplier";

const FREQUENCY_LABELS: Record<string, string> = {
  weekly: "Haftalık",
  biweekly: "2 haftada bir",
  monthly: "Aylık",
};

export function SupplierSeriesSection({
  onFlash,
}: {
  onFlash: (kind: "success" | "error", message: string) => void;
}) {
  const list = useSupplierSeries();
  const cancel = useSupplierSeriesCancel();
  const [detailId, setDetailId] = useState<string | null>(null);
  const detail = useSupplierSeriesDetail(detailId);
  const [cancelTarget, setCancelTarget] = useState<SupplierSeriesRowDto | null>(null);
  const [reason, setReason] = useState("");
  const [cancelError, setCancelError] = useState<string | null>(null);

  const rows = list.data ?? [];
  if (list.isLoading || rows.length === 0) return null;

  async function onCancel() {
    if (!cancelTarget) return;
    setCancelError(null);
    if (reason.trim().length < 3) {
      setCancelError("İptal sebebi zorunludur (en az 3 karakter).");
      return;
    }
    try {
      const result = await cancel.mutateAsync({ seriesId: cancelTarget.id, reason });
      onFlash(
        "success",
        `Serinin gelecekteki ${result.affected_count} randevusu iptal edildi; tesise bildirim gönderildi.`,
      );
      setCancelTarget(null);
      setReason("");
    } catch (err) {
      setCancelError(err instanceof ApiError ? err.message : "İptal edilemedi");
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <Repeat className="h-4 w-4 text-primary" /> Tekrarlayan Randevular
      </h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {rows.map((row) => (
          <Card key={row.id}>
            <CardContent className="flex flex-col gap-2 p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold">{row.product_name ?? "Seri"}</div>
                  <div className="text-xs text-muted-foreground">
                    {FREQUENCY_LABELS[row.frequency] ?? row.frequency} ×{" "}
                    {row.occurrence_count}
                  </div>
                </div>
                <Badge
                  className={
                    row.status === "active"
                      ? "bg-status-approved/15 text-status-approved"
                      : "bg-status-cancelled/15 text-status-cancelled"
                  }
                >
                  {row.status === "active" ? "Aktif" : "İptal Edildi"}
                </Badge>
              </div>
              {row.next_appointment_at && (
                <div className="text-xs text-muted-foreground">
                  Sıradaki randevu:{" "}
                  <span className="font-medium text-foreground">
                    {new Date(row.next_appointment_at).toLocaleString("tr-TR", {
                      day: "2-digit",
                      month: "long",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              )}
              <div className="flex flex-wrap gap-1">
                {Object.entries(row.status_counts).map(([status, count]) => (
                  <Badge key={status} className="bg-muted text-[10px] text-muted-foreground">
                    {APPOINTMENT_STATUS_LABELS[
                      status as keyof typeof APPOINTMENT_STATUS_LABELS
                    ] ?? status}
                    : {count}
                  </Badge>
                ))}
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" onClick={() => setDetailId(row.id)}>
                  Detay
                </Button>
                {row.can_cancel_series && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive"
                    onClick={() => {
                      setReason("");
                      setCancelError(null);
                      setCancelTarget(row);
                    }}
                  >
                    Seriyi İptal Et
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Detay */}
      <Dialog
        open={detailId !== null}
        onClose={() => setDetailId(null)}
        title="Seri Detayı"
      >
        {detail.isLoading ? (
          <p className="text-sm text-muted-foreground">Yükleniyor…</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {(detail.data?.appointments ?? []).map((appt) => (
              <div
                key={appt.id}
                className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm"
              >
                <span>
                  <span className="mr-2 font-medium">{appt.occurrence_index}.</span>
                  {new Date(appt.scheduled_start_at).toLocaleString("tr-TR", {
                    day: "2-digit",
                    month: "long",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                  {appt.dock_name && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      {appt.dock_name}
                    </span>
                  )}
                  {appt.original_start_at && appt.status === "revision_pending" && (
                    <span className="ml-2 text-xs text-status-revision">
                      (yeni saat önerildi)
                    </span>
                  )}
                </span>
                <StatusBadge status={appt.status as never} />
              </div>
            ))}
          </div>
        )}
      </Dialog>

      {/* Guclu onayli iptal */}
      <Dialog
        open={cancelTarget !== null}
        onClose={() => setCancelTarget(null)}
        title="Seriyi iptal et"
      >
        {cancelTarget && (
          <div className="flex flex-col gap-3">
            <p className="rounded-lg border border-status-cancelled/40 bg-status-cancelled/10 px-3 py-2 text-sm text-status-cancelled">
              Bu işlem gelecekteki{" "}
              <strong>{cancelTarget.future_cancellable_count} randevuyu</strong> iptal
              eder ve geri alınamaz. Tamamlanan randevular etkilenmez.
            </p>
            <div>
              <Label>İptal Sebebi (zorunlu)</Label>
              <Input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Örn. Üretim planı değişti"
              />
            </div>
            {cancelError && <p className="text-sm text-destructive">{cancelError}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setCancelTarget(null)}>
                Vazgeç
              </Button>
              <Button
                variant="destructive"
                disabled={cancel.isPending}
                onClick={() => void onCancel()}
              >
                {cancel.isPending
                  ? "İptal ediliyor…"
                  : `${cancelTarget.future_cancellable_count} Randevuyu İptal Et`}
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}
