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
import { Input, Label, Select } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { ApiError } from "@/lib/api/client";
import { productCategories, vehicleCategories } from "@/lib/api/resources";
import type { ProductCategoryDto } from "@/lib/api/types";
import { useSession } from "@/lib/auth/session";

const formSchema = z.object({
  name: z.string().min(1, "Ad zorunlu"),
  display_name: z.string().min(1, "Görünen ad zorunlu"),
  description: z.string().optional(),
  min_block_minutes: z.coerce
    .number({ invalid_type_error: "Sayı girin" })
    .int()
    .positive("Pozitif olmalı"),
  default_vehicle_category_id: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

export default function CategoriesPage() {
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
      default_vehicle_category_id: values.default_vehicle_category_id || null,
      is_active: editActive,
    };
    try {
      await save.mutateAsync({ id: drawer.editing?.id, body });
      showFlash("success", drawer.editing ? "Kategori güncellendi." : "Kategori oluşturuldu.");
      setDrawer({ open: false, editing: null });
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Kaydedilemedi");
    }
  }

  async function onDeactivate() {
    if (!confirmTarget) return;
    try {
      await deactivate.mutateAsync(confirmTarget.id);
      showFlash("success", `"${confirmTarget.display_name}" pasifleştirildi.`);
    } catch (err) {
      showFlash("error", err instanceof ApiError ? err.message : "İşlem başarısız");
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
      title="Ürün Kategorileri"
      description="Minimum blokaj süresi ve varsayılan araç kategorisi randevu uygunluğunu doğrudan etkiler."
      createLabel="Yeni Kategori"
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
        <ErrorState message="Kategoriler yüklenemedi." onRetry={() => list.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState
          title="Kategori bulunamadı"
          description="Tedarikçiler yalnızca burada tanımlı ve kendilerine izinli kategorilerden randevu talep edebilir."
          actionLabel="İlk kategoriyi oluştur"
          onAction={openCreate}
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Ad</TH>
              <TH>Görünen Ad</TH>
              <TH>Min. Blokaj</TH>
              <TH>Varsayılan Araç</TH>
              <TH>Durum</TH>
              <TH className="text-right">İşlem</TH>
            </TR>
          </THead>
          <TBody>
            {rows.map((row) => (
              <TR key={row.id}>
                <TD className="font-medium">{row.name}</TD>
                <TD>{row.display_name}</TD>
                <TD>{row.min_block_minutes} dk</TD>
                <TD>{vehicleName(row.default_vehicle_category_id)}</TD>
                <TD>
                  <ActiveBadge active={row.is_active} />
                </TD>
                <TD className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button size="sm" variant="secondary" onClick={() => openEdit(row)}>
                      Düzenle
                    </Button>
                    {row.is_active && (
                      <Button size="sm" variant="ghost" onClick={() => setConfirmTarget(row)}>
                        Pasifleştir
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
        title={drawer.editing ? "Kategoriyi Düzenle" : "Yeni Ürün Kategorisi"}
        description="Bu ayarlar rule engine tarafından randevu oluşturma anında uygulanır."
      >
        <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div>
            <Label>Ad</Label>
            <Input {...form.register("name")} placeholder="Örn. Soğuk Zincir" />
            {form.formState.errors.name && (
              <p className="mt-1 text-xs text-destructive">
                {form.formState.errors.name.message}
              </p>
            )}
          </div>
          <div>
            <Label>Tedarikçiye Görünen Ad</Label>
            <Input {...form.register("display_name")} />
            {form.formState.errors.display_name && (
              <p className="mt-1 text-xs text-destructive">
                {form.formState.errors.display_name.message}
              </p>
            )}
          </div>
          <div>
            <Label>Açıklama</Label>
            <Input {...form.register("description")} placeholder="Opsiyonel" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Min. Blokaj Süresi (dk)</Label>
              <Input type="number" min={1} {...form.register("min_block_minutes")} />
              {form.formState.errors.min_block_minutes && (
                <p className="mt-1 text-xs text-destructive">
                  {form.formState.errors.min_block_minutes.message}
                </p>
              )}
              <p className="mt-1 text-xs text-muted-foreground">
                Kalite kontrol gibi ek süreler bu minimuma dahildir.
              </p>
            </div>
            <div>
              <Label>Varsayılan Araç Kategorisi</Label>
              <Select {...form.register("default_vehicle_category_id")}>
                <option value="">— Seçilmedi —</option>
                {(vehicles.data ?? [])
                  .filter((v) => v.is_active)
                  .map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.display_name}
                    </option>
                  ))}
              </Select>
              <p className="mt-1 text-xs text-muted-foreground">
                Sihirbazda araç adımı bu değerle önceden doldurulur.
              </p>
            </div>
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
              İptal
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? "Kaydediliyor…" : "Kaydet"}
            </Button>
          </div>
        </form>
      </Drawer>

      <ConfirmDialog
        open={confirmTarget !== null}
        title="Kategoriyi pasifleştir"
        message={`"${confirmTarget?.display_name}" pasifleştirilecek. Geçmiş randevular etkilenmez; tedarikçiler yeni randevuda bu kategoriyi seçemez.`}
        loading={deactivate.isPending}
        onConfirm={onDeactivate}
        onClose={() => setConfirmTarget(null)}
      />
    </ConfigPageShell>
  );
}
