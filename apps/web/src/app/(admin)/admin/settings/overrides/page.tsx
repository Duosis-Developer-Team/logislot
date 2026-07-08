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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Input, Label, Select } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { ApiError } from "@/lib/api/client";
import { dockOverrides, docks } from "@/lib/api/resources";
import type { OverrideDto } from "@/lib/api/types";
import { useSession } from "@/lib/auth/session";

const formSchema = z
  .object({
    dock_id: z.string().min(1, "Rampa seçin"),
    date: z.string().min(1, "Tarih zorunlu"),
    type: z.enum(["closed", "extra_hours"]),
    start_time: z.string().optional(),
    end_time: z.string().optional(),
    reason: z.string().optional(),
  })
  .superRefine((values, ctx) => {
    if (values.type === "extra_hours") {
      if (!values.start_time)
        ctx.addIssue({ code: "custom", path: ["start_time"], message: "Zorunlu" });
      if (!values.end_time)
        ctx.addIssue({ code: "custom", path: ["end_time"], message: "Zorunlu" });
    }
    if (values.start_time && values.end_time && values.end_time <= values.start_time) {
      ctx.addIssue({
        code: "custom",
        path: ["end_time"],
        message: "Bitiş, başlangıçtan sonra olmalı",
      });
    }
  });

type FormValues = z.infer<typeof formSchema>;

