"use client";

import { Boxes, Clock3, Repeat, Truck } from "lucide-react";
import { useState } from "react";
import { QUANTITY_UNIT_LABELS, type QuantityUnit } from "@logislot/shared";
import { useFlash } from "@/components/config/page-shell";
import { SupplierCancelDialog } from "@/components/domain/supplier-cancel-dialog";
import { SupplierSeriesSection } from "@/components/domain/supplier-series-section";
import { EmptyState, ErrorState, LoadingState } from "@/components/config/states";
import { CargoBadge } from "@/components/domain/cargo-badge";
import { StatusBadge } from "@/components/domain/status-badge";
import { MetricCard } from "@/components/shell/metric-card";
import { PageContainer, PageHeader } from "@/components/shell/page";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  useCancelSupplierAppointment,
  useSupplierAppointments,
  useSupplierProfile,
  type SupplierCancelBody,
} from "@/lib/api/supplier";
import type { AppointmentDto, SupplierCancellationPolicyDto } from "@/lib/api/types";
import { useApiErrorMessage } from "@/lib/i18n/api-error";
import { useLabels } from "@/lib/i18n/labels";
import { useFormat, useT } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";

const HOUR_MS = 3600_000;

/** Tedarikcinin iptal edebilecegi durum: bekleyen/onayli ve henuz baslamamis. */
function isCancellableStatus(appointment: AppointmentDto): boolean {
  return (
    ["pending", "approved"].includes(appointment.status) &&
    new Date(appointment.scheduled_start_at).getTime() > Date.now()
  );
}

/** Tesisin iptal kuralina gore son iptal ani (kural yoksa null). */
function cancelDeadline(
  appointment: AppointmentDto,
  policy: SupplierCancellationPolicyDto | undefined,
): Date | null {
  if (!policy?.min_notice_hours) return null;
  return new Date(
    new Date(appointment.scheduled_start_at).getTime() - policy.min_notice_hours * HOUR_MS,
  );
}

/** "YYYY-MM-DD" gun degerini saat dilimi kaymasi olmadan bicimler. */
function dateOnlyIso(day: string): string {
  return `${day}T12:00:00`;
}

/** Iptal dugmesi + son iptal ani; kural suresi dolduysa dugme yerine aciklama. */
function CancelAction({
  appointment,
  policy,
  now,
  onCancel,
}: {
  appointment: AppointmentDto;
  policy: SupplierCancellationPolicyDto | undefined;
  now: number;
  onCancel: () => void;
}) {
  const t = useT();
  const fmt = useFormat();
  const deadline = cancelDeadline(appointment, policy);
  if (deadline && deadline.getTime() < now)
    return (
      <p className="rounded-md bg-muted px-2 py-1.5 text-xs text-muted-foreground">
        {t.supplier.appointments.cancelWindowClosed(policy!.min_notice_hours)}
      </p>
    );
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <Button size="sm" variant="ghost" className="w-fit text-destructive" onClick={onCancel}>
        {t.supplier.appointments.cancel}
      </Button>
      {deadline && (
        <span className="text-xs text-muted-foreground">
          {t.supplier.appointments.cancelDeadline(fmt.dayMonthTime(deadline.toISOString()))}
        </span>
      )}
    </div>
  );
}

