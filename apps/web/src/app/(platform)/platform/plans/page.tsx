"use client";

import { useState } from "react";
import { MultiSelectChips } from "@/components/config/multi-select";
import { ConfirmDialog } from "@/components/config/confirm-dialog";
import { EmptyState, ErrorState, LoadingState } from "@/components/config/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Input, Label, Select } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { ApiError } from "@/lib/api/client";
import {
  usePlanLimitDimensions,
  usePlanMutations,
  usePlatformPlans,
  type PlanDto,
} from "@/lib/api/platform";
import { cn } from "@/lib/utils";

const DIMENSIONS = [
  "appointments_created",
  "appointments_completed",
  "active_docks",
  "active_suppliers",
  "active_users",
];

const BILLING_UNITS = ["fixed", "per_appointment", "per_active_dock", "per_facility", "hybrid"];

const STATUS_BADGE: Record<string, string> = {
  draft: "bg-status-pending/15 text-status-pending",
  active: "bg-status-approved/15 text-status-approved",
  retired: "bg-status-cancelled/15 text-status-cancelled",
};

export default function PlansPage() {
  const plans = usePlatformPlans();
  const mutations = usePlanMutations();
  const limitDimensions = usePlanLimitDimensions();

  const [drawer, setDrawer] = useState<{ open: boolean; editing: PlanDto | null }>({
    open: false,
    editing: null,
  });
  const [name, setName] = useState("");
  const [scope, setScope] = useState("tenant");
  const [billingUnit, setBillingUnit] = useState("fixed");
  const [status, setStatus] = useState("draft");
  const [dimensions, setDimensions] = useState<string[]>([]);
  const [rateCardText, setRateCardText] = useState("[]");
  // Dinamik kotalar: bos string = sinirsiz. Anahtarlar backend katalogundan gelir.
  const [limits, setLimits] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [retireTarget, setRetireTarget] = useState<PlanDto | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  function openCreate() {
    setName("");
    setScope("tenant");
    setBillingUnit("fixed");
    setStatus("draft");
    setDimensions([...DIMENSIONS.slice(0, 2)]);
    setRateCardText(
      JSON.stringify(
        [{ dimension: "appointments_created", unit_price: 0, included_quota: 100, overage_rule: "per_unit" }],
        null,
        2,
      ),
    );
    setLimits({});
    setFormError(null);
    setDrawer({ open: true, editing: null });
  }

  function openEdit(plan: PlanDto) {
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
    setDrawer({ open: true, editing: plan });
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
        id: drawer.editing?.id,
        body: {
          name,
          scope,
          billing_unit_label: billingUnit,
          status,
          measurable_dimensions_json: dimensions,
          rate_card_json: rateCard,
          // Bos birakilan / 0 girilen boyut = sinirsiz; backend de ayni
          // normalizasyonu uygular (app/core/plan_limits.py).
          limits_json: Object.fromEntries(
            Object.entries(limits)
              .map(([key, raw]) => [key, Number.parseInt(raw, 10)] as const)
              .filter(([, value]) => Number.isFinite(value) && value > 0),
          ),
        },
      });
      setFlash(drawer.editing ? "Plan güncellendi." : "Plan oluşturuldu.");
      setTimeout(() => setFlash(null), 4000);
      setDrawer({ open: false, editing: null });
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Kaydedilemedi");
    }
  }

  async function onRetire() {
    if (!retireTarget) return;
    try {
      await mutations.retire.mutateAsync(retireTarget.id);
      setFlash(`"${retireTarget.name}" emekliye ayrıldı; yeni atama yapılamaz.`);
      setTimeout(() => setFlash(null), 4000);
    } finally {
      setRetireTarget(null);
    }
  }

  if (plans.isLoading) return <LoadingState />;
  if (plans.isError)
    return <ErrorState message="Planlar yüklenemedi." onRetry={() => plans.refetch()} />;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Planlar</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Plan bir <strong>politika kabıdır</strong>: neyin nasıl ölçüleceğini tanımlar.
            Fatura hesaplamaz; gelecekteki billing engine bu yapıyı okuyacaktır.
          </p>
        </div>
        <Button onClick={openCreate}>+ Yeni Plan</Button>
      </div>

      {flash && (
        <div className="rounded-lg border border-status-approved/40 bg-status-approved/10 px-3 py-2 text-sm text-status-approved">
          {flash}
        </div>
      )}

      {(plans.data ?? []).length === 0 ? (
        <EmptyState
          title="Plan yok"
          description="Starter/Professional gibi politika profilleri tanımlayın."
          actionLabel="İlk planı oluştur"
          onAction={openCreate}
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Plan</TH>
              <TH>Kapsam</TH>
              <TH>Faturalama Birimi</TH>
              <TH>Ölçülen Boyutlar</TH>
              <TH>Limitler</TH>
              <TH>Durum</TH>
              <TH className="text-right">İşlem</TH>
            </TR>
          </THead>
          <TBody>
            {(plans.data ?? []).map((plan) => (
              <TR key={plan.id}>
                <TD className="font-medium">{plan.name}</TD>
                <TD>
                  <Badge className="bg-primary/10 text-primary">
                    {plan.scope === "tenant" ? "Müşteri hesabı" : "Operasyon"}
                  </Badge>
                </TD>
                <TD className="font-mono text-xs">{plan.billing_unit_label}</TD>
                <TD>
                  <div className="flex max-w-72 flex-wrap gap-1">
                    {(plan.measurable_dimensions_json ?? []).map((d) => (
                      <Badge key={d} className="bg-muted font-mono text-[10px] text-muted-foreground">
                        {d}
                      </Badge>
                    ))}
                  </div>
                </TD>
                <TD>
                  <div className="flex max-w-64 flex-wrap gap-1">
                    {Object.keys(plan.limits_json ?? {}).length === 0 ? (
                      <span className="text-xs text-muted-foreground">Sınırsız</span>
                    ) : (
                      (limitDimensions.data?.dimensions ?? [])
                        .filter((dim) => plan.limits_json?.[dim.key])
                        .map((dim) => (
                          <Badge
                            key={dim.key}
                            className="bg-muted text-[10px] text-muted-foreground"
                            title={dim.description}
                          >
                            {dim.label}: {plan.limits_json?.[dim.key]}
                          </Badge>
                        ))
                    )}
                  </div>
                </TD>
                <TD>
                  <Badge className={cn(STATUS_BADGE[plan.status])}>{plan.status}</Badge>
                </TD>
                <TD className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button size="sm" variant="secondary" onClick={() => openEdit(plan)}>
                      Düzenle
                    </Button>
                    {plan.status !== "retired" && (
                      <Button size="sm" variant="ghost" onClick={() => setRetireTarget(plan)}>
                        Emekliye Ayır
                      </Button>
                    )}
                  </div>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}

      <Drawer
        open={drawer.open}
        onClose={() => setDrawer({ open: false, editing: null })}
        title={drawer.editing ? "Planı Düzenle" : "Yeni Plan"}
        description="Bu yapı fatura hesaplamaz; gelecekteki billing engine için politika kabıdır."
      >
        <div className="flex flex-col gap-4">
          <div>
            <Label>Plan Adı</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Professional" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Kapsam</Label>
              <Select value={scope} onChange={(e) => setScope(e.target.value)}>
                <option value="tenant">Müşteri hesabı</option>
                <option value="facility">Operasyon kapsamı</option>
              </Select>
            </div>
            <div>
              <Label>Faturalama Birimi</Label>
              <Select value={billingUnit} onChange={(e) => setBillingUnit(e.target.value)}>
                {BILLING_UNITS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Durum</Label>
              <Select value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="draft">draft</option>
                <option value="active">active</option>
                <option value="retired">retired</option>
              </Select>
            </div>
          </div>
          <div>
            <Label>Ölçülebilir Boyutlar</Label>
            <MultiSelectChips
              options={DIMENSIONS.map((d) => ({ value: d, label: d }))}
              value={dimensions}
              onChange={setDimensions}
            />
          </div>
          <div className="rounded-xl border border-border bg-muted/30 p-3">
            <div className="flex items-baseline justify-between gap-2">
              <Label className="mb-0">Plan Limitleri</Label>
              <span className="text-xs text-muted-foreground">Boş bırakılan = sınırsız</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Rakamlar sabit değildir; bu plandaki her sınırı istediğiniz zaman
              buradan değiştirebilirsiniz. Değişiklik kaydedildiği anda geçerli olur.
            </p>
            {limitDimensions.isLoading ? (
              <p className="mt-3 text-xs text-muted-foreground">Limit türleri yükleniyor…</p>
            ) : (
              <div className="mt-3 flex flex-col gap-3">
                {(limitDimensions.data?.dimensions ?? []).map((dim) => {
                  const raw = limits[dim.key] ?? "";
                  const unlimited = raw.trim() === "" || Number.parseInt(raw, 10) <= 0;
                  return (
                    <div key={dim.key} className="grid gap-2 sm:grid-cols-[1fr_10rem] sm:items-start">
                      <div>
                        <p className="text-sm font-medium">{dim.label}</p>
                        <p className="text-xs text-muted-foreground">{dim.description}</p>
                      </div>
                      <div>
                        <Input
                          type="number"
                          min={0}
                          inputMode="numeric"
                          value={raw}
                          placeholder="Sınırsız"
                          aria-label={`${dim.label} limiti (${dim.unit})`}
                          onChange={(e) =>
                            setLimits((prev) => ({ ...prev, [dim.key]: e.target.value }))
                          }
                        />
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          {unlimited ? "Sınırsız" : `${raw} ${dim.unit}`}
                          {dim.enforced_at === "assignment" && " · atamada engellenir"}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <div>
            <Label>Rate Card (JSON)</Label>
            <textarea
              className="h-40 w-full rounded-lg border border-border bg-card p-3 font-mono text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
              value={rateCardText}
              onChange={(e) => setRateCardText(e.target.value)}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Şekil: {"[{dimension, unit_price, included_quota, overage_rule}]"} — finans
              ekibi rakamları model değişmeden günceller.
            </p>
          </div>
          {formError && <p className="text-sm text-destructive">{formError}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDrawer({ open: false, editing: null })}>
              İptal
            </Button>
            <Button onClick={onSubmit} disabled={mutations.save.isPending || !name.trim()}>
              {mutations.save.isPending ? "Kaydediliyor…" : "Kaydet"}
            </Button>
          </div>
        </div>
      </Drawer>

      <ConfirmDialog
        open={retireTarget !== null}
        title="Planı emekliye ayır"
        message={`"${retireTarget?.name}" retired olur: mevcut atamalar bozulmaz ancak yeni atama yapılamaz.`}
        confirmLabel="Emekliye Ayır"
        loading={mutations.retire.isPending}
        onConfirm={onRetire}
        onClose={() => setRetireTarget(null)}
      />
    </div>
  );
}
