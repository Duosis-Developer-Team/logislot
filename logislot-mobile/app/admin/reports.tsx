/** Raporlar — web (admin)/admin/reports karşılığı.
 *  Tarih aralığı + KPI'lar + günlük trend + dağılımlar + tedarikçi aktivitesi + CSV paylaşımı. */

import { useState } from "react";
import { Alert, ScrollView, Share, Text, View } from "react-native";
import { fetchReportCsv, useReportsSummary } from "@/api/reports";
import { useSession } from "@/auth/session";
import {
  Button,
  Card,
  Chip,
  EmptyState,
  ErrorState,
  Field,
  LoadingState,
  MetricCard,
  SectionTitle,
} from "@/components/ui";
import { useTheme } from "@/theme/theme";
import { spacing } from "@/theme/tokens";
import { todayISO } from "@/utils/format";

function daysAgo(n: number, today: string): string {
  const d = new Date(`${today}T12:00:00`);
  d.setDate(d.getDate() - n);
  return d.toLocaleDateString("sv-SE");
}

export default function ReportsScreen() {
  const { colors } = useTheme();
  const session = useSession();
  const facilityId = session.activeFacilityId;
  const [today] = useState(() => todayISO());
  const [preset, setPreset] = useState("30d");
  const [dateFrom, setDateFrom] = useState(daysAgo(29, today));
  const [dateTo, setDateTo] = useState(today);
  const [sharing, setSharing] = useState<"summary" | "appointments" | null>(null);
  const report = useReportsSummary(facilityId, dateFrom, dateTo);

  const PRESETS = [
    { key: "7d", label: "Son 7 gün", from: daysAgo(6, today) },
    { key: "30d", label: "Son 30 gün", from: daysAgo(29, today) },
    {
      key: "month",
      label: "Bu ay",
      from: `${today.slice(0, 8)}01`,
    },
  ];

  function applyPreset(key: string) {
    setPreset(key);
    const found = PRESETS.find((p) => p.key === key);
    if (found) {
      setDateFrom(found.from);
      setDateTo(today);
    }
  }

  async function shareCsv(kind: "summary" | "appointments") {
    if (!facilityId) return;
    setSharing(kind);
    try {
      const csv = await fetchReportCsv(facilityId, kind, dateFrom, dateTo);
      await Share.share({
        title: `logislot_${kind === "summary" ? "ozet" : "randevular"}_${dateFrom}_${dateTo}.csv`,
        message: csv,
      });
    } catch (err) {
      Alert.alert("İndirilemedi", err instanceof Error ? err.message : "CSV alınamadı");
    } finally {
      setSharing(null);
    }
  }

  if (report.isLoading)
    return (
      <View style={{ flex: 1, justifyContent: "center", backgroundColor: colors.background }}>
        <LoadingState label="Rapor hazırlanıyor…" />
      </View>
    );
  if (report.isError || !report.data)
    return (
      <View style={{ flex: 1, justifyContent: "center", backgroundColor: colors.background }}>
        <ErrorState message="Rapor yüklenemedi." onRetry={() => report.refetch()} />
      </View>
    );

  const data = report.data;
  const totals = data.totals;
  const sla = data.approval_sla;
  const maxTrend = Math.max(...data.daily_trend.map((d) => d.total), 1);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 64 }}>
        <Text style={{ color: colors.mutedText, fontSize: 13 }}>
          {data.range.date_from} – {data.range.date_to} operasyon özeti
          {data.scope.restricted && " · Yalnızca yetkili rampalarınız gösteriliyor"}
        </Text>

        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {PRESETS.map((p) => (
            <Chip
              key={p.key}
              label={p.label}
              selected={preset === p.key}
              onPress={() => applyPreset(p.key)}
            />
          ))}
        </View>
        <View style={{ flexDirection: "row", gap: spacing.md }}>
          <View style={{ flex: 1 }}>
            <Field
              label="Başlangıç"
              value={dateFrom}
              onChangeText={(t) => {
                setPreset("custom");
                setDateFrom(t);
              }}
              placeholder="2026-06-01"
              autoCapitalize="none"
            />
          </View>
          <View style={{ flex: 1 }}>
            <Field
              label="Bitiş"
              value={dateTo}
              onChangeText={(t) => {
                setPreset("custom");
                setDateTo(t);
              }}
              placeholder={today}
              autoCapitalize="none"
            />
          </View>
        </View>
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <Button
            title="Özet CSV"
            variant="secondary"
            loading={sharing === "summary"}
            onPress={() => void shareCsv("summary")}
            style={{ flex: 1, height: 42 }}
          />
          <Button
            title="Randevu Detay CSV"
            variant="secondary"
            loading={sharing === "appointments"}
            onPress={() => void shareCsv("appointments")}
            style={{ flex: 1, height: 42 }}
          />
        </View>

        {/* KPI'lar */}
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <MetricCard label="Toplam" value={totals.appointments} icon="cube-outline" />
          <MetricCard
            label="Tamamlanan"
            value={totals.completed}
            icon="checkmark-done-outline"
            tone={colors.status.completed}
          />
          <MetricCard
            label="Bekleyen"
            value={totals.pending}
            icon="hourglass-outline"
            tone={colors.status.pending}
          />
        </View>
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <MetricCard label="Kargo" value={totals.cargo} icon="cube" tone={colors.cargo} />
          <MetricCard
            label="Tamamlanma"
            value={`%${Math.round(data.rates.completion_rate * 100)}`}
            icon="trending-up-outline"
            tone={colors.status.approved}
          />
          <MetricCard
            label="Ort. Onay"
            value={
              sla.average_minutes_to_decision !== null
                ? `${sla.average_minutes_to_decision} dk`
                : "—"
            }
            icon="timer-outline"
          />
        </View>

        {totals.appointments === 0 ? (
          <EmptyState title="Bu aralıkta veri yok" description="Farklı bir tarih aralığı seçin." />
        ) : (
          <>
            <SectionTitle title="Günlük Trend" />
            <Card>
              <View style={{ flexDirection: "row", alignItems: "flex-end", height: 110, gap: 2 }}>
                {data.daily_trend.map((day) => (
                  <View
                    key={day.date}
                    style={{ flex: 1, justifyContent: "flex-end", height: "100%" }}
                  >
                    <View
                      style={{
                        width: "100%",
                        borderTopLeftRadius: 3,
                        borderTopRightRadius: 3,
                        height: `${Math.max((day.total / maxTrend) * 100, day.total > 0 ? 4 : 0)}%`,
                        backgroundColor: day.cargo > 0 ? `${colors.cargo}B0` : `${colors.primary}B0`,
                      }}
                    />
                  </View>
                ))}
              </View>
              <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 4 }}>
                <Text style={{ color: colors.faintText, fontSize: 10 }}>{data.range.date_from}</Text>
                <Text style={{ color: colors.faintText, fontSize: 10 }}>{data.range.date_to}</Text>
              </View>
            </Card>

            <SectionTitle title="Durum Dağılımı" />
            <Card style={{ gap: spacing.sm }}>
              {data.by_status
                .filter((s) => s.count > 0)
                .map((s) => (
                  <BarRow
                    key={s.key}
                    label={s.label}
                    value={s.count}
                    max={totals.appointments}
                    valueLabel={String(s.count)}
                  />
                ))}
              <Text style={{ color: colors.faintText, fontSize: 12 }}>
                Otomatik onaylı: {totals.auto_approved} · Manuel: {totals.manual_approval} · 2
                saatten eski bekleyen: {sla.pending_over_2h}
              </Text>
            </Card>

            <SectionTitle title="Kategori Dağılımı" />
            <Card style={{ gap: spacing.sm }}>
              {data.by_category.map((c) => (
                <BarRow
                  key={c.key}
                  label={c.label ?? c.key}
                  value={c.count}
                  max={totals.appointments}
                  valueLabel={`${c.count} (%${Math.round(c.percentage * 100)})`}
                />
              ))}
            </Card>

            <SectionTitle title="Rampa Kullanım Yoğunluğu" />
            <Card style={{ gap: spacing.sm }}>
              {data.by_dock.map((d) => (
                <BarRow
                  key={d.dock_id}
                  label={d.dock_name}
                  value={d.utilization_percent}
                  max={100}
                  valueLabel={`%${d.utilization_percent} · ${d.appointment_count}`}
                  color={
                    d.utilization_percent >= 80
                      ? colors.status.rejected
                      : d.utilization_percent >= 50
                        ? colors.status.pending
                        : colors.status.approved
                  }
                />
              ))}
            </Card>

            <SectionTitle title="Tedarikçi Aktivitesi" />
            <Card style={{ gap: spacing.sm }}>
              {data.by_supplier.map((s) => (
                <View
                  key={s.supplier_id}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: spacing.sm,
                  }}
                >
                  <Text
                    numberOfLines={1}
                    style={{ color: colors.text, fontSize: 13, fontWeight: "500", flex: 1 }}
                  >
                    {s.supplier_name ?? "—"}
                  </Text>
                  <Text style={{ color: colors.mutedText, fontSize: 12 }}>
                    {s.appointment_count} randevu
                  </Text>
                  <Text style={{ color: colors.status.approved, fontSize: 12 }}>
                    ✓{s.completed}
                  </Text>
                  <Text style={{ color: colors.status.rejected, fontSize: 12 }}>
                    ✕{s.cancelled + s.rejected}
                  </Text>
                  <Text style={{ color: colors.cargo, fontSize: 12 }}>◼{s.cargo}</Text>
                </View>
              ))}
            </Card>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function BarRow({
  label,
  value,
  max,
  valueLabel,
  color,
}: {
  label: string;
  value: number;
  max: number;
  valueLabel: string;
  color?: string;
}) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
      <Text numberOfLines={1} style={{ color: colors.text, fontSize: 13, width: 110 }}>
        {label}
      </Text>
      <View
        style={{
          flex: 1,
          height: 10,
          borderRadius: 5,
          backgroundColor: `${colors.mutedText}22`,
          overflow: "hidden",
        }}
      >
        <View
          style={{
            height: "100%",
            borderRadius: 5,
            width: `${max > 0 ? Math.min((value / max) * 100, 100) : 0}%`,
            backgroundColor: color ?? colors.primary,
          }}
        />
      </View>
      <Text style={{ color: colors.mutedText, fontSize: 12, minWidth: 56, textAlign: "right" }}>
        {valueLabel}
      </Text>
    </View>
  );
}
