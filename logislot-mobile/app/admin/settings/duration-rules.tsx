/**
 * Süre Kuralları (yönetim) — web app/(admin)/admin/settings/duration-rules
 * karşılığı. Algoritma ve örnekler: docs/SURE_HESAPLAMA.md.
 *
 * Mobilde: hesaplama modu, kural listesi (sıra, ölü kural uyarısı, düzenle,
 * sil, "en özel kural üste") ve deneme kutusu. Araç × miktar senaryo tablosu
 * geniş ekran gerektirdiği için yalnızca webde.
 */

import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { ApiError } from "@/api/client";
import {
  useDurationEvaluate,
  useDurationPolicy,
  useDurationRuleMutations,
  useDurationRules,
  useSaveDurationPolicy,
} from "@/api/duration";
import { productCategories, vehicleCategories } from "@/api/resources";
import { QUANTITY_UNIT_LABELS, QUANTITY_UNITS, type QuantityUnit } from "@/api/shared";
import type { DurationMode, DurationRuleDto, DurationRuleInput } from "@/api/types";
import { useSession } from "@/auth/session";
import {
  AppModal,
  Button,
  Card,
  Chip,
  Field,
  LoadingState,
  PickerField,
  SwitchRow,
} from "@/components/ui";
import { useTheme } from "@/theme/theme";
import { radius, spacing } from "@/theme/tokens";

const ANY = "*";

const MODES: { value: DurationMode; title: string; hint: string }[] = [
  { value: "supplier", title: "Tedarikçi seçer", hint: "Eski davranış. Kurallar yalnızca bilgi amaçlıdır." },
  {
    value: "suggested",
    title: "Sistem önerir",
    hint: "Hesaplanan süre seçili gelir; tedarikçi kategori sınırları içinde değiştirebilir.",
  },
  {
    value: "computed",
    title: "Sistem hesaplar",
    hint: "Tedarikçi süre seçmez; sunucu süreyi kurallardan hesaplar ve uygun saatleri buna göre arar.",
  },
];

function errorText(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

function useLookups(facilityId: string | null) {
  const categories = productCategories.useList(facilityId);
  const vehicles = vehicleCategories.useList(facilityId);
  return {
    activeCategories: (categories.data ?? []).filter((c) => c.is_active),
    activeVehicles: (vehicles.data ?? []).filter((v) => v.is_active),
    categoryNames: new Map((categories.data ?? []).map((c) => [c.id, c.display_name])),
    vehicleNames: new Map((vehicles.data ?? []).map((v) => [v.id, v.display_name])),
  };
}

function unitLabel(unit: string | null): string {
  return unit ? QUANTITY_UNIT_LABELS[unit as QuantityUnit] ?? unit : "Tüm birimler";
}

function conditionsText(
  rule: DurationRuleInput,
  vehicles: Map<string, string>,
  categories: Map<string, string>,
): string[] {
  const qty =
    rule.min_quantity != null && rule.max_quantity != null
      ? `${rule.min_quantity}–${rule.max_quantity}`
      : rule.min_quantity != null
        ? `≥ ${rule.min_quantity}`
        : rule.max_quantity != null
          ? `≤ ${rule.max_quantity}`
          : "Her miktar";
  return [
    rule.vehicle_category_id ? vehicles.get(rule.vehicle_category_id) ?? "?" : "Tüm araçlar",
    rule.product_category_id ? categories.get(rule.product_category_id) ?? "?" : "Tüm kategoriler",
    unitLabel(rule.quantity_unit),
    qty,
  ];
}

function calcText(rule: DurationRuleInput): string {
  const unit = rule.quantity_unit ? unitLabel(rule.quantity_unit).toLocaleLowerCase("tr-TR") : "birim";
  const main =
    rule.calc_type === "fixed"
      ? `Sabit ${rule.fixed_minutes ?? 0} dk`
      : `${rule.base_minutes ?? 0} dk + ${String(rule.per_unit_minutes ?? 0).replace(".", ",")} dk/${unit}`;
  const clamp = [
    rule.min_minutes != null ? `en az ${rule.min_minutes}` : null,
    rule.max_minutes != null ? `en çok ${rule.max_minutes}` : null,
  ].filter(Boolean);
  return clamp.length ? `${main} (${clamp.join(", ")})` : main;
}

export default function AdminDurationRules() {
  const { colors } = useTheme();
  const session = useSession();
  const facilityId = session.activeFacilityId;

  if (!session.can("category.manage"))
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, padding: spacing.lg }}>
        <Text style={{ color: colors.mutedText, fontSize: 13 }}>
          Bu sayfayı görüntülemek için kategori yönetimi yetkisi gerekir.
        </Text>
      </View>
    );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 64 }}>
        <View style={{ gap: spacing.md }}>
          <Text style={{ color: colors.mutedText, fontSize: 13 }}>
            İşlem süresini araç tipi, ürün kategorisi, sevkiyat tipi ve miktara göre sistem
            hesaplar. Kuralları burada tanımlar, sonuçları deneyerek doğrularsınız.
          </Text>
          <PolicyCard facilityId={facilityId} />
          <RulesCard facilityId={facilityId} />
          <TesterCard facilityId={facilityId} />
        </View>
      </ScrollView>
    </View>
  );
}

