"use client";

import { Search } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import {
  APPOINTMENT_STATUS_LABELS,
  QUANTITY_UNIT_LABELS,
  type AppointmentStatus,
  type QuantityUnit,
} from "@logislot/shared";
import { AdminCreateDrawer } from "@/components/appointments/admin-create-drawer";
import { AppointmentDrawer } from "@/components/appointments/appointment-drawer";
import { ConfirmDialog } from "@/components/config/confirm-dialog";
import { useFlash } from "@/components/config/page-shell";
import { EmptyState, ErrorState, LoadingState } from "@/components/config/states";
import { CargoBadge } from "@/components/domain/cargo-badge";
import { StatusBadge } from "@/components/domain/status-badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { ApiError } from "@/lib/api/client";
import { useAppointmentActions, useAppointments } from "@/lib/api/appointments";
import type { AppointmentDto } from "@/lib/api/types";
import { useSession } from "@/lib/auth/session";
import { cn, formatDateTime } from "@/lib/utils";

const FILTERS: ("all" | AppointmentStatus)[] = [
  "all",
  "pending",
  "approved",
  "revision_pending",
  "completed",
  "rejected",
  "cancelled",
];

function AppointmentsListContent() {
  const { activeFacilityId, can } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<(typeof FILTERS)[number]>("all");
  const [query, setQuery] = useState("");
  const list = useAppointments(activeFacilityId, status);
  const actions = useAppointmentActions(activeFacilityId);
  const { flash, showFlash } = useFlash();
  const [createOpen, setCreateOpen] = useState(false);

  const [approveTarget, setApproveTarget] = useState<AppointmentDto | null>(null);
  const [rejectTarget, setRejectTarget] = useState<AppointmentDto | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectError, setRejectError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Deep-link: bildirimden gelen ?appointmentId=... drawer'i acar.
  const paramId = searchParams.get("appointmentId");
  useEffect(() => {
    if (paramId) setSelectedId(paramId);
  }, [paramId]);

  function closeDrawer() {
    setSelectedId(null);
    if (paramId) router.replace("/admin/appointments");
  }

  const rows = useMemo(() => {
    const all = list.data ?? [];
    const q = query.trim().toLocaleLowerCase("tr");
    if (!q) return all;
    return all.filter((a) =>
      [a.supplier_name ?? "", a.product_name, a.license_plate ?? ""]
        .join(" ")
        .toLocaleLowerCase("tr")
        .includes(q),
    );
  }, [list.data, query]);

  const pendingCount = (list.data ?? []).filter((a) => a.status === "pending").length;

  async function onApprove() {
    if (!approveTarget) return;
    try {
      await actions.approve.mutateAsync({ id: approveTarget.id });
      showFlash("success", "Randevu onaylandı; tedarikçiye bildirim gönderildi.");
    } catch (err) {
      showFlash("error", err instanceof ApiError ? err.message : "Onaylanamadı");
    } finally {
      setApproveTarget(null);
    }
  }

  async function onReject() {
    if (!rejectTarget) return;
    if (rejectReason.trim().length === 0) {
      setRejectError("Red sebebi zorunludur; tedarikçiye iletilir.");
      return;
    }
    try {
      await actions.reject.mutateAsync({ id: rejectTarget.id, reason: rejectReason });
      showFlash("success", "Randevu reddedildi; sebep tedarikçiye iletildi.");
      setRejectTarget(null);
      setRejectReason("");
      setRejectError(null);
    } catch (err) {
      setRejectError(err instanceof ApiError ? err.message : "Reddedilemedi");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Randevular</h1>
          <p className="text-sm text-muted-foreground">
            Tüm randevu talepleri — gerçek zamanlı; tedarikçi portalından gelen talepler
            burada görünür.
          </p>
        </div>
        {can("appt.create") && (
          <Button onClick={() => setCreateOpen(true)}>Yeni Randevu</Button>
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

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Tedarikçi, ürün veya plaka ara…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setStatus(f)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              status === f
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground hover:border-primary/40",
            )}
          >
            {f === "all" ? "Tümü" : APPOINTMENT_STATUS_LABELS[f]}
            {f === "pending" && pendingCount > 0 && (
              <span className="ml-1 rounded-full bg-status-pending px-1.5 text-[10px] font-bold text-white">
                {pendingCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {list.isLoading ? (
        <LoadingState />
      ) : list.isError ? (
        <ErrorState message="Randevular yüklenemedi." onRetry={() => list.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState
          title="Randevu bulunamadı"
          description="Seçili filtreye uyan randevu yok."
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Tarih / Saat</TH>
              <TH>Tedarikçi</TH>
              <TH>Ürün</TH>
              <TH>Miktar</TH>
              <TH>Rampa</TH>
              <TH>Araç</TH>
              <TH>Durum</TH>
              <TH className="text-right">İşlem</TH>
            </TR>
          </THead>
          <TBody>
            {rows.map((a) => (
              <TR
                key={a.id}
                className="cursor-pointer"
                onClick={() => setSelectedId(a.id)}
              >
                <TD className="whitespace-nowrap font-medium">
                  {formatDateTime(a.scheduled_start_at)}
                </TD>
                <TD>{a.supplier_name ?? "—"}</TD>
                <TD>
                  <div className="flex items-center gap-2">
                    {a.product_name}
                    {a.delivery_type === "cargo" && (
                      <CargoBadge window={a.cargo_window as never} />
                    )}
                  </div>
                </TD>
                <TD className="whitespace-nowrap">
                  {a.quantity}{" "}
                  {QUANTITY_UNIT_LABELS[a.quantity_unit as QuantityUnit] ?? a.quantity_unit}
                </TD>
                <TD>{a.dock_name ?? "—"}</TD>
                <TD>{a.vehicle_category_name ?? "—"}</TD>
                <TD>
                  <StatusBadge status={a.status as never} />
                </TD>
                <TD className="text-right" onClick={(e) => e.stopPropagation()}>
                  {a.status === "pending" ? (
                    <div className="flex justify-end gap-1">
                      {can("appt.approve") && (
                        <Button size="sm" onClick={() => setApproveTarget(a)}>
                          Onayla
                        </Button>
                      )}
                      {can("appt.reject") && (
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => {
                            setRejectTarget(a);
                            setRejectReason("");
                            setRejectError(null);
                          }}
                        >
                          Reddet
                        </Button>
                      )}
                    </div>
                  ) : (
                    <Button size="sm" variant="ghost" onClick={() => setSelectedId(a.id)}>
                      Detay
                    </Button>
                  )}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}

      <AppointmentDrawer
        appointmentId={selectedId}
        onClose={closeDrawer}
        onActionSuccess={(message) => showFlash("success", message)}
      />

      <AdminCreateDrawer
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSuccess={(message) => showFlash("success", message)}
      />

      <ConfirmDialog
        open={approveTarget !== null}
        title="Randevuyu onayla"
        message={`${approveTarget?.supplier_name ?? "Tedarikçi"} — "${approveTarget?.product_name}" talebi onaylanacak.`}
        confirmLabel="Onayla"
        loading={actions.approve.isPending}
        onConfirm={onApprove}
        onClose={() => setApproveTarget(null)}
      />

      <Dialog
        open={rejectTarget !== null}
        onClose={() => setRejectTarget(null)}
        title="Randevuyu reddet"
      >
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            {rejectTarget?.supplier_name} — “{rejectTarget?.product_name}” talebi
            reddedilecek. Sebep tedarikçiye iletilir.
          </p>
          <div>
            <Label>Red Sebebi</Label>
            <Input
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Örn. Kapasite dolu"
              autoFocus
            />
          </div>
          {rejectError && <p className="text-sm text-destructive">{rejectError}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setRejectTarget(null)}>
              Vazgeç
            </Button>
            <Button
              variant="destructive"
              onClick={onReject}
              disabled={actions.reject.isPending}
            >
              {actions.reject.isPending ? "İşleniyor…" : "Reddet"}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}

export default function AppointmentsListPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <AppointmentsListContent />
    </Suspense>
  );
}
