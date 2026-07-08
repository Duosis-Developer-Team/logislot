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

const FREQUENCY_LABELS: Record<string, string> = {
  weekly: "Haftalık",
  biweekly: "2 haftada bir",
  monthly: "Aylık",
};

export default function SeriesPage() {
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
      showFlash("success", `Serideki ${result.affected_count} randevu onaylandı.`);
    } catch (err) {
      showFlash("error", err instanceof ApiError ? err.message : "Onaylanamadı");
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
        `Serideki ${result.affected_count} randevu ${result.new_time} saatine revize edildi (tedarikçi onayı bekleniyor).`,
      );
      setReviseTarget(null);
    } catch (err) {
      setReviseError(err instanceof ApiError ? err.message : "Revize edilemedi");
    }
  }

  async function onCancel() {
    if (!cancelTarget) return;
    try {
      const result = await cancel.mutateAsync({ seriesId: cancelTarget.id });
      showFlash(
        "success",
        `Serinin gelecekteki ${result.affected_count} randevusu iptal edildi.`,
      );
    } catch (err) {
      showFlash("error", err instanceof ApiError ? err.message : "İşlem başarısız");
    } finally {
      setCancelTarget(null);
    }
  }

  if (list.isLoading) return <LoadingState />;
  if (list.isError)
    return <ErrorState message="Seriler yüklenemedi." onRetry={() => list.refetch()} />;

  const rows = list.data ?? [];
  const futureCancellable = (row: SeriesListRowDto) =>
    (row.status_counts["pending"] ?? 0) +
    (row.status_counts["approved"] ?? 0) +
    (row.status_counts["revision_pending"] ?? 0);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-bold">Tekrarlayan Seriler</h1>
        <p className="text-sm text-muted-foreground">
          Tedarikçi sihirbazından oluşturulan seriler. Seri iptali yalnızca gelecekteki
          randevuları kapsar; tamamlanmış randevulara dokunulmaz.
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
          title="Tekrarlayan seri yok"
          description="Tedarikçiler sihirbazdan tekrarlayan randevu oluşturduğunda burada listelenir."
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Tedarikçi</TH>
              <TH>Sıklık</TH>
              <TH>Randevular</TH>
              <TH>Durum</TH>
              <TH>Oluşturulma</TH>
              <TH className="text-right">İşlem</TH>
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
                    {FREQUENCY_LABELS[row.frequency] ?? row.frequency} × {row.occurrence_count}
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
                      {row.status === "active" ? "Aktif" : "İptal Edildi"}
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
                            Seriyi Onayla
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
                            Seriyi Revize Et
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
                            Seriyi İptal Et
                          </Button>
                        )}
                    </div>
                  </TD>
                </TR>
                {expandedId === row.id && (
                  <TR>
                    <TD colSpan={6} className="bg-muted/30">
                      {detail.isLoading ? (
                        <LoadingState label="Randevular yükleniyor…" />
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
        title="Seriyi Revize Et"
      >
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            <strong>{reviseTarget ? futureCancellable(reviseTarget) : 0}</strong> gelecek
            randevu aynı saate kaydırılacak; tamamlanmışlara dokunulmaz. Tüm tarihler
            kural setinden geçer — biri uymazsa <strong>hiçbiri değişmez</strong>.
            Randevular tedarikçi onayı için &quot;Revize Bekliyor&quot; durumuna alınır.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Yeni Saat</Label>
              <Input type="time" value={newTime} onChange={(e) => setNewTime(e.target.value)} />
            </div>
            <div>
              <Label>Süre (dk, boş = değişmez)</Label>
              <Input
                type="number"
                min={15}
                value={reviseDuration}
                onChange={(e) => setReviseDuration(e.target.value)}
                placeholder="Örn. 90"
              />
            </div>
          </div>
          <div>
            <Label>Rampa</Label>
            <div className="flex gap-2">
              <Select
                value={reviseDockMode}
                onChange={(e) => setReviseDockMode(e.target.value as "auto" | "manual")}
                className="w-40 shrink-0"
              >
                <option value="auto">Otomatik ata</option>
                <option value="manual">Manuel seç</option>
              </Select>
              {reviseDockMode === "manual" && (
                <Select
                  value={reviseDockId}
                  onChange={(e) => setReviseDockId(e.target.value)}
                >
                  <option value="">— Rampa —</option>
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
              placeholder="Örn. Pilot programı güncellendi"
            />
          </div>
          {reviseError && <p className="text-sm text-destructive">{reviseError}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setReviseTarget(null)}>
              Vazgeç
            </Button>
            <Button onClick={() => void onRevise()} disabled={revise.isPending}>
              {revise.isPending ? "Revize ediliyor…" : "Seriyi Revize Et"}
            </Button>
          </div>
        </div>
      </Dialog>

      <ConfirmDialog
        open={approveTarget !== null}
        title="Seriyi onayla"
        message={`Serideki ${
          approveTarget ? approveTarget.status_counts["revision_pending"] ?? 0 : 0
        } revize bekleyen randevu onaylanacak. Onay anında çakışmalar yeniden kontrol edilir; biri uygun değilse hiçbiri onaylanmaz.`}
        confirmLabel="Seriyi Onayla"
        loading={approve.isPending}
        onConfirm={onApprove}
        onClose={() => setApproveTarget(null)}
      />

      <ConfirmDialog
        open={cancelTarget !== null}
        title="Seriyi iptal et"
        message={`${cancelTarget?.supplier_name ?? "Tedarikçi"} serisinin gelecekteki ${
          cancelTarget ? futureCancellable(cancelTarget) : 0
        } randevusu iptal edilecek. Tamamlanmış randevular etkilenmez; tedarikçiye tek özet bildirim gider.`}
        confirmLabel="Seriyi İptal Et"
        loading={cancel.isPending}
        onConfirm={onCancel}
        onClose={() => setCancelTarget(null)}
      />

      <AppointmentDrawer appointmentId={drawerId} onClose={() => setDrawerId(null)} />
    </div>
  );
}
