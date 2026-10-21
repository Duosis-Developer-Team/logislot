"use client";

/**
 * Tedarikci portali "Tekrarlayan Randevular" bolumu (Sprint 12).
 * Seri kartlari + occurrence detayi + GUCLU onayli gelecek-iptal.
 *
 * Seri iptali tesisin iptal kuralina tekil iptalle AYNEN tabidir (sebep,
 * alternatif tarih, bildirim suresi); sure icindeki tekrarlar aktif kalir.
 */

import { Repeat } from "lucide-react";
import { useState } from "react";
import { StatusBadge } from "@/components/domain/status-badge";
import { SupplierCancelDialog } from "@/components/domain/supplier-cancel-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import {
  useSupplierProfile,
  useSupplierSeries,
  useSupplierSeriesCancel,
  useSupplierSeriesDetail,
  type SupplierCancelBody,
  type SupplierSeriesRowDto,
} from "@/lib/api/supplier";
import { useApiErrorMessage } from "@/lib/i18n/api-error";
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
  const errorMessage = useApiErrorMessage();
  const profile = useSupplierProfile();
  const list = useSupplierSeries();
  const cancel = useSupplierSeriesCancel();
  const [detailId, setDetailId] = useState<string | null>(null);
  const detail = useSupplierSeriesDetail(detailId);
  const [cancelTarget, setCancelTarget] = useState<SupplierSeriesRowDto | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const policy = profile.data?.cancellation_policy;

  const rows = list.data ?? [];
  if (list.isLoading || rows.length === 0) return null;

  async function onCancel(body: SupplierCancelBody) {
    if (!cancelTarget) return;
    setCancelError(null);
    try {
      const result = await cancel.mutateAsync({ seriesId: cancelTarget.id, ...body });
      onFlash(
        "success",
        result.kept_within_notice_count > 0
          ? copy.cancelledKept(result.affected_count, result.kept_within_notice_count)
          : copy.cancelledWithNotice(result.affected_count),
      );
      setCancelTarget(null);
    } catch (err) {
      setCancelError(errorMessage(err, copy.cancelFailed));
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
                {row.can_cancel_series && profile.isSuccess && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive"
                    onClick={() => {
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
      <SupplierCancelDialog
        open={cancelTarget !== null}
        onClose={() => setCancelTarget(null)}
        title={copy.cancelTitle}
        intro={
          cancelTarget && (
            <div className="flex flex-col gap-2">
              <p className="rounded-lg border border-status-cancelled/40 bg-status-cancelled/10 px-3 py-2 text-status-cancelled">
                {copy.cancelWarningLead}{" "}
                <strong>{copy.cancelWarningStrong(cancelTarget.future_cancellable_count)}</strong>{" "}
                {copy.cancelWarningTail}
              </p>
              {policy && policy.min_notice_hours > 0 && (
                <p className="text-xs">{copy.noticeWarning(policy.min_notice_hours)}</p>
              )}
            </div>
          )
        }
        policy={policy}
        legacyReason={{
          label: copy.cancelReasonRequiredLabel,
          placeholder: copy.cancelReasonHint,
          minError: copy.cancelReasonMin,
        }}
        confirmLabel={
          cancel.isPending
            ? copy.cancelling
            : copy.cancelCount(cancelTarget?.future_cancellable_count ?? 0)
        }
        pending={cancel.isPending}
        error={cancelError}
        onSubmit={(body) => void onCancel(body)}
      />
    </div>
  );
}
