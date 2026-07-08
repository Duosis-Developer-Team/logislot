"use client";

import { useState } from "react";
import { ErrorState, LoadingState } from "@/components/config/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Input, Label, Select } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { ApiError, downloadCsv } from "@/lib/api/client";
import {
  usePlanMutations,
  usePlanUsageWarnings,
  usePlatformPlans,
  usePlatformUsage,
} from "@/lib/api/platform";
import { cn } from "@/lib/utils";

function iso(d: Date): string {
  return d.toLocaleDateString("sv-SE");
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return iso(d);
}

type AssignTarget =
  | { kind: "tenant"; id: string; name: string }
  | { kind: "facility"; id: string; name: string };

export default function UsagePage() {
  const [dateFrom, setDateFrom] = useState(daysAgo(29));
  const [dateTo, setDateTo] = useState(iso(new Date()));
  const usage = usePlatformUsage(dateFrom, dateTo);
  const planWarnings = usePlanUsageWarnings(dateFrom, dateTo);
  const plans = usePlatformPlans();
  const mutations = usePlanMutations();

  const [assignTarget, setAssignTarget] = useState<AssignTarget | null>(null);
  const [selectedPlan, setSelectedPlan] = useState("");
  const [assignError, setAssignError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const activePlans = (plans.data ?? []).filter((p) => p.status === "active");

  async function onAssign() {
    if (!assignTarget || !selectedPlan) return;
    setAssignError(null);
    try {
      if (assignTarget.kind === "tenant") {
        await mutations.assignTenant.mutateAsync({
          tenantId: assignTarget.id,
          planId: selectedPlan,
        });
      } else {
        await mutations.assignFacility.mutateAsync({
          facilityId: assignTarget.id,
          planId: selectedPlan,
        });
      }
      setFlash(`Plan atandı: ${assignTarget.name}`);
      setAssignTarget(null);
      setTimeout(() => setFlash(null), 4000);
    } catch (err) {
      setAssignError(err instanceof ApiError ? err.message : "Atama başarısız");
    }
  }

  if (usage.isLoading) return <LoadingState label="Kullanım verileri yükleniyor…" />;
  if (usage.isError || !usage.data)
    return <ErrorState message="Kullanım verileri yüklenemedi." onRetry={() => usage.refetch()} />;

  const data = usage.data;
  const totals = data.totals;

  const statCards = [
    ["Tenant", totals.tenants],
    ["Tesis", `${totals.active_facilities}/${totals.facilities}`],
    ["Oluşturulan Randevu", totals.appointments_created],
    ["Tamamlanan", totals.appointments_completed],
    ["Aktif Rampa", totals.active_docks],
    ["Aktif Tedarikçi", totals.active_suppliers],
    ["Aktif Kullanıcı", totals.active_users],
  ] as const;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Kullanım &amp; Sağlık</h1>
          <p className="text-sm text-muted-foreground">
            {data.range.date_from} – {data.range.date_to} · yalnızca agregat metrikler,
            PII gösterilmez
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() =>
              void downloadCsv(
                `/platform/usage.csv?date_from=${dateFrom}&date_to=${dateTo}`,
                `logislot_usage_${dateFrom}_${dateTo}.csv`,
              )
            }
          >
            Usage CSV indir
          </Button>
          <Input
            type="date"
            className="h-8 w-36 text-xs"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
          />
          <span className="text-xs text-muted-foreground">–</span>
          <Input
            type="date"
            className="h-8 w-36 text-xs"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
          />
        </div>
      </div>

      {flash && (
        <div className="rounded-lg border border-status-approved/40 bg-status-approved/10 px-3 py-2 text-sm text-status-approved">
          {flash}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7">
        {statCards.map(([label, value]) => (
          <Card key={label}>
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold">{value}</div>
              <div className="mt-0.5 text-[11px] text-muted-foreground">{label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Plan kullanim uyarilari (Sprint 10) — fatura degil, esik sinyali */}
      {(planWarnings.data?.warnings.length ?? 0) > 0 && (
        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold">Plan Kullanım Uyarıları</h2>
          {planWarnings.data!.warnings.map((w) => (
            <div
              key={`${w.tenant_id}-${w.facility_id ?? "t"}-${w.dimension}`}
              className={
                w.severity === "critical"
                  ? "rounded-lg border border-status-rejected/40 bg-status-rejected/10 px-3 py-2 text-sm text-status-rejected"
                  : w.severity === "warning"
                    ? "rounded-lg border border-status-pending/40 bg-status-pending/10 px-3 py-2 text-sm text-status-pending"
                    : "rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground"
              }
            >
              <span className="font-medium">%{w.percent}</span> — {w.message}{" "}
              <span className="text-xs opacity-75">
                ({w.used}/{w.included_quota} · {w.plan_name})
              </span>
            </div>
          ))}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Tenant Kullanımı</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table className="border-0 shadow-none">
            <THead>
              <TR>
                <TH>Tenant</TH>
                <TH>Durum</TH>
                <TH>Plan</TH>
                <TH className="text-right">Tesis</TH>
                <TH className="text-right">Randevu</TH>
                <TH className="text-right">Rampa</TH>
                <TH className="text-right">Tedarikçi</TH>
                <TH>Son Aktivite</TH>
                <TH className="text-right">SLA</TH>
                <TH className="text-right">İşlem</TH>
              </TR>
            </THead>
            <TBody>
              {data.tenant_usage.map((row) => (
                <TR key={row.tenant_id}>
                  <TD className="font-medium">{row.tenant_name}</TD>
                  <TD>
                    <Badge
                      className={cn(
                        row.status === "active"
                          ? "bg-status-approved/15 text-status-approved"
                          : "bg-status-cancelled/15 text-status-cancelled",
                      )}
                    >
                      {row.status}
                    </Badge>
                  </TD>
                  <TD>{row.assigned_plan ?? "—"}</TD>
                  <TD className="text-right">{row.facility_count}</TD>
                  <TD className="text-right">
                    {row.appointments_created}
                    <span className="text-xs text-muted-foreground">
                      {" "}
                      ({row.appointments_completed} tamam)
                    </span>
                  </TD>
                  <TD className="text-right">{row.active_docks}</TD>
                  <TD className="text-right">{row.active_suppliers}</TD>
                  <TD className="text-xs text-muted-foreground">
                    {row.last_activity_at
                      ? new Date(row.last_activity_at).toLocaleString("tr-TR", {
                          day: "2-digit",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "—"}
                  </TD>
                  <TD className="text-right">
                    {row.approval_sla_avg_minutes !== null
                      ? `${row.approval_sla_avg_minutes} dk`
                      : "—"}
                  </TD>
                  <TD className="text-right">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        setAssignTarget({
                          kind: "tenant",
                          id: row.tenant_id,
                          name: row.tenant_name,
                        });
                        setSelectedPlan("");
                        setAssignError(null);
                      }}
                    >
                      Plan Ata
                    </Button>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tesis Kullanımı</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table className="border-0 shadow-none">
            <THead>
              <TR>
                <TH>Tesis</TH>
                <TH>Tenant</TH>
                <TH>Plan</TH>
                <TH className="text-right">Randevu</TH>
                <TH className="text-right">Rampa</TH>
                <TH className="text-right">Kullanıcı</TH>
                <TH>Son Aktivite</TH>
                <TH className="text-right">İşlem</TH>
              </TR>
            </THead>
            <TBody>
              {data.facility_usage.map((row) => (
                <TR key={row.facility_id}>
                  <TD className="font-medium">{row.facility_name}</TD>
                  <TD className="text-muted-foreground">{row.tenant_name}</TD>
                  <TD>
                    {row.assigned_plan ?? "—"}
                    {row.plan_is_override && (
                      <Badge className="ml-1 bg-accent/15 text-accent-foreground">
                        override
                      </Badge>
                    )}
                  </TD>
                  <TD className="text-right">
                    {row.appointments_created}
                    <span className="text-xs text-muted-foreground">
                      {" "}
                      ({row.appointments_completed} tamam)
                    </span>
                  </TD>
                  <TD className="text-right">{row.active_docks}</TD>
                  <TD className="text-right">{row.active_users}</TD>
                  <TD className="text-xs text-muted-foreground">
                    {row.last_activity_at
                      ? new Date(row.last_activity_at).toLocaleString("tr-TR", {
                          day: "2-digit",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "—"}
                  </TD>
                  <TD className="text-right">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        setAssignTarget({
                          kind: "facility",
                          id: row.facility_id,
                          name: row.facility_name,
                        });
                        setSelectedPlan("");
                        setAssignError(null);
                      }}
                    >
                      Override Ata
                    </Button>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog
        open={assignTarget !== null}
        onClose={() => setAssignTarget(null)}
        title={
          assignTarget?.kind === "tenant"
            ? "Tenant planı ata"
            : "Tesis override planı ata"
        }
      >
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            Hedef: <strong>{assignTarget?.name}</strong>. Yalnızca aktif planlar
            atanabilir; bu işlem fatura hesaplamaz.
          </p>
          <div>
            <Label>Plan</Label>
            <Select value={selectedPlan} onChange={(e) => setSelectedPlan(e.target.value)}>
              <option value="">— Plan seçin —</option>
              {activePlans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.billing_unit_label})
                </option>
              ))}
            </Select>
          </div>
          {assignError && <p className="text-sm text-destructive">{assignError}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setAssignTarget(null)}>
              Vazgeç
            </Button>
            <Button
              onClick={onAssign}
              disabled={
                !selectedPlan ||
                mutations.assignTenant.isPending ||
                mutations.assignFacility.isPending
              }
            >
              Ata
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
