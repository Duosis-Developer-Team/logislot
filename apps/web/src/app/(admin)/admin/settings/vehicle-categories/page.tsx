"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
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
import { Input, Label } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { ApiError } from "@/lib/api/client";
import { vehicleCategories } from "@/lib/api/resources";
import type { VehicleCategoryDto } from "@/lib/api/types";
import { useSession } from "@/lib/auth/session";
import { useApiErrorMessage } from "@/lib/i18n/api-error";
import type { Dictionary } from "@/lib/i18n/dictionaries/tr";
import { useT } from "@/lib/i18n/provider";

const formSchema = z.object({
  name: z.string().min(1, "nameRequired"),
  display_name: z.string().min(1, "displayNameRequired"),
  description: z.string().optional(),
  physical_note: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;


/** Zod semasi modul seviyesinde tanimlanir ve hook cagiramaz; mesaj olarak
 *  ANAHTAR uretilir ve ekranda sozlukten cevrilir. */
function fieldError(t: Dictionary, message: string | undefined): string | undefined {
  if (!message) return undefined;
  return (t.admin.config.messages as Record<string, string>)[message] ?? message;
}

export default function VehicleCategoriesPage() {
  const t = useT();
  const errorMessage = useApiErrorMessage();
  const { activeFacilityId } = useSession();
  const list = vehicleCategories.useList(activeFacilityId);
  const save = vehicleCategories.useSave(activeFacilityId);
  const deactivate = vehicleCategories.useDeactivate(activeFacilityId);
  const { flash, showFlash } = useFlash();

  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>("all");
  const [drawer, setDrawer] = useState<{ open: boolean; editing: VehicleCategoryDto | null }>({
    open: false,
    editing: null,
  });
  const [editActive, setEditActive] = useState(true);
  const [confirmTarget, setConfirmTarget] = useState<VehicleCategoryDto | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm<FormValues>({ resolver: zodResolver(formSchema) });

  function openCreate() {
    form.reset({ name: "", display_name: "", description: "", physical_note: "" });
    setEditActive(true);
    setFormError(null);
    setDrawer({ open: true, editing: null });
  }

  function openEdit(row: VehicleCategoryDto) {
    form.reset({
      name: row.name,
      display_name: row.display_name,
      description: row.description ?? "",
      physical_note: row.physical_note ?? "",
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
      physical_note: values.physical_note || null,
      is_active: editActive,
    };
    try {
      await save.mutateAsync({ id: drawer.editing?.id, body });
      showFlash(
        "success",
        drawer.editing
          ? t.admin.vehicleCategories.updated
          : t.admin.vehicleCategories.created,
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

  const rows = filterRows(
    list.data ?? [],
    search,
    activeFilter,
    (r) => `${r.name} ${r.display_name}`,
  );

  return (
    <ConfigPageShell
      title={t.admin.vehicleCategories.title}
      description={t.admin.vehicleCategories.pageDescription}
      createLabel={t.admin.vehicleCategories.create}
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
        <ErrorState message={t.admin.vehicleCategories.loadError} onRetry={() => list.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState
          title={t.admin.vehicleCategories.emptyTitle}
          description={t.admin.vehicleCategories.emptyDescription}
          actionLabel={t.admin.vehicleCategories.emptyAction}
          onAction={openCreate}
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>{t.admin.vehicleCategories.name}</TH>
              <TH>{t.admin.config.displayName}</TH>
              <TH>{t.admin.vehicleCategories.physicalNote}</TH>
              <TH>{t.admin.vehicleCategories.status}</TH>
              <TH className="text-right">{t.common.actions}</TH>
            </TR>
          </THead>
          <TBody>
            {rows.map((row) => (
              <TR key={row.id}>
                <TD className="font-medium">{row.name}</TD>
                <TD>{row.display_name}</TD>
                <TD className="max-w-64 truncate text-muted-foreground">
                  {row.physical_note ?? "—"}
                </TD>
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
        title={
          drawer.editing ? t.admin.vehicleCategories.editTitle : t.admin.vehicleCategories.create
        }
      >
        <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div>
            <Label>Ad</Label>
            <Input {...form.register("name")} placeholder={t.admin.vehicleCategories.namePlaceholder} />
            {form.formState.errors.name && (
              <p className="mt-1 text-xs text-destructive">
                {fieldError(t, form.formState.errors.name.message)}
              </p>
            )}
          </div>
          <div>
            <Label>{t.admin.config.displayName}</Label>
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
          <div>
            <Label>{t.admin.vehicleCategories.physicalNote}</Label>
            <Input
              {...form.register("physical_note")}
              placeholder={t.admin.vehicleCategories.descriptionPlaceholder}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              {t.admin.vehicleCategories.descriptionHint}
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
        title={t.admin.vehicleCategories.deactivateTitle}
        message={t.admin.vehicleCategories.deactivateMessage(confirmTarget?.display_name ?? "")}
        loading={deactivate.isPending}
        onConfirm={onDeactivate}
        onClose={() => setConfirmTarget(null)}
      />
    </ConfigPageShell>
  );
}
