"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { ConfirmDialog } from "@/components/config/confirm-dialog";
import { MultiSelectChips } from "@/components/config/multi-select";
import {
  ConfigPageShell,
  filterRows,
  useFlash,
  type ActiveFilter,
} from "@/components/config/page-shell";
import { ActiveBadge, EmptyState, ErrorState, LoadingState } from "@/components/config/states";
import {
  DEFAULT_WORKING_HOURS,
  summarizeWorkingHours,
  WorkingHoursEditor,
} from "@/components/config/working-hours-editor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Input, Label } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { ApiError } from "@/lib/api/client";
import {
  conflictGroups,
  docks,
  productCategories,
  vehicleCategories,
} from "@/lib/api/resources";
import type { DockDto, WorkingHours } from "@/lib/api/types";
import { useSession } from "@/lib/auth/session";

const formSchema = z.object({
  name: z.string().min(1, "Ad zorunlu"),
  note: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

export default function DocksPage() {
  const { activeFacilityId } = useSession();
  const list = docks.useList(activeFacilityId);
  const categories = productCategories.useList(activeFacilityId);
  const vehicles = vehicleCategories.useList(activeFacilityId);
  const groups = conflictGroups.useList(activeFacilityId);
  const save = docks.useSave(activeFacilityId);
  const deactivate = docks.useDeactivate(activeFacilityId);
  const { flash, showFlash } = useFlash();

  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>("all");
  const [drawer, setDrawer] = useState<{ open: boolean; editing: DockDto | null }>({
    open: false,
    editing: null,
  });
  const [confirmTarget, setConfirmTarget] = useState<DockDto | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // Form disi kontrollu alanlar
  const [editActive, setEditActive] = useState(true);
  const [acceptedProducts, setAcceptedProducts] = useState<string[]>([]);
  const [acceptedVehicles, setAcceptedVehicles] = useState<string[]>([]);
  const [customHours, setCustomHours] = useState(false);
  const [hours, setHours] = useState<WorkingHours>(DEFAULT_WORKING_HOURS);

  const form = useForm<FormValues>({ resolver: zodResolver(formSchema) });

  function openCreate() {
    form.reset({ name: "", note: "" });
    setEditActive(true);
    setAcceptedProducts([]);
    setAcceptedVehicles([]);
    setCustomHours(false);
    setHours(DEFAULT_WORKING_HOURS);
    setFormError(null);
    setDrawer({ open: true, editing: null });
  }

  function openEdit(row: DockDto) {
    form.reset({ name: row.name, note: row.note ?? "" });
    setEditActive(row.is_active);
    setAcceptedProducts(row.accepted_product_category_ids);
    setAcceptedVehicles(row.accepted_vehicle_category_ids);
    setCustomHours(row.working_hours_json !== null);
    setHours(row.working_hours_json ?? DEFAULT_WORKING_HOURS);
    setFormError(null);
    setDrawer({ open: true, editing: row });
  }

  async function onSubmit(values: FormValues) {
    setFormError(null);
    const body = {
      name: values.name,
      note: values.note || null,
      is_active: editActive,
      working_hours_json: customHours ? hours : null,
      accepted_product_category_ids: acceptedProducts,
      accepted_vehicle_category_ids: acceptedVehicles,
    };
    try {
      await save.mutateAsync({ id: drawer.editing?.id, body });
      showFlash("success", drawer.editing ? "Rampa güncellendi." : "Rampa oluşturuldu.");
      setDrawer({ open: false, editing: null });
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Kaydedilemedi");
    }
  }

  async function onDeactivate() {
    if (!confirmTarget) return;
    try {
      await deactivate.mutateAsync(confirmTarget.id);
      showFlash("success", `"${confirmTarget.name}" pasifleştirildi.`);
    } catch (err) {
      showFlash("error", err instanceof ApiError ? err.message : "İşlem başarısız");
    } finally {
      setConfirmTarget(null);
    }
  }

  const categoryName = (id: string) =>
    categories.data?.find((c) => c.id === id)?.display_name ?? "?";
  const vehicleName = (id: string) =>
    vehicles.data?.find((v) => v.id === id)?.display_name ?? "?";
  const groupsOf = (dockId: string) =>
    (groups.data ?? []).filter((g) => g.member_dock_ids.includes(dockId));

  const rows = filterRows(
    list.data ?? [],
    search,
    activeFilter,
    (r) => `${r.name} ${r.note ?? ""}`,
  );

  return (
    <ConfigPageShell
      title="Rampalar"
      description="Kabul edilen ürün/araç kategorileri, çalışma saatleri ve çakışma grubu üyelikleri müsaitlik hesabını doğrudan belirler."
      createLabel="Yeni Rampa"
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
        <ErrorState message="Rampalar yüklenemedi." onRetry={() => list.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState
          title="Rampa yok"
          description="Tedarikçi manuel rampa seçmez; sistem uygun rampayı burada tanımladığınız kısıtlara göre atar."
          actionLabel="İlk rampayı oluştur"
          onAction={openCreate}
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Rampa</TH>
              <TH>Ürün Kategorileri</TH>
              <TH>Araç Kategorileri</TH>
              <TH>Çalışma Saatleri</TH>
              <TH>Çakışma Grubu</TH>
              <TH>Durum</TH>
              <TH className="text-right">İşlem</TH>
            </TR>
          </THead>
          <TBody>
            {rows.map((row) => (
              <TR key={row.id}>
                <TD>
                  <div className="font-medium">{row.name}</div>
                  {row.note && (
                    <div className="text-xs text-muted-foreground">{row.note}</div>
                  )}
                </TD>
                <TD>
                  <div className="flex max-w-56 flex-wrap gap-1">
                    {row.accepted_product_category_ids.length === 0 ? (
                      <Badge className="bg-muted text-muted-foreground">Tümü</Badge>
                    ) : (
                      row.accepted_product_category_ids.map((id) => (
                        <Badge key={id} className="bg-primary/10 text-primary">
                          {categoryName(id)}
                        </Badge>
                      ))
                    )}
                  </div>
                </TD>
                <TD>
                  <div className="flex max-w-56 flex-wrap gap-1">
                    {row.accepted_vehicle_category_ids.length === 0 ? (
                      <Badge className="bg-muted text-muted-foreground">Tüm araçlar</Badge>
                    ) : (
                      row.accepted_vehicle_category_ids.map((id) => (
                        <Badge key={id} className="bg-accent/15 text-accent-foreground">
                          {vehicleName(id)}
                        </Badge>
                      ))
                    )}
                  </div>
                </TD>
                <TD className="whitespace-nowrap text-sm text-muted-foreground">
                  {summarizeWorkingHours(row.working_hours_json)}
                </TD>
                <TD>
                  {groupsOf(row.id).length === 0 ? (
                    <span className="text-xs text-muted-foreground">—</span>
                  ) : (
                    groupsOf(row.id).map((g) => (
                      <Badge key={g.id} className="bg-cargo/10 text-cargo">
                        {g.name}
                      </Badge>
                    ))
                  )}
                </TD>
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
        title={drawer.editing ? "Rampayı Düzenle" : "Yeni Rampa"}
        description="Bu ayarlar randevu uygunluğunu ve akıllı rampa atamasını etkiler."
      >
        <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-5">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Ad</Label>
              <Input {...form.register("name")} placeholder="Örn. Rampa 4" />
              {form.formState.errors.name && (
                <p className="mt-1 text-xs text-destructive">
                  {form.formState.errors.name.message}
                </p>
              )}
            </div>
            <div>
              <Label>Not</Label>
              <Input {...form.register("note")} placeholder="Örn. TIR uyumlu" />
            </div>
          </div>

          <div>
            <Label>Kabul Edilen Ürün Kategorileri</Label>
            <MultiSelectChips
              options={(categories.data ?? [])
                .filter((c) => c.is_active)
                .map((c) => ({ value: c.id, label: c.display_name }))}
              value={acceptedProducts}
              onChange={setAcceptedProducts}
              emptyHint="Boş bırakılırsa tüm ürün kategorileri kabul edilir."
            />
          </div>

          <div>
            <Label>Kabul Edilen Araç Kategorileri</Label>
            <MultiSelectChips
              options={(vehicles.data ?? [])
                .filter((v) => v.is_active)
                .map((v) => ({ value: v.id, label: v.display_name }))}
              value={acceptedVehicles}
              onChange={setAcceptedVehicles}
              emptyHint="Boş bırakılırsa tüm araç tipleri kabul edilir (geriye uyumluluk kuralı)."
            />
          </div>

          <div className="flex flex-col gap-2">
            <Switch
              checked={customHours}
              onChange={setCustomHours}
              label="Özel çalışma saatleri tanımla"
            />
            {customHours ? (
              <WorkingHoursEditor value={hours} onChange={setHours} />
            ) : (
              <p className="text-xs text-muted-foreground">
                Varsayılan çalışma profili uygulanır.
              </p>
            )}
          </div>

          <Switch checked={editActive} onChange={setEditActive} label="Aktif" />
          <p className="text-xs text-muted-foreground">
            Pasif rampa müsaitlik ve akıllı atamada aday olmaz; geçmiş randevular korunur.
          </p>

          {formError && <p className="text-sm text-destructive">{formError}</p>}
          <div className="flex justify-end gap-2">
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
        title="Rampayı pasifleştir"
        message={`"${confirmTarget?.name}" pasifleştirilecek. Yeni randevularda aday olmaz; mevcut randevu geçmişi bozulmaz.`}
        loading={deactivate.isPending}
        onConfirm={onDeactivate}
        onClose={() => setConfirmTarget(null)}
      />
    </ConfigPageShell>
  );
}
