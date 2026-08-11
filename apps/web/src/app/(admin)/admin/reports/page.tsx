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

function iso(d: Date): string {
  return d.toLocaleDateString("sv-SE");
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return iso(d);
}

const PRESETS = [
  { key: "7d", label: "Son 7 gün", from: () => daysAgo(6) },
  { key: "30d", label: "Son 30 gün", from: () => daysAgo(29) },
  {
    key: "month",
    label: "Bu ay",
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

  if (report.isLoading) return <LoadingState label="Rapor hazırlanıyor…" />;
  if (report.isError || !report.data)
    return <ErrorState message="Rapor yüklenemedi." onRetry={() => report.refetch()} />;

  const data = report.data;
  const totals = data.totals;
  const sla = data.approval_sla;
  const maxTrend = Math.max(...data.daily_trend.map((d) => d.total), 1);

  const stats = [
    { label: "Toplam Randevu", value: totals.appointments, icon: Truck },
    { label: "Tamamlanan", value: totals.completed, icon: CheckCircle2 },
    { label: "Bekleyen", value: totals.pending, icon: Clock4 },
    { label: "Kargo", value: totals.cargo, icon: Package, accent: true },
    {
      label: "Tamamlanma Oranı",
      value: `%${Math.round(data.rates.completion_rate * 100)}`,
      icon: CheckCircle2,
    },
    {
      label: "Ort. Onay Süresi",
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
          <h1 className="text-xl font-bold">Raporlar</h1>
          <p className="text-sm text-muted-foreground">
            {data.range.date_from} – {data.range.date_to} operasyon özeti
            {data.scope.restricted && " · Yalnızca yetkili rampalarınız gösteriliyor"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() =>
              void downloadCsv(
                `/facilities/${activeFacilityId}/reports/summary.csv?date_from=${dateFrom}&date_to=${dateTo}`,
                `logislot_ozet_${dateFrom}_${dateTo}.csv`,
              )
            }
          >
            <Download className="mr-1 h-3.5 w-3.5" /> Özet CSV
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() =>
              void downloadCsv(
                `/facilities/${activeFacilityId}/reports/appointments.csv?date_from=${dateFrom}&date_to=${dateTo}`,
                `logislot_randevular_${dateFrom}_${dateTo}.csv`,
              )
            }
          >
            <Download className="mr-1 h-3.5 w-3.5" /> Randevu Detay CSV
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
              {p.label}
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
          title="Bu aralıkta veri yok"
          description="Farklı bir tarih aralığı seçin."
        />
      ) : (
        <>
          {/* Gunluk trend */}
          <Card>
            <CardHeader>
              <CardTitle>Günlük Trend</CardTitle>
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
                    title={`${day.date}: ${day.total} randevu (${day.completed} tamam, ${day.cargo} kargo)`}
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
                <CardTitle>Durum Dağılımı</CardTitle>
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
                  Otomatik onaylı: {totals.auto_approved} · Manuel: {totals.manual_approval} ·
                  2 saatten eski bekleyen: {sla.pending_over_2h}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Kategori Dağılımı</CardTitle>
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
                <CardTitle>Rampa Kullanım Yoğunluğu</CardTitle>
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
                      %{d.utilization_percent} · {d.appointment_count} randevu
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Tedarikçi Aktivitesi</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table className="border-0 shadow-none">
                  <THead>
                    <TR>
                      <TH>Tedarikçi</TH>
                      <TH className="text-right">Randevu</TH>
                      <TH className="text-right">Tamam</TH>
                      <TH className="text-right">İptal/Red</TH>
                      <TH className="text-right">Kargo</TH>
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
