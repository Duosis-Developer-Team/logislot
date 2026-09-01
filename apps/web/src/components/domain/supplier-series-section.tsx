"use client";

/**
 * Tedarikci portali "Tekrarlayan Randevular" bolumu (Sprint 12).
 * Seri kartlari + occurrence detayi + GUCLU onayli gelecek-iptal.
 */

import { Repeat } from "lucide-react";
import { useState } from "react";
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
import { useLabels } from "@/lib/i18n/labels";
import { useFormat, useT } from "@/lib/i18n/provider";

export function SupplierSeriesSection({
  onFlash,
}: {
  onFlash: (kind: "success" | "error", message: string) => void;
}) {
  const t = useT();
  const copy = t.tickets.series;
  const fmt = useFormat();
  const labels = useLabels();
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
      setCancelError(copy.cancelReasonMin);
      return;
    }
    try {
      const result = await cancel.mutateAsync({ seriesId: cancelTarget.id, reason });
      onFlash(
        "success",
        copy.cancelledWithNotice(result.affected_count),
      );
      setCancelTarget(null);
      setReason("");
    } catch (err) {
      setCancelError(err instanceof ApiError ? err.message : copy.cancelFailed);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <Repeat className="h-4 w-4 text-primary" /> {copy.title}
      </h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {rows.map((row) => (
          <Card key={row.id}>
            <CardContent className="flex flex-col gap-2 p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold">{row.product_name ?? copy.fallbackName}</div>
                  <div className="text-xs text-muted-foreground">
                    {copy.frequency[row.frequency] ?? row.frequency} ×{" "}
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
                  {row.status === "active" ? copy.statusActive : copy.statusCancelled}
                </Badge>
              </div>
              {row.next_appointment_at && (
                <div className="text-xs text-muted-foreground">
                  {copy.nextAppointment}:{" "}
                  <span className="font-medium text-foreground">
                    {fmt.dayMonthTime(row.next_appointment_at)}
                  </span>
                </div>
              )}
              <div className="flex flex-wrap gap-1">
                {Object.entries(row.status_counts).map(([status, count]) => (
                  <Badge key={status} className="bg-muted text-[10px] text-muted-foreground">
                    {labels.appointmentStatus[
                      status as keyof typeof labels.appointmentStatus
                    ] ?? status}
                    : {count}
                  </Badge>
                ))}
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" onClick={() => setDetailId(row.id)}>
                  {t.common.detail}
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
                    {copy.cancelSeries}
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
        title={copy.detailTitle}
      >
        {detail.isLoading ? (
          <p className="text-sm text-muted-foreground">{t.common.loading}</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {(detail.data?.appointments ?? []).map((appt) => (
              <div
                key={appt.id}
                className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm"
              >
                <span>
                  <span className="mr-2 font-medium">{appt.occurrence_index}.</span>
                  {fmt.dayMonthTime(appt.scheduled_start_at)}
                  {appt.dock_name && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      {appt.dock_name}
                    </span>
                  )}
                  {appt.original_start_at && appt.status === "revision_pending" && (
                    <span className="ml-2 text-xs text-status-revision">
                      {copy.newTimeSuggested}
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
        title={copy.cancelTitle}
      >
        {cancelTarget && (
          <div className="flex flex-col gap-3">
            <p className="rounded-lg border border-status-cancelled/40 bg-status-cancelled/10 px-3 py-2 text-sm text-status-cancelled">
              {copy.cancelWarningLead}{" "}
              <strong>{copy.cancelWarningStrong(cancelTarget.future_cancellable_count)}</strong>{" "}
              {copy.cancelWarningTail}
            </p>
            <div>
              <Label>{copy.cancelReasonRequiredLabel}</Label>
              <Input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={copy.cancelReasonHint}
              />
            </div>
            {cancelError && <p className="text-sm text-destructive">{cancelError}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setCancelTarget(null)}>
                {t.common.cancel}
              </Button>
              <Button
                variant="destructive"
                disabled={cancel.isPending}
                onClick={() => void onCancel()}
              >
                {cancel.isPending
                  ? copy.cancelling
                  : copy.cancelCount(cancelTarget.future_cancellable_count)}
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}
