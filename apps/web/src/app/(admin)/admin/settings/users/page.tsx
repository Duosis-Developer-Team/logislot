"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { KeyRound, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { ConfirmDialog } from "@/components/config/confirm-dialog";
import { useFlash } from "@/components/config/page-shell";
import { MultiSelectField } from "@/components/config/multi-select";
import { PermissionPicker } from "@/components/config/permission-picker";
import { ActiveBadge, EmptyState, ErrorState, LoadingState } from "@/components/config/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Input, Label } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { ApiError } from "@/lib/api/client";
import {
  docks,
  usePermissionCatalog,
  useFacilityRoles,
  useFacilityUsers,
  useRoleMutations,
  useUserMutations,
} from "@/lib/api/resources";
import type { FacilityUserDto, RoleDto } from "@/lib/api/types";
import { useSession } from "@/lib/auth/session";
import { cn } from "@/lib/utils";

/** Izin kodu -> Turkce etiket. Gruplar rol editorunde baslik olarak kullanilir. */
const PERMISSION_GROUPS: { title: string; items: { code: string; label: string }[] }[] = [
  {
    title: "Randevular",
    items: [
      { code: "appt.view", label: "Randevuları görüntüle" },
      { code: "appt.create", label: "Randevu oluştur (tedarikçi adına)" },
      { code: "appt.approve", label: "Randevu onayla" },
      { code: "appt.reject", label: "Randevu reddet" },
      { code: "appt.revise", label: "Randevu revize et" },
      { code: "appt.complete", label: "Randevu tamamla" },
      { code: "appt.cancel", label: "Randevu iptal et" },
    ],
  },
  {
    title: "Takvim",
    items: [
      { code: "calendar.view", label: "Takvimi görüntüle" },
      { code: "calendar.override", label: "İstisna günler (override) yönet" },
    ],
  },
  {
    title: "Konfigürasyon",
    items: [
      { code: "category.manage", label: "Ürün kategorilerini yönet" },
      { code: "vehicle_category.manage", label: "Araç kategorilerini yönet" },
      { code: "dock.manage", label: "Rampaları yönet" },
      { code: "dock_conflict_group.manage", label: "Çakışma gruplarını yönet" },
      { code: "supplier.manage", label: "Tedarikçileri yönet" },
    ],
  },
  {
    title: "Yönetim",
    items: [
      { code: "user.manage", label: "Kullanıcıları yönet" },
      { code: "role.manage", label: "Rolleri yönet" },
      { code: "report.view", label: "Raporları görüntüle" },
      // Denetim Kayitlari sayfasi bu izni ister; katalogda vardi ama listede
      // olmadigi icin UI'dan hic verilemiyordu.
      { code: "audit.view", label: "Denetim kayıtlarını görüntüle" },
    ],
  },
];

const PERMISSION_LABELS = new Map(
  PERMISSION_GROUPS.flatMap((g) => g.items.map((i) => [i.code, i.label] as const)),
);

const userSchema = z.object({
  name: z.string().min(1, "Ad zorunlu"),
  email: z.string().email("Geçerli bir e-posta girin"),
  temporary_password: z.string().min(6, "En az 6 karakter").optional().or(z.literal("")),
});
type UserFormValues = z.infer<typeof userSchema>;

const roleSchema = z.object({
  name: z.string().min(1, "Rol adı zorunlu"),
  display_name: z.string().optional(),
  description: z.string().optional(),
});
type RoleFormValues = z.infer<typeof roleSchema>;

