"use client";

import { Copy, KeyRound } from "lucide-react";
import { useState } from "react";
import { useFlash } from "@/components/config/page-shell";
import { ErrorState, LoadingState } from "@/components/config/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Input, Label, Select } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { ApiError } from "@/lib/api/client";
import {
  usePlatformPlans,
  usePlatformTenants,
  useTenantMutations,
  type PlatformTenantDto,
} from "@/lib/api/platform";
import { useT } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";

/**
 * Musteri Hesaplari — 1 tenant = 1 tesis (urun karari 2026-07).
 *
 * Tesis ARTIK ayri bir varlik degildir: hesap acilirken operasyonel kapsami
 * (rampalar/kategoriler/roller) ve istege bagli ilk yoneticisi ayni formda,
 * tek istekte kurulur. Duzenlemede ad/adres/saat dilimi/durum tek kayitmis
 * gibi senkron guncellenir.
 */

const STATUS_BADGE: Record<string, string> = {
  trial: "bg-status-pending/15 text-status-pending",
  active: "bg-status-approved/15 text-status-approved",
  suspended: "bg-status-rejected/15 text-status-rejected",
  archived: "bg-status-cancelled/15 text-status-cancelled",
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
  address: string;
  admin_host: string;
  supplier_host: string;
}

const EMPTY_FORM: FormState = {
  commercial_name: "",
  display_name: "",
  slug: "",
  status: "trial",
  primary_contact_name: "",
  primary_contact_email: "",
  default_timezone: "Europe/Istanbul",
  address: "",
  admin_host: "",
  supplier_host: "",
};

