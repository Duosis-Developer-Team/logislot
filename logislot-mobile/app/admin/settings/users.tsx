/** Kullanıcılar & Roller — web (admin)/admin/settings/users karşılığı.
 *  Kullanıcı CRUD + parola reset + rol CRUD (izin grupları; sistem rolleri kilitli). */

import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Alert, FlatList, RefreshControl, Text, View } from "react-native";
import { ApiError } from "@/api/client";
import {
  docks,
  useFacilityRoles,
  useFacilityUsers,
  usePermissionCatalog,
  useRoleMutations,
  useUserMutations,
} from "@/api/resources";
import type { FacilityUserDto, RoleDto } from "@/api/types";
import { useSession } from "@/auth/session";
import { ActiveBadge, MultiSelectField, PermissionPicker } from "@/components/config";
import {
  AppModal,
  Badge,
  Button,
  Card,
  Chip,
  EmptyState,
  ErrorState,
  Field,
  LoadingState,
  SwitchRow,
} from "@/components/ui";
import { useTheme } from "@/theme/theme";
import { spacing } from "@/theme/tokens";

/** İzin kodu → Türkçe etiket — web ile aynı gruplar. */
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
      // Denetim Kayıtları sayfası bu izni ister; katalogda vardı ama listede
      // olmadığı için UI'dan hiç verilemiyordu.
      { code: "audit.view", label: "Denetim kayıtlarını görüntüle" },
    ],
  },
];

const PERMISSION_LABELS = new Map(
  PERMISSION_GROUPS.flatMap((g) => g.items.map((i) => [i.code, i.label] as const)),
);