export default function UsersPage() {
  const { activeFacilityId } = useSession();
  const users = useFacilityUsers(activeFacilityId);
  const roles = useFacilityRoles(activeFacilityId);
  const dockList = docks.useList(activeFacilityId);
  const catalog = usePermissionCatalog(activeFacilityId);
  const userMutations = useUserMutations(activeFacilityId);
  const roleMutations = useRoleMutations(activeFacilityId);
  const { flash, showFlash } = useFlash();

  const [tab, setTab] = useState<"users" | "roles">("users");

  // ---- kullanici drawer'i ----
  const [userDrawer, setUserDrawer] = useState<{ open: boolean; editing: FacilityUserDto | null }>(
    { open: false, editing: null },
  );
  const [userRoleIds, setUserRoleIds] = useState<string[]>([]);
  const [userDockIds, setUserDockIds] = useState<string[]>([]);
  const [userActive, setUserActive] = useState(true);
  const [userError, setUserError] = useState<string | null>(null);
  const userForm = useForm<UserFormValues>({ resolver: zodResolver(userSchema) });

  // ---- rol drawer'i ----
  const [roleDrawer, setRoleDrawer] = useState<{ open: boolean; editing: RoleDto | null }>({
    open: false,
    editing: null,
  });
  const [rolePermissions, setRolePermissions] = useState<string[]>([]);
  const [roleActive, setRoleActive] = useState(true);
  const [roleError, setRoleError] = useState<string | null>(null);
  const roleForm = useForm<RoleFormValues>({ resolver: zodResolver(roleSchema) });

  // ---- onay/parola dialoglari ----
  const [deactivateUserTarget, setDeactivateUserTarget] = useState<FacilityUserDto | null>(null);
  const [deactivateRoleTarget, setDeactivateRoleTarget] = useState<RoleDto | null>(null);
  const [resetTarget, setResetTarget] = useState<FacilityUserDto | null>(null);
  const [resetPassword, setResetPassword] = useState("");

  const dockName = (id: string) => dockList.data?.find((d) => d.id === id)?.name ?? "?";
  const activeRoles = (roles.data ?? []).filter((r) => r.is_active);
  const knownPermissions = catalog.data?.permissions ?? [];
  // Katalog henuz gelmediyse (bos liste) tum gruplar gosterilir — mevcut davranis.
  const visiblePermissionGroups = PERMISSION_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter(
      (item) => knownPermissions.length === 0 || knownPermissions.includes(item.code),
    ),
  }));

  function openUserCreate() {
    userForm.reset({ name: "", email: "", temporary_password: "" });
    setUserRoleIds([]);
    setUserDockIds([]);
    setUserActive(true);
    setUserError(null);
    setUserDrawer({ open: true, editing: null });
  }

  function openUserEdit(row: FacilityUserDto) {
    userForm.reset({ name: row.name, email: row.email, temporary_password: "" });
    setUserRoleIds(row.roles.map((r) => r.id));
    setUserDockIds(row.assigned_dock_ids ?? []);
    setUserActive(row.is_active);
    setUserError(null);
    setUserDrawer({ open: true, editing: row });
  }

  async function onUserSubmit(values: UserFormValues) {
    setUserError(null);
    if (userRoleIds.length === 0) {
      setUserError("Kullanıcının en az 1 rolü olmalı.");
      return;
    }
    try {
      if (userDrawer.editing) {
        await userMutations.save.mutateAsync({
          id: userDrawer.editing.id,
          body: {
            name: values.name,
            role_ids: userRoleIds,
            assigned_dock_ids: userDockIds,
            is_active: userActive,
          },
        });
        showFlash("success", "Kullanıcı güncellendi. Rol değişiklikleri kullanıcının bir sonraki girişinde/yenilemesinde etkinleşir.");
      } else {
        await userMutations.save.mutateAsync({
          body: {
            name: values.name,
            email: values.email,
            role_ids: userRoleIds,
            assigned_dock_ids: userDockIds,
            is_active: userActive,
            temporary_password: values.temporary_password || undefined,
          },
        });
        showFlash(
          "success",
          `Kullanıcı oluşturuldu. Geçici parola: ${values.temporary_password || "Demo123!"}`,
        );
      }
      setUserDrawer({ open: false, editing: null });
    } catch (err) {
      setUserError(err instanceof ApiError ? err.message : "Kaydedilemedi");
    }
  }

  async function onUserDeactivate() {
    if (!deactivateUserTarget) return;
    try {
      await userMutations.deactivate.mutateAsync(deactivateUserTarget.id);
      showFlash("success", `"${deactivateUserTarget.name}" pasifleştirildi; oturumları düşürüldü.`);
    } catch (err) {
      showFlash("error", err instanceof ApiError ? err.message : "İşlem başarısız");
    } finally {
      setDeactivateUserTarget(null);
    }
  }

  async function onResetPassword() {
    if (!resetTarget || resetPassword.length < 6) return;
    try {
      await userMutations.resetPassword.mutateAsync({
        id: resetTarget.id,
        password: resetPassword,
      });
      showFlash("success", `"${resetTarget.name}" parolası sıfırlandı; tüm oturumları düşürüldü.`);
    } catch (err) {
      showFlash("error", err instanceof ApiError ? err.message : "İşlem başarısız");
    } finally {
      setResetTarget(null);
      setResetPassword("");
    }
  }

  function openRoleCreate() {
    roleForm.reset({ name: "", display_name: "", description: "" });
    setRolePermissions([]);
    setRoleActive(true);
    setRoleError(null);
    setRoleDrawer({ open: true, editing: null });
  }

  function openRoleEdit(row: RoleDto) {
    roleForm.reset({
      name: row.name,
      display_name: row.display_name === row.name ? "" : row.display_name,
      description: row.description ?? "",
    });
    setRolePermissions(row.permissions);
    setRoleActive(row.is_active);
    setRoleError(null);
    setRoleDrawer({ open: true, editing: row });
  }

  async function onRoleSubmit(values: RoleFormValues) {
    setRoleError(null);
    const editing = roleDrawer.editing;
    const isSystem = editing?.is_system ?? false;
    if (!isSystem && rolePermissions.length === 0) {
      setRoleError("Role en az 1 izin seçin.");
      return;
    }
    try {
      // System rolde YALNIZCA gorunen ad + aciklama gonderilir (backend kilidi).
      const body = isSystem
        ? {
            display_name: values.display_name || values.name,
            description: values.description || null,
          }
        : {
            name: values.name,
            display_name: values.display_name || null,
            description: values.description || null,
            permission_codes: rolePermissions,
            is_active: roleActive,
          };
      await roleMutations.save.mutateAsync({ id: editing?.id, body });
      showFlash("success", editing ? "Rol güncellendi." : "Rol oluşturuldu.");
      setRoleDrawer({ open: false, editing: null });
    } catch (err) {
      setRoleError(err instanceof ApiError ? err.message : "Kaydedilemedi");
    }
  }

  async function onRoleDeactivate() {
    if (!deactivateRoleTarget) return;
    try {
      await roleMutations.deactivate.mutateAsync(deactivateRoleTarget.id);
      showFlash("success", `"${deactivateRoleTarget.display_name}" pasifleştirildi.`);
    } catch (err) {
      showFlash("error", err instanceof ApiError ? err.message : "İşlem başarısız");
    } finally {
      setDeactivateRoleTarget(null);
    }
  }

  if (users.isLoading || roles.isLoading) return <LoadingState />;
  if (users.isError || roles.isError)
    return (
      <ErrorState
        message="Kullanıcı/rol verisi yüklenemedi."
        onRetry={() => {
          users.refetch();
          roles.refetch();
        }}
      />
    );

  const editingSystemRole = roleDrawer.editing?.is_system ?? false;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Kullanıcılar &amp; Roller</h1>
          <p className="text-sm text-muted-foreground">
            Hesap kullanıcılarını ve rol/izin setlerini yönetin. Sistem rollerinin izinleri
            kilitlidir.
          </p>
        </div>
        <Button onClick={tab === "users" ? openUserCreate : openRoleCreate}>
          {tab === "users" ? "Yeni Kullanıcı" : "Yeni Rol"}
        </Button>
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

      <div className="flex gap-1 border-b border-border">
        {(
          [
            { key: "users", label: `Kullanıcılar (${users.data?.length ?? 0})` },
            { key: "roles", label: `Roller (${roles.data?.length ?? 0})` },
          ] as const
        ).map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              "border-b-2 px-4 py-2 text-sm font-medium transition-colors",
              tab === t.key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "users" ? (
        (users.data ?? []).length === 0 ? (
          <EmptyState
            title="Kullanıcı yok"
            description="İlk kullanıcıyı ekleyin."
            actionLabel="Yeni Kullanıcı"
            onAction={openUserCreate}
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Ad</TH>
                <TH>E-posta</TH>
                <TH>Roller</TH>
                <TH>Yetkili Rampalar</TH>
                <TH>Durum</TH>
                <TH className="text-right">İşlem</TH>
              </TR>
            </THead>
            <TBody>
              {(users.data ?? []).map((user) => (
                <TR key={user.id}>
                  <TD className="font-medium">{user.name}</TD>
                  <TD className="text-muted-foreground">{user.email}</TD>
                  <TD>
                    <div className="flex flex-wrap gap-1">
                      {user.roles.map((role) => (
                        <Badge key={role.id} className="bg-primary/10 text-primary">
                          {role.display_name}
                        </Badge>
                      ))}
                    </div>
                  </TD>
                  <TD>
                    {user.assigned_dock_ids ? (
                      <div className="flex flex-wrap gap-1">
                        {user.assigned_dock_ids.map((id) => (
                          <Badge key={id} className="bg-muted text-muted-foreground">
                            {dockName(id)}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">Kısıt yok</span>
                    )}
                  </TD>
                  <TD>
                    <ActiveBadge active={user.is_active} />
                  </TD>
                  <TD className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="secondary" onClick={() => openUserEdit(user)}>
                        Düzenle
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        title="Parola sıfırla"
                        onClick={() => {
                          setResetTarget(user);
                          setResetPassword("");
                        }}
                      >
                        <KeyRound className="h-4 w-4" />
                      </Button>
                      {user.is_active && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setDeactivateUserTarget(user)}
                        >
                          Pasifleştir
                        </Button>
                      )}
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {(roles.data ?? []).map((role) => (
            <div
              key={role.id}
              className={cn(
                "rounded-xl border border-border bg-card p-4",
                !role.is_active && "opacity-60",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2 font-semibold">
                    <ShieldCheck className="h-4 w-4 text-primary" />
                    {role.display_name}
                    {role.is_system && (
                      <Badge className="bg-muted text-muted-foreground">Sistem</Badge>
                    )}
                    {!role.is_active && (
                      <Badge className="bg-status-cancelled/15 text-status-cancelled">
                        Pasif
                      </Badge>
                    )}
                  </div>
                  {role.description && (
                    <p className="mt-0.5 text-xs text-muted-foreground">{role.description}</p>
                  )}
                </div>
                <div className="flex gap-1">
                  <Button size="sm" variant="secondary" onClick={() => openRoleEdit(role)}>
                    Düzenle
                  </Button>
                  {!role.is_system && role.is_active && (
                    <Button size="sm" variant="ghost" onClick={() => setDeactivateRoleTarget(role)}>
                      Pasifleştir
                    </Button>
                  )}
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-1">
                {role.permissions.map((permission) => (
                  <Badge key={permission} className="bg-muted text-[11px] text-muted-foreground">
                    {PERMISSION_LABELS.get(permission) ?? permission}
                  </Badge>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ---------- kullanici drawer ---------- */}
      <Drawer
        open={userDrawer.open}
        onClose={() => setUserDrawer({ open: false, editing: null })}
        title={userDrawer.editing ? "Kullanıcıyı Düzenle" : "Yeni Kullanıcı"}
      >
        <form onSubmit={userForm.handleSubmit(onUserSubmit)} className="flex flex-col gap-4">
          <div>
            <Label>Ad Soyad</Label>
            <Input {...userForm.register("name")} placeholder="Örn. Ayşe Yılmaz" />
            {userForm.formState.errors.name && (
              <p className="mt-1 text-xs text-destructive">
                {userForm.formState.errors.name.message}
              </p>
            )}
          </div>
          <div>
            <Label>E-posta</Label>
            <Input
              {...userForm.register("email")}
              disabled={!!userDrawer.editing}
              placeholder="kullanici@firma.com"
            />
            {userForm.formState.errors.email && (
              <p className="mt-1 text-xs text-destructive">
                {userForm.formState.errors.email.message}
              </p>
            )}
            {userDrawer.editing && (
              <p className="mt-1 text-xs text-muted-foreground">E-posta değiştirilemez.</p>
            )}
          </div>
          {!userDrawer.editing && (
            <div>
              <Label>Geçici Parola</Label>
              <Input
                {...userForm.register("temporary_password")}
                placeholder="Boş bırakılırsa: Demo123!"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Kullanıcı ilk girişinden sonra parolasını değiştirmelidir.
              </p>
            </div>
          )}
          <div>
            <Label>Roller (en az 1)</Label>
            <MultiSelectField
              options={activeRoles.map((r) => ({ value: r.id, label: r.display_name }))}
              value={userRoleIds}
              onChange={setUserRoleIds}
              searchPlaceholder="Rol ara…"
            />
          </div>
          <div>
            <Label>Yetkili Rampalar</Label>
            <MultiSelectField
              options={(dockList.data ?? [])
                .filter((d) => d.is_active)
                .map((d) => ({ value: d.id, label: d.name }))}
              value={userDockIds}
              onChange={setUserDockIds}
              searchPlaceholder="Rampa ara…"
              emptyHint="Boş = tüm rampalarda işlem yapabilir"
            />
          </div>
          {userDrawer.editing && (
            <Switch checked={userActive} onChange={setUserActive} label="Aktif" />
          )}
          {userError && <p className="text-sm text-destructive">{userError}</p>}
          <div className="mt-2 flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setUserDrawer({ open: false, editing: null })}
            >
              İptal
            </Button>
            <Button type="submit" disabled={userMutations.save.isPending}>
              {userMutations.save.isPending ? "Kaydediliyor…" : "Kaydet"}
            </Button>
          </div>
        </form>
      </Drawer>

      {/* ---------- rol drawer ---------- */}
      <Drawer
        open={roleDrawer.open}
        onClose={() => setRoleDrawer({ open: false, editing: null })}
        title={roleDrawer.editing ? "Rolü Düzenle" : "Yeni Rol"}
      >
        <form onSubmit={roleForm.handleSubmit(onRoleSubmit)} className="flex flex-col gap-4">
          {editingSystemRole && (
            <div className="rounded-lg border border-accent/40 bg-accent/10 px-3 py-2 text-xs text-accent-foreground">
              Sistem rolü: ad, izinler ve aktiflik kilitlidir. Yalnızca görünen ad ve açıklama
              düzenlenebilir.
            </div>
          )}
          <div>
            <Label>Rol Adı</Label>
            <Input {...roleForm.register("name")} disabled={editingSystemRole} />
            {roleForm.formState.errors.name && (
              <p className="mt-1 text-xs text-destructive">
                {roleForm.formState.errors.name.message}
              </p>
            )}
          </div>
          <div>
            <Label>Görünen Ad</Label>
            <Input {...roleForm.register("display_name")} placeholder="Opsiyonel" />
          </div>
          <div>
            <Label>Açıklama</Label>
            <Input {...roleForm.register("description")} placeholder="Opsiyonel" />
          </div>
          <div>
            <Label>İzinler</Label>
            <PermissionPicker
              groups={visiblePermissionGroups}
              value={rolePermissions}
              onChange={setRolePermissions}
              disabled={editingSystemRole}
            />
          </div>
          {roleDrawer.editing && !editingSystemRole && (
            <Switch checked={roleActive} onChange={setRoleActive} label="Aktif" />
          )}
          {roleError && <p className="text-sm text-destructive">{roleError}</p>}
          <div className="mt-2 flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setRoleDrawer({ open: false, editing: null })}
            >
              İptal
            </Button>
            <Button type="submit" disabled={roleMutations.save.isPending}>
              {roleMutations.save.isPending ? "Kaydediliyor…" : "Kaydet"}
            </Button>
          </div>
        </form>
      </Drawer>

      {/* ---------- onay/parola dialoglari ---------- */}
      <ConfirmDialog
        open={deactivateUserTarget !== null}
        title="Kullanıcıyı pasifleştir"
        message={`"${deactivateUserTarget?.name}" pasifleştirilecek. Aktif oturumları düşürülür ve giriş yapamaz.`}
        loading={userMutations.deactivate.isPending}
        onConfirm={onUserDeactivate}
        onClose={() => setDeactivateUserTarget(null)}
      />
      <ConfirmDialog
        open={deactivateRoleTarget !== null}
        title="Rolü pasifleştir"
        message={`"${deactivateRoleTarget?.display_name}" pasifleştirilecek. Pasif rol yeni kullanıcılara atanamaz; mevcut atamalar yetki vermeyi durdurur.`}
        loading={roleMutations.deactivate.isPending}
        onConfirm={onRoleDeactivate}
        onClose={() => setDeactivateRoleTarget(null)}
      />
      <Drawer
        open={resetTarget !== null}
        onClose={() => setResetTarget(null)}
        title="Parola Sıfırla"
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{resetTarget?.name}</span> için yeni
            parola belirleyin. Tüm aktif oturumları düşürülür.
          </p>
          <div>
            <Label>Yeni Parola</Label>
            <Input
              value={resetPassword}
              onChange={(e) => setResetPassword(e.target.value)}
              placeholder="En az 6 karakter"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setResetTarget(null)}>
              İptal
            </Button>
            <Button
              onClick={onResetPassword}
              disabled={resetPassword.length < 6 || userMutations.resetPassword.isPending}
            >
              {userMutations.resetPassword.isPending ? "Sıfırlanıyor…" : "Sıfırla"}
            </Button>
          </div>
        </div>
      </Drawer>
    </div>
  );
}
