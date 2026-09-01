"use client";

import { Download, CheckCircle2, Clock4, Package, Timer, Truck } from "lucide-react";
import { useState } from "react";
import { EmptyState, ErrorState, LoadingState } from "@/components/config/states";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { useReportsSummary } from "@/lib/api/reports";
import { useSession } from "@/lib/auth/session";
import { downloadCsv } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import type { Dictionary } from "@/lib/i18n/dictionaries/tr";
import { useT } from "@/lib/i18n/provider";

/** Aralik etiketi: "Bu ay" `ranges` altinda degil, ayri bir anahtardir. */
function rangeLabel(t: Dictionary, key: string): string {
  const ranges = t.admin.reports.ranges as Record<string, string>;
  return ranges[key] ?? (t.admin.reports as unknown as Record<string, string>)[key] ?? key;
}

function iso(d: Date): string {
  return d.toLocaleDateString("sv-SE");
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return iso(d);
}

const PRESETS = [
  { key: "7d", labelKey: "d7" as const, from: () => daysAgo(6) },
  { key: "30d", labelKey: "d30" as const, from: () => daysAgo(29) },
  {
    key: "month",
    labelKey: "thisMonth" as const,
    from: () => iso(new Date(new Date().getFullYear(), new Date().getMonth(), 1)),
  },
] as const;

function Bar({ value, max, className }: { value: number; max: number; className?: string }) {
  return (
    <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
      <div
        className={cn("h-full rounded-full bg-primary", className)}
        style={{ width: `${max > 0 ? (value / max) * 100 : 0}%` }}
      />
    </div>
  );
}

