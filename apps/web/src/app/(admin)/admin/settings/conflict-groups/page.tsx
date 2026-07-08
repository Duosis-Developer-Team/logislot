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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Input, Label, Select } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { ApiError } from "@/lib/api/client";
import { conflictGroups, docks, vehicleCategories } from "@/lib/api/resources";
import type { ConflictGroupDto, ConflictRelationType } from "@/lib/api/types";
import { useSession } from "@/lib/auth/session";

const TYPE_LABELS: Record<ConflictRelationType, string> = {
  mutual_block: "Karşılıklı Bloke",
  shared_capacity: "Paylaşımlı Kapasite",
  conditional: "Koşullu",
};

const TYPE_HELP: Record<ConflictRelationType, string> = {
  mutual_block: "Üye rampalardan biri doluyken diğerleri de bloke olur.",
  shared_capacity:
    "Rampalar tek fiziksel kapasiteyi paylaşır. (İlk sürümde karşılıklı bloke gibi davranır.)",
  conditional: "Yalnızca seçtiğiniz araç kategorileri geldiğinde grup devreye girer.",
};

const formSchema = z.object({
  name: z.string().min(1, "Ad zorunlu"),
  relation_type: z.enum(["mutual_block", "shared_capacity", "conditional"]),
});

type FormValues = z.infer<typeof formSchema>;