export default function SupplierAppointmentsPage() {
  const t = useT();
  const fmt = useFormat();
  const labels = useLabels();
  const errorMessage = useApiErrorMessage();
  const [activeTab, setActiveTab] = useState<"upcoming" | "past">("upcoming");
  const profile = useSupplierProfile();
  const list = useSupplierAppointments();
  const cancel = useCancelSupplierAppointment();
  const { flash, showFlash } = useFlash();
  const [confirmTarget, setConfirmTarget] = useState<AppointmentDto | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const policy = profile.data?.cancellation_policy;

  if (list.isLoading) return <LoadingState />;
  if (list.isError)
    return <ErrorState message={t.supplier.appointments.loadError} onRetry={() => list.refetch()} />;

  const all = list.data ?? [];
  const now = Date.now();
  const upcoming = all
    .filter(
      (a) =>
        new Date(a.scheduled_start_at).getTime() >= now - 3600_000 &&
        !["completed", "cancelled", "rejected"].includes(a.status),
    )
    .sort(
      (a, b) =>
        new Date(a.scheduled_start_at).getTime() - new Date(b.scheduled_start_at).getTime(),
    );
  const past = all.filter((a) => !upcoming.includes(a));
  const shown = activeTab === "upcoming" ? upcoming : past;

  const counters: {
    label: string;
    value: number;
    icon: typeof Clock3;
    tone: "primary" | "pending" | "completed";
  }[] = [
    { label: t.supplier.appointments.counters.upcoming, value: upcoming.length, icon: Clock3, tone: "primary" },
    {
      label: t.supplier.appointments.counters.pending,
      value: all.filter((a) => a.status === "pending").length,
      icon: Boxes,
      tone: "pending",
    },
    {
      label: t.supplier.appointments.counters.completed,
      value: all.filter((a) => a.status === "completed").length,
      icon: Truck,
      tone: "completed",
    },
  ];

  async function onCancel(body: SupplierCancelBody) {
    if (!confirmTarget) return;
    setCancelError(null);
    try {
      await cancel.mutateAsync({ id: confirmTarget.id, ...body });
      showFlash("success", t.appointmentDrawer.cancelled);
      setConfirmTarget(null);
    } catch (err) {
      // Form acik kalir: kullanici secimini kaybetmeden duzeltebilsin.
      setCancelError(errorMessage(err, t.supplier.appointments.cancelFailed));
    }
  }

  return (
    <PageContainer className="mx-auto max-w-5xl">
      <PageHeader
        title={profile.data?.company_name ?? t.supplier.appointments.fallbackTitle}
        description={
          profile.data
            ? `${t.supplier.appointments.codePrefix} ${profile.data.code}${
                profile.data.category_label ? ` · ${profile.data.category_label}` : ""
              }`
            : undefined
        }
      />

      {flash && (
        <div
          className={cn(
            "rounded-xl border px-3.5 py-2.5 text-sm",
            flash.kind === "success"
              ? "border-status-approved/40 bg-status-approved/10 text-status-approved"
              : "border-destructive/40 bg-destructive/10 text-destructive",
          )}
        >
          {flash.text}
        </div>
      )}

      <SupplierSeriesSection onFlash={showFlash} />

      <div className="grid grid-cols-3 gap-3">
        {counters.map((c) => (
          <MetricCard
            key={c.label}
            icon={c.icon}
            label={c.label}
            value={c.value}
            tone={c.tone}
          />
        ))}
      </div>

      <div className="flex rounded-xl bg-muted p-1">
        {(
          [
            ["upcoming", t.supplier.appointments.tabs.upcoming],
            ["past", t.supplier.appointments.tabs.past],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={cn(
              "flex-1 rounded-md py-1.5 text-sm font-medium transition-colors",
              activeTab === key ? "bg-card shadow-sm" : "text-muted-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <EmptyState
          title={t.supplier.appointments.emptyTitle}
          description={
            activeTab === "upcoming"
              ? t.supplier.appointments.emptyUpcoming
              : t.supplier.appointments.emptyPast
          }
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {shown.map((a) => (
            <Card key={a.id}>
            <CardContent className="flex flex-col gap-2 p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="break-words text-sm font-semibold">{a.product_name}</div>
                  <div className="break-words text-xs text-muted-foreground">
                    {a.quantity}{" "}
                    {labels.quantityUnit[a.quantity_unit as QuantityUnit] ?? a.quantity_unit}
                    {a.product_category_name ? ` · ${a.product_category_name}` : ""}
                  </div>
                </div>
                <StatusBadge status={a.status as never} className="shrink-0" />
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span>{fmt.date(a.scheduled_start_at)}</span>
                <span>
                  {fmt.time(a.scheduled_start_at)}–{fmt.time(a.scheduled_end_at)}
                </span>
                {a.dock_name && <span>{a.dock_name}</span>}
                {a.vehicle_category_name && <span>{a.vehicle_category_name}</span>}
                {a.license_plate && <span className="font-mono">{a.license_plate}</span>}
              </div>
              {a.delivery_type === "cargo" && (
                <CargoBadge window={a.cargo_window as never} />
              )}
              {a.series_id && a.occurrence_index && (
                <span className="w-fit rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                  <Repeat className="mr-1 inline h-3 w-3" />
                  {t.supplier.appointments.recurring(a.occurrence_index)}
                </span>
              )}
              {a.status === "rejected" && a.rejection_reason && (
                <p className="rounded-md bg-status-rejected/10 px-2 py-1 text-xs text-status-rejected">
                  {t.supplier.appointments.rejectionReason} {a.rejection_reason}
                </p>
              )}
              {a.status === "revision_pending" && a.original_start_at && (
                <div className="rounded-md bg-status-revision/10 px-2 py-1.5 text-xs text-status-revision">
                  <div className="font-medium">{t.supplier.appointments.revisionTitle}</div>
                  <div>
                    {fmt.date(a.original_start_at)} {fmt.time(a.original_start_at)} →{" "}
                    {fmt.date(a.scheduled_start_at)} {fmt.time(a.scheduled_start_at)}
                  </div>
                  {a.revision_note && <div className="mt-0.5">
                      {t.supplier.appointments.revisionNote} {a.revision_note}
                    </div>}
                </div>
              )}
              {a.status === "cancelled" &&
                (a.cancellation_reason_code || a.cancellation_reason) && (
                  <p className="rounded-md bg-status-cancelled/10 px-2 py-1 text-xs text-status-cancelled">
                    {t.supplier.appointments.cancellationReason}{" "}
                    {labels.cancellationReasonText(
                      a.cancellation_reason_code,
                      a.cancellation_reason,
                    )}
                    {a.cancellation_alternative_date && (
                      <span className="block">
                        {t.supplier.appointments.alternativeDate}{" "}
                        {fmt.date(dateOnlyIso(a.cancellation_alternative_date))}
                      </span>
                    )}
                  </p>
                )}
              {/* Kural profille gelir; yuklenmeden form eksik alanla acilmasin. */}
              {isCancellableStatus(a) && profile.isSuccess && (
                <CancelAction
                  appointment={a}
                  policy={policy}
                  now={now}
                  onCancel={() => {
                    setCancelError(null);
                    setConfirmTarget(a);
                  }}
                />
              )}
            </CardContent>
          </Card>
          ))}
        </div>
      )}

      <SupplierCancelDialog
        open={confirmTarget !== null}
        title={t.supplier.appointments.cancelTitle}
        intro={t.supplier.appointments.cancelMessage(confirmTarget?.product_name ?? "")}
        policy={policy}
        confirmLabel={t.supplier.appointments.cancel}
        pending={cancel.isPending}
        error={cancelError}
        onSubmit={(body) => void onCancel(body)}
        onClose={() => setConfirmTarget(null)}
      />
    </PageContainer>
  );
}