export default function OverridesPage() {
  const { activeFacilityId } = useSession();
  const list = dockOverrides.useList(activeFacilityId);
  const dockList = docks.useList(activeFacilityId);
  const save = dockOverrides.useSave(activeFacilityId);
  const deactivate = dockOverrides.useDeactivate(activeFacilityId);
  const { flash, showFlash } = useFlash();

  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>("all");
  const [drawer, setDrawer] = useState<{ open: boolean; editing: OverrideDto | null }>({
    open: false,
    editing: null,
  });
  const [confirmTarget, setConfirmTarget] = useState<OverrideDto | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { type: "closed" },
  });
  const overrideType = form.watch("type");

  const dockName = (id: string) => dockList.data?.find((d) => d.id === id)?.name ?? "?";

  function openCreate() {
    form.reset({
      dock_id: "",
      date: new Date().toISOString().slice(0, 10),
      type: "closed",
      start_time: "",
      end_time: "",
      reason: "",
    });
    setFormError(null);
    setDrawer({ open: true, editing: null });
  }

  function openEdit(row: OverrideDto) {
    form.reset({
      dock_id: row.dock_id,
      date: row.date,
      type: row.type,
      start_time: row.start_time?.slice(0, 5) ?? "",
      end_time: row.end_time?.slice(0, 5) ?? "",
      reason: row.reason ?? "",
    });
    setFormError(null);
    setDrawer({ open: true, editing: row });
  }

  async function onSubmit(values: FormValues) {
    setFormError(null);
    const body = {
      dock_id: values.dock_id,
      date: values.date,
      type: values.type,
      start_time: values.start_time || null,
      end_time: values.end_time || null,
      reason: values.reason || null,
    };
    try {
      await save.mutateAsync({ id: drawer.editing?.id, body });
      showFlash("success", drawer.editing ? "İstisna güncellendi." : "İstisna oluşturuldu.");
      setDrawer({ open: false, editing: null });
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Kaydedilemedi");
    }
  }

  async function onDeactivate() {
    if (!confirmTarget) return;
    try {
      await deactivate.mutateAsync(confirmTarget.id);
      showFlash("success", "İstisna pasifleştirildi; normal takvim geçerli.");
    } catch (err) {
      showFlash("error", err instanceof ApiError ? err.message : "İşlem başarısız");
    } finally {
      setConfirmTarget(null);
    }
  }

  const rows = filterRows(
    list.data ?? [],
    search,
    activeFilter,
    (r) => `${dockName(r.dock_id)} ${r.date} ${r.reason ?? ""}`,
  );

  return (
    <ConfigPageShell
      title="Takvim İstisnaları"
      description="Kapalı gün müsaitlikte sert engel üretir; ek mesai o günün çalışma penceresinin yerine geçer ve normal saat dışına slot açabilir."
      createLabel="Yeni İstisna"
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
        <ErrorState message="İstisnalar yüklenemedi." onRetry={() => list.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState
          title="Takvim istisnası yok"
          description="Bakım için kapalı gün ya da bayram öncesi ek mesai tanımlayın; müsaitlik anında güncellenir."
          actionLabel="İlk istisnayı oluştur"
          onAction={openCreate}
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Tarih</TH>
              <TH>Rampa</TH>
              <TH>Tip</TH>
              <TH>Saat Aralığı</TH>
              <TH>Sebep</TH>
              <TH>Durum</TH>
              <TH className="text-right">İşlem</TH>
            </TR>
          </THead>
          <TBody>
            {rows.map((row) => (
              <TR key={row.id}>
                <TD className="whitespace-nowrap font-medium">
                  {new Date(row.date).toLocaleDateString("tr-TR", {
                    day: "2-digit",
                    month: "short",
                    weekday: "short",
                  })}
                </TD>
                <TD>{dockName(row.dock_id)}</TD>
                <TD>
                  {row.type === "closed" ? (
                    <Badge className="bg-status-rejected/15 text-status-rejected">
                      Kapalı
                    </Badge>
                  ) : (
                    <Badge className="bg-status-approved/15 text-status-approved">
                      Ek Mesai
                    </Badge>
                  )}
                </TD>
                <TD className="text-sm text-muted-foreground">
                  {row.start_time && row.end_time
                    ? `${row.start_time.slice(0, 5)}–${row.end_time.slice(0, 5)}`
                    : "Tüm gün"}
                </TD>
                <TD className="max-w-56 truncate text-sm text-muted-foreground">
                  {row.reason ?? "—"}
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
        title={drawer.editing ? "İstisnayı Düzenle" : "Yeni Takvim İstisnası"}
      >
        <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div>
            <Label>Rampa</Label>
            <Select {...form.register("dock_id")}>
              <option value="">— Rampa seçin —</option>
              {(dockList.data ?? [])
                .filter((d) => d.is_active)
                .map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
            </Select>
            {form.formState.errors.dock_id && (
              <p className="mt-1 text-xs text-destructive">
                {form.formState.errors.dock_id.message}
              </p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Tarih</Label>
              <Input type="date" {...form.register("date")} />
            </div>
            <div>
              <Label>Tip</Label>
              <Select {...form.register("type")}>
                <option value="closed">Kapalı (bakım, tatil…)</option>
                <option value="extra_hours">Ek Mesai</option>
              </Select>
            </div>
          </div>
          {overrideType === "extra_hours" ? (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Başlangıç</Label>
                <Input type="time" {...form.register("start_time")} />
                {form.formState.errors.start_time && (
                  <p className="mt-1 text-xs text-destructive">
                    {form.formState.errors.start_time.message}
                  </p>
                )}
              </div>
              <div>
                <Label>Bitiş</Label>
                <Input type="time" {...form.register("end_time")} />
                {form.formState.errors.end_time && (
                  <p className="mt-1 text-xs text-destructive">
                    {form.formState.errors.end_time.message}
                  </p>
                )}
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Kapalı istisna tüm günü randevuya kapatır.
            </p>
          )}
          <div>
            <Label>Sebep</Label>
            <Input {...form.register("reason")} placeholder="Örn. Planlı bakım" />
          </div>
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
        title="İstisnayı pasifleştir"
        message="Bu istisna pasifleştirilecek ve rampa o gün normal çalışma düzenine döner."
        loading={deactivate.isPending}
        onConfirm={onDeactivate}
        onClose={() => setConfirmTarget(null)}
      />
    </ConfigPageShell>
  );
}