export default function ConflictGroupsPage() {
  const { activeFacilityId } = useSession();
  const list = conflictGroups.useList(activeFacilityId);
  const dockList = docks.useList(activeFacilityId);
  const vehicles = vehicleCategories.useList(activeFacilityId);
  const save = conflictGroups.useSave(activeFacilityId);
  const deactivate = conflictGroups.useDeactivate(activeFacilityId);
  const { flash, showFlash } = useFlash();

  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>("all");
  const [drawer, setDrawer] = useState<{ open: boolean; editing: ConflictGroupDto | null }>({
    open: false,
    editing: null,
  });
  const [confirmTarget, setConfirmTarget] = useState<ConflictGroupDto | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [triggerVehicleIds, setTriggerVehicleIds] = useState<string[]>([]);
  const [editActive, setEditActive] = useState(true);
  const [showJson, setShowJson] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { relation_type: "mutual_block" },
  });
  const relationType = form.watch("relation_type");

  const dockName = (id: string) => dockList.data?.find((d) => d.id === id)?.name ?? "?";
  const vehicleName = (id: string) =>
    vehicles.data?.find((v) => v.id === id)?.display_name ?? "?";

  function triggerSummary(group: ConflictGroupDto): string {
    const ids = group.trigger_condition_json?.vehicle_category_ids ?? [];
    if (group.relation_type !== "conditional" || ids.length === 0) return "Her zaman";
    return `${ids.map(vehicleName).join(" veya ")} geldiğinde`;
  }

  function openCreate() {
    form.reset({ name: "", relation_type: "mutual_block" });
    setMemberIds([]);
    setTriggerVehicleIds([]);
    setEditActive(true);
    setFormError(null);
    setDrawer({ open: true, editing: null });
  }

  function openEdit(row: ConflictGroupDto) {
    form.reset({ name: row.name, relation_type: row.relation_type });
    setMemberIds(row.member_dock_ids);
    setTriggerVehicleIds(row.trigger_condition_json?.vehicle_category_ids ?? []);
    setEditActive(row.is_active);
    setFormError(null);
    setDrawer({ open: true, editing: row });
  }

  async function onSubmit(values: FormValues) {
    setFormError(null);
    if (memberIds.length < 2) {
      setFormError("Çakışma grubu en az 2 rampa içermeli.");
      return;
    }
    if (values.relation_type === "conditional" && triggerVehicleIds.length === 0) {
      setFormError("Koşullu grup için en az bir tetikleyici araç kategorisi seçin.");
      return;
    }
    const body = {
      name: values.name,
      relation_type: values.relation_type,
      member_dock_ids: memberIds,
      trigger_condition_json:
        values.relation_type === "conditional"
          ? { vehicle_category_ids: triggerVehicleIds }
          : null,
      is_active: editActive,
    };
    try {
      await save.mutateAsync({ id: drawer.editing?.id, body });
      showFlash("success", drawer.editing ? "Grup güncellendi." : "Grup oluşturuldu.");
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

  const rows = filterRows(list.data ?? [], search, activeFilter, (r) => r.name);

  return (
    <ConfigPageShell
      title="Rampa Çakışma Grupları"
      description="Fiziksel rampa ilişkileri koda değil konfigürasyona yazılır. Aktif gruplar müsaitlik hesabında kardeş rampaları da kontrol eder."
      createLabel="Yeni Grup"
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
        <ErrorState message="Gruplar yüklenemedi." onRetry={() => list.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState
          title="Çakışma grubu yok"
          description='Örnek: "Rampa 1-2 bitişik; TIR yanaştığında ikisi birden bloke olur" senaryosu burada bir koşullu grupla tanımlanır.'
          actionLabel="İlk grubu oluştur"
          onAction={openCreate}
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Grup</TH>
              <TH>Tip</TH>
              <TH>Üye Rampalar</TH>
              <TH>Tetik Koşulu</TH>
              <TH>Durum</TH>
              <TH className="text-right">İşlem</TH>
            </TR>
          </THead>
          <TBody>
            {rows.map((row) => (
              <TR key={row.id}>
                <TD className="font-medium">{row.name}</TD>
                <TD>
                  <Badge className="bg-primary/10 text-primary">
                    {TYPE_LABELS[row.relation_type]}
                  </Badge>
                </TD>
                <TD>
                  <div className="flex flex-wrap gap-1">
                    {row.member_dock_ids.map((id) => (
                      <Badge key={id} className="bg-muted text-muted-foreground">
                        {dockName(id)}
                      </Badge>
                    ))}
                  </div>
                </TD>
                <TD className="text-sm text-muted-foreground">{triggerSummary(row)}</TD>
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
        title={drawer.editing ? "Grubu Düzenle" : "Yeni Çakışma Grubu"}
        description="Bu ayar randevu uygunluğunu etkiler: grup üyesi rampalardan biri dolunca diğerleri de değerlendirilir."
      >
        <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-5">
          <div>
            <Label>Grup Adı</Label>
            <Input {...form.register("name")} placeholder='Örn. "Rampa 1-2 Bitişik Blok"' />
            {form.formState.errors.name && (
              <p className="mt-1 text-xs text-destructive">
                {form.formState.errors.name.message}
              </p>
            )}
          </div>

          <div>
            <Label>İlişki Tipi</Label>
            <Select {...form.register("relation_type")}>
              {(Object.keys(TYPE_LABELS) as ConflictRelationType[]).map((t) => (
                <option key={t} value={t}>
                  {TYPE_LABELS[t]}
                </option>
              ))}
            </Select>
            <p className="mt-1 text-xs text-muted-foreground">{TYPE_HELP[relationType]}</p>
          </div>

          <div>
            <Label>Üye Rampalar (en az 2)</Label>
            <MultiSelectChips
              options={(dockList.data ?? [])
                .filter((d) => d.is_active)
                .map((d) => ({ value: d.id, label: d.name }))}
              value={memberIds}
              onChange={setMemberIds}
            />
          </div>

          {relationType === "conditional" && (
            <div>
              <Label>Tetikleyici Araç Kategorileri</Label>
              <MultiSelectChips
                options={(vehicles.data ?? [])
                  .filter((v) => v.is_active)
                  .map((v) => ({ value: v.id, label: v.display_name }))}
                value={triggerVehicleIds}
                onChange={setTriggerVehicleIds}
              />
              {triggerVehicleIds.length > 0 && (
                <p className="mt-2 rounded-md bg-primary/5 px-3 py-2 text-xs text-primary">
                  {triggerVehicleIds.map(vehicleName).join(" veya ")} geldiğinde bu grup
                  devreye girer; diğer araçlarda rampalar bağımsız çalışır.
                </p>
              )}
            </div>
          )}

          <Switch checked={editActive} onChange={setEditActive} label="Aktif" />

          <div>
            <button
              type="button"
              onClick={() => setShowJson(!showJson)}
              className="text-xs text-muted-foreground underline"
            >
              {showJson ? "Teknik görünümü gizle" : "Teknik görünüm (JSON)"}
            </button>
            {showJson && (
              <pre className="mt-2 overflow-x-auto rounded-lg bg-muted p-3 text-xs">
                {JSON.stringify(
                  {
                    relation_type: relationType,
                    member_dock_ids: memberIds,
                    trigger_condition_json:
                      relationType === "conditional"
                        ? { vehicle_category_ids: triggerVehicleIds }
                        : null,
                  },
                  null,
                  2,
                )}
              </pre>
            )}
          </div>

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
        title="Grubu pasifleştir"
        message={`"${confirmTarget?.name}" pasifleştirilecek. Grup, müsaitlik hesabında artık dikkate alınmaz.`}
        loading={deactivate.isPending}
        onConfirm={onDeactivate}
        onClose={() => setConfirmTarget(null)}
      />
    </ConfigPageShell>
  );
}