export default function ReportsPage() {
  const t = useT();
  const { activeFacilityId } = useSession();
  const [preset, setPreset] = useState<string>("30d");
  const [dateFrom, setDateFrom] = useState(daysAgo(29));
  const [dateTo, setDateTo] = useState(iso(new Date()));
  const report = useReportsSummary(activeFacilityId, dateFrom, dateTo);

  function applyPreset(key: string) {
    setPreset(key);
    const found = PRESETS.find((p) => p.key === key);
    if (found) {
      setDateFrom(found.from());
      setDateTo(iso(new Date()));
    }
  }

  if (report.isLoading) return <LoadingState label={t.admin.reports.loading} />;
  if (report.isError || !report.data)
    return <ErrorState message={t.admin.reports.loadError} onRetry={() => report.refetch()} />;

  const data = report.data;
  const totals = data.totals;
  const sla = data.approval_sla;
  const maxTrend = Math.max(...data.daily_trend.map((d) => d.total), 1);

  const stats = [
    { label: t.admin.reports.totalAppointments, value: totals.appointments, icon: Truck },
    { label: t.common.completed, value: totals.completed, icon: CheckCircle2 },
    { label: t.common.pending, value: totals.pending, icon: Clock4 },
    { label: t.common.cargo, value: totals.cargo, icon: Package, accent: true },
    {
      label: t.admin.reports.completionRate,
      value: `%${Math.round(data.rates.completion_rate * 100)}`,
      icon: CheckCircle2,
    },
    {
      label: t.admin.reports.avgApproval,
      value:
        sla.average_minutes_to_decision !== null
          ? `${sla.average_minutes_to_decision} dk`
          : "—",
      icon: Timer,
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">{t.admin.reports.title}</h1>
          <p className="text-sm text-muted-foreground">
            {t.admin.reports.summaryLine(data.range.date_from, data.range.date_to)}
            {data.scope.restricted && t.admin.reports.restricted}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() =>
              void downloadCsv(
                `/facilities/${activeFacilityId}/reports/summary.csv?date_from=${dateFrom}&date_to=${dateTo}`,
                `${t.admin.reports.summaryFileName}_${dateFrom}_${dateTo}.csv`,
              )
            }
          >
            <Download className="mr-1 h-3.5 w-3.5" /> {t.admin.reports.summaryCsv}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() =>
              void downloadCsv(
                `/facilities/${activeFacilityId}/reports/appointments.csv?date_from=${dateFrom}&date_to=${dateTo}`,
                `${t.admin.reports.appointmentsFileName}_${dateFrom}_${dateTo}.csv`,
              )
            }
          >
            <Download className="mr-1 h-3.5 w-3.5" /> {t.admin.reports.appointmentCsv}
          </Button>
          {PRESETS.map((p) => (
            <button
              key={p.key}
              onClick={() => applyPreset(p.key)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                preset === p.key
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:border-primary/40",
              )}
            >
              {rangeLabel(t, p.labelKey)}
            </button>
          ))}
          <Input
            type="date"
            className="h-8 w-36 text-xs"
            value={dateFrom}
            onChange={(e) => {
              setPreset("custom");
              setDateFrom(e.target.value);
            }}
          />
          <span className="text-xs text-muted-foreground">–</span>
          <Input
            type="date"
            className="h-8 w-36 text-xs"
            value={dateTo}
            onChange={(e) => {
              setPreset("custom");
              setDateTo(e.target.value);
            }}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <Card key={s.label}>
              <CardContent className="flex flex-col gap-2 p-4">
                <span
                  className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-lg",
                    s.accent ? "bg-cargo/15" : "bg-primary/10",
                  )}
                >
                  <Icon className={cn("h-4 w-4", s.accent ? "text-cargo" : "text-primary")} />
                </span>
                <div>
                  <div className="text-xl font-bold leading-none">{s.value}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{s.label}</div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {totals.appointments === 0 ? (
        <EmptyState
          title={t.admin.reports.emptyTitle}
          description={t.admin.reports.emptyDescription}
        />
      ) : (
        <>
          {/* Gunluk trend */}
          <Card>
            <CardHeader>
              <CardTitle>{t.admin.reports.dailyTrend}</CardTitle>
            </CardHeader>
            <CardContent>
              {/* Kolonlar h-full olmali: yuzde yukseklik ancak tanimli yukseklikli
                  bir ebeveyne karsi cozulur, aksi halde TUM barlar 0px kalir.
                  Barlar min-w-1'e dayandigi icin uzun araliklarda (180 gune kadar)
                  bosluk daraltilir; overflow-x dar ekranlar icin emniyet agi. */}
              <div
                className={cn(
                  "flex h-32 items-end overflow-x-auto",
                  data.daily_trend.length > 60 ? "gap-px" : "gap-1",
                )}
              >
                {data.daily_trend.map((day) => (
                  <div
                    key={day.date}
                    className="group relative flex h-full flex-1 flex-col items-center justify-end"
                    title={t.admin.reports.trendTooltip(day.date, day.total, day.completed, day.cargo)}
                  >
                    <div
                      className={cn(
                        "w-full min-w-1 rounded-t-sm",
                        day.cargo > 0 ? "bg-cargo/70" : "bg-primary/70",
                      )}
                      style={{
                        height: `${Math.max((day.total / maxTrend) * 100, day.total > 0 ? 4 : 0)}%`,
                      }}
                    />
                  </div>
                ))}
              </div>
              <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
                <span>{data.range.date_from}</span>
                <span>{data.range.date_to}</span>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>{t.admin.reports.statusBreakdown}</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                {data.by_status
                  .filter((s) => s.count > 0)
                  .map((s) => (
                    <div key={s.key} className="flex items-center gap-3 text-sm">
                      <span className="w-32 truncate">{s.label}</span>
                      <Bar value={s.count} max={totals.appointments} />
                      <span className="w-10 text-right font-medium">{s.count}</span>
                    </div>
                  ))}
                <p className="mt-2 text-xs text-muted-foreground">
                  {t.admin.reports.slaLine(
                    totals.auto_approved,
                    totals.manual_approval,
                    sla.pending_over_2h,
                  )}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t.admin.reports.categoryBreakdown}</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                {data.by_category.map((c) => (
                  <div key={c.key} className="flex items-center gap-3 text-sm">
                    <span className="w-40 truncate">{c.label}</span>
                    <Bar value={c.count} max={totals.appointments} />
                    <span className="w-14 text-right text-xs text-muted-foreground">
                      {c.count} (%{Math.round(c.percentage * 100)})
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t.admin.reports.dockUtilisation}</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                {data.by_dock.map((d) => (
                  <div key={d.dock_id} className="flex items-center gap-3 text-sm">
                    <span className="w-24 truncate">{d.dock_name}</span>
                    <Bar
                      value={d.utilization_percent}
                      max={100}
                      className={
                        d.utilization_percent >= 80
                          ? "bg-status-rejected"
                          : d.utilization_percent >= 50
                            ? "bg-status-pending"
                            : "bg-status-approved"
                      }
                    />
                    <span className="w-24 text-right text-xs text-muted-foreground">
                      {t.admin.reports.dockLine(d.utilization_percent, d.appointment_count)}
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t.admin.reports.supplierActivity}</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table className="border-0 shadow-none">
                  <THead>
                    <TR>
                      <TH>{t.admin.appointments.colSupplier}</TH>
                      <TH className="text-right">{t.common.appointment}</TH>
                      <TH className="text-right">Tamam</TH>
                      <TH className="text-right">{t.admin.reports.colCancelled}</TH>
                      <TH className="text-right">{t.common.cargo}</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {data.by_supplier.map((s) => (
                      <TR key={s.supplier_id}>
                        <TD className="font-medium">{s.supplier_name}</TD>
                        <TD className="text-right">{s.appointment_count}</TD>
                        <TD className="text-right text-status-approved">{s.completed}</TD>
                        <TD className="text-right text-status-rejected">
                          {s.cancelled + s.rejected}
                        </TD>
                        <TD className="text-right text-cargo">{s.cargo}</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
