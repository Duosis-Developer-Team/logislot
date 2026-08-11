"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { MultiSelectField } from "@/components/config/multi-select";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Input, Label, Select } from "@/components/ui/input";
import { TimeSelect } from "@/components/ui/time-select";
import { ApiError } from "@/lib/api/client";
import { dockOverrides, docks } from "@/lib/api/resources";
import type { OverrideDto, OverrideType } from "@/lib/api/types";
import { useSession } from "@/lib/auth/session";

/**
 * Takvim istisnasi formu — Ayarlar > Takvim Istisnalari ve Takvim sekmesinin
 * ortak kabi. Olusturmada COKLU rampa secilebilir (tek istek, N kayit);
 * duzenlemede rampa sabittir (PATCH dock_id kabul etmez).
 */

export interface OverrideDrawerInitial {
  /** "YYYY-MM-DD" — takvimden acilista goruntulenen gun. */
  date?: string;
  /** On-secili rampalar (ornegin satirdan hizli kapatma). */
  dockIds?: string[];
  type?: OverrideType;
}

interface OverrideDrawerProps {
  open: boolean;
  /** Dolu ise duzenleme modu; null ise olusturma modu. */
  editing?: OverrideDto | null;
  initial?: OverrideDrawerInitial | null;
  onClose: () => void;
  onSaved: (message: string) => void;
}

function todayISO(): string {
  return new Date().toLocaleDateString("sv-SE");
}

export function OverrideDrawer({
  open,
  editing = null,
  initial = null,
  onClose,
  onSaved,
}: OverrideDrawerProps) {
  // Form state'i acilis parametrelerinden turer; effect ile senkronlamak yerine
  // key degisince govde yeniden mount edilir (temiz sifirlama).
  const formKey = [
    editing?.id ?? "new",
    initial?.date ?? "",
    (initial?.dockIds ?? []).join(","),
    initial?.type ?? "",
  ].join("|");

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={editing ? "İstisnayı Düzenle" : "Yeni Takvim İstisnası"}
      description="Kapalı gün müsaitlikte sert engel üretir; ek mesai o günün çalışma penceresinin yerine geçer."
    >
      <OverrideForm
        key={formKey}
        editing={editing}
        initial={initial}
        onClose={onClose}
        onSaved={onSaved}
      />
    </Drawer>
  );
}

function OverrideForm({
  editing,
  initial,
  onClose,
  onSaved,
}: Omit<OverrideDrawerProps, "open">) {
  const { activeFacilityId } = useSession();
  const queryClient = useQueryClient();
  const dockList = docks.useList(activeFacilityId);
  const overrideList = dockOverrides.useList(activeFacilityId);
  const save = dockOverrides.useSave(activeFacilityId);

  const [dockIds, setDockIds] = useState<string[]>(
    editing ? [editing.dock_id] : (initial?.dockIds ?? []),
  );
  const [date, setDate] = useState(editing?.date ?? initial?.date ?? todayISO());
  const [type, setType] = useState<OverrideType>(editing?.type ?? initial?.type ?? "closed");
  const [startTime, setStartTime] = useState(editing?.start_time?.slice(0, 5) ?? "");
  const [endTime, setEndTime] = useState(editing?.end_time?.slice(0, 5) ?? "");
  const [reason, setReason] = useState(editing?.reason ?? "");
  const [formError, setFormError] = useState<string | null>(null);

  const dockName = (id: string) => dockList.data?.find((d) => d.id === id)?.name ?? "?";

  // Ayni rampa+gun icin ikinci aktif istisna API'de reddedilir; secenekten dusur.
  const takenDockIds = new Set(
    (overrideList.data ?? [])
      .filter((o) => o.is_active && o.date === date && o.id !== editing?.id)
      .map((o) => o.dock_id),
  );
  const activeDocks = (dockList.data ?? []).filter((d) => d.is_active);
  const options = activeDocks
    .filter((d) => !takenDockIds.has(d.id))
    .map((d) => ({ value: d.id, label: d.name }));
  const takenNames = activeDocks.filter((d) => takenDockIds.has(d.id)).map((d) => d.name);
  // Tarih degisince artik secilemeyen rampalar secimden duser.
  const selected = dockIds.filter((id) => !takenDockIds.has(id));

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);
    if (!editing && selected.length === 0) {
      setFormError("En az bir rampa seçin.");
      return;
    }
    if (type === "extra_hours") {
      if (!startTime || !endTime) {
        setFormError("Ek mesai için başlangıç ve bitiş saati zorunludur.");
        return;
      }
      if (endTime <= startTime) {
        setFormError("Bitiş, başlangıçtan sonra olmalı.");
        return;
      }
    }
    const shared = {
      date,
      type,
      start_time: startTime || null,
      end_time: endTime || null,
      reason: reason || null,
    };
    try {
      await save.mutateAsync({
        id: editing?.id,
        body: editing ? shared : { ...shared, dock_ids: selected },
      });
      // Takvim gorunumu ayri sorgu agacinda; kapali bantlar aninda tazelensin.
      await queryClient.invalidateQueries({ queryKey: ["calendar"] });
      onSaved(
        editing
          ? "İstisna güncellendi."
          : selected.length > 1
            ? `${selected.length} rampa için istisna oluşturuldu.`
            : "İstisna oluşturuldu.",
      );
      onClose();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Kaydedilemedi");
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div>
        <Label>{editing ? "Rampa" : "Rampalar (çoklu seçim)"}</Label>
        {editing ? (
          <p className="rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm">
            {dockName(editing.dock_id)}
            <span className="ml-2 text-xs text-muted-foreground">
              (rampa değiştirilemez; yeni istisna oluşturun)
            </span>
          </p>
        ) : (
          <>
            {/* Toplu sec/temizle artik MultiSelectField basliginda; ayri buton
                kaldirildi (ayni islev icin iki kontrol olmasin). */}
            <MultiSelectField
              options={options}
              value={selected}
              onChange={setDockIds}
              searchPlaceholder="Rampa ara…"
              emptyHint="İstisnanın uygulanacağı rampaları seçin."
            />
            {takenNames.length > 0 && (
              <p className="mt-2 text-xs text-muted-foreground">
                Bu tarihte zaten istisnası olan rampalar listede yok: {takenNames.join(", ")}.
              </p>
            )}
          </>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Tarih</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div>
          <Label>Tip</Label>
          <Select value={type} onChange={(e) => setType(e.target.value as OverrideType)}>
            <option value="closed">Kapalı (bakım, tatil…)</option>
            <option value="extra_hours">Ek Mesai</option>
          </Select>
        </div>
      </div>

      {type === "extra_hours" ? (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Başlangıç</Label>
            <TimeSelect ariaLabel="Başlangıç" value={startTime} onChange={setStartTime} />
          </div>
          <div>
            <Label>Bitiş</Label>
            <TimeSelect ariaLabel="Bitiş" value={endTime} onChange={setEndTime} />
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Kapalı istisna, seçilen rampaların o gününü tamamen randevuya kapatır.
        </p>
      )}

      <div>
        <Label>Sebep</Label>
        <Input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Örn. Planlı bakım"
        />
      </div>

      {formError && <p className="text-sm text-destructive">{formError}</p>}

      <div className="mt-2 flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onClose}>
          İptal
        </Button>
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? "Kaydediliyor…" : "Kaydet"}
        </Button>
      </div>
    </form>
  );
}