// ---------------------------------------------------------------- politika

function PolicyCard({ facilityId }: { facilityId: string | null }) {
  const { colors } = useTheme();
  const policy = useDurationPolicy(facilityId);
  const save = useSaveDurationPolicy(facilityId);
  const [draft, setDraft] = useState<{ mode: DurationMode; rounding_minutes: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const current =
    draft ?? (policy.data ? { mode: policy.data.mode, rounding_minutes: policy.data.rounding_minutes } : null);

  async function onSave() {
    if (!current) return;
    setError(null);
    setSaved(false);
    try {
      await save.mutateAsync(current);
      setSaved(true);
    } catch (err) {
      setError(errorText(err, "Hesaplama modu kaydedilemedi."));
    }
  }

  return (
    <Card style={{ gap: spacing.sm }}>
      <Text style={{ color: colors.text, fontSize: 15, fontWeight: "600" }}>Hesaplama Modu</Text>
      {!current ? (
        <LoadingState />
      ) : (
        <>
          {MODES.map((mode) => {
            const selected = current.mode === mode.value;
            return (
              <Pressable
                key={mode.value}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                onPress={() => {
                  setSaved(false);
                  setDraft({ ...current, mode: mode.value });
                }}
                style={{
                  gap: 2,
                  padding: 12,
                  borderRadius: radius.md,
                  borderWidth: 1,
                  borderColor: selected ? colors.primary : colors.border,
                  backgroundColor: colors.card,
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Ionicons
                    name={selected ? "radio-button-on" : "radio-button-off"}
                    size={16}
                    color={selected ? colors.primary : colors.faintText}
                  />
                  <Text style={{ color: colors.text, fontSize: 14, fontWeight: "600" }}>
                    {mode.title}
                  </Text>
                </View>
                <Text style={{ color: colors.mutedText, fontSize: 12, paddingLeft: 22 }}>
                  {mode.hint}
                </Text>
              </Pressable>
            );
          })}
          <Text style={{ color: colors.text, fontSize: 14, fontWeight: "500", marginTop: 4 }}>
            Yuvarlama adımı
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {(policy.data?.rounding_choices ?? [1, 5, 10, 15, 30]).map((r) => (
              <Chip
                key={r}
                label={r === 1 ? "Yok" : `${r} dk`}
                selected={current.rounding_minutes === r}
                onPress={() => {
                  setSaved(false);
                  setDraft({ ...current, rounding_minutes: r });
                }}
              />
            ))}
          </View>
          <Text style={{ color: colors.faintText, fontSize: 12 }}>
            Süre bu adıma yukarı yuvarlanır (ör. 15 dk adımında 102,5 → 105 dk). Rampa planı için
            asla aşağı yuvarlanmaz.
          </Text>
          {error && <Text style={{ color: colors.destructive, fontSize: 13 }}>{error}</Text>}
          {saved && (
            <Text style={{ color: colors.status.approved, fontSize: 13 }}>
              Hesaplama modu kaydedildi.
            </Text>
          )}
          <Button title="Kaydet" loading={save.isPending} onPress={() => void onSave()} />
        </>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------- kurallar

function IconButton({
  icon,
  label,
  onPress,
  disabled,
  danger,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({ padding: 6, opacity: disabled ? 0.3 : pressed ? 0.6 : 1 })}
    >
      <Ionicons name={icon} size={18} color={danger ? colors.destructive : colors.mutedText} />
    </Pressable>
  );
}

function RulesCard({ facilityId }: { facilityId: string | null }) {
  const { colors } = useTheme();
  const rules = useDurationRules(facilityId);
  const mutations = useDurationRuleMutations(facilityId);
  const lookups = useLookups(facilityId);
  const [editing, setEditing] = useState<DurationRuleDto | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const rows = rules.data ?? [];
  const byId = new Map(rows.map((r) => [r.id, r]));
  const shadowedCount = rows.filter((r) => r.shadowed_by).length;

  async function run(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(errorText(err, "Süre kuralları kaydedilemedi."));
    }
  }

  function move(index: number, delta: number) {
    const ids = rows.map((r) => r.id);
    const [id] = ids.splice(index, 1);
    ids.splice(index + delta, 0, id);
    void run(() => mutations.order.mutateAsync({ rule_ids: ids }));
  }

  function confirmDelete(rule: DurationRuleDto) {
    Alert.alert(
      "Kural silinsin mi?",
      "Mevcut randevuların süresi değişmez. Yeni randevularda sıradaki uygun kural uygulanır.",
      [
        { text: "Vazgeç", style: "cancel" },
        {
          text: "Sil",
          style: "destructive",
          onPress: () => void run(() => mutations.remove.mutateAsync(rule.id)),
        },
      ],
    );
  }

  return (
    <Card style={{ gap: spacing.sm }}>
      <Text style={{ color: colors.text, fontSize: 15, fontWeight: "600" }}>Kurallar</Text>
      <Text style={{ color: colors.faintText, fontSize: 12 }}>
        Kurallar yukarıdan aşağı taranır; koşulları tutan İLK kural uygulanır. Boş koşul
        “hepsi” demektir. Hiçbir kural tutmazsa kategorinin taban süresi kullanılır.
      </Text>
      {shadowedCount > 0 && (
        <View
          style={{
            flexDirection: "row",
            gap: 6,
            padding: 10,
            borderRadius: radius.md,
            borderWidth: 1,
            borderColor: colors.status.pending,
          }}
        >
          <Ionicons name="warning-outline" size={16} color={colors.status.pending} />
          <Text style={{ color: colors.text, fontSize: 12, flex: 1 }}>
            {shadowedCount} kural hiç uygulanmıyor: üstlerindeki daha genel bir kural aynı durumları
            önce yakalıyor. Sırayı değiştirin ya da “En özel kural üste”yi kullanın.
          </Text>
        </View>
      )}
      {error && <Text style={{ color: colors.destructive, fontSize: 13 }}>{error}</Text>}
      {rules.isLoading ? (
        <LoadingState />
      ) : rows.length === 0 ? (
        <Text style={{ color: colors.mutedText, fontSize: 13 }}>
          Henüz kural yok. Tüm randevular kategori taban süresiyle hesaplanır.
        </Text>
      ) : (
        rows.map((rule, index) => (
          <View
            key={rule.id}
            style={{
              gap: 4,
              padding: 10,
              borderRadius: radius.md,
              borderWidth: 1,
              borderColor: rule.shadowed_by ? colors.status.pending : colors.border,
              opacity: rule.is_active ? 1 : 0.6,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Text style={{ color: colors.mutedText, fontSize: 12, fontWeight: "700" }}>
                #{index + 1}
              </Text>
              <Text style={{ color: colors.text, fontSize: 14, fontWeight: "600", flex: 1 }}>
                {rule.name || calcText(rule)}
              </Text>
              <IconButton icon="arrow-up" label="Yukarı taşı" disabled={index === 0} onPress={() => move(index, -1)} />
              <IconButton
                icon="arrow-down"
                label="Aşağı taşı"
                disabled={index === rows.length - 1}
                onPress={() => move(index, 1)}
              />
              <IconButton icon="create-outline" label="Düzenle" onPress={() => setEditing(rule)} />
              <IconButton icon="trash-outline" label="Sil" danger onPress={() => confirmDelete(rule)} />
            </View>
            <Text style={{ color: colors.mutedText, fontSize: 12 }}>
              {conditionsText(rule, lookups.vehicleNames, lookups.categoryNames).join(" · ")}
            </Text>
            {rule.name ? (
              <Text style={{ color: colors.primary, fontSize: 13, fontWeight: "600" }}>
                {calcText(rule)}
              </Text>
            ) : null}
            {rule.shadowed_by && (
              <Text style={{ color: colors.status.pending, fontSize: 12 }}>
                Uygulanmıyor: #{(byId.get(rule.shadowed_by)?.position ?? 0) + 1} numaralı kural bu
                durumları önce yakalıyor.
              </Text>
            )}
            {!rule.is_active && (
              <Text style={{ color: colors.faintText, fontSize: 12 }}>Pasif (uygulanmaz)</Text>
            )}
          </View>
        ))
      )}
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <Button
          title="En özel kural üste"
          variant="secondary"
          disabled={rows.length < 2}
          loading={mutations.order.isPending}
          onPress={() => void run(() => mutations.order.mutateAsync({ by_specificity: true }))}
          style={{ flex: 1 }}
        />
        <Button title="Kural ekle" onPress={() => setEditing("new")} style={{ flex: 1 }} />
      </View>
      {editing !== null && (
        <RuleModal
          facilityId={facilityId}
          rule={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </Card>
  );
}

const EMPTY_RULE: DurationRuleInput = {
  name: null,
  is_active: true,
  vehicle_category_id: null,
  product_category_id: null,
  quantity_unit: null,
  min_quantity: null,
  max_quantity: null,
  calc_type: "fixed",
  fixed_minutes: 30,
  base_minutes: null,
  per_unit_minutes: null,
  min_minutes: null,
  max_minutes: null,
};

function numberOrNull(value: string): number | null {
  if (value.trim() === "") return null;
  const n = Number(value.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function text(n: number | null): string {
  return n == null ? "" : String(n).replace(".", ",");
}

function RuleModal({
  facilityId,
  rule,
  onClose,
}: {
  facilityId: string | null;
  rule: DurationRuleDto | null;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const mutations = useDurationRuleMutations(facilityId);
  const lookups = useLookups(facilityId);
  const [draft, setDraft] = useState<DurationRuleInput>(() =>
    rule
      ? {
          name: rule.name,
          is_active: rule.is_active,
          vehicle_category_id: rule.vehicle_category_id,
          product_category_id: rule.product_category_id,
          quantity_unit: rule.quantity_unit,
          min_quantity: rule.min_quantity,
          max_quantity: rule.max_quantity,
          calc_type: rule.calc_type,
          fixed_minutes: rule.fixed_minutes,
          base_minutes: rule.base_minutes,
          per_unit_minutes: rule.per_unit_minutes,
          min_minutes: rule.min_minutes,
          max_minutes: rule.max_minutes,
        }
      : EMPTY_RULE,
  );
  // Ondalık girişte ("2," yazarken) metin kaybolmasın diye ayrı tutulur.
  const [perUnitText, setPerUnitText] = useState(text(draft.per_unit_minutes));
  const [error, setError] = useState<string | null>(null);
  const pending = mutations.create.isPending || mutations.update.isPending;
  const set = (patch: Partial<DurationRuleInput>) => setDraft((d) => ({ ...d, ...patch }));

  function validate(): string | null {
    if (draft.calc_type === "fixed" && !draft.fixed_minutes) return "Sabit süre girin.";
    if (draft.calc_type === "per_unit" && draft.per_unit_minutes == null)
      return "Birim başına süreyi girin.";
    if (draft.min_quantity != null && draft.max_quantity != null && draft.max_quantity < draft.min_quantity)
      return "Miktar üst sınırı alt sınırdan küçük olamaz.";
    if (draft.min_minutes != null && draft.max_minutes != null && draft.max_minutes < draft.min_minutes)
      return "Süre üst sınırı alt sınırdan küçük olamaz.";
    return null;
  }

  async function onSave() {
    const problem = validate();
    if (problem) return setError(problem);
    setError(null);
    const body: DurationRuleInput = {
      ...draft,
      name: draft.name?.trim() || null,
      fixed_minutes: draft.calc_type === "fixed" ? draft.fixed_minutes : null,
      base_minutes: draft.calc_type === "per_unit" ? draft.base_minutes ?? 0 : null,
      per_unit_minutes: draft.calc_type === "per_unit" ? draft.per_unit_minutes : null,
    };
    try {
      if (rule) await mutations.update.mutateAsync({ id: rule.id, body });
      else await mutations.create.mutateAsync(body);
      onClose();
    } catch (err) {
      setError(errorText(err, "Kural kaydedilemedi."));
    }
  }

  const section = (title: string) => (
    <Text style={{ color: colors.mutedText, fontSize: 12, fontWeight: "700", marginTop: 4 }}>
      {title.toLocaleUpperCase("tr-TR")}
    </Text>
  );

  return (
    <AppModal visible onClose={onClose} title={rule ? "Kuralı düzenle" : "Kural ekle"}>
      <View style={{ gap: spacing.sm }}>
        <Field
          label="Kural adı (isteğe bağlı)"
          value={draft.name ?? ""}
          maxLength={120}
          placeholder="ör. Tır · Un"
          onChangeText={(v) => set({ name: v })}
        />
        <SwitchRow
          label="Aktif"
          value={draft.is_active}
          onValueChange={(v) => set({ is_active: v })}
        />

        {section("Koşullar")}
        <PickerField
          label="Araç tipi"
          value={draft.vehicle_category_id ?? ANY}
          options={[
            { value: ANY, label: "Tüm araçlar" },
            ...lookups.activeVehicles.map((v) => ({ value: v.id, label: v.display_name })),
          ]}
          onChange={(v) => set({ vehicle_category_id: v === ANY ? null : v })}
        />
        <PickerField
          label="Ürün kategorisi"
          value={draft.product_category_id ?? ANY}
          options={[
            { value: ANY, label: "Tüm kategoriler" },
            ...lookups.activeCategories.map((c) => ({ value: c.id, label: c.display_name })),
          ]}
          onChange={(v) => set({ product_category_id: v === ANY ? null : v })}
        />
        <PickerField
          label="Sevkiyat tipi"
          value={draft.quantity_unit ?? ANY}
          options={[
            { value: ANY, label: "Tüm birimler" },
            ...QUANTITY_UNITS.map((u) => ({ value: u, label: QUANTITY_UNIT_LABELS[u] })),
          ]}
          onChange={(v) => set({ quantity_unit: v === ANY ? null : v })}
        />
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <View style={{ flex: 1 }}>
            <Field
              label="Miktar en az"
              keyboardType="number-pad"
              placeholder="Sınırsız"
              value={text(draft.min_quantity)}
              onChangeText={(v) => set({ min_quantity: numberOrNull(v) })}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Field
              label="Miktar en çok"
              keyboardType="number-pad"
              placeholder="Sınırsız"
              value={text(draft.max_quantity)}
              onChangeText={(v) => set({ max_quantity: numberOrNull(v) })}
            />
          </View>
        </View>

        {section("Hesap")}
        <View style={{ flexDirection: "row", gap: 6 }}>
          <Chip label="Sabit süre" selected={draft.calc_type === "fixed"} onPress={() => set({ calc_type: "fixed" })} />
          <Chip
            label="Taban + birim başına"
            selected={draft.calc_type === "per_unit"}
            onPress={() => set({ calc_type: "per_unit" })}
          />
        </View>
        {draft.calc_type === "fixed" ? (
          <Field
            label="Süre (dk)"
            keyboardType="number-pad"
            value={text(draft.fixed_minutes)}
            onChangeText={(v) => set({ fixed_minutes: numberOrNull(v) })}
          />
        ) : (
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <View style={{ flex: 1 }}>
              <Field
                label="Taban (dk)"
                keyboardType="number-pad"
                value={text(draft.base_minutes)}
                onChangeText={(v) => set({ base_minutes: numberOrNull(v) })}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Field
                label="Birim başına (dk)"
                keyboardType="decimal-pad"
                placeholder="2,5"
                value={perUnitText}
                onChangeText={(v) => {
                  setPerUnitText(v);
                  set({ per_unit_minutes: numberOrNull(v) });
                }}
              />
            </View>
          </View>
        )}
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <View style={{ flex: 1 }}>
            <Field
              label="Alt sınır (dk)"
              keyboardType="number-pad"
              placeholder="Sınırsız"
              value={text(draft.min_minutes)}
              onChangeText={(v) => set({ min_minutes: numberOrNull(v) })}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Field
              label="Üst sınır (dk)"
              keyboardType="number-pad"
              placeholder="Sınırsız"
              value={text(draft.max_minutes)}
              onChangeText={(v) => set({ max_minutes: numberOrNull(v) })}
            />
          </View>
        </View>
        <Text style={{ color: colors.primary, fontSize: 13, fontWeight: "600" }}>{calcText(draft)}</Text>

        {error && <Text style={{ color: colors.destructive, fontSize: 13 }}>{error}</Text>}
        <Button title="Kaydet" loading={pending} onPress={() => void onSave()} />
      </View>
    </AppModal>
  );
}

// ---------------------------------------------------------------- deneme

function TesterCard({ facilityId }: { facilityId: string | null }) {
  const { colors } = useTheme();
  const lookups = useLookups(facilityId);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [vehicleId, setVehicleId] = useState<string>(ANY);
  const [unit, setUnit] = useState<string>("pallet");
  const [quantity, setQuantity] = useState("12");
  const qty = Math.max(1, Math.floor(Number(quantity) || 0));
  const result = useDurationEvaluate(
    facilityId,
    categoryId
      ? [
          {
            product_category_id: categoryId,
            vehicle_category_id: vehicleId === ANY ? null : vehicleId,
            quantity: qty,
            quantity_unit: unit,
          },
        ]
      : null,
  );
  const estimate = result.data?.results[0];

  return (
    <Card style={{ gap: spacing.sm }}>
      <Text style={{ color: colors.text, fontSize: 15, fontWeight: "600" }}>Dene</Text>
      <PickerField
        label="Ürün kategorisi"
        value={categoryId}
        placeholder="Kategori seçin"
        options={lookups.activeCategories.map((c) => ({ value: c.id, label: c.display_name }))}
        onChange={setCategoryId}
      />
      <PickerField
        label="Araç tipi"
        value={vehicleId}
        options={[
          { value: ANY, label: "Kategorinin varsayılan aracı" },
          ...lookups.activeVehicles.map((v) => ({ value: v.id, label: v.display_name })),
        ]}
        onChange={setVehicleId}
      />
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <View style={{ flex: 1 }}>
          <PickerField
            label="Sevkiyat tipi"
            value={unit}
            options={QUANTITY_UNITS.map((u) => ({ value: u, label: QUANTITY_UNIT_LABELS[u] }))}
            onChange={setUnit}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Field label="Miktar" keyboardType="number-pad" value={quantity} onChangeText={setQuantity} />
        </View>
      </View>
      {!categoryId ? (
        <Text style={{ color: colors.faintText, fontSize: 12 }}>
          Bir kategori seçin; sonuç, eşleşen kural ve hesap adımları burada görünür.
        </Text>
      ) : !estimate ? (
        <LoadingState />
      ) : (
        <View
          style={{
            gap: 4,
            padding: 12,
            borderRadius: radius.md,
            borderWidth: 1,
            borderColor: estimate.source === "rule" ? colors.status.approved : colors.border,
          }}
        >
          <Text style={{ color: colors.mutedText, fontSize: 12 }}>Hesaplanan süre</Text>
          <Text style={{ color: colors.text, fontSize: 26, fontWeight: "700" }}>
            {estimate.minutes} dk
          </Text>
          <Text style={{ color: colors.text, fontSize: 12 }}>
            {estimate.source === "rule"
              ? `Eşleşen kural: #${(estimate.rule_position ?? 0) + 1}${estimate.rule_name ? ` · ${estimate.rule_name}` : ""}`
              : "Eşleşen kural yok: kategori taban süresi uygulandı."}
          </Text>
          {estimate.steps.map((step) => (
            <Text key={step} style={{ color: colors.mutedText, fontSize: 12 }}>
              • {step}
            </Text>
          ))}
        </View>
      )}
    </Card>
  );
}
