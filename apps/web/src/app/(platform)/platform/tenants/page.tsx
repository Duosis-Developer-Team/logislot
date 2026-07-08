"use client";

import { useState } from "react";
import { useFlash } from "@/components/config/page-shell";
import { ErrorState, LoadingState } from "@/components/config/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Input, Label, Select } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { ApiError } from "@/lib/api/client";
import {
  usePlatformPlans,
  usePlatformTenants,
  useTenantMutations,
  type PlatformTenantDto,
} from "@/lib/api/platform";
import { cn } from "@/lib/utils";

const STATUS_BADGE: Record<string, string> = {
  trial: "bg-status-pending/15 text-status-pending",
  active: "bg-status-approved/15 text-status-approved",
  suspended: "bg-status-rejected/15 text-status-rejected",
  archived: "bg-status-cancelled/15 text-status-cancelled",
};

const STATUS_LABELS: Record<string, string> = {
  trial: "Deneme",
  active: "Aktif",
  suspended: "Askıda",
  archived: "Arşiv",
};

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[çÇ]/g, "c")
    .replace(/[ğĞ]/g, "g")
    .replace(/[ıİi]/g, "i")
    .replace(/[öÖ]/g, "o")
    .replace(/[şŞ]/g, "s")
    .replace(/[üÜ]/g, "u")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
}

interface FormState {
  commercial_name: string;
  display_name: string;
  slug: string;
  status: string;
  primary_contact_name: string;
  primary_contact_email: string;
  default_timezone: string;
}

const EMPTY_FORM: FormState = {
  commercial_name: "",
  display_name: "",
  slug: "",
  status: "trial",
  primary_contact_name: "",
  primary_contact_email: "",
  default_timezone: "Europe/Istanbul",
};

