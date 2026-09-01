"use client";

/**
 * Ortak randevu detay/aksiyon drawer'i — takvim, randevu listesi ve dashboard
 * ayni bileseni kullanir. Aksiyonlar backend'in `allowed_actions` haritasina
 * gore gorunur (status + izin + rampa scope'u backend'de birlesir).
 */

import { ArrowRight, Mail, Package, Phone, Repeat } from "lucide-react";
import { useMemo, useState } from "react";
import {
  APPOINTMENT_STATUS_LABELS,
  QUANTITY_UNIT_LABELS,
  type QuantityUnit,
  formatDurationRange,
  resolveDurationRange,
} from "@logislot/shared";
import { ConfirmDialog } from "@/components/config/confirm-dialog";
import { ErrorState, LoadingState } from "@/components/config/states";
import { CargoBadge } from "@/components/domain/cargo-badge";
import { StatusBadge } from "@/components/domain/status-badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Modal } from "@/components/ui/modal";
import { Input, Label, Select } from "@/components/ui/input";
import {
  useAdminAvailability,
  useAppointmentActions,
  useAppointmentDetail,
  useDockOptions,
  useEmailResend,
  useSeriesCancel,
} from "@/lib/api/appointments";
import { ApiError } from "@/lib/api/client";
import { emailProviderLabel, emailStatusLabel, emailTemplateLabel } from "@/lib/email-labels";
import { useEmailLogs } from "@/lib/api/reports";
import {
  docks as dockResource,
  productCategories as categoryResource,
} from "@/lib/api/resources";
import { useSession } from "@/lib/auth/session";
import { formatDate, isoFromWallClock, timeInTz } from "@/lib/utils";
import { useApiErrorMessage } from "@/lib/i18n/api-error";
import { useT } from "@/lib/i18n/provider";

interface AppointmentDrawerProps {
  appointmentId: string | null;
  onClose: () => void;
  /** Basarili aksiyon sonrasi ek geri bildirim (sayfa flash'i vb.). */
  onActionSuccess?: (message: string) => void;
}

