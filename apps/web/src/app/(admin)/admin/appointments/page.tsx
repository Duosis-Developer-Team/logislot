"use client";

import { Download, Search } from "lucide-react";
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
import {
  SortableTH,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
  type SortDirection,
} from "@/components/ui/table";
import { ApiError } from "@/lib/api/client";
import {
  APPOINTMENT_PAGE_LIMIT,
  isTruncated,
  useAppointmentActions,
  useAppointments,
} from "@/lib/api/appointments";
import type { AppointmentDto } from "@/lib/api/types";
import { useSession } from "@/lib/auth/session";
import { downloadCsv, timestampedFileName, toCsv } from "@/lib/csv";
import { cn, formatDateTime } from "@/lib/utils";
import { useApiErrorMessage } from "@/lib/i18n/api-error";
import { useLabels } from "@/lib/i18n/labels";
import { useT } from "@/lib/i18n/provider";

const FILTERS: ("all" | AppointmentStatus)[] = [
  "all",
  "pending",
  "approved",
  "revision_pending",
  "completed",
  "rejected",
  "cancelled",
];

type SortKey =
  | "scheduled_start_at"
  | "supplier_name"
  | "product_name"
  | "quantity"
  | "dock_name"
  | "vehicle_category_name"
  | "status";

/** Turkce siralama: "İ/ı/ş/ğ" ingilizce siralamada yanlis yere duser. */
const collator = new Intl.Collator("tr", { sensitivity: "base", numeric: true });

function statusLabel(status: string): string {
  return status;
}

function unitLabel(unit: string): string {
  return unit;
}

/** Sutun degeri. Bos alanlar `null` doner ve YONDEN BAGIMSIZ en sona atilir —
 *  "—" satirlarini listenin basina toplamak kullaniciya bilgi vermez. */
function sortValue(a: AppointmentDto, key: SortKey): string | number | null {
  switch (key) {
    case "scheduled_start_at":
      return new Date(a.scheduled_start_at).getTime();
    case "quantity":
      return a.quantity;
    case "status":
      // Siralama HAM statuye gore: dile gore degisen bir sira kullaniciyi sasirtir.
      return a.status;
    case "supplier_name":
      return a.supplier_name || null;
    case "product_name":
      return a.product_name || null;
    case "dock_name":
      return a.dock_name || null;
    case "vehicle_category_name":
      return a.vehicle_category_name || null;
  }
}

function compareRows(a: AppointmentDto, b: AppointmentDto, key: SortKey, dir: SortDirection) {
  const left = sortValue(a, key);
  const right = sortValue(b, key);
  if (left === null && right === null) return 0;
  if (left === null) return 1; // bos deger daima sonda
  if (right === null) return -1;
  const result =
    typeof left === "number" && typeof right === "number"
      ? left - right
      : collator.compare(String(left), String(right));
  return dir === "asc" ? result : -result;
}

