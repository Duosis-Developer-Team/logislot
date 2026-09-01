"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { DEFAULT_MAX_BLOCK_MINUTES } from "@logislot/shared";
import { ConfirmDialog } from "@/components/config/confirm-dialog";
import {
  ConfigPageShell,
  filterRows,
  useFlash,
  type ActiveFilter,
} from "@/components/config/page-shell";
import { ActiveBadge, EmptyState, ErrorState, LoadingState } from "@/components/config/states";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Input, Label, Select } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { ApiError } from "@/lib/api/client";
import { productCategories, vehicleCategories } from "@/lib/api/resources";
import type { ProductCategoryDto } from "@/lib/api/types";
import { useSession } from "@/lib/auth/session";
import { useApiErrorMessage } from "@/lib/i18n/api-error";
import type { Dictionary } from "@/lib/i18n/dictionaries/tr";
import { useT } from "@/lib/i18n/provider";

// Backend ile ayni sinir: app/schemas/config.py -> MAX_BLOCK_MINUTES_CAP
const MAX_BLOCK_MINUTES_CAP = 1440;

const formSchema = z
  .object({
    name: z.string().min(1, "nameRequired"),
    display_name: z.string().min(1, "displayNameRequired"),
    description: z.string().optional(),
    min_block_minutes: z.coerce
      .number({ invalid_type_error: "numberRequired" })
      .int()
      .positive("mustBePositive")
      .max(MAX_BLOCK_MINUTES_CAP, "maxDuration"),
    // Boş bırakılabilir: "üst sınır yok" anlamına gelir.
    max_block_minutes: z.union([
      z.literal(""),
      z.coerce
        .number({ invalid_type_error: "numberRequired" })
        .int()
        .positive("mustBePositive")
        .max(MAX_BLOCK_MINUTES_CAP, "maxDuration"),
    ]),
    default_vehicle_category_id: z.string().optional(),
  })
  .refine(
    (v) => v.max_block_minutes === "" || v.max_block_minutes >= v.min_block_minutes,
    { path: ["max_block_minutes"], message: "maxBelowMin" },
  );

type FormValues = z.infer<typeof formSchema>;


/** Zod semasi modul seviyesinde tanimlanir ve hook cagiramaz; mesaj olarak
 *  ANAHTAR uretilir ve ekranda sozlukten cevrilir. */
function fieldError(t: Dictionary, message: string | undefined): string | undefined {
  if (!message) return undefined;
  return (t.admin.config.messages as Record<string, string>)[message] ?? message;
}

