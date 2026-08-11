/** Tedarikçi yönetimi — web (admin)/admin/settings/suppliers karşılığı.
 *  CRUD + portal hesabı (oluştur / parola sıfırla / aktif-pasif). */

import { useState } from "react";
import { Alert, Text, View } from "react-native";
import { ApiError } from "@/api/client";
import {
  productCategories,
  suppliers,
  useSupplierAccountActions,
} from "@/api/resources";
import type { SupplierDto } from "@/api/types";
import { useSession } from "@/auth/session";
import { ActiveBadge, ConfigList, MultiSelectField } from "@/components/config";
import {
  AppModal,
  Badge,
  Button,
  Card,
  Field,
  KeyValueRow,
  SectionTitle,
  SwitchRow,
} from "@/components/ui";
import { useTheme } from "@/theme/theme";
import { spacing } from "@/theme/tokens";

const numOrNull = (v: string) => {
  const n = parseInt(v, 10);
  return Number.isInteger(n) && n >= 0 ? n : null;
};

export default function SuppliersScreen() {
  const { colors } = useTheme();
  const session = useSession();
  const facilityId = session.activeFacilityId;
  const list = suppliers.useList(facilityId);
  const categories = productCategories.useList(facilityId);
  const save = suppliers.useSave(facilityId);
  const deactivate = suppliers.useDeactivate(facilityId);
  const account = useSupplierAccountActions(facilityId);

  const [editing, setEditing] = useState<SupplierDto | null>(null);
  const [open, setOpen] = useState(false);
  const [companyName, setCompanyName] = useState("");
  const [code, setCode] = useState("");
  const [categoryLabel, setCategoryLabel] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [minBlock, setMinBlock] = useState("");
  const [maxBlock, setMaxBlock] = useState("");
  const [weeklyQuota, setWeeklyQuota] = useState("");
  const [monthlyQuota, setMonthlyQuota] = useState("");
  const [notes, setNotes] = useState("");
  const [allowedCategories, setAllowedCategories] = useState<string[]>([]);
  const [autoApprove, setAutoApprove] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [createAccount, setCreateAccount] = useState(true);
  const [accountActive, setAccountActive] = useState(true);
  const [accountEmail, setAccountEmail] = useState("");
  const [accountPassword, setAccountPassword] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  function openCreate() {
    setEditing(null);
    setCompanyName("");
    setCode("");
    setCategoryLabel("");
    setContactName("");
    setContactEmail("");
    setContactPhone("");
    setMinBlock("");
    setMaxBlock("");
    setWeeklyQuota("");
    setMonthlyQuota("");
    setNotes("");
    setAllowedCategories([]);
    setAutoApprove(false);
    setIsActive(true);
    setCreateAccount(true);
    setAccountEmail("");
    setAccountPassword("");
    setFormError(null);
    setOpen(true);
  }

  function openEdit(row: SupplierDto) {
    setEditing(row);
    setCompanyName(row.company_name);
    setCode(row.code);
    setCategoryLabel(row.category_label ?? "");
    setContactName(row.contact_name ?? "");
    setContactEmail(row.contact_email ?? "");
    setContactPhone(row.contact_phone ?? "");
    setMinBlock(row.min_block_minutes != null ? String(row.min_block_minutes) : "");
    setMaxBlock(row.max_block_minutes != null ? String(row.max_block_minutes) : "");
    setWeeklyQuota(row.weekly_quota != null ? String(row.weekly_quota) : "");
    setMonthlyQuota(row.monthly_quota != null ? String(row.monthly_quota) : "");
    setNotes(row.notes ?? "");
    setAllowedCategories(row.allowed_product_category_ids);
    setAutoApprove(row.auto_approval_enabled);
    setIsActive(row.is_active);
    setAccountActive(row.account_active ?? true);
    setAccountEmail(row.account_email ?? "");
    setAccountPassword("");
    setFormError(null);
    setOpen(true);
  }

  async function onSubmit() {
    setFormError(null);
    if (!companyName.trim() || !code.trim()) {
      setFormError("Firma adı ve tedarikçi kodu zorunludur.");
      return;
    }
    const min = numOrNull(minBlock);
    const max = numOrNull(maxBlock);
    // Backend ile aynı sınır: app/schemas/config.py -> MAX_BLOCK_MINUTES_CAP
    if ((min !== null && min > 1440) || (max !== null && max > 1440)) {
      setFormError("Blokaj süreleri en fazla 1440 dk (24 saat) olabilir.");
      return;
    }
    if (min !== null && max !== null && max < min) {
      setFormError("Maks. süre, min. süreden küçük olamaz.");
      return;
    }
    const base = {
      company_name: companyName,
      code,
      category_label: categoryLabel || null,
      contact_name: contactName || null,
      contact_email: contactEmail || null,
      contact_phone: contactPhone || null,
      allowed_product_category_ids: allowedCategories,
      min_block_minutes: min,
      max_block_minutes: max,
      weekly_quota: numOrNull(weeklyQuota),
      monthly_quota: numOrNull(monthlyQuota),
      auto_approval_enabled: autoApprove,
      is_active: isActive,
      notes: notes || null,
    };
    try {
      if (editing) {
        await save.mutateAsync({ id: editing.id, body: base });
      } else {
        await save.mutateAsync({
          body: {
            ...base,
            create_account: createAccount,
            account_email: accountEmail || null,
            account_password: accountPassword || null,
          },
        });
      }
      setOpen(false);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Kaydedilemedi");
    }
  }

  async function onResetPassword() {
    if (!editing) return;
    if (!accountPassword || accountPassword.length < 6) {
      setFormError("Şifre sıfırlamak için en az 6 karakterli yeni parola girin.");
      return;
    }
    try {
      await account.resetPassword.mutateAsync({ id: editing.id, password: accountPassword });
      setAccountPassword("");
      setFormError(null);
      Alert.alert("Tamamlandı", "Portal parolası sıfırlandı.");
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Sıfırlama başarısız");
    }
  }

  async function onToggleAccount(next: boolean) {
    if (!editing) {
      setAccountActive(next);
      return;
    }
    try {
      await account.setAccountStatus.mutateAsync({ id: editing.id, isActive: next });
      setAccountActive(next);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "İşlem başarısız");
    }
  }

  function onDeactivate(row: SupplierDto) {
    Alert.alert(
      "Tedarikçiyi pasifleştir",
      `"${row.company_name}" pasifleştirilecek. Portal girişi ve yeni randevu oluşturma engellenir; geçmiş randevular korunur.`,
      [
        { text: "Vazgeç", style: "cancel" },
        {
          text: "Pasifleştir",
          style: "destructive",
          onPress: () =>
            deactivate.mutate(row.id, {
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

  const categoryName = (id: string) =>
    categories.data?.find((c) => c.id === id)?.display_name ?? "?";

  return (
    <>
      <ConfigList
        query={list}
        createLabel="Yeni Tedarikçi"
        onCreate={openCreate}
        description="Tedarikçi yalnızca kendisine izinli kategorilerden randevu oluşturabilir; kota ve süre limitleri rule engine tarafından uygulanır."
        searchText={(r) =>
          `${r.company_name} ${r.code} ${r.contact_name ?? ""} ${r.contact_email ?? ""}`
        }
        keyExtractor={(r) => r.id}
        emptyTitle="Tedarikçi yok"
        emptyDescription="Tedarikçi oluşturduğunuzda portal hesabı da otomatik açılabilir; tedarikçi kendi telefonundan randevu talep eder."
        renderItem={(row) => (
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
                  {row.company_name}
                </Text>
                <Text style={{ color: colors.mutedText, fontSize: 12 }}>
                  {row.code}
                  {row.contact_name ? ` · ${row.contact_name}` : ""}
                </Text>
              </View>
              <ActiveBadge active={row.is_active} />
            </View>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4 }}>
              <Badge
                label={row.auto_approval_enabled ? "Otomatik onay" : "Manuel onay"}
                color={row.auto_approval_enabled ? colors.status.approved : colors.mutedText}
              />
              {row.account_email ? (
                <Badge
                  label={row.account_active ? "Aktif hesap" : "Pasif hesap"}
                  color={row.account_active ? colors.status.approved : colors.status.cancelled}
                />
              ) : (
                <Badge label="Hesap yok" color={colors.mutedText} />
              )}
              {row.allowed_product_category_ids.map((id) => (
                <Badge key={id} label={categoryName(id)} color={colors.accent} />
              ))}
            </View>
            <KeyValueRow
              label="Süre / Kota"
              value={`${row.min_block_minutes ?? "—"}–${row.max_block_minutes ?? "—"} dk · ${
                row.weekly_quota ?? "∞"
              }/hafta · ${row.monthly_quota ?? "∞"}/ay`}
            />
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              <Button
                title="Düzenle"
                variant="secondary"
                onPress={() => openEdit(row)}
                style={{ flex: 1, height: 40 }}
              />
              {row.is_active && (
                <Button
                  title="Pasifleştir"
                  variant="ghost"
                  onPress={() => onDeactivate(row)}
                  style={{ flex: 1, height: 40 }}
                />
              )}
            </View>
          </Card>
        )}
      />

      <AppModal
        visible={open}
        onClose={() => setOpen(false)}
        title={editing ? "Tedarikçiyi Düzenle" : "Yeni Tedarikçi"}
      >
        <View style={{ gap: spacing.md }}>
          <SectionTitle title="Firma" />
          <Field label="Firma Adı" value={companyName} onChangeText={setCompanyName} />
          <View style={{ flexDirection: "row", gap: spacing.md }}>
            <View style={{ flex: 1 }}>
              <Field label="Tedarikçi Kodu" value={code} onChangeText={setCode} placeholder="SUP-004" autoCapitalize="characters" />
            </View>
            <View style={{ flex: 1 }}>
              <Field label="Etiket" value={categoryLabel} onChangeText={setCategoryLabel} placeholder="Hammadde" />
            </View>
          </View>
          <View style={{ flexDirection: "row", gap: spacing.md }}>
            <View style={{ flex: 1 }}>
              <Field label="İletişim Kişisi" value={contactName} onChangeText={setContactName} />
            </View>
            <View style={{ flex: 1 }}>
              <Field label="Telefon" value={contactPhone} onChangeText={setContactPhone} keyboardType="phone-pad" />
            </View>
          </View>
          <Field
            label="İletişim E-postası"
            value={contactEmail}
            onChangeText={setContactEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />

          <SectionTitle title="İzinler / Kategoriler" />
          <MultiSelectField
            options={(categories.data ?? [])
              .filter((c) => c.is_active)
              .map((c) => ({ value: c.id, label: c.display_name }))}
            value={allowedCategories}
            onChange={setAllowedCategories}
            searchPlaceholder="Ürün kategorisi ara…"
            emptyHint="Bu tedarikçi yalnızca seçili kategorilerden randevu oluşturabilir."
          />
          <SwitchRow
            label="Otomatik onay"
            hint="Talepler beklemeden onaylanır."
            value={autoApprove}
            onValueChange={setAutoApprove}
          />

          <SectionTitle title="Blokaj & Kota" />
          <View style={{ flexDirection: "row", gap: spacing.md }}>
            <View style={{ flex: 1 }}>
              <Field label="Min. Süre (dk)" value={minBlock} onChangeText={setMinBlock} keyboardType="number-pad" />
            </View>
            <View style={{ flex: 1 }}>
              <Field label="Maks. Süre (dk)" value={maxBlock} onChangeText={setMaxBlock} keyboardType="number-pad" />
            </View>
          </View>
          <View style={{ flexDirection: "row", gap: spacing.md }}>
            <View style={{ flex: 1 }}>
              <Field label="Haftalık Kota" value={weeklyQuota} onChangeText={setWeeklyQuota} keyboardType="number-pad" />
            </View>
            <View style={{ flex: 1 }}>
              <Field label="Aylık Kota" value={monthlyQuota} onChangeText={setMonthlyQuota} keyboardType="number-pad" />
            </View>
          </View>
          <Text style={{ color: colors.faintText, fontSize: 12 }}>
            Boş bırakılan limitler uygulanmaz. Bu ayarlar randevu uygunluğunu etkiler.
          </Text>

          <SectionTitle title="Portal Hesabı" />
          {editing ? (
            editing.account_email ? (
              <View style={{ gap: spacing.sm }}>
                <KeyValueRow label="Giriş e-postası" value={editing.account_email} />
                <SwitchRow
                  label="Hesap aktif"
                  value={accountActive}
                  onValueChange={(v) => void onToggleAccount(v)}
                />
                <Field
                  label="Yeni Parola (en az 6 karakter)"
                  value={accountPassword}
                  onChangeText={setAccountPassword}
                  secureTextEntry
                  autoCapitalize="none"
                />
                <Button
                  title={account.resetPassword.isPending ? "Sıfırlanıyor…" : "Parolayı Sıfırla"}
                  variant="secondary"
                  loading={account.resetPassword.isPending}
                  onPress={() => void onResetPassword()}
                  style={{ height: 44 }}
                />
              </View>
            ) : (
              <Text style={{ color: colors.mutedText, fontSize: 13 }}>
                Bu tedarikçinin portal hesabı yok.
              </Text>
            )
          ) : (
            <View style={{ gap: spacing.sm }}>
              <SwitchRow
                label="Portal hesabı oluştur"
                value={createAccount}
                onValueChange={setCreateAccount}
              />
              {createAccount && (
                <>
                  <Field
                    label="Giriş E-postası"
                    value={accountEmail}
                    onChangeText={setAccountEmail}
                    placeholder="Boşsa iletişim e-postası kullanılır"
                    keyboardType="email-address"
                    autoCapitalize="none"
                  />
                  <Field
                    label="Geçici Parola"
                    value={accountPassword}
                    onChangeText={setAccountPassword}
                    placeholder="Boşsa Demo123! atanır (yalnızca demo)"
                    secureTextEntry
                    autoCapitalize="none"
                  />
                </>
              )}
            </View>
          )}

          <SectionTitle title="Notlar" />
          <Field value={notes} onChangeText={setNotes} placeholder="Opsiyonel iç not" />

          {editing && (
            <SwitchRow
              label="Tedarikçi aktif"
              hint={
                isActive
                  ? undefined
                  : "Pasif tedarikçi portala giriş yapamaz ve yeni randevu oluşturamaz; geçmiş randevuları korunur."
              }
              value={isActive}
              onValueChange={setIsActive}
            />
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
    </>
  );
}
