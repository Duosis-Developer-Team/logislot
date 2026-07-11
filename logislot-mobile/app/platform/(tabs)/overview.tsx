import { useState } from "react";
import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ApiError } from "@/api/client";
import {
  usePlanMutations,
  usePlanUsageWarnings,
  usePlatformPlans,
  usePlatformUsage,
} from "@/api/platform";
import {
  AppModal,
  Badge,
  Button,
  Card,
  Chip,
  ErrorState,
  LoadingState,
  MetricCard,
  Screen,
  SectionTitle,
} from "@/components/ui";
import { useTheme } from "@/theme/theme";
import { spacing } from "@/theme/tokens";
import { addDaysISO, todayISO } from "@/utils/format";

/**
 * Platform — Genel Bakış: son 30 gün agregat kullanım + plan kullanım uyarıları
 * + tenant/tesis kullanımı ve plan atama (web platform/usage karşılığı).
 */
export default function PlatformOverview() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [dateTo] = useState(() => todayISO());
  const dateFrom = addDaysISO(dateTo, -30);
  const usage = usePlatformUsage(dateFrom, dateTo);
  const warnings = usePlanUsageWarnings(dateFrom, dateTo);
  const plans = usePlatformPlans();
  const mutations = usePlanMutations();

  const [assignTarget, setAssignTarget] = useState<{
    kind: "tenant" | "facility";
    id: string;
    name: string;
  } | null>(null);
  const [selectedPlan, setSelectedPlan] = useState("");
  const [assignError, setAssignError] = useState<string | null>(null);

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
      setAssignTarget(null);
    } catch (err) {
      setAssignError(err instanceof ApiError ? err.message : "Atanamadı");
    }
  }

  if (usage.isLoading)
    return <Screen scroll={false}><LoadingState label="Kullanım yükleniyor…" /></Screen>;
  if (usage.isError || !usage.data)
    return (
      <Screen scroll={false}>
        <ErrorState message="Kullanım verisi yüklenemedi." onRetry={() => usage.refetch()} />
      </Screen>
    );

  const t = usage.data.totals;
  const warningList = warnings.data?.warnings ?? [];
  const severityColor = (s: string) =>
    s === "critical"
      ? colors.status.rejected
      : s === "warning"
        ? colors.status.pending
        : colors.accent;

  return (
    <Screen style={{ paddingTop: insets.top }}>
      <View style={{ gap: spacing.md }}>
        <View>
          <Text style={{ color: colors.text, fontSize: 24, fontWeight: "800" }}>
            Genel Bakış
          </Text>
          <Text style={{ color: colors.mutedText, fontSize: 13 }}>
            Son 30 gün · yalnızca agregat metrikler, PII gösterilmez
          </Text>
        </View>

        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <MetricCard label="Tenant" value={t.tenants} icon="business-outline" tone={colors.accent} />
          <MetricCard label="Tesis" value={`${t.active_facilities}/${t.facilities}`} icon="home-outline" tone={colors.accent} />
        </View>
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <MetricCard label="Oluşturulan Randevu" value={t.appointments_created} icon="calendar-outline" tone={colors.status.completed} />
          <MetricCard label="Tamamlanan" value={t.appointments_completed} icon="checkmark-done-outline" tone={colors.status.approved} />
        </View>
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <MetricCard label="Aktif Rampa" value={t.active_docks} icon="git-branch-outline" tone={colors.accent} />
          <MetricCard label="Aktif Tedarikçi" value={t.active_suppliers} icon="people-outline" tone={colors.accent} />
        </View>

        {/* Plan kullanım uyarıları — fatura değil, eşik sinyali */}
        {warningList.length > 0 && (
          <>
            <SectionTitle title="Plan Kullanım Uyarıları" />
            {warningList.map((w, i) => (
              <Card
                key={`${w.tenant_id}-${w.facility_id ?? "t"}-${w.dimension}-${i}`}
                style={{ gap: 4, borderColor: `${severityColor(w.severity)}66` }}
              >
                <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
                  <Text style={{ color: colors.text, fontSize: 13, fontWeight: "600", flex: 1 }}>
                    {w.facility_name ?? w.tenant_name}
                  </Text>
                  <Badge label={`%${Math.round(w.percent)}`} color={severityColor(w.severity)} />
                </View>
                <Text style={{ color: colors.mutedText, fontSize: 12 }}>
                  {w.message} ({w.used}/{w.included_quota} · {w.plan_name})
                </Text>
              </Card>
            ))}
          </>
        )}

        <SectionTitle title="Tenant Kullanımı" />
        {usage.data.tenant_usage.map((row) => (
          <Card key={row.tenant_id} style={{ gap: 6 }}>
            <Text style={{ color: colors.text, fontSize: 14, fontWeight: "700" }}>
              {row.tenant_name}
            </Text>
            <Text style={{ color: colors.mutedText, fontSize: 12 }}>
              {row.assigned_plan ?? "Plan yok"} · {row.facility_count} tesis ·{" "}
              {row.appointments_created} randevu ({row.appointments_completed} tamam)
              {row.approval_sla_avg_minutes !== null
                ? ` · ort. onay ${row.approval_sla_avg_minutes} dk`
                : ""}
            </Text>
            <Button
              title="Plan Ata"
              variant="secondary"
              onPress={() => {
                setSelectedPlan("");
                setAssignError(null);
                setAssignTarget({ kind: "tenant", id: row.tenant_id, name: row.tenant_name });
              }}
              style={{ height: 38 }}
            />
          </Card>
        ))}

        <SectionTitle title="Tesis Kullanımı" />
        {usage.data.facility_usage.map((row) => (
          <Card key={row.facility_id} style={{ gap: 6 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
              <Text style={{ color: colors.text, fontSize: 14, fontWeight: "700", flex: 1 }}>
                {row.facility_name}
              </Text>
              {row.plan_is_override && <Badge label="Override" color={colors.cargo} />}
            </View>
            <Text style={{ color: colors.mutedText, fontSize: 12 }}>
              {row.tenant_name ?? "—"} · {row.assigned_plan ?? "Plan yok"} ·{" "}
              {row.appointments_created} randevu ({row.appointments_completed} tamam) ·{" "}
              {row.active_docks} rampa · {row.active_users} kullanıcı
            </Text>
            <Button
              title="Plan Ata (Override)"
              variant="secondary"
              onPress={() => {
                setSelectedPlan("");
                setAssignError(null);
                setAssignTarget({
                  kind: "facility",
                  id: row.facility_id,
                  name: row.facility_name,
                });
              }}
              style={{ height: 38 }}
            />
          </Card>
        ))}
      </View>

      {/* Plan atama */}
      <AppModal
        visible={assignTarget !== null}
        onClose={() => setAssignTarget(null)}
        title={`Plan Ata — ${assignTarget?.name ?? ""}`}
      >
        <View style={{ gap: spacing.md }}>
          <Text style={{ color: colors.mutedText, fontSize: 13 }}>
            Yalnızca aktif planlar atanabilir.
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {activePlans.map((p) => (
              <Chip
                key={p.id}
                label={p.name}
                selected={selectedPlan === p.id}
                onPress={() => setSelectedPlan(p.id)}
              />
            ))}
          </View>
          {activePlans.length === 0 && (
            <Text style={{ color: colors.faintText, fontSize: 12 }}>
              {"Aktif plan yok — önce Menü → Planlar'dan bir plan aktifleştirin."}
            </Text>
          )}
          {assignError && (
            <Text style={{ color: colors.destructive, fontSize: 13 }}>{assignError}</Text>
          )}
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <Button
              title="Vazgeç"
              variant="secondary"
              onPress={() => setAssignTarget(null)}
              style={{ flex: 1 }}
            />
            <Button
              title="Plan Ata"
              disabled={!selectedPlan}
              loading={mutations.assignTenant.isPending || mutations.assignFacility.isPending}
              onPress={() => void onAssign()}
              style={{ flex: 2 }}
            />
          </View>
        </View>
      </AppModal>
    </Screen>
  );
}