export default function UsersScreen() {
  const { colors } = useTheme();
  const session = useSession();
  const facilityId = session.activeFacilityId;
  const users = useFacilityUsers(facilityId);
  const roles = useFacilityRoles(facilityId);
  const dockList = docks.useList(facilityId);
  const catalog = usePermissionCatalog(facilityId);
  const userMutations = useUserMutations(facilityId);
  const roleMutations = useRoleMutations(facilityId);

  const [tab, setTab] = useState<"users" | "roles">("users");

  // ---- kullanıcı formu ----
  const [userOpen, setUserOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<FacilityUserDto | null>(null);
  const [userName, setUserName] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [tempPassword, setTempPassword] = useState("");
  const [userRoleIds, setUserRoleIds] = useState<string[]>([]);
  const [userDockIds, setUserDockIds] = useState<string[]>([]);
  const [userActive, setUserActive] = useState(true);
  const [userError, setUserError] = useState<string | null>(null);

  // ---- rol formu ----
  const [roleOpen, setRoleOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<RoleDto | null>(null);
  const [roleName, setRoleName] = useState("");
  const [roleDisplayName, setRoleDisplayName] = useState("");
  const [roleDescription, setRoleDescription] = useState("");
  const [rolePermissions, setRolePermissions] = useState<string[]>([]);
  const [roleActive, setRoleActive] = useState(true);
  const [roleError, setRoleError] = useState<string | null>(null);

  // ---- parola reset ----
  const [resetTarget, setResetTarget] = useState<FacilityUserDto | null>(null);
  const [resetPassword, setResetPassword] = useState("");

  const dockName = (id: string) => dockList.data?.find((d) => d.id === id)?.name ?? "?";
  const activeRoles = (roles.data ?? []).filter((r) => r.is_active);
  const knownPermissions = catalog.data?.permissions ?? [];
  const editingSystemRole = editingRole?.is_system ?? false;
  // Katalog henüz gelmediyse (boş liste) tüm gruplar gösterilir — mevcut davranış.
  const visiblePermissionGroups = PERMISSION_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter(
      (item) => knownPermissions.length === 0 || knownPermissions.includes(item.code),
    ),
  }));

  function openUserCreate() {
    setEditingUser(null);
    setUserName("");
    setUserEmail("");
    setTempPassword("");
    setUserRoleIds([]);
    setUserDockIds([]);
    setUserActive(true);
    setUserError(null);
    setUserOpen(true);
  }

  function openUserEdit(row: FacilityUserDto) {
    setEditingUser(row);
    setUserName(row.name);
    setUserEmail(row.email);
    setTempPassword("");
    setUserRoleIds(row.roles.map((r) => r.id));
    setUserDockIds(row.assigned_dock_ids ?? []);
    setUserActive(row.is_active);
    setUserError(null);
    setUserOpen(true);
  }

  async function onUserSubmit() {
    setUserError(null);
    if (!userName.trim()) {
      setUserError("Ad zorunludur.");
      return;
    }
    if (!editingUser && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(userEmail)) {
      setUserError("Geçerli bir e-posta girin.");
      return;
    }
    if (userRoleIds.length === 0) {
      setUserError("Kullanıcının en az 1 rolü olmalı.");
      return;
    }
    try {
      if (editingUser) {
        await userMutations.save.mutateAsync({
          id: editingUser.id,
          body: {
            name: userName,
            role_ids: userRoleIds,
            assigned_dock_ids: userDockIds,
            is_active: userActive,
          },
        });
        Alert.alert(
          "Güncellendi",
          "Rol değişiklikleri kullanıcının bir sonraki girişinde/yenilemesinde etkinleşir.",
        );
      } else {
        await userMutations.save.mutateAsync({
          body: {
            name: userName,
            email: userEmail,
            role_ids: userRoleIds,
            assigned_dock_ids: userDockIds,
            is_active: userActive,
            temporary_password: tempPassword || undefined,
          },
        });
        Alert.alert(
          "Oluşturuldu",
          `Kullanıcı oluşturuldu. Geçici parola: ${tempPassword || "Demo123!"}`,
        );
      }
      setUserOpen(false);
    } catch (err) {
      setUserError(err instanceof ApiError ? err.message : "Kaydedilemedi");
    }
  }

  function onUserDeactivate(row: FacilityUserDto) {
    Alert.alert(
      "Kullanıcıyı pasifleştir",
      `"${row.name}" pasifleştirilecek. Aktif oturumları düşürülür ve giriş yapamaz.`,
      [
        { text: "Vazgeç", style: "cancel" },
        {
          text: "Pasifleştir",
          style: "destructive",
          onPress: () =>
            userMutations.deactivate.mutate(row.id, {
              onError: (err) =>
                Alert.alert(
                  "İşlem başarısız",
                  err instanceof ApiError ? err.message : "İşlem başarısız",
                ),
            }),
        },
      ],
    );
  }

  async function onResetPassword() {
    if (!resetTarget || resetPassword.length < 6) return;
    try {
      await userMutations.resetPassword.mutateAsync({
        id: resetTarget.id,
        password: resetPassword,
      });
      Alert.alert(
        "Sıfırlandı",
        `"${resetTarget.name}" parolası sıfırlandı; tüm oturumları düşürüldü.`,
      );
      setResetTarget(null);
      setResetPassword("");
    } catch (err) {
      Alert.alert("İşlem başarısız", err instanceof ApiError ? err.message : "İşlem başarısız");
    }
  }

  function openRoleCreate() {
    setEditingRole(null);
    setRoleName("");
    setRoleDisplayName("");
    setRoleDescription("");
    setRolePermissions([]);
    setRoleActive(true);
    setRoleError(null);
    setRoleOpen(true);
  }

  function openRoleEdit(row: RoleDto) {
    setEditingRole(row);
    setRoleName(row.name);
    setRoleDisplayName(row.display_name === row.name ? "" : row.display_name);
    setRoleDescription(row.description ?? "");
    setRolePermissions(row.permissions);
    setRoleActive(row.is_active);
    setRoleError(null);
    setRoleOpen(true);
  }

  async function onRoleSubmit() {
    setRoleError(null);
    const isSystem = editingRole?.is_system ?? false;
    if (!isSystem && !roleName.trim()) {
      setRoleError("Rol adı zorunludur.");
      return;
    }
    if (!isSystem && rolePermissions.length === 0) {
      setRoleError("Role en az 1 izin seçin.");
      return;
    }
    try {
      // Sistem rolde YALNIZCA görünen ad + açıklama gönderilir (backend kilidi).
      const body = isSystem
        ? {
            display_name: roleDisplayName || roleName,
            description: roleDescription || null,
          }
        : {
            name: roleName,
            display_name: roleDisplayName || null,
            description: roleDescription || null,
            permission_codes: rolePermissions,
            is_active: roleActive,
          };
      await roleMutations.save.mutateAsync({ id: editingRole?.id, body });
      setRoleOpen(false);
    } catch (err) {
      setRoleError(err instanceof ApiError ? err.message : "Kaydedilemedi");
    }
  }

  function onRoleDeactivate(row: RoleDto) {
    Alert.alert(
      "Rolü pasifleştir",
      `"${row.display_name}" pasifleştirilecek. Pasif rol yeni kullanıcılara atanamaz; mevcut atamalar yetki vermeyi durdurur.`,
      [
        { text: "Vazgeç", style: "cancel" },
        {
          text: "Pasifleştir",
          style: "destructive",
          onPress: () =>
            roleMutations.deactivate.mutate(row.id, {
              onError: (err) =>
                Alert.alert(
                  "İşlem başarısız",
                  err instanceof ApiError ? err.message : "İşlem başarısız",
                ),
            }),
        },
      ],
    );
  }

  if (users.isLoading || roles.isLoading)
    return (
      <View style={{ flex: 1, justifyContent: "center", backgroundColor: colors.background }}>
        <LoadingState />
      </View>
    );
  if (users.isError || roles.isError)
    return (
      <View style={{ flex: 1, justifyContent: "center", backgroundColor: colors.background }}>
        <ErrorState
          message="Kullanıcı/rol verisi yüklenemedi."
          onRetry={() => {
            void users.refetch();
            void roles.refetch();
          }}
        />
      </View>
    );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {tab === "users" ? (
        <FlatList
          data={users.data ?? []}
          keyExtractor={(u) => u.id}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 64 }}
          refreshControl={
            <RefreshControl
              refreshing={users.isRefetching}
              onRefresh={() => void users.refetch()}
              tintColor={colors.accent}
            />
          }
          ListHeaderComponent={
            <Header
              tab={tab}
              onTab={setTab}
              usersCount={users.data?.length ?? 0}
              rolesCount={roles.data?.length ?? 0}
              onCreate={openUserCreate}
              createLabel="Yeni Kullanıcı"
            />
          }
          ListEmptyComponent={
            <EmptyState title="Kullanıcı yok" description="Tesise ilk kullanıcıyı ekleyin." />
          }
          renderItem={({ item: user }) => (
            <Card style={{ gap: spacing.sm }}>
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  gap: spacing.sm,
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontSize: 15, fontWeight: "600" }}>
                    {user.name}
                  </Text>
                  <Text style={{ color: colors.mutedText, fontSize: 12 }}>{user.email}</Text>
                </View>
                <ActiveBadge active={user.is_active} />
              </View>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4 }}>
                {user.roles.map((role) => (
                  <Badge key={role.id} label={role.display_name} color={colors.accent} />
                ))}
                {user.assigned_dock_ids ? (
                  user.assigned_dock_ids.map((id) => (
                    <Badge key={id} label={dockName(id)} color={colors.mutedText} />
                  ))
                ) : (
                  <Badge label="Rampa kısıtı yok" color={colors.mutedText} />
                )}
              </View>
              <View style={{ flexDirection: "row", gap: spacing.sm }}>
                <Button
                  title="Düzenle"
                  variant="secondary"
                  onPress={() => openUserEdit(user)}
                  style={{ flex: 1, height: 40 }}
                />
                <Button
                  title="Parola"
                  variant="secondary"
                  onPress={() => {
                    setResetTarget(user);
                    setResetPassword("");
                  }}
                  style={{ flex: 1, height: 40 }}
                />
                {user.is_active && (
                  <Button
                    title="Pasifleştir"
                    variant="ghost"
                    onPress={() => onUserDeactivate(user)}
                    style={{ flex: 1, height: 40 }}
                  />
                )}
              </View>
            </Card>
          )}
        />
      ) : (
        <FlatList
          data={roles.data ?? []}
          keyExtractor={(r) => r.id}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 64 }}
          refreshControl={
            <RefreshControl
              refreshing={roles.isRefetching}
              onRefresh={() => void roles.refetch()}
              tintColor={colors.accent}
            />
          }
          ListHeaderComponent={
            <Header
              tab={tab}
              onTab={setTab}
              usersCount={users.data?.length ?? 0}
              rolesCount={roles.data?.length ?? 0}
              onCreate={openRoleCreate}
              createLabel="Yeni Rol"
            />
          }
          renderItem={({ item: role }) => (
            <Card style={{ gap: spacing.sm, opacity: role.is_active ? 1 : 0.6 }}>
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  gap: spacing.sm,
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flex: 1 }}>
                  <Ionicons name="shield-checkmark" size={16} color={colors.accent} />
                  <Text style={{ color: colors.text, fontSize: 15, fontWeight: "600" }}>
                    {role.display_name}
                  </Text>
                </View>
                <View style={{ flexDirection: "row", gap: 4 }}>
                  {role.is_system && <Badge label="Sistem" color={colors.mutedText} />}
                  {!role.is_active && (
                    <Badge label="Pasif" color={colors.status.cancelled} />
                  )}
                </View>
              </View>
              {role.description && (
                <Text style={{ color: colors.mutedText, fontSize: 12 }}>{role.description}</Text>
              )}
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4 }}>
                {role.permissions.map((permission) => (
                  <Badge
                    key={permission}
                    label={PERMISSION_LABELS.get(permission) ?? permission}
                    color={colors.mutedText}
                  />
                ))}
              </View>
              <View style={{ flexDirection: "row", gap: spacing.sm }}>
                <Button
                  title="Düzenle"
                  variant="secondary"
                  onPress={() => openRoleEdit(role)}
                  style={{ flex: 1, height: 40 }}
                />
                {!role.is_system && role.is_active && (
                  <Button
                    title="Pasifleştir"
                    variant="ghost"
                    onPress={() => onRoleDeactivate(role)}
                    style={{ flex: 1, height: 40 }}
                  />
                )}
              </View>
            </Card>
          )}
        />
      )}

      {/* ---------- kullanıcı formu ---------- */}
      <AppModal
        visible={userOpen}
        onClose={() => setUserOpen(false)}
        title={editingUser ? "Kullanıcıyı Düzenle" : "Yeni Kullanıcı"}
      >
        <View style={{ gap: spacing.md }}>
          <Field
            label="Ad Soyad"
            value={userName}
            onChangeText={setUserName}
            placeholder="Örn. Ayşe Yılmaz"
          />
          <Field
            label={editingUser ? "E-posta (değiştirilemez)" : "E-posta"}
            value={userEmail}
            onChangeText={setUserEmail}
            editable={!editingUser}
            placeholder="kullanici@firma.com"
            keyboardType="email-address"
            autoCapitalize="none"
          />
          {!editingUser && (
            <Field
              label="Geçici Parola (boşsa: Demo123!) — kullanıcı ilk girişte değiştirmelidir"
              value={tempPassword}
              onChangeText={setTempPassword}
              secureTextEntry
              autoCapitalize="none"
            />
          )}
          <View style={{ gap: 6 }}>
            <Text style={{ color: colors.text, fontSize: 14, fontWeight: "500" }}>
              Roller (en az 1)
            </Text>
            <MultiSelectField
              options={activeRoles.map((r) => ({ value: r.id, label: r.display_name }))}
              value={userRoleIds}
              onChange={setUserRoleIds}
              searchPlaceholder="Rol ara…"
            />
          </View>
          <View style={{ gap: 6 }}>
            <Text style={{ color: colors.text, fontSize: 14, fontWeight: "500" }}>
              Yetkili Rampalar
            </Text>
            <MultiSelectField
              options={(dockList.data ?? [])
                .filter((d) => d.is_active)
                .map((d) => ({ value: d.id, label: d.name }))}
              value={userDockIds}
              onChange={setUserDockIds}
              searchPlaceholder="Rampa ara…"
              emptyHint="Boş = tüm rampalarda işlem yapabilir"
            />
          </View>
          {editingUser && (
            <SwitchRow label="Aktif" value={userActive} onValueChange={setUserActive} />
          )}
          {userError && (
            <Text style={{ color: colors.destructive, fontSize: 13 }}>{userError}</Text>
          )}
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <Button
              title="İptal"
              variant="secondary"
              onPress={() => setUserOpen(false)}
              style={{ flex: 1 }}
            />
            <Button
              title={userMutations.save.isPending ? "Kaydediliyor…" : "Kaydet"}
              loading={userMutations.save.isPending}
              onPress={() => void onUserSubmit()}
              style={{ flex: 2 }}
            />
          </View>
        </View>
      </AppModal>

      {/* ---------- rol formu ---------- */}
      <AppModal
        visible={roleOpen}
        onClose={() => setRoleOpen(false)}
        title={editingRole ? "Rolü Düzenle" : "Yeni Rol"}
      >
        <View style={{ gap: spacing.md }}>
          {editingSystemRole && (
            <View
              style={{
                borderWidth: 1,
                borderColor: `${colors.accent}66`,
                backgroundColor: `${colors.accent}15`,
                borderRadius: 12,
                padding: spacing.md,
              }}
            >
              <Text style={{ color: colors.accent, fontSize: 12 }}>
                Sistem rolü: ad, izinler ve aktiflik kilitlidir. Yalnızca görünen ad ve
                açıklama düzenlenebilir.
              </Text>
            </View>
          )}
          <Field
            label="Rol Adı"
            value={roleName}
            onChangeText={setRoleName}
            editable={!editingSystemRole}
          />
          <Field
            label="Görünen Ad"
            value={roleDisplayName}
            onChangeText={setRoleDisplayName}
            placeholder="Opsiyonel"
          />
          <Field
            label="Açıklama"
            value={roleDescription}
            onChangeText={setRoleDescription}
            placeholder="Opsiyonel"
          />
          <View style={{ gap: spacing.sm }}>
            <Text style={{ color: colors.text, fontSize: 14, fontWeight: "500" }}>İzinler</Text>
            <PermissionPicker
              groups={visiblePermissionGroups}
              value={rolePermissions}
              onChange={setRolePermissions}
              disabled={editingSystemRole}
            />
          </View>
          {editingRole && !editingSystemRole && (
            <SwitchRow label="Aktif" value={roleActive} onValueChange={setRoleActive} />
          )}
          {roleError && (
            <Text style={{ color: colors.destructive, fontSize: 13 }}>{roleError}</Text>
          )}
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <Button
              title="İptal"
              variant="secondary"
              onPress={() => setRoleOpen(false)}
              style={{ flex: 1 }}
            />
            <Button
              title={roleMutations.save.isPending ? "Kaydediliyor…" : "Kaydet"}
              loading={roleMutations.save.isPending}
              onPress={() => void onRoleSubmit()}
              style={{ flex: 2 }}
            />
          </View>
        </View>
      </AppModal>

      {/* ---------- parola reset ---------- */}
      <AppModal
        visible={resetTarget !== null}
        onClose={() => setResetTarget(null)}
        title="Parola Sıfırla"
      >
        <View style={{ gap: spacing.md }}>
          <Text style={{ color: colors.mutedText, fontSize: 13 }}>
            <Text style={{ color: colors.text, fontWeight: "600" }}>{resetTarget?.name}</Text>{" "}
            için yeni parola belirleyin. Tüm aktif oturumları düşürülür.
          </Text>
          <Field
            label="Yeni Parola (en az 6 karakter)"
            value={resetPassword}
            onChangeText={setResetPassword}
            secureTextEntry
            autoCapitalize="none"
          />
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <Button
              title="İptal"
              variant="secondary"
              onPress={() => setResetTarget(null)}
              style={{ flex: 1 }}
            />
            <Button
              title={userMutations.resetPassword.isPending ? "Sıfırlanıyor…" : "Sıfırla"}
              loading={userMutations.resetPassword.isPending}
              disabled={resetPassword.length < 6}
              onPress={() => void onResetPassword()}
              style={{ flex: 2 }}
            />
          </View>
        </View>
      </AppModal>
    </View>
  );
}

function Header({
  tab,
  onTab,
  usersCount,
  rolesCount,
  onCreate,
  createLabel,
}: {
  tab: "users" | "roles";
  onTab: (t: "users" | "roles") => void;
  usersCount: number;
  rolesCount: number;
  onCreate: () => void;
  createLabel: string;
}) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: spacing.md, marginBottom: spacing.sm }}>
      <Text style={{ color: colors.mutedText, fontSize: 13 }}>
        Tesis kullanıcılarını ve rol/izin setlerini yönetin. Sistem rollerinin izinleri
        kilitlidir.
      </Text>
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <Chip
          label={`Kullanıcılar (${usersCount})`}
          selected={tab === "users"}
          onPress={() => onTab("users")}
        />
        <Chip
          label={`Roller (${rolesCount})`}
          selected={tab === "roles"}
          onPress={() => onTab("roles")}
        />
      </View>
      <Button title={createLabel} onPress={onCreate} style={{ height: 44 }} />
    </View>
  );
}