export default function TenantsPage() {
  const t = useT();
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
  // Kapsam kurulumu (yalnizca yeni hesapta)
  const [bootstrap, setBootstrap] = useState(true);
  const [createAdmin, setCreateAdmin] = useState(true);
  const [adminName, setAdminName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  // Tek seferlik gecici parola paneli
  const [createdAdmin, setCreatedAdmin] = useState<{
    email: string;
    temporary_password: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  const planName = (id: string | null) => plans.data?.find((p) => p.id === id)?.name ?? "—";

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function openCreate() {
    setForm(EMPTY_FORM);
    setSlugTouched(false);
    setFormError(null);
    setBootstrap(true);
    setCreateAdmin(true);
    setAdminName("");
    setAdminEmail("");
    setAdminPassword("");
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
      address: row.address ?? "",
      admin_host: row.admin_host ?? "",
      supplier_host: row.supplier_host ?? "",
    });
    setSlugTouched(true);
    setFormError(null);
    setDrawer({ open: true, editing: row });
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!form.display_name.trim() || (!drawer.editing && !form.slug.trim())) {
      setFormError(t.platform.tenants.validationRequired);
      return;
    }
    if (!drawer.editing && createAdmin && (!adminName.trim() || !adminEmail.trim())) {
      setFormError(t.platform.tenants.validationAdmin);
      return;
    }
    try {
      if (drawer.editing) {
        // Slug/ticari unvan kimlik alanidir; olusturma sonrasi degistirilmez.
        await save.mutateAsync({
          id: drawer.editing.id,
          body: {
            display_name: form.display_name,
            status: form.status,
            primary_contact_name: form.primary_contact_name || null,
            primary_contact_email: form.primary_contact_email || null,
            address: form.address || null,
            admin_host: form.admin_host.trim(),
            supplier_host: form.supplier_host.trim(),
          },
        });
        showFlash("success", t.platform.tenants.updated);
      } else {
        const created = await save.mutateAsync({
          body: {
            commercial_name: form.commercial_name || form.display_name,
            display_name: form.display_name,
            slug: form.slug,
            status: form.status,
            primary_contact_name: form.primary_contact_name || null,
            primary_contact_email: form.primary_contact_email || null,
            default_timezone: form.default_timezone,
            address: form.address || null,
            admin_host: form.admin_host.trim() || null,
            supplier_host: form.supplier_host.trim() || null,
            bootstrap_defaults: bootstrap,
            initial_admin: createAdmin
              ? {
                  name: adminName,
                  email: adminEmail,
                  temporary_password: adminPassword || undefined,
                  must_change_password: true,
                }
              : undefined,
          },
        });
        showFlash(
          "success",
          created.bootstrap
            ? t.platform.tenants.createdWithBootstrap(
                created.bootstrap.docks,
                created.bootstrap.roles,
              )
            : t.platform.tenants.createdEmpty,
        );
        if (created.initial_admin) {
          setCopied(false);
          setCreatedAdmin({
            email: created.initial_admin.email,
            temporary_password: created.initial_admin.temporary_password,
          });
        }
      }
      setDrawer({ open: false, editing: null });
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Kaydedilemedi");
    }
  }

  if (tenants.isLoading) return <LoadingState />;
  if (tenants.isError)
    return (
      <ErrorState message={t.platform.tenants.loadError} onRetry={() => tenants.refetch()} />
    );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">{t.platform.tenants.title}</h1>
          <p className="text-sm text-muted-foreground">
            {t.platform.tenants.description}
          </p>
        </div>
        <Button onClick={openCreate}>{t.platform.tenants.create}</Button>
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
            <TH>{t.platform.tenants.colCustomer}</TH>
            <TH>Slug</TH>
            <TH>Durum</TH>
            <TH>Plan</TH>
            <TH>Adres</TH>
            <TH>{t.platform.tenants.colCreated}</TH>
            <TH className="text-right">{t.common.actions}</TH>
          </TR>
        </THead>
        <TBody>
          {(tenants.data ?? []).map((tenant) => (
            <TR key={tenant.id}>
              <TD>
                <div className="font-medium">{tenant.display_name}</div>
                <div className="text-xs text-muted-foreground">{tenant.commercial_name}</div>
              </TD>
              <TD className="font-mono text-xs text-muted-foreground">{tenant.slug}</TD>
              <TD>
                <Badge className={cn(STATUS_BADGE[tenant.status])}>
                  {t.platform.tenants.status[
                    tenant.status as keyof typeof t.platform.tenants.status
                  ] ?? tenant.status}
                </Badge>
              </TD>
              <TD>{planName(tenant.assigned_plan_id)}</TD>
              <TD className="max-w-56 truncate text-xs text-muted-foreground">
                {tenant.address ?? "—"}
              </TD>
              <TD className="text-xs text-muted-foreground">
                {new Date(tenant.created_at).toLocaleDateString("tr-TR")}
              </TD>
              <TD className="text-right">
                <Button size="sm" variant="secondary" onClick={() => openEdit(tenant)}>
                  {t.common.edit}
                </Button>
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>

      <Drawer
        open={drawer.open}
        onClose={() => setDrawer({ open: false, editing: null })}
        title={drawer.editing ? t.platform.tenants.editTitle : t.platform.tenants.create}
        description={
          drawer.editing
            ? undefined
            : t.platform.tenants.createSubtitle
        }
      >
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div>
            <Label>{t.platform.tenants.displayName}</Label>
            <Input
              value={form.display_name}
              onChange={(e) => {
                set("display_name", e.target.value);
                if (!slugTouched && !drawer.editing) set("slug", slugify(e.target.value));
              }}
              placeholder={t.platform.tenants.displayNamePlaceholder}
            />
            {!drawer.editing && (
              <p className="mt-1 text-xs text-muted-foreground">
                {t.platform.tenants.displayNameHint}
              </p>
            )}
          </div>

          {!drawer.editing && (
            <>
              <div>
                <Label>{t.platform.tenants.commercialName}</Label>
                <Input
                  value={form.commercial_name}
                  onChange={(e) => set("commercial_name", e.target.value)}
                  placeholder={t.platform.tenants.commercialPlaceholder}
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
                  {t.platform.tenants.slugHint}
                </p>
              </div>
              <div>
                <Label>{t.platform.tenants.timezone}</Label>
                <Input
                  value={form.default_timezone}
                  onChange={(e) => set("default_timezone", e.target.value)}
                />
              </div>
            </>
          )}

          <div>
            <Label>{t.platform.tenants.address}</Label>
            <Input
              value={form.address}
              onChange={(e) => set("address", e.target.value)}
              placeholder={t.platform.tenants.addressPlaceholder}
            />
          </div>

          <div>
            <Label>Durum</Label>
            <Select value={form.status} onChange={(e) => set("status", e.target.value)}>
              {Object.entries(t.platform.tenants.status).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
            {(form.status === "archived" || form.status === "suspended") && (
              <p className="mt-1 text-xs text-status-cancelled">
                {t.platform.tenants.statusHint}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>{t.platform.tenants.contactName}</Label>
              <Input
                value={form.primary_contact_name}
                onChange={(e) => set("primary_contact_name", e.target.value)}
                placeholder="Opsiyonel"
              />
            </div>
            <div>
              <Label>{t.platform.tenants.contactEmail}</Label>
              <Input
                value={form.primary_contact_email}
                onChange={(e) => set("primary_contact_email", e.target.value)}
                placeholder="Opsiyonel"
              />
            </div>
          </div>

          <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
            <div>
              <p className="text-sm font-medium">{t.platform.tenants.brandedHostsTitle}</p>
              <p className="text-xs text-muted-foreground">
                {t.platform.tenants.brandedHostsHint}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>{t.platform.tenants.brandedAdmin}</Label>
                <Input
                  value={form.admin_host}
                  onChange={(e) => set("admin_host", e.target.value)}
                  placeholder="cknb.logislot.io"
                />
              </div>
              <div>
                <Label>{t.platform.tenants.brandedSupplier}</Label>
                <Input
                  value={form.supplier_host}
                  onChange={(e) => set("supplier_host", e.target.value)}
                  placeholder="cknbtedarik.logislot.io"
                />
              </div>
            </div>
          </div>

          {!drawer.editing && (
            <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Kurulum
              </h3>
              <Switch
                checked={bootstrap}
                onChange={setBootstrap}
                label={t.platform.tenants.bootstrapLabel}
              />
              <Switch
                checked={createAdmin}
                onChange={setCreateAdmin}
                label={t.platform.tenants.createAdminLabel}
              />
              {createAdmin && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label>{t.platform.tenants.adminName}</Label>
                    <Input
                      value={adminName}
                      onChange={(e) => setAdminName(e.target.value)}
                      placeholder={t.platform.tenants.fullNamePlaceholder}
                    />
                  </div>
                  <div>
                    <Label>{t.platform.tenants.adminEmail}</Label>
                    <Input
                      type="email"
                      value={adminEmail}
                      onChange={(e) => setAdminEmail(e.target.value)}
                      placeholder={t.platform.tenants.adminEmailPlaceholder}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <Label>{t.platform.tenants.tempPassword}</Label>
                    <Input
                      value={adminPassword}
                      onChange={(e) => setAdminPassword(e.target.value)}
                      placeholder={t.platform.tenants.tempPasswordPlaceholder}
                    />
                  </div>
                </div>
              )}
            </div>
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

      {/* Tek seferlik gecici parola paneli */}
      <Drawer
        open={createdAdmin !== null}
        onClose={() => setCreatedAdmin(null)}
        title={t.platform.tenants.adminCreatedTitle}
        description={t.platform.tenants.adminCreatedHint}
      >
        {createdAdmin && (
          <div className="flex flex-col gap-4">
            <div className="rounded-lg border border-border bg-muted/40 p-4">
              <div className="flex items-center gap-2 text-sm">
                <KeyRound className="h-4 w-4 text-primary" />
                <span className="font-medium">{t.platform.tenants.credentials}</span>
              </div>
              <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
                <dt className="text-muted-foreground">E-posta</dt>
                <dd className="font-mono">{createdAdmin.email}</dd>
                <dt className="text-muted-foreground">{t.platform.tenants.tempPasswordLabel}</dt>
                <dd className="font-mono">{createdAdmin.temporary_password}</dd>
              </dl>
            </div>
            <Button
              variant="secondary"
              onClick={() => {
                void navigator.clipboard
                  .writeText(
                    t.platform.tenants.copyBody(
                      createdAdmin.email,
                      createdAdmin.temporary_password,
                    ),
                  )
                  .then(() => setCopied(true));
              }}
            >
              <Copy className="h-4 w-4" />
              {copied ? t.platform.tenants.copied : t.platform.tenants.copyCredentials}
            </Button>
            <Button onClick={() => setCreatedAdmin(null)}>Kaydettim, kapat</Button>
          </div>
        )}
      </Drawer>
    </div>
  );
}
