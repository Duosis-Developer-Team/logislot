"use client";

import {
  CalendarCheck2,
  CalendarClock,
  CheckCircle2,
  Package,
  Truck,
  Users2,
  Warehouse,
} from "lucide-react";
import { useState } from "react";
import { useFlash } from "@/components/config/page-shell";
import { EmptyState, ErrorState, LoadingState } from "@/components/config/states";
import { AppointmentDrawer } from "@/components/appointments/appointment-drawer";
import { CargoBadge } from "@/components/domain/cargo-badge";
import { StatusBadge } from "@/components/domain/status-badge";
import { MetricCard } from "@/components/shell/metric-card";
import { PageContainer, PageHeader } from "@/components/shell/page";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useDashboardSummary } from "@/lib/api/appointments";
import { useFacilityPlanWarnings } from "@/lib/api/reports";
import { useSession } from "@/lib/auth/session";
import { cn, formatDate, timeInTz } from "@/lib/utils";
import { useApiErrorMessage } from "@/lib/i18n/api-error";
import { useT } from "@/lib/i18n/provider";

export default function DashboardPage() {
  const t = useT();
  const errorMessage = useApiErrorMessage();
  const { activeFacilityId, activeFacility } = useSession();
  const summary = useDashboardSummary(activeFacilityId);
  const tz = activeFacility?.timezone ?? "Europe/Istanbul";
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { flash, showFlash } = useFlash();

  if (summary.isLoading) return <LoadingState label={t.admin.dashboard.loading} />;
  if (summary.isError || !summary.data)
    return (
      <ErrorState message={t.admin.dashboard.loadError} onRetry={() => summary.refetch()} />
    );

  const data = summary.data;
  const stats: {
    label: string;
    value: number;
    icon: typeof CalendarClock;
    tone?: "primary" | "cargo";
  }[] = [
    { label: t.admin.dashboard.todayAppointments, value: data.today_appointments, icon: CalendarClock },
    { label: t.admin.dashboard.pendingApprovals, value: data.pending_approvals, icon: CalendarCheck2 },
    { label: t.admin.dashboard.completedToday, value: data.completed_today, icon: CheckCircle2 },
    { label: t.admin.dashboard.weekTotal, value: data.week_total, icon: Truck },
    { label: t.admin.dashboard.activeSuppliers, value: data.active_suppliers, icon: Users2 },
    { label: t.admin.dashboard.activeDocks, value: data.active_docks, icon: Warehouse },
    { label: t.admin.dashboard.cargoWarned, value: data.cargo_warned, icon: Package, tone: "cargo" },
  ];

  return (
    <PageContainer>
      <PlanWarningBanner />
      <PageHeader
        title={t.nav.admin.dashboard}
        description={t.admin.dashboard.summaryFor(activeFacility?.name ?? "")}
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

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        {stats.map((s) => (
          <MetricCard
            key={s.label}
            icon={s.icon}
            label={s.label}
            value={s.value}
            tone={s.tone ?? "primary"}
          />
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t.admin.dashboard.pendingRequests}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {data.pending_list.length === 0 ? (
              <EmptyState
                title={t.admin.dashboard.noPending}
                description={t.admin.dashboard.newRequestsHint}
              />
            ) : (
              data.pending_list.map((a) => (
                <button
                  key={a.id}
                  onClick={() => setSelectedId(a.id)}
                  className="flex items-center justify-between gap-2 rounded-lg border border-border p-3 text-left transition-colors hover:border-primary/40"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">
                      {a.supplier_name} — {a.product_name}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {formatDate(a.scheduled_start_at)} ·{" "}
                      {timeInTz(a.scheduled_start_at, tz)} · {a.dock_name}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <StatusBadge status={a.status as never} />
                    {a.delivery_type === "cargo" && (
                      <CargoBadge window={a.cargo_window as never} />
                    )}
                  </div>
                </button>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t.admin.dashboard.upcoming}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {data.upcoming.length === 0 ? (
              <EmptyState
                title={t.admin.dashboard.noUpcoming}
                description={t.admin.dashboard.calendarEmpty}
              />
            ) : (
              data.upcoming.map((a) => (
                <button
                  key={a.id}
                  onClick={() => setSelectedId(a.id)}
                  className="flex items-center justify-between gap-2 rounded-lg border border-border p-3 text-left transition-colors hover:border-primary/40"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="w-14 shrink-0 text-sm font-semibold">
                      {timeInTz(a.scheduled_start_at, tz)}
                    </span>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{a.product_name}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {a.supplier_name} · {a.dock_name} ·{" "}
                        {formatDate(a.scheduled_start_at)}
                      </div>
                    </div>
                  </div>
                  <StatusBadge status={a.status as never} />
                </button>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <AppointmentDrawer
        appointmentId={selectedId}
        onClose={() => setSelectedId(null)}
        onActionSuccess={(message) => showFlash("success", message)}
      />
    </PageContainer>
  );
}


/** Plan kullanim uyarisi (Sprint 11) — bilgilendirme amaclidir, engellemez. */
function PlanWarningBanner() {
  const t = useT();
  const { activeFacilityId, can } = useSession();
  const warnings = useFacilityPlanWarnings(can("report.view") ? activeFacilityId : null);
  const rows = warnings.data?.warnings ?? [];
  if (rows.length === 0) return null;
  const worst = rows[0];
  const cls =
    worst.severity === "critical"
      ? "border-status-rejected/40 bg-status-rejected/10 text-status-rejected"
      : worst.severity === "warning"
        ? "border-status-pending/40 bg-status-pending/10 text-status-pending"
        : "border-border bg-muted/40 text-muted-foreground";
  return (
    <div className={`rounded-lg border px-4 py-2.5 text-sm ${cls}`}>
      <span className="font-medium">{t.admin.dashboard.planWarning}</span> {worst.message}
      {rows.length > 1 && (
        <span className="ml-1 text-xs opacity-75">
          {t.admin.dashboard.moreWarnings(rows.length - 1)}
        </span>
      )}
    </div>
  );
}
