"use client";

import { Boxes, Clock3, Repeat, Truck } from "lucide-react";
import { useState } from "react";
import { QUANTITY_UNIT_LABELS, type QuantityUnit } from "@logislot/shared";
import { ConfirmDialog } from "@/components/config/confirm-dialog";
import { useFlash } from "@/components/config/page-shell";
import { SupplierSeriesSection } from "@/components/domain/supplier-series-section";
import { EmptyState, ErrorState, LoadingState } from "@/components/config/states";
import { CargoBadge } from "@/components/domain/cargo-badge";
import { StatusBadge } from "@/components/domain/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ApiError } from "@/lib/api/client";
import {
  useCancelSupplierAppointment,
  useSupplierAppointments,
  useSupplierProfile,
} from "@/lib/api/supplier";
import type { AppointmentDto } from "@/lib/api/types";
import { cn, formatDate, formatTime } from "@/lib/utils";

function canCancel(appointment: AppointmentDto): boolean {
  return (
    ["pending", "approved"].includes(appointment.status) &&
    new Date(appointment.scheduled_start_at).getTime() > Date.now()
  );
}

export default function SupplierAppointmentsPage() {
  const [activeTab, setActiveTab] = useState<"upcoming" | "past">("upcoming");
  const profile = useSupplierProfile();
  const list = useSupplierAppointments();
  const cancel = useCancelSupplierAppointment();
  const { flash, showFlash } = useFlash();
  const [confirmTarget, setConfirmTarget] = useState<AppointmentDto | null>(null);

  if (list.isLoading) return <LoadingState />;
  if (list.isError)
    return <ErrorState message="Randevular yüklenemedi." onRetry={() => list.refetch()} />;

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

  const counters = [
    { label: "Yaklaşan", value: upcoming.length, icon: Clock3 },
    { label: "Bekleyen", value: all.filter((a) => a.status === "pending").length, icon: Boxes },
    {
      label: "Tamamlanan",
      value: all.filter((a) => a.status === "completed").length,
      icon: Truck,
    },
  ];

  async function onCancel() {
    if (!confirmTarget) return;
    try {
      await cancel.mutateAsync(confirmTarget.id);
      showFlash("success", "Randevu iptal edildi.");
    } catch (err) {
      showFlash("error", err instanceof ApiError ? err.message : "İptal edilemedi");
    } finally {
      setConfirmTarget(null);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
      <div>
        <h1 className="text-xl font-bold sm:text-2xl">
          {profile.data?.company_name ?? "Randevularım"}
        </h1>
        {profile.data && (
          <p className="text-xs text-muted-foreground">
            Kod: {profile.data.code}
            {profile.data.category_label ? ` · ${profile.data.category_label}` : ""}
          </p>
        )}
      </div>

      {flash && (
        <div
          className={cn(
            "rounded-lg border px-3 py-2 text-sm",
            flash.kind === "success"
              ? "border-status-approved/40 bg-status-approved/10 text-status-approved"
              : "border-destructive/40 bg-destructive/10 text-destructive",
          )}
        >
          {flash.text}
        </div>
      )}

      <SupplierSeriesSection onFlash={showFlash} />

      <div className="grid grid-cols-3 gap-2">
        {counters.map((c) => {
          const Icon = c.icon;
          return (
            <Card key={c.label}>
              <CardContent className="flex flex-col items-center gap-1 p-3">
                <Icon className="h-4 w-4 text-primary" />
                <span className="text-xl font-bold">{c.value}</span>
                <span className="text-[11px] text-muted-foreground">{c.label}</span>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="flex rounded-lg bg-muted p-1">
        {(
          [
            ["upcoming", "Yaklaşan"],
            ["past", "Geçmiş"],
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
          title="Randevu yok"
          description={
            activeTab === "upcoming"
              ? "Yeni Randevu sekmesinden 3 adımda talep oluşturabilirsiniz."
              : "Geçmiş randevunuz bulunmuyor."
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
                    {QUANTITY_UNIT_LABELS[a.quantity_unit as QuantityUnit] ?? a.quantity_unit}
                    {a.product_category_name ? ` · ${a.product_category_name}` : ""}
                  </div>
                </div>
                <StatusBadge status={a.status as never} className="shrink-0" />
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span>{formatDate(a.scheduled_start_at)}</span>
                <span>
                  {formatTime(a.scheduled_start_at)}–{formatTime(a.scheduled_end_at)}
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
                  Tekrarlayan {a.occurrence_index}. randevu
                </span>
              )}
              {a.status === "rejected" && a.rejection_reason && (
                <p className="rounded-md bg-status-rejected/10 px-2 py-1 text-xs text-status-rejected">
                  Red sebebi: {a.rejection_reason}
                </p>
              )}
              {a.status === "revision_pending" && a.original_start_at && (
                <div className="rounded-md bg-status-revision/10 px-2 py-1.5 text-xs text-status-revision">
                  <div className="font-medium">Tesis yönetimi yeni saat önerdi:</div>
                  <div>
                    {formatDate(a.original_start_at)} {formatTime(a.original_start_at)} →{" "}
                    {formatDate(a.scheduled_start_at)} {formatTime(a.scheduled_start_at)}
                  </div>
                  {a.revision_note && <div className="mt-0.5">Not: {a.revision_note}</div>}
                </div>
              )}
              {a.status === "cancelled" && a.cancellation_reason && (
                <p className="rounded-md bg-status-cancelled/10 px-2 py-1 text-xs text-status-cancelled">
                  İptal sebebi: {a.cancellation_reason}
                </p>
              )}
              {canCancel(a) && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="w-fit text-destructive"
                  onClick={() => setConfirmTarget(a)}
                >
                  İptal Et
                </Button>
              )}
            </CardContent>
          </Card>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={confirmTarget !== null}
        title="Randevuyu iptal et"
        message={`"${confirmTarget?.product_name}" randevusu iptal edilecek. Bu işlem geri alınamaz.`}
        confirmLabel="İptal Et"
        loading={cancel.isPending}
        onConfirm={onCancel}
        onClose={() => setConfirmTarget(null)}
      />
    </div>
  );
}
