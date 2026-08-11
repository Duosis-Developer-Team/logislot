/** Planlar — web (platform)/platform/plans karşılığı.
 *  Plan bir politika kabıdır: fatura hesaplamaz; billing engine bu yapıyı okuyacaktır. */

import { useState } from "react";
import { Alert, FlatList, RefreshControl, Text, View } from "react-native";
import { ApiError } from "@/api/client";
import { usePlanLimitDimensions,
  usePlanMutations, usePlatformPlans } from "@/api/platform";
import type { PlanDto } from "@/api/types";
import { MultiSelectField } from "@/components/config";
import {
  AppModal,
  Badge,
  Button,
  Card,
  Chip,
  EmptyState,
  ErrorState,
  Field,
  LoadingState,
} from "@/components/ui";
import { useTheme } from "@/theme/theme";
import { spacing } from "@/theme/tokens";

const DIMENSIONS = [
  "appointments_created",
  "appointments_completed",
  "active_docks",
  "active_suppliers",
  "active_users",
];

const BILLING_UNITS = ["fixed", "per_appointment", "per_active_dock", "per_facility", "hybrid"];
const STATUSES = ["draft", "active", "retired"] as const;

export default function PlatformPlans() {
  const { colors } = useTheme();
  const plans = usePlatformPlans();
  const mutations = usePlanMutations();
  const limitDimensions = usePlanLimitDimensions();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<PlanDto | null>(null);
  const [name, setName] = useState("");
  const [scope, setScope] = useState("tenant");
  const [billingUnit, setBillingUnit] = useState("fixed");
  const [status, setStatus] = useState("draft");
  const [dimensions, setDimensions] = useState<string[]>([]);
  const [rateCardText, setRateCardText] = useState("[]");
  // Dinamik kotalar: bos string = sinirsiz. Anahtarlar backend katalogundan gelir.
  const [limits, setLimits] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const statusColor = (s: string) =>
    s === "active"
      ? colors.status.approved
      : s === "draft"
        ? colors.status.pending
        : colors.status.cancelled;

  function openCreate() {
    setEditing(null);
    setName("");
    setScope("tenant");
    setBillingUnit("fixed");
    setStatus("draft");
    setDimensions([...DIMENSIONS.slice(0, 2)]);
    setLimits({});
    setRateCardText(
      JSON.stringify(
        [
          {
            dimension: "appointments_created",
            unit_price: 0,
            included_quota: 100,
            overage_rule: "per_unit",
          },
        ],
        null,
        2,
      ),
    );
    setFormError(null);
    setOpen(true);
  }

  function openEdit(plan: PlanDto) {
    setEditing(plan);
    setName(plan.name);
    setScope(plan.scope);
    setBillingUnit(plan.billing_unit_label);
    setStatus(plan.status);
    setDimensions(plan.measurable_dimensions_json ?? []);
    setRateCardText(JSON.stringify(plan.rate_card_json ?? [], null, 2));
    setLimits(
      Object.fromEntries(
        Object.entries(plan.limits_json ?? {}).map(([k, v]) => [k, String(v)]),
      ),
    );
    setFormError(null);
    setOpen(true);
  }

  async function onSubmit() {
    setFormError(null);
    let rateCard: unknown;
    try {
      rateCard = JSON.parse(rateCardText);
      if (!Array.isArray(rateCard)) throw new Error("liste olmalı");
    } catch {
      setFormError("Rate card geçerli bir JSON listesi olmalı.");
      return;
    }
    try {
      await mutations.save.mutateAsync({
        id: editing?.id,
        body: {
          name,
          scope,
          billing_unit_label: billingUnit,
          status,
          measurable_dimensions_json: dimensions,
          rate_card_json: rateCard,
          // Bos birakilan / 0 girilen boyut = sinirsiz; backend ayni
          // normalizasyonu uygular (app/core/plan_limits.py).
          limits_json: Object.fromEntries(
            Object.entries(limits)
              .map(([key, raw]) => [key, Number.parseInt(raw, 10)] as const)
              .filter(([, value]) => Number.isFinite(value) && value > 0),
          ),
        },
      });
      setOpen(false);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Kaydedilemedi");
    }
  }

  function onRetire(plan: PlanDto) {
    Alert.alert(
      "Planı emekliye ayır",
      `"${plan.name}" retired olur: mevcut atamalar bozulmaz ancak yeni atama yapılamaz.`,
      [
        { text: "Vazgeç", style: "cancel" },
        {
          text: "Emekliye Ayır",
          style: "destructive",
          onPress: () =>
            mutations.retire.mutate(plan.id, {
              onError: (err) =>
                Alert.alert(
                  "İşlem başarısız",
                  err instanceof ApiError ? err.message : "İşlem başarısız",
                ),
            }),
        },
      ],
    );
  }

  if (plans.isLoading)
    return (
      <View style={{ flex: 1, justifyContent: "center", backgroundColor: colors.background }}>
        <LoadingState />
      </View>
    );
  if (plans.isError)
    return (
      <View style={{ flex: 1, justifyContent: "center", backgroundColor: colors.background }}>
        <ErrorState message="Planlar yüklenemedi." onRetry={() => plans.refetch()} />
      </View>
    );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <FlatList
        data={plans.data ?? []}
        keyExtractor={(p) => p.id}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 64 }}
        refreshControl={
          <RefreshControl
            refreshing={plans.isRefetching}
            onRefresh={() => void plans.refetch()}
            tintColor={colors.accent}
          />
        }
        ListHeaderComponent={
          <View style={{ gap: spacing.md, marginBottom: spacing.sm }}>
            <Text style={{ color: colors.mutedText, fontSize: 13 }}>
              Plan bir politika kabıdır: neyin nasıl ölçüleceğini tanımlar. Fatura hesaplamaz;
              gelecekteki billing engine bu yapıyı okuyacaktır.
            </Text>
            <Button title="+ Yeni Plan" onPress={openCreate} style={{ height: 44 }} />
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            title="Plan yok"
            description="Starter/Professional gibi politika profilleri tanımlayın."
          />
        }
        renderItem={({ item: plan }) => (
          <Card style={{ gap: spacing.sm }}>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: spacing.sm,
              }}
            >
              <Text style={{ color: colors.text, fontSize: 15, fontWeight: "700", flex: 1 }}>
                {plan.name}
              </Text>
              <Badge label={plan.status} color={statusColor(plan.status)} />
            </View>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4 }}>
              <Badge
                label={plan.scope === "tenant" ? "Tenant" : "Tesis"}
                color={colors.accent}
              />
              <Badge label={plan.billing_unit_label} color={colors.mutedText} />
              {(plan.measurable_dimensions_json ?? []).map((d) => (
                <Badge key={d} label={d} color={colors.mutedText} />
              ))}
            </View>
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              <Button
                title="Düzenle"
                variant="secondary"
                onPress={() => openEdit(plan)}
                style={{ flex: 1, height: 40 }}
              />
              {plan.status !== "retired" && (
                <Button
                  title="Emekliye Ayır"
                  variant="ghost"
                  onPress={() => onRetire(plan)}
                  style={{ flex: 1, height: 40 }}
                />
              )}
            </View>
          </Card>
        )}
      />

      <AppModal
        visible={open}
        onClose={() => setOpen(false)}
        title={editing ? "Planı Düzenle" : "Yeni Plan"}
      >
        <View style={{ gap: spacing.md }}>
          <Field label="Plan Adı" value={name} onChangeText={setName} placeholder="Professional" />
          <View style={{ gap: 6 }}>
            <Text style={{ color: colors.text, fontSize: 14, fontWeight: "500" }}>Kapsam</Text>
            <View style={{ flexDirection: "row", gap: 6 }}>
              <Chip label="Tenant" selected={scope === "tenant"} onPress={() => setScope("tenant")} />
              <Chip
                label="Tesis"
                selected={scope === "facility"}
                onPress={() => setScope("facility")}
              />
            </View>
          </View>
          <View style={{ gap: 6 }}>
            <Text style={{ color: colors.text, fontSize: 14, fontWeight: "500" }}>
              Faturalama Birimi
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {BILLING_UNITS.map((u) => (
                <Chip
                  key={u}
                  label={u}
                  selected={billingUnit === u}
                  onPress={() => setBillingUnit(u)}
                />
              ))}
            </View>
          </View>
          <View style={{ gap: 6 }}>
            <Text style={{ color: colors.text, fontSize: 14, fontWeight: "500" }}>Durum</Text>
            <View style={{ flexDirection: "row", gap: 6 }}>
              {STATUSES.map((s) => (
                <Chip key={s} label={s} selected={status === s} onPress={() => setStatus(s)} />
              ))}
            </View>
          </View>
          <View style={{ gap: 6 }}>
            <Text style={{ color: colors.text, fontSize: 14, fontWeight: "500" }}>
              Ölçülebilir Boyutlar
            </Text>
            <MultiSelectField
              options={DIMENSIONS.map((d) => ({ value: d, label: d }))}
              value={dimensions}
              onChange={setDimensions}
              searchPlaceholder="Boyut ara…"
            />
          </View>
          <Card style={{ gap: spacing.sm }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
              <Text style={{ color: colors.text, fontSize: 14, fontWeight: "600" }}>
                Plan Limitleri
              </Text>
              <Text style={{ color: colors.faintText, fontSize: 12 }}>
                Boş bırakılan = sınırsız
              </Text>
            </View>
            <Text style={{ color: colors.mutedText, fontSize: 12 }}>
              Rakamlar sabit değildir; her sınırı istediğiniz zaman buradan
              değiştirebilirsiniz.
            </Text>
            {(limitDimensions.data?.dimensions ?? []).map((dim) => {
              const raw = limits[dim.key] ?? "";
              const unlimited = raw.trim() === "" || Number.parseInt(raw, 10) <= 0;
              return (
                <View key={dim.key} style={{ gap: 4 }}>
                  <Field
                    label={dim.label}
                    value={raw}
                    onChangeText={(t) => setLimits((prev) => ({ ...prev, [dim.key]: t }))}
                    placeholder="Sınırsız"
                    keyboardType="number-pad"
                  />
                  <Text style={{ color: colors.faintText, fontSize: 12 }}>
                    {unlimited ? "Sınırsız" : `${raw} ${dim.unit}`}
                    {dim.enforced_at === "assignment" ? " · atamada engellenir" : ""}
                  </Text>
                </View>
              );
            })}
          </Card>
          <View style={{ gap: 6 }}>
            <Text style={{ color: colors.text, fontSize: 14, fontWeight: "500" }}>
              Rate Card (JSON)
            </Text>
            <Field
              value={rateCardText}
              onChangeText={setRateCardText}
              multiline
              numberOfLines={8}
              autoCapitalize="none"
              autoCorrect={false}
              style={{ height: 160, textAlignVertical: "top", paddingTop: 12, fontFamily: "Courier" }}
            />
            <Text style={{ color: colors.faintText, fontSize: 12 }}>
              Şekil: [{"{dimension, unit_price, included_quota, overage_rule}"}] — finans ekibi
              rakamları model değişmeden günceller.
            </Text>
          </View>
          {formError && (
            <Text style={{ color: colors.destructive, fontSize: 13 }}>{formError}</Text>
          )}
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <Button
              title="İptal"
              variant="secondary"
              onPress={() => setOpen(false)}
              style={{ flex: 1 }}
            />
            <Button
              title={mutations.save.isPending ? "Kaydediliyor…" : "Kaydet"}
              loading={mutations.save.isPending}
              disabled={!name.trim()}
              onPress={() => void onSubmit()}
              style={{ flex: 2 }}
            />
          </View>
        </View>
      </AppModal>
    </View>
  );
}