export default function CategoriesPage() {
  const t = useT();
  const errorMessage = useApiErrorMessage();
  const { activeFacilityId } = useSession();
  const list = productCategories.useList(activeFacilityId);
  const vehicles = vehicleCategories.useList(activeFacilityId);
  const save = productCategories.useSave(activeFacilityId);
  const deactivate = productCategories.useDeactivate(activeFacilityId);
  const { flash, showFlash } = useFlash();

  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>("all");
  const [drawer, setDrawer] = useState<{ open: boolean; editing: ProductCategoryDto | null }>({
    open: false,
    editing: null,
  });
  const [editActive, setEditActive] = useState(true);
  const [confirmTarget, setConfirmTarget] = useState<ProductCategoryDto | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm<FormValues>({ resolver: zodResolver(formSchema) });

  function openCreate() {
    form.reset({
      name: "",
      display_name: "",
      description: "",
      min_block_minutes: 30,
      // Ust sinir bos birakilirsa sistem varsayilani (120 dk) uygulanir; form
      // da bu degerle acilir ki kural gorunur olsun.
      max_block_minutes: DEFAULT_MAX_BLOCK_MINUTES,
      default_vehicle_category_id: "",
    });
    setEditActive(true);
    setFormError(null);
    setDrawer({ open: true, editing: null });
  }

  function openEdit(row: ProductCategoryDto) {
    form.reset({
      name: row.name,
      display_name: row.display_name,
      description: row.description ?? "",
      min_block_minutes: row.min_block_minutes,
      max_block_minutes: row.max_block_minutes ?? "",
      default_vehicle_category_id: row.default_vehicle_category_id ?? "",
    });
    setEditActive(row.is_active);
    setFormError(null);
    setDrawer({ open: true, editing: row });
  }

  async function onSubmit(values: FormValues) {
    setFormError(null);
    const body = {
      ...values,
      description: values.description || null,
      // Bos deger = ust siniri KALDIR; backend null'i bilerek kabul eder.
      max_block_minutes: values.max_block_minutes === "" ? null : values.max_block_minutes,
      default_vehicle_category_id: values.default_vehicle_category_id || null,
      is_active: editActive,
    };
    try {
      await save.mutateAsync({ id: drawer.editing?.id, body });
      showFlash(
        "success",
        drawer.editing ? t.admin.categories.updated : t.admin.categories.created,
      );
      setDrawer({ open: false, editing: null });
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Kaydedilemedi");
    }
  }

  async function onDeactivate() {
    if (!confirmTarget) return;
    try {
      await deactivate.mutateAsync(confirmTarget.id);
      showFlash("success", t.admin.config.deactivated(confirmTarget.display_name));
    } catch (err) {
      showFlash("error", errorMessage(err, t.admin.config.actionFailed));
    } finally {
      setConfirmTarget(null);
    }
  }

  const vehicleName = (id: string | null) =>
    vehicles.data?.find((v) => v.id === id)?.display_name ?? "—";

  const rows = filterRows(
    list.data ?? [],
    search,
    activeFilter,
    (r) => `${r.name} ${r.display_name}`,
  );

  return (
    <ConfigPageShell
      title={t.admin.categories.title}
      description={t.admin.categories.pageDescription}
      createLabel={t.admin.categories.createLabel}
      onCreate={openCreate}
      search={search}
      onSearchChange={setSearch}
      activeFilter={activeFilter}
      onActiveFilterChange={setActiveFilter}
      flash={flash}
    >
      {list.isLoading ? (
        <LoadingState />
      ) : list.isError ? (
        <ErrorState message={t.admin.categories.loadError} onRetry={() => list.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState
          title={t.admin.categories.emptyTitle}
          description={t.admin.categories.emptyDescription}
          actionLabel={t.admin.categories.emptyAction}
          onAction={openCreate}
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Ad</TH>
              <TH>{t.admin.config.displayName}</TH>
              <TH>{t.admin.categories.colDuration}</TH>
              <TH>{t.admin.categories.colDefaultVehicle}</TH>
              <TH>Durum</TH>
              <TH className="text-right">{t.common.actions}</TH>
            </TR>
          </THead>
          <TBody>
            {rows.map((row) => (
              <TR key={row.id}>
                <TD className="font-medium">{row.name}</TD>
                <TD>{row.display_name}</TD>
                <TD>
                  {`${row.min_block_minutes}–${
                    row.max_block_minutes ?? DEFAULT_MAX_BLOCK_MINUTES
                  } dk`}
                </TD>
                <TD>{vehicleName(row.default_vehicle_category_id)}</TD>
                <TD>
                  <ActiveBadge active={row.is_active} />
                </TD>
                <TD className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button size="sm" variant="secondary" onClick={() => openEdit(row)}>
                      {t.common.edit}
                    </Button>
                    {row.is_active && (
                      <Button size="sm" variant="ghost" onClick={() => setConfirmTarget(row)}>
                        {t.admin.config.deactivate}
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
        title={drawer.editing ? t.admin.categories.editTitle : t.admin.categories.createTitle}
        description={t.admin.categories.drawerHint}
      >
        <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div>
            <Label>Ad</Label>
            <Input {...form.register("name")} placeholder={t.admin.categories.namePlaceholder} />
            {form.formState.errors.name && (
              <p className="mt-1 text-xs text-destructive">
                {fieldError(t, form.formState.errors.name.message)}
              </p>
            )}
          </div>
          <div>
            <Label>{t.admin.categories.supplierFacingName}</Label>
            <Input {...form.register("display_name")} />
            {form.formState.errors.display_name && (
              <p className="mt-1 text-xs text-destructive">
                {fieldError(t, form.formState.errors.display_name.message)}
              </p>
            )}
          </div>
          <div>
            <Label>{t.admin.config.description}</Label>
            <Input {...form.register("description")} placeholder="Opsiyonel" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>{t.admin.categories.minDuration}</Label>
              <Input type="number" min={1} {...form.register("min_block_minutes")} />
              {form.formState.errors.min_block_minutes && (
                <p className="mt-1 text-xs text-destructive">
                  {fieldError(t, form.formState.errors.min_block_minutes.message)}
                </p>
              )}
              <p className="mt-1 text-xs text-muted-foreground">
                {t.admin.categories.minDurationHint}
              </p>
            </div>
            <div>
              <Label>{t.admin.categories.maxDuration}</Label>
              <Input
                type="number"
                min={1}
                placeholder={t.admin.categories.unlimited}
                {...form.register("max_block_minutes")}
              />
              {form.formState.errors.max_block_minutes && (
                <p className="mt-1 text-xs text-destructive">
                  {fieldError(t, form.formState.errors.max_block_minutes.message)}
                </p>
              )}
              <p className="mt-1 text-xs text-muted-foreground">
                {t.admin.categories.maxDurationHint}
              </p>
            </div>
          </div>
          <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            {t.admin.categories.intersectionLead}{" "}
            <strong>{t.admin.categories.intersectionStrong}</strong>{" "}
            {t.admin.categories.intersectionTail}
          </div>
          <div>
            <Label>{t.admin.categories.defaultVehicle}</Label>
            <Select {...form.register("default_vehicle_category_id")}>
              <option value="">{t.admin.categories.notSelected}</option>
              {(vehicles.data ?? [])
                .filter((v) => v.is_active)
                .map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.display_name}
                  </option>
                ))}
            </Select>
            <p className="mt-1 text-xs text-muted-foreground">
              {t.admin.categories.defaultVehicleHint}
            </p>
          </div>
          {drawer.editing && (
            <Switch checked={editActive} onChange={setEditActive} label="Aktif" />
          )}
          {formError && <p className="text-sm text-destructive">{formError}</p>}
          <div className="mt-2 flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setDrawer({ open: false, editing: null })}
            >
              {t.common.cancel}
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? t.common.saving : t.common.save}
            </Button>
          </div>
        </form>
      </Drawer>

      <ConfirmDialog
        open={confirmTarget !== null}
        title={t.admin.categories.deactivateTitle}
        message={t.admin.categories.deactivateMessage(confirmTarget?.display_name ?? "")}
        loading={deactivate.isPending}
        onConfirm={onDeactivate}
        onClose={() => setConfirmTarget(null)}
      />
    </ConfigPageShell>
  );
}
