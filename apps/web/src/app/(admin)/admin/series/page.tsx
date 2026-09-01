"use client";

import { Repeat } from "lucide-react";
import { Fragment, useState } from "react";
import { APPOINTMENT_STATUS_LABELS } from "@logislot/shared";
import { ConfirmDialog } from "@/components/config/confirm-dialog";
import { useFlash } from "@/components/config/page-shell";
import { EmptyState, ErrorState, LoadingState } from "@/components/config/states";
import { AppointmentDrawer } from "@/components/appointments/appointment-drawer";
import { StatusBadge } from "@/components/domain/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Dialog } from "@/components/ui/dialog";
import { Input, Label, Select } from "@/components/ui/input";
import {
  useAppointmentSeries,
  useSeriesApprove,
  useSeriesCancel,
  useSeriesDetail,
  useSeriesRevise,
  type SeriesListRowDto,
} from "@/lib/api/appointments";
import { docks as dockResource } from "@/lib/api/resources";
import { ApiError } from "@/lib/api/client";
import { useSession } from "@/lib/auth/session";
import { cn, formatDate } from "@/lib/utils";
import { useApiErrorMessage } from "@/lib/i18n/api-error";
import { useT } from "@/lib/i18n/provider";



export default function SeriesPage() {
  const t = useT();
  const errorMessage = useApiErrorMessage();
  const { activeFacilityId, can } = useSession();
  const list = useAppointmentSeries(activeFacilityId);
  const cancel = useSeriesCancel(activeFacilityId);
  const { flash, showFlash } = useFlash();

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const detail = useSeriesDetail(activeFacilityId, expandedId);
  const [cancelTarget, setCancelTarget] = useState<SeriesListRowDto | null>(null);
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const approve = useSeriesApprove(activeFacilityId);
  const [approveTarget, setApproveTarget] = useState<SeriesListRowDto | null>(null);

  async function onApprove() {
    if (!approveTarget) return;
    try {
      const result = await approve.mutateAsync({ seriesId: approveTarget.id });
      showFlash("success", t.admin.series.approved(result.affected_count));
    } catch (err) {
      showFlash("error", errorMessage(err, t.admin.series.approveFailed));
    } finally {
      setApproveTarget(null);
    }
  }

  // Seri revize dialogu (Sprint 10)
  const revise = useSeriesRevise(activeFacilityId);
  const dockList = dockResource.useList(activeFacilityId);
  const [reviseTarget, setReviseTarget] = useState<SeriesListRowDto | null>(null);
  const [newTime, setNewTime] = useState("10:00");
  const [reviseDuration, setReviseDuration] = useState<string>("");
  const [reviseDockMode, setReviseDockMode] = useState<"auto" | "manual">("auto");
  const [reviseDockId, setReviseDockId] = useState("");
  const [reviseNote, setReviseNote] = useState("");
  const [reviseError, setReviseError] = useState<string | null>(null);

  async function onRevise() {
    if (!reviseTarget) return;
    setReviseError(null);
    try {
      const result = await revise.mutateAsync({
        seriesId: reviseTarget.id,
        new_time: newTime,
        duration_minutes: reviseDuration ? Number(reviseDuration) : null,
        auto_assign_dock: reviseDockMode === "auto",
        dock_id: reviseDockMode === "manual" ? reviseDockId || null : null,
        note: reviseNote || null,
      });
      showFlash(
        "success",
        t.admin.series.revised(result.affected_count, result.new_time),
      );
      setReviseTarget(null);
    } catch (err) {
      setReviseError(err instanceof ApiError ? err.message : t.admin.series.reviseFailed);
    }
  }

  async function onCancel() {
    if (!cancelTarget) return;
    try {
      const result = await cancel.mutateAsync({ seriesId: cancelTarget.id });
      showFlash(
        "success",
        t.admin.series.cancelledCount(result.affected_count),
      );
    } catch (err) {
      showFlash("error", errorMessage(err, t.admin.series.actionFailed));
    } finally {
      setCancelTarget(null);
    }
  }

  if (list.isLoading) return <LoadingState />;
  if (list.isError)
    return <ErrorState message={t.admin.series.loadError} onRetry={() => list.refetch()} />;

  const rows = list.data ?? [];
  const futureCancellable = (row: SeriesListRowDto) =>
    (row.status_counts["pending"] ?? 0) +
    (row.status_counts["approved"] ?? 0) +
    (row.status_counts["revision_pending"] ?? 0);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-bold">{t.admin.series.title}</h1>
        <p className="text-sm text-muted-foreground">
          {t.admin.series.description}
        </p>
      </div>

      {flash && (
        <div
          className={cn(
            "rounded-lg border px-4 py-2.5 text-sm",
            flash.kind === "success"
              ? "border-status-approved/30 bg-status-approved/10 text-status-approved"
              : "border-destructive/30 bg-destructive/10 text-destructive",
          )}
        >
          {flash.text}
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyState
          title={t.admin.series.emptyTitle}
          description={t.admin.series.emptyDescription}
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>{t.admin.appointments.colSupplier}</TH>
              <TH>{t.admin.series.colFrequency}</TH>
              <TH>{t.admin.series.colAppointments}</TH>
              <TH>{t.admin.series.colStatus}</TH>
              <TH>{t.admin.series.colCreated}</TH>
              <TH className="text-right">{t.common.actions}</TH>
            </TR>
          </THead>
          <TBody>
            {rows.map((row) => (
              <Fragment key={row.id}>
                <TR
                  className="cursor-pointer"
                  onClick={() => setExpandedId(expandedId === row.id ? null : row.id)}
                >
                  <TD className="font-medium">
                    <span className="flex items-center gap-2">
                      <Repeat className="h-4 w-4 text-primary" />
                      {row.supplier_name ?? "—"}
                    </span>
                  </TD>
                  <TD>
                    {t.admin.series.frequency[row.frequency] ?? row.frequency} × {row.occurrence_count}
                  </TD>
                  <TD>
                    <div className="flex flex-wrap gap-1">
                      {Object.entries(row.status_counts).map(([status, count]) => (
                        <Badge key={status} className="bg-muted text-muted-foreground">
                          {APPOINTMENT_STATUS_LABELS[
                            status as keyof typeof APPOINTMENT_STATUS_LABELS
                          ] ?? status}
                          : {count}
                        </Badge>
                      ))}
                    </div>
                  </TD>
                  <TD>
                    <Badge
                      className={
                        row.status === "active"
                          ? "bg-status-approved/15 text-status-approved"
                          : "bg-status-cancelled/15 text-status-cancelled"
                      }
                    >
                      {row.status === "active" ? t.admin.series.active : t.admin.series.cancelled}
                    </Badge>
                  </TD>
                  <TD className="text-xs text-muted-foreground">
                    {row.created_at ? formatDate(row.created_at) : "—"}
                  </TD>
                  <TD className="text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex justify-end gap-1">
                      {can("appt.approve") &&
                        row.status === "active" &&
                        (row.status_counts["revision_pending"] ?? 0) > 0 && (
                          <Button size="sm" onClick={() => setApproveTarget(row)}>
                            {t.admin.series.approveSeries}
                          </Button>
                        )}
                      {can("appt.revise") &&
                        row.status === "active" &&
                        futureCancellable(row) > 0 && (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => {
                              setReviseError(null);
                              setReviseNote("");
                              setReviseTarget(row);
                            }}
                          >
                            {t.admin.series.reviseSeries}
                          </Button>
                        )}
                      {can("appt.cancel") &&
                        row.status === "active" &&
                        futureCancellable(row) > 0 && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive"
                            onClick={() => setCancelTarget(row)}
                          >
                            {t.admin.series.cancelSeries}
                          </Button>
                        )}
                    </div>
                  </TD>
                </TR>
                {expandedId === row.id && (
                  <TR>
                    <TD colSpan={6} className="bg-muted/30">
                      {detail.isLoading ? (
                        <LoadingState label={t.admin.series.loadingAppointments} />
                      ) : (
                        <div className="flex flex-wrap gap-2 py-1">
                          {(detail.data?.appointments ?? []).map((appt) => (
                            <button
                              key={appt.id}
                              type="button"
                              onClick={() => setDrawerId(appt.id)}
                              className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-xs hover:border-primary/40"
                            >
                              <span className="font-medium">{appt.occurrence_index}.</span>
                              {formatDate(appt.scheduled_start_at)}
                              <StatusBadge status={appt.status as never} />
                            </button>
                          ))}
                        </div>
                      )}
                    </TD>
                  </TR>
                )}
              </Fragment>
            ))}
          </TBody>
        </Table>
      )}

      <Dialog
        open={reviseTarget !== null}
        onClose={() => setReviseTarget(null)}
        title={t.admin.series.reviseTitle}
      >
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            <strong>{reviseTarget ? futureCancellable(reviseTarget) : 0}</strong>{" "}
            {t.admin.series.reviseCountWord} {t.admin.series.reviseLead} <strong>{t.admin.series.reviseStrong}</strong>
            {t.admin.series.reviseTail}
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>{t.admin.series.newTime}</Label>
              <Input type="time" value={newTime} onChange={(e) => setNewTime(e.target.value)} />
            </div>
            <div>
              <Label>{t.admin.series.duration}</Label>
              <Input
                type="number"
                min={15}
                value={reviseDuration}
                onChange={(e) => setReviseDuration(e.target.value)}
                placeholder={t.admin.series.durationPlaceholder}
              />
            </div>
          </div>
          <div>
            <Label>{t.common.dock}</Label>
            <div className="flex gap-2">
              <Select
                value={reviseDockMode}
                onChange={(e) => setReviseDockMode(e.target.value as "auto" | "manual")}
                className="w-40 shrink-0"
              >
                <option value="auto">{t.admin.series.autoAssign}</option>
                <option value="manual">{t.admin.series.manualSelect}</option>
              </Select>
              {reviseDockMode === "manual" && (
                <Select
                  value={reviseDockId}
                  onChange={(e) => setReviseDockId(e.target.value)}
                >
                  <option value="">{t.admin.series.selectDock}</option>
                  {(dockList.data ?? [])
                    .filter((d) => d.is_active)
                    .map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                </Select>
              )}
            </div>
          </div>
          <div>
            <Label>Not (opsiyonel)</Label>
            <Input
              value={reviseNote}
              onChange={(e) => setReviseNote(e.target.value)}
              placeholder={t.admin.series.notePlaceholder}
            />
          </div>
          {reviseError && <p className="text-sm text-destructive">{reviseError}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setReviseTarget(null)}>
              {t.common.cancel}
            </Button>
            <Button onClick={() => void onRevise()} disabled={revise.isPending}>
              {revise.isPending ? t.admin.series.revising : t.admin.series.reviseSeries}
            </Button>
          </div>
        </div>
      </Dialog>

      <ConfirmDialog
        open={approveTarget !== null}
        title={t.admin.series.approveTitle}
        message={t.admin.series.approveSeriesMessage(
          approveTarget ? (approveTarget.status_counts["revision_pending"] ?? 0) : 0,
        )}
        confirmLabel={t.admin.series.approveSeries}
        loading={approve.isPending}
        onConfirm={onApprove}
        onClose={() => setApproveTarget(null)}
      />

      <ConfirmDialog
        open={cancelTarget !== null}
        title={t.admin.series.cancelSeries}
        message={t.admin.series.cancelMessage(
          cancelTarget?.supplier_name ?? t.admin.appointments.supplierFallback,
          cancelTarget ? futureCancellable(cancelTarget) : 0,
        )}
        confirmLabel={t.admin.series.cancelSeries}
        loading={cancel.isPending}
        onConfirm={onCancel}
        onClose={() => setCancelTarget(null)}
      />

      <AppointmentDrawer appointmentId={drawerId} onClose={() => setDrawerId(null)} />
    </div>
  );
}
