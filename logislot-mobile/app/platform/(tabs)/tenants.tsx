import { useState } from "react";
import { FlatList, RefreshControl, Share, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ApiError } from "@/api/client";
import { usePlatformPlans, usePlatformTenants, useTenantMutations } from "@/api/platform";
import type { PlatformTenantDto } from "@/api/types";
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
  SwitchRow,
} from "@/components/ui";
import { useTheme } from "@/theme/theme";
import { spacing } from "@/theme/tokens";

/**
 * Platform — Müşteri hesapları (web platform/tenants karşılığı).
 *
 * 1 tenant = 1 tesis: ayrı bir "tesis" ekranı YOKTUR. Hesap açıldığında
 * operasyonel kapsamı, varsayılan tanımları ve (istenirse) ilk yöneticisi
 * tek istekte birlikte oluşturulur.
 */

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

export default function PlatformTenants() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const tenants = usePlatformTenants();
  const plans = usePlatformPlans();
  const { save } = useTenantMutations();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<PlatformTenantDto | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [commercialName, setCommercialName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [status, setStatus] = useState("trial");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [timezone, setTimezone] = useState("Europe/Istanbul");
  const [address, setAddress] = useState("");
  const [bootstrapDefaults, setBootstrapDefaults] = useState(true);
  const [createAdmin, setCreateAdmin] = useState(true);
  const [adminName, setAdminName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [createdAdmin, setCreatedAdmin] = useState<{
    email: string;
    temporary_password: string;
  } | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const planName = (id: string | null) => plans.data?.find((p) => p.id === id)?.name ?? "—";

  const statusColor = (s: string) =>
    s === "active"
      ? colors.status.approved
      : s === "trial"
        ? colors.status.pending
        : s === "suspended"
          ? colors.status.rejected
          : colors.status.cancelled;

  function openCreate() {
    setEditing(null);
    setDisplayName("");
    setCommercialName("");
    setSlug("");
    setSlugTouched(false);
    setStatus("trial");
    setContactName("");
    setContactEmail("");
    setTimezone("Europe/Istanbul");
    setAddress("");
    setBootstrapDefaults(true);
    setCreateAdmin(true);
    setAdminName("");
    setAdminEmail("");
    setFormError(null);
    setOpen(true);
  }

  function openEdit(row: PlatformTenantDto) {
    setEditing(row);
    setDisplayName(row.display_name);
    setCommercialName(row.commercial_name);
    setSlug(row.slug);
    setSlugTouched(true);
    setStatus(row.status);
    setContactName(row.primary_contact_name ?? "");
    setContactEmail(row.primary_contact_email ?? "");
    setTimezone(row.default_timezone);
    setAddress(row.address ?? "");
    setFormError(null);
    setOpen(true);
  }

  async function onSubmit() {
    setFormError(null);
    if (!displayName.trim() || (!editing && !slug.trim())) {
      setFormError("Görünen ad ve slug zorunludur.");
      return;
    }
    if (!editing && createAdmin && (!adminName.trim() || !adminEmail.trim())) {
      setFormError("İlk yönetici için ad ve e-posta zorunludur.");
      return;
    }
    try {
      if (editing) {
        // Slug/commercial_name oluşturma sonrası değiştirilemez (kimlik alanları).
        // Ad/adres/durum tesise de yansır (backend senkron tutar).
        await save.mutateAsync({
          id: editing.id,
          body: {
            display_name: displayName,
            status,
            address: address || null,
            primary_contact_name: contactName || null,
            primary_contact_email: contactEmail || null,
          },
        });
      } else {
        const created = await save.mutateAsync({
          body: {
            commercial_name: commercialName || displayName,
            display_name: displayName,
            slug,
            status,
            address: address || null,
            primary_contact_name: contactName || null,
            primary_contact_email: contactEmail || null,
            default_timezone: timezone,
            bootstrap_defaults: bootstrapDefaults,
            initial_admin: createAdmin ? { name: adminName, email: adminEmail } : null,
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
        data={tenants.data ?? []}
        keyExtractor={(t) => t.id}
        contentContainerStyle={{
          padding: spacing.lg,
          paddingTop: insets.top + spacing.md,
          gap: spacing.md,
          paddingBottom: spacing.xl * 2,
        }}
        refreshControl={
          <RefreshControl
            refreshing={tenants.isRefetching}
            onRefresh={() => void tenants.refetch()}
            tintColor={colors.accent}
          />
        }
        ListHeaderComponent={
          <View style={{ gap: spacing.md, marginBottom: spacing.sm }}>
            <Text style={{ color: colors.text, fontSize: 24, fontWeight: "800" }}>
              Müşteri Hesapları
            </Text>
            <Text style={{ color: colors.mutedText, fontSize: 13 }}>
              {"Her hesap kendi operasyon kapsamıdır; hesap açıldığında rampa/kategori tanımları ve ilk yönetici birlikte oluşturulur."}
            </Text>
            <Button title="Yeni Hesap" onPress={openCreate} style={{ height: 44 }} />
          </View>
        }
        renderItem={({ item }) => (
          <Card style={{ gap: 6 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
              <Text style={{ color: colors.text, fontSize: 15, fontWeight: "700", flex: 1 }}>
                {item.display_name}
              </Text>
              <Badge
                label={STATUS_LABELS[item.status] ?? item.status}
                color={statusColor(item.status)}
              />
            </View>
            <Text style={{ color: colors.mutedText, fontSize: 13 }}>
              {item.commercial_name} · {item.slug}
            </Text>
            <Text style={{ color: colors.faintText, fontSize: 12 }}>
              Plan: {planName(item.assigned_plan_id)}
              {item.primary_contact_email
                ? ` · ${item.primary_contact_name ?? ""} ${item.primary_contact_email}`
                : ""}
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
          tenants.isLoading ? (
            <LoadingState />
          ) : tenants.isError ? (
            <ErrorState message="Müşteri hesapları yüklenemedi." onRetry={() => tenants.refetch()} />
          ) : (
            <EmptyState title="Müşteri hesabı yok" />
          )
        }
      />

      <AppModal
        visible={open}
        onClose={() => setOpen(false)}
        title={editing ? "Hesabı Düzenle" : "Yeni Müşteri Hesabı"}
      >
        <View style={{ gap: spacing.md }}>
          <Field
            label="Görünen Ad"
            value={displayName}
            onChangeText={(t) => {
              setDisplayName(t);
              if (!slugTouched && !editing) setSlug(slugify(t));
            }}
            placeholder="Örn. Pilot Gıda"
          />
          {!editing && (
            <>
              <Field
                label="Ticari Unvan"
                value={commercialName}
                onChangeText={setCommercialName}
                placeholder="Boş bırakılırsa görünen ad kullanılır"
              />
              <Field
                label="Slug (sonradan değiştirilemez)"
                value={slug}
                onChangeText={(t) => {
                  setSlugTouched(true);
                  setSlug(slugify(t));
                }}
                placeholder="pilot-gida"
                autoCapitalize="none"
              />
              <Field
                label="Varsayılan Saat Dilimi"
                value={timezone}
                onChangeText={setTimezone}
                autoCapitalize="none"
              />
            </>
          )}
          <View style={{ gap: 6 }}>
            <Text style={{ color: colors.text, fontSize: 14, fontWeight: "500" }}>Durum</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {Object.entries(STATUS_LABELS).map(([value, label]) => (
                <Chip
                  key={value}
                  label={label}
                  selected={status === value}
                  onPress={() => setStatus(value)}
                />
              ))}
            </View>
            {status === "archived" && (
              <Text style={{ color: colors.status.cancelled, fontSize: 12 }}>
                {"Arşivlenmiş hesapta operasyon durdurulur."}
              </Text>
            )}
          </View>
          <View style={{ flexDirection: "row", gap: spacing.md }}>
            <View style={{ flex: 1 }}>
              <Field
                label="İletişim Adı"
                value={contactName}
                onChangeText={setContactName}
                placeholder="Opsiyonel"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Field
                label="İletişim E-postası"
                value={contactEmail}
                onChangeText={setContactEmail}
                placeholder="Opsiyonel"
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>
          </View>
          <Field
            label="Adres"
            value={address}
            onChangeText={setAddress}
            placeholder="Opsiyonel — operasyon adresi"
          />
          {!editing && (
            <Card style={{ gap: spacing.sm }}>
              <Text style={{ color: colors.text, fontSize: 14, fontWeight: "600" }}>Kurulum</Text>
              <SwitchRow
                label="Varsayılan tanımlar"
                hint="Araç/ürün kategorileri, örnek rampa ve roller otomatik oluşturulur."
                value={bootstrapDefaults}
                onValueChange={setBootstrapDefaults}
              />
              <SwitchRow
                label="İlk yönetici oluştur"
                hint="Geçici parola üretilir ve yalnızca bir kez gösterilir."
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
                    placeholder="yonetici@firma.com"
                    keyboardType="email-address"
                    autoCapitalize="none"
                  />
                </>
              )}
            </Card>
          )}
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
              title={save.isPending ? "Kaydediliyor…" : "Kaydet"}
              loading={save.isPending}
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
