"use client";

/**
 * Islem suresi kurallari yonetimi (musteri karari 2026-11).
 *
 * Dort parca: politika (mod + yuvarlama), kural listesi (sira onemli; olu
 * kural uyarisi), deneme kutusu (tek senaryo + hesap adimlari) ve senaryo
 * tablosu (arac x miktar; kural bosluklari bir bakista). Algoritma ve
 * ornekler: docs/SURE_HESAPLAMA.md.
 */

import { AlertTriangle, ArrowDown, ArrowUp, Pencil, Plus, Sparkles, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { QUANTITY_UNITS, type QuantityUnit } from "@logislot/shared";
import { ConfirmDialog } from "@/components/config/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Input, Label, Select } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  useDurationEvaluate,
  useDurationPolicy,
  useDurationRuleMutations,
  useDurationRules,
  useSaveDurationPolicy,
} from "@/lib/api/duration";
import { productCategories, vehicleCategories } from "@/lib/api/resources";
import type {
  DurationMode,
  DurationRuleDto,
  DurationRuleInput,
  DurationScenario,
} from "@/lib/api/types";
import { useApiErrorMessage } from "@/lib/i18n/api-error";
import { useLabels } from "@/lib/i18n/labels";
import { useT } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";

const MODES: DurationMode[] = ["supplier", "suggested", "computed"];
const DEFAULT_QUANTITIES = "1, 5, 10, 15, 20, 33";

type Lookup = Map<string, string>;

function useLookups(facilityId: string | null) {
  const categories = productCategories.useList(facilityId);
  const vehicles = vehicleCategories.useList(facilityId);
  const activeCategories = (categories.data ?? []).filter((c) => c.is_active);
  const activeVehicles = (vehicles.data ?? []).filter((v) => v.is_active);
  const categoryNames: Lookup = new Map((categories.data ?? []).map((c) => [c.id, c.display_name]));
  const vehicleNames: Lookup = new Map((vehicles.data ?? []).map((v) => [v.id, v.display_name]));
  return { activeCategories, activeVehicles, categoryNames, vehicleNames };
}

/** Kural formunun canli onizlemesi icin sunucuyla AYNI formul (yukari yuvarlama). */
function previewMinutes(rule: DurationRuleInput, quantity: number, rounding: number): number {
  let raw =
    rule.calc_type === "fixed"
      ? rule.fixed_minutes ?? 0
      : (rule.base_minutes ?? 0) + (rule.per_unit_minutes ?? 0) * quantity;
  if (rule.min_minutes != null && raw < rule.min_minutes) raw = rule.min_minutes;
  if (rule.max_minutes != null && raw > rule.max_minutes) raw = rule.max_minutes;
  const step = rounding > 1 ? rounding : 1;
  return Math.min(Math.max(Math.ceil(Math.round(raw * 100) / 100 / step) * step, step), 1440);
}

