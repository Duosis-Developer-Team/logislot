import { useState } from "react";
import { FlatList, RefreshControl, Share, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ApiError } from "@/api/client";
import {
  useFacilityMutations,
  usePlatformFacilities,
  usePlatformPlans,
  usePlatformTenants,
} from "@/api/platform";
import type { PlatformFacilityDto } from "@/api/types";
import {
  AppModal,
  Badge,
  Button,
  Card,
  Chip,
  EmptyState,
  ErrorState,
  Field,
  KeyValueRow,
  LoadingState,
  PickerField,
  SwitchRow,
} from "@/components/ui";
import { useTheme } from "@/theme/theme";
import { spacing } from "@/theme/tokens";

/** Platform — Tesis dizini + oluştur/düzenle + ilk yönetici (web platform/facilities karşılığı). */
export default function PlatformFacilities() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const facilities = usePlatformFacilities();
  const tenants = usePlatformTenants();
  const plans = usePlatformPlans();
  const { create, patch } = useFacilityMutations();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<PlatformFacilityDto | null>(null);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [timezone, setTimezone] = useState("Europe/Istanbul");
  const [planOverrideId, setPlanOverrideId] = useState<string | null>(null);
  const [bootstrap, setBootstrap] = useState(true);
  const [isActive, setIsActive] = useState(true);
  // İlk yönetici — geçici parola yanıt sonrası BİR kez gösterilir.
  const [createAdmin, setCreateAdmin] = useState(true);
  const [adminName, setAdminName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPasswordMode, setAdminPasswordMode] = useState<"auto" | "manual">("auto");
  const [adminPassword, setAdminPassword] = useState("");
  const [createdAdmin, setCreatedAdmin] = useState<{
    email: string;
    temporary_password: string;
  } | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const tenantName = (id: string) =>
    tenants.data?.find((t) => t.id === id)?.display_name ?? "—";
  const planName = (id: string | null) =>
    plans.data?.find((p) => p.id === id)?.name ?? null;
  // Yalnızca aktif planlar override olarak seçilebilir (retired/draft atanamaz).
  const assignablePlans = (plans.data ?? []).filter((p) => p.status === "active");

  function openCreate() {
    setEditing(null);
    setTenantId(null);
    setName("");
    setAddress("");
    setTimezone("Europe/Istanbul");
    setPlanOverrideId(null);
    setBootstrap(true);
    setIsActive(true);
    setCreateAdmin(true);
    setAdminName("");
    setAdminEmail("");
    setAdminPasswordMode("auto");
    setAdminPassword("");
    setFormError(null);
    setOpen(true);
  }

  function openEdit(row: PlatformFacilityDto) {
    setEditing(row);
    setTenantId(row.tenant_id);
    setName(row.name);
    setAddress(row.address ?? "");
    setTimezone(row.timezone);
    setPlanOverrideId(row.plan_override_id);
    setIsActive(row.status === "active");
    setFormError(null);
    setOpen(true);
  }

  async function onSubmit() {
    setFormError(null);
    if (!name.trim() || (!editing && !tenantId)) {
      setFormError("Tenant ve tesis adı zorunludur.");
      return;
    }
    if (!editing && createAdmin) {
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
      if (editing) {
        await patch.mutateAsync({
          id: editing.id,
          body: {
            name,
            address: address || null,
            timezone,
            status: isActive ? "active" : "inactive",
            plan_override_id: planOverrideId || null,
          },
        });
      } else {
        const created = await create.mutateAsync({
          tenantId: tenantId!,
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
        if (created.initial_admin) {
          setCreatedAdmin({
            email: created.initial_admin.email,
            temporary_password: created.initial_admin.temporary_password,
          });
        }
      }
      setOpen(false);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Kaydedilemedi");
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <FlatList
        data={facilities.data ?? []}
        keyExtractor={(f) => f.id}
        contentContainerStyle={{
          padding: spacing.lg,
          paddingTop: insets.top + spacing.md,
          gap: spacing.md,
          paddingBottom: spacing.xl * 2,
        }}
        refreshControl={
          <RefreshControl
            refreshing={facilities.isRefetching}
            onRefresh={() => void facilities.refetch()}
            tintColor={colors.accent}
          />
        }
        ListHeaderComponent={
          <View style={{ gap: spacing.md, marginBottom: spacing.sm }}>
            <Text style={{ color: colors.text, fontSize: 24, fontWeight: "800" }}>
              Tesisler
            </Text>
            <Text style={{ color: colors.mutedText, fontSize: 13 }}>
              {"Tenant'lar arası tüm tesisler (destek/operasyon görünümü)"}
            </Text>
            <Button title="Yeni Tesis" onPress={openCreate} style={{ height: 44 }} />
          </View>
        }
        renderItem={({ item }) => (
          <Card style={{ gap: 6 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
              <Text style={{ color: colors.text, fontSize: 15, fontWeight: "700", flex: 1 }}>
                {item.name}
              </Text>
              <Badge
                label={item.status === "active" ? "Aktif" : "Pasif"}
                color={
                  item.status === "active" ? colors.status.approved : colors.status.cancelled
                }
              />
            </View>
            <Text style={{ color: colors.mutedText, fontSize: 13 }}>
              {tenantName(item.tenant_id)} · {item.timezone}
            </Text>
            <Text style={{ color: colors.faintText, fontSize: 12 }}>
              Plan: {planName(item.plan_override_id) ?? "Tenant planı"}
              {item.address ? ` · ${item.address}` : ""}
            </Text>
            <Button
              title="Düzenle"
              variant="secondary"
              onPress={() => openEdit(item)}
              style={{ height: 40 }}
            />
          </Card>
        )}
        ListEmptyComponent={
          facilities.isLoading ? (
            <LoadingState />
          ) : facilities.isError ? (
            <ErrorState message="Tesisler yüklenemedi." onRetry={() => facilities.refetch()} />
          ) : (
            <EmptyState title="Tesis yok" />
          )
        }
      />

      <AppModal
        visible={open}
        onClose={() => setOpen(false)}
        title={editing ? "Tesisi Düzenle" : "Yeni Tesis"}
      >
        <View style={{ gap: spacing.md }}>
          {!editing && (
            <PickerField
              label="Tenant"
              value={tenantId}
              placeholder="— Tenant seçin —"
              options={(tenants.data ?? [])
                .filter((t) => t.status !== "archived")
                .map((t) => ({ value: t.id, label: t.display_name }))}
              onChange={setTenantId}
            />
          )}
          <Field label="Tesis Adı" value={name} onChangeText={setName} />
          <Field label="Adres" value={address} onChangeText={setAddress} placeholder="Opsiyonel" />
          <Field
            label="Saat Dilimi"
            value={timezone}
            onChangeText={setTimezone}
            autoCapitalize="none"
          />
          <PickerField
            label="Plan Override (boş = tenant planı)"
            value={planOverrideId}
            placeholder="Tenant planı"
            options={assignablePlans.map((p) => ({ value: p.id, label: p.name }))}
            onChange={(v) => setPlanOverrideId(v)}
          />

          {!editing && (
            <>
              <SwitchRow
                label="Başlangıç konfigürasyonu kur (bootstrap)"
                hint="Varsayılan rampa/rol/kategori seti ile başlar."
                value={bootstrap}
                onValueChange={setBootstrap}
              />
              <SwitchRow
                label="İlk yönetici oluştur"
                value={createAdmin}
                onValueChange={setCreateAdmin}
              />
              {createAdmin && (
                <>
                  <Field
                    label="Yönetici Adı"
                    value={adminName}
                    onChangeText={setAdminName}
                    placeholder="Ad Soyad"
                  />
                  <Field
                    label="Yönetici E-postası"
                    value={adminEmail}
                    onChangeText={setAdminEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                  />
                  <View style={{ flexDirection: "row", gap: spacing.sm }}>
                    <Chip
                      label="Otomatik parola"
                      selected={adminPasswordMode === "auto"}
                      onPress={() => setAdminPasswordMode("auto")}
                    />
                    <Chip
                      label="Manuel parola"
                      selected={adminPasswordMode === "manual"}
                      onPress={() => setAdminPasswordMode("manual")}
                    />
                  </View>
                  {adminPasswordMode === "manual" && (
                    <Field
                      label="Geçici Parola (en az 6 karakter)"
                      value={adminPassword}
                      onChangeText={setAdminPassword}
                      secureTextEntry
                      autoCapitalize="none"
                    />
                  )}
                </>
              )}
            </>
          )}

          {editing && <SwitchRow label="Aktif" value={isActive} onValueChange={setIsActive} />}
          {formError && (
            <Text style={{ color: colors.destructive, fontSize: 13 }}>{formError}</Text>
          )}
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <Button
              title="İptal"
              variant="secondary"
              onPress={() => setOpen(false)}
              style={{ flex: 1 }}
            />
            <Button
              title={create.isPending || patch.isPending ? "Kaydediliyor…" : "Kaydet"}
              loading={create.isPending || patch.isPending}
              onPress={() => void onSubmit()}
              style={{ flex: 2 }}
            />
          </View>
        </View>
      </AppModal>

      {/* Tek seferlik geçici parola paneli — kapanınca bir daha gösterilmez */}
      <AppModal
        visible={createdAdmin !== null}
        onClose={() => setCreatedAdmin(null)}
        title="İlk Yönetici Oluşturuldu"
      >
        {createdAdmin && (
          <View style={{ gap: spacing.md }}>
            <Text style={{ color: colors.status.approved, fontSize: 13 }}>
              Geçici parola YALNIZCA bir kez gösterilir. Kaydetmeden kapatmayın.
            </Text>
            <Card style={{ gap: spacing.sm }}>
              <KeyValueRow label="E-posta" value={createdAdmin.email} />
              <KeyValueRow label="Geçici Parola" value={createdAdmin.temporary_password} />
            </Card>
            <Button
              title="Paylaş / Kopyala"
              variant="secondary"
              onPress={() =>
                void Share.share({
                  message: `LogiSlot giriş bilgileri\nE-posta: ${createdAdmin.email}\nGeçici parola: ${createdAdmin.temporary_password}\nİlk girişte parola değiştirilmelidir.`,
                })
              }
            />
            <Button title="Kaydettim, kapat" onPress={() => setCreatedAdmin(null)} />
          </View>
        )}
      </AppModal>
    </View>
  );
}
