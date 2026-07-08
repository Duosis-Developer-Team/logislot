"use client";

import { useState } from "react";
import { useFlash } from "@/components/config/page-shell";
import { ErrorState, LoadingState } from "@/components/config/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Drawer } from "@/components/ui/drawer";
import { Input, Label, Select } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { ApiError } from "@/lib/api/client";
import {
  useFacilityMutations,
  usePlatformFacilities,
  usePlatformPlans,
  usePlatformTenants,
  type PlatformFacilityDto,
} from "@/lib/api/platform";
import { cn } from "@/lib/utils";

export default function FacilitiesPage() {
  const facilities = usePlatformFacilities();
  const tenants = usePlatformTenants();
  const plans = usePlatformPlans();
  const { create, patch } = useFacilityMutations();
  const { flash, showFlash } = useFlash();

  const [drawer, setDrawer] = useState<{ open: boolean; editing: PlatformFacilityDto | null }>({
    open: false,
    editing: null,
  });
  const [tenantId, setTenantId] = useState("");
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [timezone, setTimezone] = useState("Europe/Istanbul");
  const [planOverrideId, setPlanOverrideId] = useState("");
  const [bootstrap, setBootstrap] = useState(true);
  const [isActive, setIsActive] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);
  // Ilk yonetici bolumu (Sprint 9)
  const [createAdmin, setCreateAdmin] = useState(true);
  const [adminName, setAdminName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPasswordMode, setAdminPasswordMode] = useState<"auto" | "manual">("auto");
  const [adminPassword, setAdminPassword] = useState("");
  // Tek seferlik gecici parola paneli (kapaninca bir daha gosterilmez)
  const [createdAdmin, setCreatedAdmin] = useState<{
    email: string;
    temporary_password: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  const tenantName = (id: string) =>
    tenants.data?.find((t) => t.id === id)?.display_name ?? "—";
  const planName = (id: string | null) =>
    plans.data?.find((p) => p.id === id)?.name ?? null;
  // Yalnizca aktif planlar override olarak secilebilir (retired/draft atanamaz).
  const assignablePlans = (plans.data ?? []).filter((p) => p.status === "active");
  const selectedTenant = tenants.data?.find((t) => t.id === tenantId) ?? null;

  function openCreate() {
    setTenantId("");
    setName("");
    setAddress("");
    setTimezone("Europe/Istanbul");
    setPlanOverrideId("");
    setBootstrap(true);
    setCreateAdmin(true);
    setAdminName("");
    setAdminEmail("");
    setAdminPasswordMode("auto");
    setAdminPassword("");
    setFormError(null);
    setDrawer({ open: true, editing: null });
  }

  function openEdit(row: PlatformFacilityDto) {
    setTenantId(row.tenant_id);
    setName(row.name);
    setAddress(row.address ?? "");
    setTimezone(row.timezone);
    setPlanOverrideId(row.plan_override_id ?? "");
    setIsActive(row.status === "active");
    setFormError(null);
    setDrawer({ open: true, editing: row });
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!name.trim() || (!drawer.editing && !tenantId)) {
      setFormError("Tenant ve tesis adı zorunludur.");
      return;
    }
    if (!drawer.editing && createAdmin) {
      if (!adminName.trim() || !adminEmail.trim()) {
        setFormError("İlk yönetici için ad ve e-posta zorunludur.");
        return;
      }
      if (adminPasswordMode === "manual" && adminPassword.length < 6) {
        setFormError("Geçici parola en az 6 karakter olmalı.");
        return;
      }
    }
    try {
      if (drawer.editing) {
        await patch.mutateAsync({
          id: drawer.editing.id,
          body: {
            name,
            address: address || null,
            timezone,
            status: isActive ? "active" : "inactive",
            plan_override_id: planOverrideId || null,
          },
        });
        showFlash("success", "Tesis güncellendi.");
      } else {
        const created = await create.mutateAsync({
          tenantId,
          body: {
            name,
            address: address || null,
            timezone,
            plan_override_id: planOverrideId || null,
            bootstrap_defaults: bootstrap,
            initial_admin: createAdmin
              ? {
                  name: adminName,
                  email: adminEmail,
                  temporary_password:
                    adminPasswordMode === "manual" ? adminPassword : undefined,
                  must_change_password: true,
                }
              : undefined,
          },
        });
        showFlash(
          "success",
          created.bootstrap
            ? `Tesis oluşturuldu; başlangıç konfigürasyonu kuruldu (${created.bootstrap.docks} rampa, ${created.bootstrap.roles} rol).`
            : "Tesis oluşturuldu (boş konfigürasyon).",
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

  if (facilities.isLoading) return <LoadingState />;
  if (facilities.isError)
    return (
      <ErrorState message="Tesisler yüklenemedi." onRetry={() => facilities.refetch()} />
    );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Tesis Dizini</h1>
          <p className="text-sm text-muted-foreground">
            Tenant&apos;lar arası tüm tesisler (destek/operasyon görünümü)
          </p>
        </div>
        <Button onClick={openCreate}>Yeni Tesis</Button>
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
            <TH>Tesis</TH>
            <TH>Tenant</TH>
            <TH>Saat Dilimi</TH>
            <TH>Plan Override</TH>
            <TH>Durum</TH>
            <TH className="text-right">İşlem</TH>
          </TR>
        </THead>
        <TBody>
          {(facilities.data ?? []).map((f) => (
            <TR key={f.id}>
              <TD className="font-medium">{f.name}</TD>
              <TD>{tenantName(f.tenant_id)}</TD>
              <TD className="text-muted-foreground">{f.timezone}</TD>
              <TD>
                {planName(f.plan_override_id) ?? (
                  <span className="text-xs text-muted-foreground">Tenant planı</span>
                )}
              </TD>
              <TD>
                <Badge
                  className={cn(
                    f.status === "active"
                      ? "bg-status-approved/15 text-status-approved"
                      : "bg-status-cancelled/15 text-status-cancelled",
                  )}
                >
                  {f.status === "active" ? "Aktif" : "Pasif"}
                </Badge>
              </TD>
              <TD className="text-right">
                <Button size="sm" variant="secondary" onClick={() => openEdit(f)}>
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
        title={drawer.editing ? "Tesisi Düzenle" : "Yeni Tesis"}
      >
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div>
            <Label>Tenant</Label>
            <Select
              value={tenantId}
              onChange={(e) => setTenantId(e.target.value)}
              disabled={!!drawer.editing}
            >
              <option value="">— Tenant seçin —</option>
              {(tenants.data ?? []).map((t) => (
                <option key={t.id} value={t.id} disabled={t.status === "archived"}>
                  {t.display_name}
                  {t.status === "archived" ? " (arşiv — tesis eklenemez)" : ""}
                </option>
              ))}
            </Select>
            {selectedTenant?.status === "archived" && (
              <p className="mt-1 text-xs text-destructive">
                Arşivlenmiş tenant&apos;a yeni tesis eklenemez.
              </p>
            )}
          </div>
          <div>
            <Label>Tesis Adı</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Örn. İzmir Üretim Tesisi"
            />
          </div>
          <div>
            <Label>Adres</Label>
            <Input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Opsiyonel"
            />
          </div>
          <div>
            <Label>Saat Dilimi</Label>
            <Input value={timezone} onChange={(e) => setTimezone(e.target.value)} />
          </div>
          <div>
            <Label>Plan Override</Label>
            <Select
              value={planOverrideId}
              onChange={(e) => setPlanOverrideId(e.target.value)}
            >
              <option value="">Tenant planını kullan</option>
              {assignablePlans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
            <p className="mt-1 text-xs text-muted-foreground">
              Yalnızca aktif planlar seçilebilir. Plan bir politika konteyneridir;
              faturalama motoru değildir.
            </p>
          </div>
          {!drawer.editing && (
            <div>
              <Switch
                checked={bootstrap}
                onChange={setBootstrap}
                label="Varsayılan konfigürasyonu kur"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                3 araç kategorisi, &quot;Genel&quot; ürün kategorisi, varsayılan çalışma
                saatli Rampa 1 ve 3 standart sistem rolü oluşturulur. Tesis ilk randevuyu
                alabilir duruma gelir.
              </p>
            </div>
          )}
          {!drawer.editing && (
            <div className="rounded-lg border border-border p-3">
              <Switch
                checked={createAdmin}
                onChange={setCreateAdmin}
                label="İlk tesis yöneticisini oluştur"
              />
              {createAdmin && (
                <div className="mt-3 flex flex-col gap-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Ad Soyad</Label>
                      <Input
                        value={adminName}
                        onChange={(e) => setAdminName(e.target.value)}
                        placeholder="Örn. Pilot Yönetici"
                      />
                    </div>
                    <div>
                      <Label>E-posta</Label>
                      <Input
                        value={adminEmail}
                        onChange={(e) => setAdminEmail(e.target.value)}
                        placeholder="yonetici@firma.com"
                      />
                    </div>
                  </div>
                  <div>
                    <Label>Geçici Parola</Label>
                    <div className="flex gap-2">
                      <Select
                        value={adminPasswordMode}
                        onChange={(e) =>
                          setAdminPasswordMode(e.target.value as "auto" | "manual")
                        }
                        className="w-44 shrink-0"
                      >
                        <option value="auto">Otomatik üret</option>
                        <option value="manual">Elle gir</option>
                      </Select>
                      {adminPasswordMode === "manual" && (
                        <Input
                          value={adminPassword}
                          onChange={(e) => setAdminPassword(e.target.value)}
                          placeholder="En az 6 karakter"
                        />
                      )}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Kullanıcı ilk girişte parolasını değiştirmek zorundadır; geçici
                      parola oluşturma sonrası yalnızca BİR kez gösterilir.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
          {drawer.editing && (
            <Switch checked={isActive} onChange={setIsActive} label="Aktif" />
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
            <Button
              type="submit"
              disabled={create.isPending || patch.isPending || selectedTenant?.status === "archived"}
            >
              {create.isPending || patch.isPending ? "Kaydediliyor…" : "Kaydet"}
            </Button>
          </div>
        </form>
      </Drawer>

      {/* Tek seferlik gecici parola paneli */}
      <Dialog
        open={createdAdmin !== null}
        onClose={() => setCreatedAdmin(null)}
        title="İlk Yönetici Oluşturuldu"
      >
        {createdAdmin && (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              Aşağıdaki geçici parolayı yöneticiyle güvenli bir kanaldan paylaşın.
              Kullanıcı ilk girişte parolasını değiştirmek zorundadır.
            </p>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-lg border border-border p-3 text-sm">
              <dt className="text-muted-foreground">E-posta</dt>
              <dd className="font-medium">{createdAdmin.email}</dd>
              <dt className="text-muted-foreground">Geçici Parola</dt>
              <dd className="font-mono font-semibold">{createdAdmin.temporary_password}</dd>
            </dl>
            <p className="rounded-md bg-status-pending/10 px-3 py-2 text-xs text-status-pending">
              Bu parola bir daha gösterilmeyecek. Kapatmadan önce kopyaladığınızdan emin
              olun.
            </p>
            <div className="flex justify-end gap-2">
              <Button
                variant="secondary"
                onClick={() => {
                  void navigator.clipboard.writeText(
                    `${createdAdmin.email} / ${createdAdmin.temporary_password}`,
                  );
                  setCopied(true);
                }}
              >
                {copied ? "Kopyalandı ✓" : "Kopyala"}
              </Button>
              <Button onClick={() => setCreatedAdmin(null)}>Kapat</Button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}