export function DurationRulesManager({ facilityId }: { facilityId: string | null }) {
  return (
    <div className="flex flex-col gap-4">
      <PolicyCard facilityId={facilityId} />
      <RulesCard facilityId={facilityId} />
      <div className="grid gap-4 xl:grid-cols-2">
        <TesterCard facilityId={facilityId} />
        <ScenarioTableCard facilityId={facilityId} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- politika

function PolicyCard({ facilityId }: { facilityId: string | null }) {
  const t = useT();
  const copy = t.admin.durationRules;
  const errorMessage = useApiErrorMessage();
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
      setError(errorMessage(err, copy.saveFailed));
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{copy.policyTitle}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {!current ? (
          <p className="text-sm text-muted-foreground">{t.common.loading}</p>
        ) : (
          <>
            <div role="radiogroup" className="grid gap-2 md:grid-cols-3">
              {MODES.map((mode) => (
                <button
                  key={mode}
                  type="button"
                  role="radio"
                  aria-checked={current.mode === mode}
                  onClick={() => {
                    setSaved(false);
                    setDraft({ ...current, mode });
                  }}
                  className={cn(
                    "flex flex-col gap-1 rounded-xl border p-3 text-left transition-colors",
                    current.mode === mode
                      ? "border-primary bg-primary/10"
                      : "border-border hover:bg-muted",
                  )}
                >
                  <span className="text-sm font-semibold">{copy.modes[mode].title}</span>
                  <span className="text-xs text-muted-foreground">{copy.modes[mode].hint}</span>
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <Label htmlFor="duration-rounding">{copy.rounding}</Label>
                <Select
                  id="duration-rounding"
                  value={current.rounding_minutes}
                  onChange={(e) => {
                    setSaved(false);
                    setDraft({ ...current, rounding_minutes: Number(e.target.value) });
                  }}
                  className="w-44"
                >
                  {(policy.data?.rounding_choices ?? [1, 5, 10, 15, 30]).map((r) => (
                    <option key={r} value={r}>
                      {r === 1 ? copy.noRounding : copy.roundingOption(r)}
                    </option>
                  ))}
                </Select>
              </div>
              <p className="max-w-xl text-xs text-muted-foreground">{copy.roundingHint}</p>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            {saved && <p className="text-sm text-status-approved">{copy.policySaved}</p>}
            <div className="flex justify-end">
              <Button onClick={() => void onSave()} disabled={save.isPending}>
                {save.isPending ? t.common.saving : t.common.save}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------- kurallar

function useRuleText() {
  const t = useT();
  const copy = t.admin.durationRules;
  const labels = useLabels();
  const unitLabel = (unit: string | null) =>
    unit ? labels.quantityUnit[unit as QuantityUnit] ?? unit : copy.anyUnit;
  return {
    conditions(rule: DurationRuleInput, vehicles: Lookup, categories: Lookup): string[] {
      const qty =
        rule.min_quantity != null && rule.max_quantity != null
          ? `${rule.min_quantity}–${rule.max_quantity}`
          : rule.min_quantity != null
            ? `≥ ${rule.min_quantity}`
            : rule.max_quantity != null
              ? `≤ ${rule.max_quantity}`
              : copy.anyQuantity;
      return [
        rule.vehicle_category_id ? vehicles.get(rule.vehicle_category_id) ?? "?" : copy.anyVehicle,
        rule.product_category_id
          ? categories.get(rule.product_category_id) ?? "?"
          : copy.anyCategory,
        unitLabel(rule.quantity_unit),
        qty,
      ];
    },
    calc(rule: DurationRuleInput): string {
      const main =
        rule.calc_type === "fixed"
          ? copy.fixedText(rule.fixed_minutes ?? 0)
          : copy.perUnitText(
              rule.base_minutes ?? 0,
              String(rule.per_unit_minutes ?? 0).replace(".", ","),
              rule.quantity_unit ? unitLabel(rule.quantity_unit).toLocaleLowerCase("tr-TR") : copy.unitWord,
            );
      const clamp = [
        rule.min_minutes != null ? copy.minClamp(rule.min_minutes) : null,
        rule.max_minutes != null ? copy.maxClamp(rule.max_minutes) : null,
      ].filter(Boolean);
      return clamp.length ? `${main} (${clamp.join(", ")})` : main;
    },
  };
}

function RulesCard({ facilityId }: { facilityId: string | null }) {
  const t = useT();
  const copy = t.admin.durationRules;
  const errorMessage = useApiErrorMessage();
  const rules = useDurationRules(facilityId);
  const mutations = useDurationRuleMutations(facilityId);
  const lookups = useLookups(facilityId);
  const text = useRuleText();
  const [editing, setEditing] = useState<DurationRuleDto | "new" | null>(null);
  const [deleting, setDeleting] = useState<DurationRuleDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const rows = rules.data ?? [];
  const byId = new Map(rows.map((r) => [r.id, r]));
  const shadowedCount = rows.filter((r) => r.shadowed_by).length;

  async function run(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(errorMessage(err, copy.saveFailed));
    }
  }

  function move(index: number, delta: number) {
    const ids = rows.map((r) => r.id);
    const [id] = ids.splice(index, 1);
    ids.splice(index + delta, 0, id);
    void run(() => mutations.order.mutateAsync({ rule_ids: ids }));
  }

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle>{copy.rulesTitle}</CardTitle>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            size="sm"
            disabled={rows.length < 2 || mutations.order.isPending}
            onClick={() => void run(() => mutations.order.mutateAsync({ by_specificity: true }))}
            title={copy.sortHint}
          >
            <Sparkles className="mr-1 h-4 w-4" />
            {copy.sortBySpecificity}
          </Button>
          <Button size="sm" onClick={() => setEditing("new")}>
            <Plus className="mr-1 h-4 w-4" />
            {copy.addRule}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-xs text-muted-foreground">{copy.rulesHint}</p>
        {shadowedCount > 0 && (
          <p className="flex items-start gap-2 rounded-lg border border-status-pending/40 bg-status-pending/10 px-3 py-2 text-xs">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-status-pending" />
            {copy.shadowedSummary(shadowedCount)}
          </p>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
        {rules.isLoading ? (
          <p className="text-sm text-muted-foreground">{t.common.loading}</p>
        ) : rows.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            {copy.empty}
          </p>
        ) : (
          <ol className="flex flex-col gap-2">
            {rows.map((rule, index) => (
              <li
                key={rule.id}
                className={cn(
                  "flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center",
                  rule.shadowed_by ? "border-status-pending/50" : "border-border",
                  !rule.is_active && "opacity-60",
                )}
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  {rule.name && <div className="text-sm font-semibold">{rule.name}</div>}
                  <div className="flex flex-wrap gap-1.5 text-xs">
                    {text
                      .conditions(rule, lookups.vehicleNames, lookups.categoryNames)
                      .map((part, i) => (
                        <span key={i} className="rounded-full bg-muted px-2 py-0.5">
                          {part}
                        </span>
                      ))}
                  </div>
                  <div className="mt-1 text-sm font-medium text-primary">{text.calc(rule)}</div>
                  {rule.shadowed_by && (
                    <div className="mt-1 text-xs text-status-pending">
                      {copy.shadowedBy((byId.get(rule.shadowed_by)?.position ?? 0) + 1)}
                    </div>
                  )}
                  {!rule.is_active && (
                    <div className="mt-1 text-xs text-muted-foreground">{copy.inactive}</div>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <IconButton label={copy.moveUp} disabled={index === 0} onClick={() => move(index, -1)}>
                    <ArrowUp className="h-4 w-4" />
                  </IconButton>
                  <IconButton
                    label={copy.moveDown}
                    disabled={index === rows.length - 1}
                    onClick={() => move(index, 1)}
                  >
                    <ArrowDown className="h-4 w-4" />
                  </IconButton>
                  <IconButton label={t.common.edit} onClick={() => setEditing(rule)}>
                    <Pencil className="h-4 w-4" />
                  </IconButton>
                  <IconButton label={t.common.delete} danger onClick={() => setDeleting(rule)}>
                    <Trash2 className="h-4 w-4" />
                  </IconButton>
                </div>
              </li>
            ))}
          </ol>
        )}
      </CardContent>

      {editing !== null && (
        <RuleDialog
          facilityId={facilityId}
          rule={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
      <ConfirmDialog
        open={deleting !== null}
        title={copy.deleteTitle}
        message={copy.deleteMessage}
        confirmLabel={t.common.delete}
        loading={mutations.remove.isPending}
        onConfirm={() =>
          void run(async () => {
            await mutations.remove.mutateAsync(deleting!.id);
            setDeleting(null);
          })
        }
        onClose={() => setDeleting(null)}
      />
    </Card>
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted disabled:opacity-30",
        danger && "hover:bg-destructive/10 hover:text-destructive",
      )}
    >
      {children}
    </button>
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

function RuleDialog({
  facilityId,
  rule,
  onClose,
}: {
  facilityId: string | null;
  rule: DurationRuleDto | null;
  onClose: () => void;
}) {
  const t = useT();
  const copy = t.admin.durationRules;
  const labels = useLabels();
  const errorMessage = useApiErrorMessage();
  const mutations = useDurationRuleMutations(facilityId);
  const policy = useDurationPolicy(facilityId);
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
  const [error, setError] = useState<string | null>(null);
  const pending = mutations.create.isPending || mutations.update.isPending;
  const rounding = policy.data?.rounding_minutes ?? 15;
  const set = (patch: Partial<DurationRuleInput>) => setDraft((d) => ({ ...d, ...patch }));
  const previewQuantities = [1, 5, 10, 20, 33].filter(
    (q) =>
      (draft.min_quantity == null || q >= draft.min_quantity) &&
      (draft.max_quantity == null || q <= draft.max_quantity),
  );

  function validate(): string | null {
    if (draft.calc_type === "fixed" && !draft.fixed_minutes) return copy.errors.fixedRequired;
    if (draft.calc_type === "per_unit" && draft.per_unit_minutes == null) return copy.errors.perUnitRequired;
    if (draft.min_quantity != null && draft.max_quantity != null && draft.max_quantity < draft.min_quantity)
      return copy.errors.quantityRange;
    if (draft.min_minutes != null && draft.max_minutes != null && draft.max_minutes < draft.min_minutes)
      return copy.errors.minuteRange;
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
      setError(errorMessage(err, copy.saveFailed));
    }
  }

  return (
    <Dialog open onClose={onClose} title={rule ? copy.editRule : copy.addRule} className="max-w-2xl">
      <div className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <div>
            <Label htmlFor="rule-name">{copy.fields.name}</Label>
            <Input
              id="rule-name"
              value={draft.name ?? ""}
              maxLength={120}
              placeholder={copy.fields.namePlaceholder}
              onChange={(e) => set({ name: e.target.value })}
            />
          </div>
          <div className="flex items-center gap-2 pb-2.5 text-sm">
            <Switch checked={draft.is_active} onChange={(v) => set({ is_active: v })} />
            {draft.is_active ? copy.active : copy.inactive}
          </div>
        </div>

        <fieldset className="flex flex-col gap-3 rounded-lg border border-border p-3">
          <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {copy.conditionsTitle}
          </legend>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label>{copy.fields.vehicle}</Label>
              <Select
                value={draft.vehicle_category_id ?? ""}
                onChange={(e) => set({ vehicle_category_id: e.target.value || null })}
              >
                <option value="">{copy.anyVehicle}</option>
                {lookups.activeVehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.display_name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>{copy.fields.category}</Label>
              <Select
                value={draft.product_category_id ?? ""}
                onChange={(e) => set({ product_category_id: e.target.value || null })}
              >
                <option value="">{copy.anyCategory}</option>
                {lookups.activeCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.display_name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>{copy.fields.unit}</Label>
              <Select
                value={draft.quantity_unit ?? ""}
                onChange={(e) => set({ quantity_unit: e.target.value || null })}
              >
                <option value="">{copy.anyUnit}</option>
                {QUANTITY_UNITS.map((u) => (
                  <option key={u} value={u}>
                    {labels.quantityUnit[u]}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:w-2/3">
            <div>
              <Label>{copy.fields.minQuantity}</Label>
              <Input
                type="number"
                min={0}
                value={draft.min_quantity ?? ""}
                placeholder={copy.fields.noLimit}
                onChange={(e) => set({ min_quantity: numberOrNull(e.target.value) })}
              />
            </div>
            <div>
              <Label>{copy.fields.maxQuantity}</Label>
              <Input
                type="number"
                min={0}
                value={draft.max_quantity ?? ""}
                placeholder={copy.fields.noLimit}
                onChange={(e) => set({ max_quantity: numberOrNull(e.target.value) })}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">{copy.conditionsHint}</p>
        </fieldset>

        <fieldset className="flex flex-col gap-3 rounded-lg border border-border p-3">
          <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {copy.calcTitle}
          </legend>
          <div className="flex flex-wrap gap-2">
            {(["fixed", "per_unit"] as const).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => set({ calc_type: type })}
                className={cn(
                  "rounded-lg border px-3 py-1.5 text-sm transition-colors",
                  draft.calc_type === type
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border hover:bg-muted",
                )}
              >
                {copy.calcTypes[type]}
              </button>
            ))}
          </div>
          {draft.calc_type === "fixed" ? (
            <div className="sm:w-1/3">
              <Label>{copy.fields.fixedMinutes}</Label>
              <Input
                type="number"
                min={1}
                value={draft.fixed_minutes ?? ""}
                onChange={(e) => set({ fixed_minutes: numberOrNull(e.target.value) })}
              />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:w-2/3">
              <div>
                <Label>{copy.fields.baseMinutes}</Label>
                <Input
                  type="number"
                  min={0}
                  value={draft.base_minutes ?? ""}
                  onChange={(e) => set({ base_minutes: numberOrNull(e.target.value) })}
                />
              </div>
              <div>
                <Label>{copy.fields.perUnitMinutes}</Label>
                <Input
                  inputMode="decimal"
                  value={draft.per_unit_minutes ?? ""}
                  placeholder="2,5"
                  onChange={(e) => set({ per_unit_minutes: numberOrNull(e.target.value) })}
                />
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3 sm:w-2/3">
            <div>
              <Label>{copy.fields.minMinutes}</Label>
              <Input
                type="number"
                min={1}
                value={draft.min_minutes ?? ""}
                placeholder={copy.fields.noLimit}
                onChange={(e) => set({ min_minutes: numberOrNull(e.target.value) })}
              />
            </div>
            <div>
              <Label>{copy.fields.maxMinutes}</Label>
              <Input
                type="number"
                min={1}
                value={draft.max_minutes ?? ""}
                placeholder={copy.fields.noLimit}
                onChange={(e) => set({ max_minutes: numberOrNull(e.target.value) })}
              />
            </div>
          </div>
        </fieldset>

        {previewQuantities.length > 0 && (
          <div className="rounded-lg bg-muted/50 p-3">
            <div className="mb-2 text-xs font-semibold text-muted-foreground">
              {copy.previewTitle(rounding)}
            </div>
            <div className="flex flex-wrap gap-2">
              {previewQuantities.map((q) => (
                <span key={q} className="rounded-lg bg-card px-2.5 py-1 text-xs shadow-sm">
                  {q} → <strong>{previewMinutes(draft, q, rounding)} dk</strong>
                </span>
              ))}
            </div>
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            {t.common.cancel}
          </Button>
          <Button onClick={() => void onSave()} disabled={pending}>
            {pending ? t.common.saving : t.common.save}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

// ---------------------------------------------------------------- deneme

function TesterCard({ facilityId }: { facilityId: string | null }) {
  const t = useT();
  const copy = t.admin.durationRules;
  const labels = useLabels();
  const lookups = useLookups(facilityId);
  const [categoryId, setCategoryId] = useState("");
  const [vehicleId, setVehicleId] = useState("");
  const [unit, setUnit] = useState<QuantityUnit>("pallet");
  const [quantity, setQuantity] = useState("12");
  const qty = Math.max(1, Math.floor(Number(quantity) || 0));
  const scenarios: DurationScenario[] | null = categoryId
    ? [{ product_category_id: categoryId, vehicle_category_id: vehicleId || null, quantity: qty, quantity_unit: unit }]
    : null;
  const result = useDurationEvaluate(facilityId, scenarios);
  const estimate = result.data?.results[0];

  return (
    <Card>
      <CardHeader>
        <CardTitle>{copy.testerTitle}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>{copy.fields.category}</Label>
            <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">{copy.selectCategory}</option>
              {lookups.activeCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.display_name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>{copy.fields.vehicle}</Label>
            <Select value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
              <option value="">{copy.categoryDefaultVehicle}</option>
              {lookups.activeVehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.display_name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>{copy.fields.unit}</Label>
            <Select value={unit} onChange={(e) => setUnit(e.target.value as QuantityUnit)}>
              {QUANTITY_UNITS.map((u) => (
                <option key={u} value={u}>
                  {labels.quantityUnit[u]}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>{copy.fields.quantity}</Label>
            <Input type="number" min={1} value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          </div>
        </div>
        {!categoryId ? (
          <p className="text-xs text-muted-foreground">{copy.testerHint}</p>
        ) : estimate ? (
          <div
            className={cn(
              "rounded-xl border p-4",
              estimate.source === "rule"
                ? "border-status-approved/40 bg-status-approved/10"
                : "border-border bg-muted/50",
            )}
          >
            <div className="text-xs text-muted-foreground">{copy.calculated}</div>
            <div className="text-3xl font-bold tabular-nums">{copy.minutes(estimate.minutes)}</div>
            <div className="mt-1 text-xs">
              {estimate.source === "rule"
                ? copy.matchedRule((estimate.rule_position ?? 0) + 1, estimate.rule_name)
                : copy.fallback}
            </div>
            <ul className="mt-2 list-inside list-disc text-xs text-muted-foreground">
              {estimate.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">{t.common.loading}</p>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------- senaryo tablosu

function ScenarioTableCard({ facilityId }: { facilityId: string | null }) {
  const t = useT();
  const copy = t.admin.durationRules;
  const labels = useLabels();
  const lookups = useLookups(facilityId);
  const [categoryId, setCategoryId] = useState("");
  const [unit, setUnit] = useState<QuantityUnit>("pallet");
  const [quantityText, setQuantityText] = useState(DEFAULT_QUANTITIES);
  const quantities = useMemo(
    () =>
      Array.from(
        new Set(
          quantityText
            .split(/[,\s;]+/)
            .map((v) => Math.floor(Number(v)))
            .filter((v) => Number.isFinite(v) && v >= 1),
        ),
      )
        .sort((a, b) => a - b)
        .slice(0, 12),
    [quantityText],
  );
  const vehicles = lookups.activeVehicles;
  const scenarios: DurationScenario[] | null =
    categoryId && quantities.length > 0
      ? vehicles.flatMap((v) =>
          quantities.map((q) => ({
            product_category_id: categoryId,
            vehicle_category_id: v.id,
            quantity: q,
            quantity_unit: unit,
          })),
        )
      : null;
  const result = useDurationEvaluate(facilityId, scenarios);
  const cells = result.data?.results ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>{copy.scenarioTitle}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div>
            <Label>{copy.fields.category}</Label>
            <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">{copy.selectCategory}</option>
              {lookups.activeCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.display_name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>{copy.fields.unit}</Label>
            <Select value={unit} onChange={(e) => setUnit(e.target.value as QuantityUnit)}>
              {QUANTITY_UNITS.map((u) => (
                <option key={u} value={u}>
                  {labels.quantityUnit[u]}
                </option>
              ))}
            </Select>
          </div>
          <div className="col-span-2 sm:col-span-1">
            <Label>{copy.quantities}</Label>
            <Input value={quantityText} onChange={(e) => setQuantityText(e.target.value)} />
          </div>
        </div>
        {!categoryId ? (
          <p className="text-xs text-muted-foreground">{copy.scenarioHint}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-muted-foreground">
                  <th className="py-1.5 pr-2 text-left font-medium">{copy.fields.vehicle}</th>
                  {quantities.map((q) => (
                    <th key={q} className="px-1.5 py-1.5 text-right font-medium tabular-nums">
                      {q}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {vehicles.map((v, row) => (
                  <tr key={v.id} className="border-t border-border">
                    <td className="py-1.5 pr-2 font-medium">{v.display_name}</td>
                    {quantities.map((q, col) => {
                      const cell = cells[row * quantities.length + col];
                      return (
                        <td
                          key={q}
                          className={cn(
                            "px-1.5 py-1.5 text-right tabular-nums",
                            cell?.source === "fallback" && "italic text-muted-foreground",
                          )}
                          title={cell?.steps.join(" · ")}
                        >
                          {cell ? `${cell.minutes}${cell.source === "fallback" ? "*" : ""}` : "…"}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-muted-foreground">{copy.scenarioLegend}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