function AppointmentsListContent() {
  const t = useT();
  const labels = useLabels();
  const errorMessage = useApiErrorMessage();
  const { activeFacilityId, can } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<(typeof FILTERS)[number]>("all");
  const [query, setQuery] = useState("");
  // Siralama SECILENE KADAR API sirasi korunur; kullanici tiklamadan gorunum
  // degismesin.
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDirection } | null>(null);
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
    const filtered = q
      ? all.filter((a) =>
          [a.supplier_name ?? "", a.product_name, a.license_plate ?? ""]
            .join(" ")
            .toLocaleLowerCase("tr")
            .includes(q),
        )
      : all;
    if (!sort) return filtered;
    // Kopya uzerinde siralanir: `list.data` react-query onbellegidir.
    return [...filtered].sort((a, b) => compareRows(a, b, sort.key, sort.dir));
  }, [list.data, query, sort]);

  /** Ayni sutuna tekrar tiklamak yonu cevirir, yeni sutun artan baslar. */
  function toggleSort(key: SortKey) {
    setSort((current) =>
      current?.key === key
        ? { key, dir: current.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "asc" },
    );
  }

  /** EKRANDA NE VARSA onu indirir: aktif filtre, arama ve siralama dahil.
   *  Kullanicinin gordugu liste ile dosyanin ayrilmasi kafa karistirirdi. */
  function exportCsv() {
    const content = toCsv(
      [
        t.admin.appointments.csv.date,
        t.admin.appointments.csv.time,
        t.admin.appointments.csv.supplier,
        t.admin.appointments.csv.product,
        t.admin.appointments.csv.quantity,
        t.admin.appointments.csv.unit,
        t.admin.appointments.csv.dock,
        t.admin.appointments.csv.vehicle,
        t.admin.appointments.csv.status,
        t.admin.appointments.csv.plate,
        t.admin.appointments.csv.driver,
        t.admin.appointments.csv.duration,
      ],
      rows.map((a) => {
        const start = new Date(a.scheduled_start_at);
        return [
          start.toLocaleDateString("tr-TR"),
          start.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" }),
          a.supplier_name ?? "",
          a.product_name,
          a.quantity,
          labels.quantityUnit[a.quantity_unit as QuantityUnit] ?? a.quantity_unit,
          a.dock_name ?? "",
          a.vehicle_category_name ?? "",
          labels.appointmentStatus[a.status as AppointmentStatus] ?? a.status,
          a.license_plate ?? "",
          a.driver_name ?? "",
          a.duration_minutes,
        ];
      }),
    );
    downloadCsv(timestampedFileName(t.admin.appointments.csv.fileName), content);
  }

  const pendingCount = (list.data ?? []).filter((a) => a.status === "pending").length;

  async function onApprove() {
    if (!approveTarget) return;
    try {
      await actions.approve.mutateAsync({ id: approveTarget.id });
      showFlash("success", t.admin.appointments.approved);
    } catch (err) {
      showFlash("error", errorMessage(err, t.admin.appointments.approveFailed));
    } finally {
      setApproveTarget(null);
    }
  }

  async function onReject() {
    if (!rejectTarget) return;
    if (rejectReason.trim().length === 0) {
      setRejectError(t.admin.appointments.rejectReasonRequired);
      return;
    }
    try {
      await actions.reject.mutateAsync({ id: rejectTarget.id, reason: rejectReason });
      showFlash("success", t.admin.appointments.rejected);
      setRejectTarget(null);
      setRejectReason("");
      setRejectError(null);
    } catch (err) {
      setRejectError(errorMessage(err, t.admin.appointments.rejectFailed));
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">{t.admin.appointments.title}</h1>
          <p className="text-sm text-muted-foreground">
            {t.admin.appointments.description}
          </p>
        </div>
        {can("appt.create") && (
          <Button onClick={() => setCreateOpen(true)}>{t.admin.appointments.create}</Button>
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

      {isTruncated(list.data) && (
        // Sunucu toplam sayi dondurmuyor; sonuc limite dayandiysa daha fazlasi
        // OLABILIR. Sessiz kirpma CSV'yi guvenilmez kilardi.
        <p className="rounded-lg border border-status-pending/40 bg-status-pending/10 px-3 py-2 text-xs text-foreground">
          {t.admin.appointments.truncated(APPOINTMENT_PAGE_LIMIT)}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[16rem] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder={t.admin.appointments.searchPlaceholder}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <Button
          variant="secondary"
          onClick={exportCsv}
          disabled={rows.length === 0}
          title={t.common.exportHint}
        >
          <Download className="h-4 w-4" />
          {t.common.downloadCsv}
        </Button>
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
            {f === "all" ? t.common.all : labels.appointmentStatus[f]}
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
        <ErrorState message={t.admin.appointments.loadError} onRetry={() => list.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState
          title={t.admin.appointments.emptyTitle}
          description={t.admin.appointments.emptyDescription}
        />
      ) : (
        <Table>
          <THead>
            <TR>
              {(
                [
                  ["scheduled_start_at", t.admin.appointments.colDateTime],
                  ["supplier_name", t.admin.appointments.colSupplier],
                  ["product_name", t.admin.appointments.colProduct],
                  ["quantity", t.admin.appointments.colQuantity],
                  ["dock_name", t.admin.appointments.colDock],
                  ["vehicle_category_name", t.admin.appointments.colVehicle],
                  ["status", t.admin.appointments.colStatus],
                ] as [SortKey, string][]
              ).map(([key, label]) => (
                <SortableTH
                  key={key}
                  label={label}
                  active={sort?.key === key}
                  direction={sort?.key === key ? sort.dir : "asc"}
                  onSort={() => toggleSort(key)}
                />
              ))}
              <TH className="text-right">{t.common.actions}</TH>
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
                          {t.admin.appointments.approve}
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
                          {t.admin.appointments.reject}
                        </Button>
                      )}
                    </div>
                  ) : (
                    <Button size="sm" variant="ghost" onClick={() => setSelectedId(a.id)}>
                      {t.common.detail}
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
        title={t.admin.appointments.approveTitle}
        message={t.admin.appointments.approveMessage(
          approveTarget?.supplier_name ?? t.admin.appointments.supplierFallback,
          approveTarget?.product_name ?? "",
        )}
        confirmLabel={t.appointmentDrawer.approve}
        loading={actions.approve.isPending}
        onConfirm={onApprove}
        onClose={() => setApproveTarget(null)}
      />

      <Dialog
        open={rejectTarget !== null}
        onClose={() => setRejectTarget(null)}
        title={t.admin.appointments.rejectTitle}
      >
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            {rejectTarget?.supplier_name} — “{rejectTarget?.product_name}”{" "}
            {t.admin.appointments.rejectRequestWord}{" "}
            {t.admin.appointments.rejectLead}
          </p>
          <div>
            <Label>{t.admin.appointments.rejectReason}</Label>
            <Input
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder={t.admin.appointments.rejectPlaceholder}
              autoFocus
            />
          </div>
          {rejectError && <p className="text-sm text-destructive">{rejectError}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setRejectTarget(null)}>
              {t.common.cancel}
            </Button>
            <Button
              variant="destructive"
              onClick={onReject}
              disabled={actions.reject.isPending}
            >
              {actions.reject.isPending ? t.admin.appointments.processing : t.admin.appointments.reject}
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