export default function TenantsPage() {
  const tenants = usePlatformTenants();
  const plans = usePlatformPlans();
  const { save } = useTenantMutations();
  const { flash, showFlash } = useFlash();

  const [drawer, setDrawer] = useState<{ open: boolean; editing: PlatformTenantDto | null }>({
    open: false,
    editing: null,
  });
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [slugTouched, setSlugTouched] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const planName = (id: string | null) =>
    plans.data?.find((p) => p.id === id)?.name ?? "—";

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function openCreate() {
    setForm(EMPTY_FORM);
    setSlugTouched(false);
    setFormError(null);
    setDrawer({ open: true, editing: null });
  }

  function openEdit(row: PlatformTenantDto) {
    setForm({
      commercial_name: row.commercial_name,
      display_name: row.display_name,
      slug: row.slug,
      status: row.status,
      primary_contact_name: row.primary_contact_name ?? "",
      primary_contact_email: row.primary_contact_email ?? "",
      default_timezone: row.default_timezone,
    });
    setSlugTouched(true);
    setFormError(null);
    setDrawer({ open: true, editing: row });
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!form.display_name.trim() || (!drawer.editing && !form.slug.trim())) {
      setFormError("Görünen ad ve slug zorunludur.");
      return;
    }
    try {
      if (drawer.editing) {
        // Slug/commercial_name olusturma sonrasi degistirilemez (kimlik alanlari).
        await save.mutateAsync({
          id: drawer.editing.id,
          body: {
            display_name: form.display_name,
            status: form.status,
            primary_contact_name: form.primary_contact_name || null,
            primary_contact_email: form.primary_contact_email || null,
          },
        });
        showFlash("success", "Tenant güncellendi.");
      } else {
        await save.mutateAsync({
          body: {
            commercial_name: form.commercial_name || form.display_name,
            display_name: form.display_name,
            slug: form.slug,
            status: form.status,
            primary_contact_name: form.primary_contact_name || null,
            primary_contact_email: form.primary_contact_email || null,
            default_timezone: form.default_timezone,
          },
        });
        showFlash("success", "Tenant oluşturuldu. Tesis eklemek için Tesis Dizini'ne geçin.");
      }
      setDrawer({ open: false, editing: null });
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Kaydedilemedi");
    }
  }

  if (tenants.isLoading) return <LoadingState />;
  if (tenants.isError)
    return <ErrorState message="Tenant'lar yüklenemedi." onRetry={() => tenants.refetch()} />;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Tenant Dizini</h1>
          <p className="text-sm text-muted-foreground">
            Tüm müşteri hesapları — operasyonel/PII detay içermez. Plan ataması Kullanım
            sayfasından yapılır.
          </p>
        </div>
        <Button onClick={openCreate}>Yeni Tenant</Button>
      </div>

      {flash && (
        <div
          className={cn(
            "rounded-lg border px-4 py-2.5 text-sm",
            flash.kind === "success"
              ? "border-status-approved/30 bg-status-approved/10 text-status-approved"
              : "border-destructive/30 bg-destructive/10 text-destructive",
          )}
        >
          {flash.text}
        </div>
      )}

      <Table>
        <THead>
          <TR>
            <TH>Müşteri</TH>
            <TH>Slug</TH>
            <TH>Durum</TH>
            <TH>Plan</TH>
            <TH>İletişim</TH>
            <TH>Oluşturulma</TH>
            <TH className="text-right">İşlem</TH>
          </TR>
        </THead>
        <TBody>
          {(tenants.data ?? []).map((t) => (
            <TR key={t.id}>
              <TD className="font-medium">{t.display_name}</TD>
              <TD className="font-mono text-xs text-muted-foreground">{t.slug}</TD>
              <TD>
                <Badge className={cn(STATUS_BADGE[t.status])}>
                  {STATUS_LABELS[t.status] ?? t.status}
                </Badge>
              </TD>
              <TD>{planName(t.assigned_plan_id)}</TD>
              <TD className="text-xs text-muted-foreground">{t.commercial_name}</TD>
              <TD className="text-xs text-muted-foreground">
                {new Date(t.created_at).toLocaleDateString("tr-TR")}
              </TD>
              <TD className="text-right">
                <Button size="sm" variant="secondary" onClick={() => openEdit(t)}>
                  Düzenle
                </Button>
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>

      <Drawer
        open={drawer.open}
        onClose={() => setDrawer({ open: false, editing: null })}
        title={drawer.editing ? "Tenant'ı Düzenle" : "Yeni Tenant"}
      >
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div>
            <Label>Görünen Ad</Label>
            <Input
              value={form.display_name}
              onChange={(e) => {
                set("display_name", e.target.value);
                if (!slugTouched && !drawer.editing) set("slug", slugify(e.target.value));
              }}
              placeholder="Örn. Pilot Gıda"
            />
          </div>
          {!drawer.editing && (
            <>
              <div>
                <Label>Ticari Unvan</Label>
                <Input
                  value={form.commercial_name}
                  onChange={(e) => set("commercial_name", e.target.value)}
                  placeholder="Boş bırakılırsa görünen ad kullanılır"
                />
              </div>
              <div>
                <Label>Slug</Label>
                <Input
                  value={form.slug}
                  onChange={(e) => {
                    setSlugTouched(true);
                    set("slug", slugify(e.target.value));
                  }}
                  placeholder="pilot-gida"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Görünen addan otomatik türetilir; sonradan değiştirilemez.
                </p>
              </div>
              <div>
                <Label>Varsayılan Saat Dilimi</Label>
                <Input
                  value={form.default_timezone}
                  onChange={(e) => set("default_timezone", e.target.value)}
                />
              </div>
            </>
          )}
          <div>
            <Label>Durum</Label>
            <Select value={form.status} onChange={(e) => set("status", e.target.value)}>
              {Object.entries(STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
            {form.status === "archived" && (
              <p className="mt-1 text-xs text-status-cancelled">
                Arşivlenmiş tenant&apos;a yeni tesis eklenemez.
              </p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>İletişim Adı</Label>
              <Input
                value={form.primary_contact_name}
                onChange={(e) => set("primary_contact_name", e.target.value)}
                placeholder="Opsiyonel"
              />
            </div>
            <div>
              <Label>İletişim E-postası</Label>
              <Input
                value={form.primary_contact_email}
                onChange={(e) => set("primary_contact_email", e.target.value)}
                placeholder="Opsiyonel"
              />
            </div>
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
    </div>
  );
}