export function AppointmentDrawer({
  appointmentId,
  onClose,
  onActionSuccess,
}: AppointmentDrawerProps) {
  const t = useT();
  const errorMessage = useApiErrorMessage();
  const { activeFacilityId, activeFacility, can } = useSession();
  const detail = useAppointmentDetail(activeFacilityId, appointmentId);
  const dockList = dockResource.useList(activeFacilityId);
  const categoryList = categoryResource.useList(activeFacilityId);
  const actions = useAppointmentActions(activeFacilityId);
  const tz = activeFacility?.timezone ?? "Europe/Istanbul";

  const [dialog, setDialog] = useState<
    | null
    | "approve"
    | "reject"
    | "complete"
    | "cancel"
    | "revise"
    | "dock-change"
    | "cancel-series"
  >(null);
  const seriesCancel = useSeriesCancel(activeFacilityId);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);

  // Revize formu
  const [reviseDate, setReviseDate] = useState("");
  const [reviseTime, setReviseTime] = useState("");
  const [reviseDuration, setReviseDuration] = useState(60);
  const [reviseDock, setReviseDock] = useState<string>("auto");
  const [reviseNote, setReviseNote] = useState("");

  // Rampa degisimi (saat degismez) — secenekler sunucudan gelir.
  const [dockTarget, setDockTarget] = useState<string>("auto");
  const [dockNote, setDockNote] = useState("");
  // Secenekler yalnizca diyalog acikken cekilir (gereksiz istek uretme).
  const dockOptions = useDockOptions(
    activeFacilityId,
    dialog === "dock-change" ? appointmentId : null,
  );

  const a = detail.data ?? null;
  const allowed = a?.allowed_actions;
  const emailLogs = useEmailLogs(activeFacilityId, appointmentId);
  const emailResend = useEmailResend(activeFacilityId);
  const [resendError, setResendError] = useState<string | null>(null);

  async function onResend(logId: string) {
    setResendError(null);
    try {
      const result = await emailResend.mutateAsync(logId);
      if (result.status === "failed") {
        setResendError(result.error_message ?? t.appointmentDrawer.resendFailed);
      }
      void emailLogs.refetch();
    } catch (err) {
      setResendError(errorMessage(err, t.appointmentDrawer.resendError));
    }
  }

  /**
   * Revize suresi secenekleri KATEGORI araligiyla sinirlanir.
   *
   * Tedarikci limitleri bilerek disarida: tedarikci listesi SUPPLIER_MANAGE
   * ister ve rampa yoneticisi de revize edebilir. Backend sure degistiginde
   * her iki limiti de dogruladigi icin guvenlik acigi olusmaz.
   */
  const reviseCategoryRange = useMemo(() => {
    const category = (categoryList.data ?? []).find(
      (c) => c.id === a?.product_category_id,
    );
    return category ? resolveDurationRange(category) : null;
  }, [categoryList.data, a?.product_category_id]);

  const reviseDurationOptions = useMemo(() => {
    if (!reviseCategoryRange) return [];
    // Mevcut sure listede degilse (limitler sonradan daraltildi) yine de
    // gosterilir; boylece "sureyi degistirmeden" kaydetmek mumkun kalir.
    const current = a?.duration_minutes;
    return current != null && !reviseCategoryRange.options.includes(current)
      ? [...reviseCategoryRange.options, current].sort((x, y) => x - y)
      : reviseCategoryRange.options;
  }, [reviseCategoryRange, a?.duration_minutes]);

  // Revize hedefinde kargo advisory onizlemesi (engellemez; farkindalik).
  const reviseAvailability = useAdminAvailability(
    activeFacilityId,
    dialog === "revise" && a && reviseDate
      ? {
          supplier_id: a.supplier_id,
          product_category_id: a.product_category_id,
          vehicle_category_id: a.vehicle_category_id,
          target_date: reviseDate,
          duration_minutes: reviseDuration,
        }
      : null,
  );
  const reviseTargetSlot =
    reviseTime && reviseAvailability.data
      ? reviseAvailability.data.find(
          (s) => timeInTz(s.start, tz) === reviseTime,
        ) ?? null
      : null;
  const reviseAdvisories = reviseTargetSlot?.advisory_warnings ?? [];

  /**
   * Revize hedefinde secilebilir rampalar.
   *
   * Uyumluluk rampanin kabul ettigi urun kategorilerinden (bos liste = hepsi),
   * doluluk ise hedef slotun `candidate_dock_ids` degerinden gelir — ikincisi
   * SUNUCU kararidir, istemci yeniden hesaplamaz.
   */
  const reviseEligibleDocks = useMemo(() => {
    const all = (dockList.data ?? []).filter((d) => d.is_active);
    const compatible = a?.product_category_id
      ? all.filter(
          (d) =>
            d.accepted_product_category_ids.length === 0 ||
            d.accepted_product_category_ids.includes(a.product_category_id),
        )
      : all;
    const freeIds = reviseTargetSlot ? new Set(reviseTargetSlot.candidate_dock_ids) : null;
    return compatible.map((d) => ({
      ...d,
      available: freeIds === null ? true : freeIds.has(d.id),
    }));
  }, [dockList.data, a?.product_category_id, reviseTargetSlot]);

  function openDialog(kind: NonNullable<typeof dialog>) {
    setActionError(null);
    setReason("");
    setNote("");
    if (kind === "revise" && a) {
      const startLocal = new Date(a.scheduled_start_at).toLocaleString("sv-SE", {
        timeZone: tz,
      });
      setReviseDate(startLocal.slice(0, 10));
      setReviseTime(startLocal.slice(11, 16));
      setReviseDuration(a.duration_minutes);
      setReviseDock(a.dock_id ?? "auto");
      setReviseNote("");
    }
    if (kind === "dock-change") {
      setDockTarget("auto");
      setDockNote("");
    }
    setDialog(kind);
  }

  async function run(action: () => Promise<unknown>, successMessage: string) {
    setActionError(null);
    try {
      await action();
      setDialog(null);
      onActionSuccess?.(successMessage);
    } catch (err) {
      setActionError(errorMessage(err, t.appointmentDrawer.actionFailed));
    }
  }

  const isBusy =
    actions.approve.isPending ||
    actions.reject.isPending ||
    actions.complete.isPending ||
    actions.cancel.isPending ||
    actions.revise.isPending;

  return (
    <Modal open={appointmentId !== null} onClose={onClose} title={t.appointmentDrawer.title}>
      {detail.isLoading ? (
        <LoadingState />
      ) : detail.isError || !a ? (
        <ErrorState message={t.appointmentDrawer.loadError} onRetry={() => detail.refetch()} />
      ) : (
        <div className="flex flex-col gap-5">
          {/* Baslik + statu */}
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold">{a.supplier_name}</h3>
              <p className="text-sm text-muted-foreground">{a.product_name}</p>
            </div>
            <div className="flex flex-col items-end gap-1">
              <StatusBadge status={a.status as never} />
              {a.delivery_type === "cargo" && (
                <CargoBadge window={a.cargo_window as never} />
              )}
            </div>
          </div>

          {/* Bilgi izgarasi */}
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg border border-border p-4 text-sm">
            <dt className="text-muted-foreground">Tarih</dt>
            <dd>{formatDate(a.scheduled_start_at)}</dd>
            <dt className="text-muted-foreground">Saat</dt>
            <dd>
              {timeInTz(a.scheduled_start_at, tz)}–{timeInTz(a.scheduled_end_at, tz)} (
              {a.duration_minutes} dk)
            </dd>
            <dt className="text-muted-foreground">Rampa</dt>
            <dd>{a.dock_name ?? "—"}</dd>
            <dt className="text-muted-foreground">Kategori</dt>
            <dd>{a.product_category_name ?? "—"}</dd>
            <dt className="text-muted-foreground">Miktar</dt>
            <dd>
              {a.quantity}{" "}
              {QUANTITY_UNIT_LABELS[a.quantity_unit as QuantityUnit] ?? a.quantity_unit}
            </dd>
            <dt className="text-muted-foreground">{t.appointmentDrawer.vehicle}</dt>
            <dd>{a.vehicle_category_name ?? "—"}</dd>
            {a.license_plate && (
              <>
                <dt className="text-muted-foreground">Plaka</dt>
                <dd className="font-mono">{a.license_plate}</dd>
              </>
            )}
            {a.driver_name && (
              <>
                <dt className="text-muted-foreground">{t.appointmentDrawer.driver}</dt>
                <dd>{a.driver_name}</dd>
              </>
            )}
            {a.supplier_contact?.phone && (
              <>
                <dt className="text-muted-foreground">{t.appointmentDrawer.contact}</dt>
                <dd className="flex items-center gap-1">
                  <Phone className="h-3 w-3" />
                  {a.supplier_contact.phone}
                </dd>
              </>
            )}
          </dl>

          {a.delivery_type === "cargo" && (
            <p className="flex items-center gap-2 rounded-lg bg-cargo/10 px-3 py-2 text-xs text-cargo">
              <Package className="h-4 w-4 shrink-0" />
              {t.appointmentDrawer.cargoNote}
            </p>
          )}

          {a.series && (
            <div className="flex items-center justify-between gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-primary">
              <span className="flex items-center gap-2">
                <Repeat className="h-4 w-4 shrink-0" />
                Tekrarlayan serinin {a.series.occurrence_index}/{a.series.occurrence_count}.
                randevusu (
                {a.series.frequency === "weekly"
                  ? t.appointmentDrawer.weekly
                  : a.series.frequency === "biweekly"
                    ? "2 haftada bir"
                    : t.appointmentDrawer.monthly}
                ). Randevular tek tek revize/iptal edilebilir.
              </span>
              {can("appt.cancel") && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="shrink-0 text-destructive"
                  onClick={() => {
                    setReason("");
                    setActionError(null);
                    setDialog("cancel-series");
                  }}
                >
                  {t.appointmentDrawer.cancelSeries}
                </Button>
              )}
            </div>
          )}

          {a.rejection_reason && (
            <p className="rounded-lg bg-status-rejected/10 px-3 py-2 text-sm text-status-rejected">
              Red sebebi: {a.rejection_reason}
            </p>
          )}
          {a.cancellation_reason && (
            <p className="rounded-lg bg-status-cancelled/10 px-3 py-2 text-sm text-status-cancelled">
              {t.appointmentDrawer.cancellationReason} {a.cancellation_reason}
            </p>
          )}
          {a.completion_note && (
            <p className="rounded-lg bg-status-completed/10 px-3 py-2 text-sm text-status-completed">
              Tamamlama notu: {a.completion_note}
            </p>
          )}

          {/* Revizyon gecmisi */}
          {(a.revisions?.length ?? 0) > 0 && (
            <div className="flex flex-col gap-2">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t.appointmentDrawer.revisionHistory}
              </h4>
              {a.revisions!.map((r) => (
                <div
                  key={r.id}
                  className="rounded-lg border border-status-revision/30 bg-status-revision/5 p-3 text-xs"
                >
                  <div className="flex items-center gap-2 font-medium">
                    {formatDate(r.old_start_at)} {timeInTz(r.old_start_at, tz)}
                    <ArrowRight className="h-3 w-3" />
                    {formatDate(r.new_start_at)} {timeInTz(r.new_start_at, tz)}
                  </div>
                  {r.note && <p className="mt-1 text-muted-foreground">{r.note}</p>}
                </div>
              ))}
            </div>
          )}

          {/* E-posta loglari — log_only provider; v1.0 otomatik e-posta davranisi */}
          {(emailLogs.data?.length ?? 0) > 0 && (
            <div className="flex flex-col gap-2">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t.appointmentDrawer.emailLogs}
              </h4>
              {resendError && (
                <p className="text-xs text-destructive">{resendError}</p>
              )}
              {emailLogs.data!.map((log) => (
                <div
                  key={log.id}
                  className="flex items-start gap-2 rounded-lg border border-border p-2.5 text-xs"
                >
                  <Mail className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{log.subject}</div>
                    <div className="text-muted-foreground">
                      {log.recipient_email} · {emailTemplateLabel(t, log.template_key)}
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground">
                      <span
                        className={
                          log.status === "sent"
                            ? "text-status-approved"
                            : log.status === "failed"
                              ? "text-status-rejected"
                              : ""
                        }
                      >
                        {emailStatusLabel(t, log.status)}
                      </span>
                      <span>{emailProviderLabel(t, log.provider)}</span>
                      {log.retry_count > 0 && (
                        <span>deneme: {log.retry_count}/{log.max_attempts}</span>
                      )}
                      <span>
                        {new Date(log.last_attempt_at ?? log.created_at).toLocaleString(
                          "tr-TR",
                          {
                            day: "2-digit",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          },
                        )}
                      </span>
                    </div>
                    {log.status === "failed" && log.error_message && (
                      <div className="mt-0.5 text-[10px] text-status-rejected">
                        {log.error_message}
                      </div>
                    )}
                  </div>
                  {log.status === "failed" &&
                    (log.retry_count < log.max_attempts ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        className="shrink-0"
                        disabled={emailResend.isPending}
                        onClick={() => void onResend(log.id)}
                      >
                        {emailResend.isPending ? t.appointmentDrawer.sending : t.appointmentDrawer.resend}
                      </Button>
                    ) : (
                      <span className="shrink-0 text-[10px] text-muted-foreground">
                        {t.appointmentDrawer.noAttemptsLeft}
                      </span>
                    ))}
                </div>
              ))}
            </div>
          )}

          {actionError && !dialog && (
            <p className="text-sm text-destructive">{actionError}</p>
          )}

          {/* Aksiyonlar — backend allowed_actions (status+izin+scope) */}
          {allowed && Object.values(allowed).some(Boolean) && (
            <div className="flex flex-wrap gap-2 border-t border-border pt-4">
              {allowed.approve && (
                <Button size="sm" onClick={() => openDialog("approve")}>
                  Onayla
                </Button>
              )}
              {allowed.revise && (
                <Button size="sm" variant="secondary" onClick={() => openDialog("revise")}>
                  Revize Et
                </Button>
              )}
              {/* Rampa degisimi revizeyle AYNI yetkiye baglidir ama ayri bir
                  aksiyondur: saat degismedigi icin randevu durumu korunur. */}
              {allowed.revise && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => openDialog("dock-change")}
                >
                  {t.appointmentDrawer.changeDock}
                </Button>
              )}
              {allowed.complete && (
                <Button size="sm" variant="secondary" onClick={() => openDialog("complete")}>
                  Tamamla
                </Button>
              )}
              {allowed.reject && (
                <Button size="sm" variant="destructive" onClick={() => openDialog("reject")}>
                  Reddet
                </Button>
              )}
              {allowed.cancel && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive"
                  onClick={() => openDialog("cancel")}
                >
                  {t.appointmentDrawer.cancel}
                </Button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Onayla */}
      <ConfirmDialog
        open={dialog === "approve"}
        title="Randevuyu onayla"
        message={t.appointmentDrawer.approveMessage(a?.supplier_name ?? "", a?.product_name ?? "")}
        confirmLabel="Onayla"
        loading={actions.approve.isPending}
        onConfirm={() =>
          run(() => actions.approve.mutateAsync({ id: a!.id }), t.appointmentDrawer.approved)
        }
        onClose={() => setDialog(null)}
      />

      {/* Reddet */}
      <Dialog open={dialog === "reject"} onClose={() => setDialog(null)} title="Randevuyu reddet">
        <div className="flex flex-col gap-3">
          <div>
            <Label>{t.appointmentDrawer.rejectReason}</Label>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t.appointmentDrawer.rejectPlaceholder}
              autoFocus
            />
          </div>
          {actionError && <p className="text-sm text-destructive">{actionError}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDialog(null)}>
              {t.common.cancel}
            </Button>
            <Button
              variant="destructive"
              disabled={isBusy}
              onClick={() => {
                if (!reason.trim()) {
                  setActionError("Red sebebi zorunludur.");
                  return;
                }
                run(
                  () => actions.reject.mutateAsync({ id: a!.id, reason }),
                  "Randevu reddedildi.",
                );
              }}
            >
              Reddet
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Tamamla */}
      <Dialog
        open={dialog === "complete"}
        onClose={() => setDialog(null)}
        title="Randevuyu tamamla"
      >
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            {t.appointmentDrawer.completeNote}
          </p>
          <div>
            <Label>Not (opsiyonel)</Label>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t.appointmentDrawer.completePlaceholder}
            />
          </div>
          {actionError && <p className="text-sm text-destructive">{actionError}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDialog(null)}>
              {t.common.cancel}
            </Button>
            <Button
              disabled={isBusy}
              onClick={() =>
                run(
                  () => actions.complete.mutateAsync({ id: a!.id, note }),
                  t.appointmentDrawer.completed,
                )
              }
            >
              Tamamla
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Iptal */}
      <Dialog open={dialog === "cancel"} onClose={() => setDialog(null)} title="Randevuyu iptal et">
        <div className="flex flex-col gap-3">
          <div>
            <Label>{t.appointmentDrawer.cancelReason}</Label>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t.appointmentDrawer.cancelPlaceholder}
            />
          </div>
          {actionError && <p className="text-sm text-destructive">{actionError}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDialog(null)}>
              {t.common.cancel}
            </Button>
            <Button
              variant="destructive"
              disabled={isBusy}
              onClick={() =>
                run(
                  () => actions.cancel.mutateAsync({ id: a!.id, reason }),
                  "Randevu iptal edildi.",
                )
              }
            >
              {t.appointmentDrawer.cancel}
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Seri toplu iptali */}
      <Dialog
        open={dialog === "cancel-series"}
        onClose={() => setDialog(null)}
        title="Seriyi iptal et"
      >
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            {t.appointmentDrawer.seriesCancelLead}{" "}
            <strong>{t.appointmentDrawer.seriesCancelStrong}</strong>{" "}
            {t.appointmentDrawer.seriesCancelTail}
          </p>
          <div>
            <Label>{t.appointmentDrawer.cancelReason}</Label>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t.appointmentDrawer.seriesCancelPlaceholder}
            />
          </div>
          {actionError && <p className="text-sm text-destructive">{actionError}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDialog(null)}>
              {t.common.cancel}
            </Button>
            <Button
              variant="destructive"
              disabled={seriesCancel.isPending}
              onClick={() =>
                run(async () => {
                  const result = await seriesCancel.mutateAsync({
                    seriesId: a!.series!.id,
                    reason,
                  });
                  return result;
                }, t.appointmentDrawer.seriesCancelled)
              }
            >
              {seriesCancel.isPending
                ? t.appointmentDrawer.cancelling
                : t.appointmentDrawer.cancelSeries}
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Rampa degisimi — saat/sure ve durum DEGISMEZ */}
      <Dialog
        open={dialog === "dock-change"}
        onClose={() => setDialog(null)}
        title={t.appointmentDrawer.changeDockTitle}
      >
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            {t.appointmentDrawer.changeDockLead}
          </p>
          <div>
            <Label>Rampa</Label>
            {dockOptions.isLoading ? (
              <p className="text-xs text-muted-foreground">{t.appointmentDrawer.loadingDocks}</p>
            ) : (
              <Select value={dockTarget} onChange={(e) => setDockTarget(e.target.value)}>
                <option value="auto">Otomatik ata (en az dolu uygun rampa)</option>
                {(dockOptions.data?.options ?? []).map((o) => (
                  <option key={o.dock_id} value={o.dock_id} disabled={!o.available}>
                    {o.name}
                    {o.is_current ? " (mevcut)" : ""}
                    {o.available ? "" : ` — ${o.reason ?? t.appointmentDrawer.notAvailable}`}
                  </option>
                ))}
              </Select>
            )}
            <p className="mt-1 text-xs text-muted-foreground">
              {t.appointmentDrawer.dockFilterHint}
            </p>
          </div>
          <div>
            <Label>Not</Label>
            <Input
              value={dockNote}
              onChange={(e) => setDockNote(e.target.value)}
              placeholder={t.appointmentDrawer.supplierNotePlaceholder}
            />
          </div>
          {actionError && <p className="text-sm text-destructive">{actionError}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDialog(null)}>
              {t.common.cancel}
            </Button>
            <Button
              disabled={isBusy}
              onClick={() =>
                run(
                  () =>
                    actions.changeDock.mutateAsync({
                      id: a!.id,
                      dock_id: dockTarget === "auto" ? null : dockTarget,
                      note: dockNote || null,
                    }),
                  t.appointmentDrawer.dockChanged,
                )
              }
            >
              {actions.changeDock.isPending
                ? t.appointmentDrawer.saving
                : t.appointmentDrawer.changeDockConfirm}
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Revize */}
      <Dialog open={dialog === "revise"} onClose={() => setDialog(null)} title="Randevuyu revize et">
        <div className="flex flex-col gap-3">
          {a?.original_start_at && (
            <p className="text-xs text-muted-foreground">
              Orijinal talep: {formatDate(a.original_start_at)}{" "}
              {timeInTz(a.original_start_at, tz)}
            </p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Yeni Tarih</Label>
              <Input
                type="date"
                value={reviseDate}
                onChange={(e) => setReviseDate(e.target.value)}
              />
            </div>
            <div>
              <Label>{t.appointmentDrawer.newStart}</Label>
              <Input
                type="time"
                value={reviseTime}
                onChange={(e) => setReviseTime(e.target.value)}
              />
            </div>
            <div>
              <Label>{t.appointmentDrawer.duration}</Label>
              <Select
                value={reviseDuration}
                onChange={(e) => setReviseDuration(Number(e.target.value))}
              >
                {reviseDurationOptions.map((d) => (
                  <option key={d} value={d}>
                    {d} dakika
                    {reviseCategoryRange &&
                    (d < reviseCategoryRange.min ||
                      (reviseCategoryRange.max != null && d > reviseCategoryRange.max))
                      ? t.appointmentDrawer.outOfRange
                      : ""}
                  </option>
                ))}
              </Select>
              {reviseCategoryRange && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {t.appointmentDrawer.categoryRange}{" "}
                  {formatDurationRange(reviseCategoryRange.min, reviseCategoryRange.max)}
                </p>
              )}
            </div>
            <div>
              <Label>Rampa</Label>
              <Select value={reviseDock} onChange={(e) => setReviseDock(e.target.value)}>
                <option value="auto">Otomatik ata (en az dolu uygun rampa)</option>
                {reviseEligibleDocks.map((d) => (
                  <option key={d.id} value={d.id} disabled={!d.available}>
                    {d.name}
                    {d.available ? "" : " — hedef saatte dolu"}
                  </option>
                ))}
              </Select>
              <p className="mt-1 text-xs text-muted-foreground">
                {t.appointmentDrawer.dockFilterHint}
                listelenir.
              </p>
            </div>
          </div>
          <div>
            <Label>Revizyon Notu</Label>
            <Input
              value={reviseNote}
              onChange={(e) => setReviseNote(e.target.value)}
              placeholder={t.appointmentDrawer.supplierNotePlaceholder}
            />
          </div>
          {reviseAdvisories.length > 0 && (
            <p className="flex items-start gap-2 rounded-lg border border-cargo/40 bg-cargo/10 px-3 py-2 text-xs text-cargo">
              <Package className="mt-0.5 h-4 w-4 shrink-0" />
              {t.appointmentDrawer.cargoWarning}
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            {t.appointmentDrawer.reviseHint}
            &quot;{APPOINTMENT_STATUS_LABELS.revision_pending}&quot; olur.
          </p>
          {actionError && <p className="text-sm text-destructive">{actionError}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDialog(null)}>
              {t.common.cancel}
            </Button>
            <Button
              disabled={isBusy || !reviseDate || !reviseTime}
              onClick={() =>
                run(
                  () =>
                    actions.revise.mutateAsync({
                      id: a!.id,
                      new_start_at: isoFromWallClock(reviseDate, reviseTime, tz),
                      new_duration_minutes: reviseDuration,
                      new_dock_id: reviseDock === "auto" ? null : reviseDock,
                      auto_assign_dock: reviseDock === "auto",
                      note: reviseNote || null,
                      acknowledged_warning_codes: reviseAdvisories.map((w) => w.code),
                    }),
                  t.appointmentDrawer.revised,
                )
              }
            >
              {actions.revise.isPending ? "Kaydediliyor…" : "Revize Et"}
            </Button>
          </div>
        </div>
      </Dialog>
    </Modal>
  );
}
