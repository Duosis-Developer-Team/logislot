"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { BadgeCheck, KeyRound, Package } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { ConfirmDialog } from "@/components/config/confirm-dialog";
import { MultiSelectField } from "@/components/config/multi-select";
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
import { Input, Label } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { ApiError } from "@/lib/api/client";
import {
  productCategories,
  suppliers,
  useSupplierAccountActions,
} from "@/lib/api/resources";
import type { SupplierDto } from "@/lib/api/types";
import { useSession } from "@/lib/auth/session";

const formSchema = z
  .object({
    company_name: z.string().min(1, "Firma adı zorunlu"),
    code: z.string().min(1, "Kod zorunlu"),
    category_label: z.string().optional(),
    contact_name: z.string().optional(),
    contact_email: z.string().email("Geçerli e-posta girin").or(z.literal("")),
    contact_phone: z.string().optional(),
    // Backend ile ayni sinir: app/schemas/config.py -> MAX_BLOCK_MINUTES_CAP
    min_block_minutes: z.coerce
      .number()
      .int()
      .positive()
      .max(1440, "En fazla 1440 dk (24 saat)")
      .optional()
      .or(z.literal("")),
    max_block_minutes: z.coerce
      .number()
      .int()
      .positive()
      .max(1440, "En fazla 1440 dk (24 saat)")
      .optional()
      .or(z.literal("")),
    weekly_quota: z.coerce.number().int().min(0).optional().or(z.literal("")),
    monthly_quota: z.coerce.number().int().min(0).optional().or(z.literal("")),
    notes: z.string().optional(),
    account_email: z.string().email("Geçerli e-posta girin").or(z.literal("")),
    account_password: z
      .string()
      .min(6, "En az 6 karakter")
      .or(z.literal("")),
  })
  .superRefine((values, ctx) => {
    const min = values.min_block_minutes;
    const max = values.max_block_minutes;
    if (typeof min === "number" && typeof max === "number" && max < min) {
      ctx.addIssue({
        code: "custom",
        path: ["max_block_minutes"],
        message: "Maks, min'den küçük olamaz",
      });
    }
  });

type FormValues = z.infer<typeof formSchema>;

const num = (v: number | "" | undefined) => (typeof v === "number" ? v : null);

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      {children}
    </div>
  );
}

export default function SuppliersPage() {
  const { activeFacilityId } = useSession();
  const list = suppliers.useList(activeFacilityId);
  const categories = productCategories.useList(activeFacilityId);
  const save = suppliers.useSave(activeFacilityId);
  const deactivate = suppliers.useDeactivate(activeFacilityId);
  const account = useSupplierAccountActions(activeFacilityId);
  const { flash, showFlash } = useFlash();

  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>("all");
  const [drawer, setDrawer] = useState<{ open: boolean; editing: SupplierDto | null }>({
    open: false,
    editing: null,
  });
  const [confirmTarget, setConfirmTarget] = useState<SupplierDto | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const [allowedCategories, setAllowedCategories] = useState<string[]>([]);
  const [autoApprove, setAutoApprove] = useState(false);
  const [cargoEnabled, setCargoEnabled] = useState(false);
  const [editActive, setEditActive] = useState(true);
  const [createAccount, setCreateAccount] = useState(true);
  const [accountActive, setAccountActive] = useState(true);

  const form = useForm<FormValues>({ resolver: zodResolver(formSchema) });

  function openCreate() {
    form.reset({
      company_name: "", code: "", category_label: "", contact_name: "",
      contact_email: "", contact_phone: "", min_block_minutes: "",
      max_block_minutes: "", weekly_quota: "", monthly_quota: "",
      notes: "", account_email: "", account_password: "",
    });
    setAllowedCategories([]);
    setAutoApprove(false);
    setCargoEnabled(false);
    setEditActive(true);
    setCreateAccount(true);
    setFormError(null);
    setDrawer({ open: true, editing: null });
  }

  function openEdit(row: SupplierDto) {
    form.reset({
      company_name: row.company_name,
      code: row.code,
      category_label: row.category_label ?? "",
      contact_name: row.contact_name ?? "",
      contact_email: row.contact_email ?? "",
      contact_phone: row.contact_phone ?? "",
      min_block_minutes: row.min_block_minutes ?? "",
      max_block_minutes: row.max_block_minutes ?? "",
      weekly_quota: row.weekly_quota ?? "",
      monthly_quota: row.monthly_quota ?? "",
      notes: row.notes ?? "",
      account_email: row.account_email ?? "",
      account_password: "",
    });
    setAllowedCategories(row.allowed_product_category_ids);
    setAutoApprove(row.auto_approval_enabled);
    setCargoEnabled(row.cargo_enabled);
    setEditActive(row.is_active);
    setAccountActive(row.account_active ?? true);
    setFormError(null);
    setDrawer({ open: true, editing: row });
  }

  async function onSubmit(values: FormValues) {
    setFormError(null);
    const base = {
      company_name: values.company_name,
      code: values.code,
      category_label: values.category_label || null,
      contact_name: values.contact_name || null,
      contact_email: values.contact_email || null,
      contact_phone: values.contact_phone || null,
      allowed_product_category_ids: allowedCategories,
      min_block_minutes: num(values.min_block_minutes),
      max_block_minutes: num(values.max_block_minutes),
      weekly_quota: num(values.weekly_quota),
      monthly_quota: num(values.monthly_quota),
      auto_approval_enabled: autoApprove,
      cargo_enabled: cargoEnabled,
      is_active: editActive,
      notes: values.notes || null,
    };
    try {
      if (drawer.editing) {
        await save.mutateAsync({ id: drawer.editing.id, body: base });
        showFlash("success", "Tedarikçi güncellendi.");
      } else {
        // Yanit, hesap acildiysa account_password tasir: parola alani bos
        // birakildiginda sunucu rastgele uretir (sabit varsayilan YOK) ve deger
        // bir daha gosterilemez, bu yuzden yoneticiye burada gosterilir.
        const created = (await save.mutateAsync({
          body: {
            ...base,
            create_account: createAccount,
            account_email: values.account_email || null,
            account_password: values.account_password || null,
          },
        })) as SupplierDto & { account_password?: string };
        showFlash(
          "success",
          createAccount
            ? `Tedarikçi ve portal hesabı oluşturuldu. Geçici parola: ${created.account_password ?? values.account_password}`
            : "Tedarikçi oluşturuldu (hesapsız).",
        );
      }
      setDrawer({ open: false, editing: null });
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Kaydedilemedi");
    }
  }

  async function onResetPassword() {
    if (!drawer.editing) return;
    const password = form.getValues("account_password");
    if (!password || password.length < 6) {
      setFormError("Şifre sıfırlamak için en az 6 karakterli yeni parola girin.");
      return;
    }
    try {
      await account.resetPassword.mutateAsync({ id: drawer.editing.id, password });
      showFlash("success", "Portal parolası sıfırlandı.");
      form.setValue("account_password", "");
      setFormError(null);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Sıfırlama başarısız");
    }
  }

  async function onToggleAccount(next: boolean) {
    if (!drawer.editing) {
      setAccountActive(next);
      return;
    }
    try {
      await account.setAccountStatus.mutateAsync({ id: drawer.editing.id, isActive: next });
      setAccountActive(next);
      showFlash("success", next ? "Portal hesabı aktifleştirildi." : "Portal hesabı pasifleştirildi.");
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "İşlem başarısız");
    }
  }

  async function onDeactivate() {
    if (!confirmTarget) return;
    try {
      await deactivate.mutateAsync(confirmTarget.id);
      showFlash("success", `"${confirmTarget.company_name}" pasifleştirildi; artık giriş yapamaz ve randevu oluşturamaz.`);
    } catch (err) {
      showFlash("error", err instanceof ApiError ? err.message : "İşlem başarısız");
    } finally {
      setConfirmTarget(null);
    }
  }

  const categoryName = (id: string) =>
    categories.data?.find((c) => c.id === id)?.display_name ?? "?";

  const rows = filterRows(
    list.data ?? [],
    search,
    activeFilter,
    (r) => `${r.company_name} ${r.code} ${r.contact_name ?? ""} ${r.contact_email ?? ""}`,
  );

  return (
    <ConfigPageShell
      title="Tedarikçiler"
      description="Tedarikçi yalnızca kendisine izinli kategorilerden randevu oluşturabilir; kota ve süre limitleri rule engine tarafından uygulanır."
      createLabel="Yeni Tedarikçi"
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
        <ErrorState message="Tedarikçiler yüklenemedi." onRetry={() => list.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState
          title="Tedarikçi yok"
          description="Tedarikçi oluşturduğunuzda portal hesabı da otomatik açılabilir; tedarikçi kendi telefonundan randevu talep eder."
          actionLabel="İlk tedarikçiyi oluştur"
          onAction={openCreate}
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Firma</TH>
              <TH>İletişim</TH>
              <TH>İzinli Kategoriler</TH>
              <TH>Teslimat</TH>
              <TH>Süre / Kota</TH>
              <TH>Onay</TH>
              <TH>Hesap</TH>
              <TH>Durum</TH>
              <TH className="text-right">İşlem</TH>
            </TR>
          </THead>
          <TBody>
            {rows.map((row) => (
              <TR key={row.id}>
                <TD>
                  <div className="font-medium">{row.company_name}</div>
                  <div className="font-mono text-xs text-muted-foreground">{row.code}</div>
                </TD>
                <TD>
                  <div className="text-sm">{row.contact_name ?? "—"}</div>
                  <div className="text-xs text-muted-foreground">{row.contact_email}</div>
                </TD>
                <TD>
                  <div className="flex max-w-52 flex-wrap gap-1">
                    {row.allowed_product_category_ids.map((id) => (
                      <Badge key={id} className="bg-primary/10 text-primary">
                        {categoryName(id)}
                      </Badge>
                    ))}
                  </div>
                </TD>
                <TD>
                  <div className="flex flex-wrap gap-1">
                    <Badge className="bg-muted text-muted-foreground">Standart</Badge>
                    {row.cargo_enabled && (
                      <Badge className="bg-cargo/15 text-cargo">
                        <Package className="h-3 w-3" /> Kargo
                      </Badge>
                    )}
                  </div>
                </TD>
                <TD className="whitespace-nowrap text-xs text-muted-foreground">
                  {row.min_block_minutes ?? "—"}–{row.max_block_minutes ?? "—"} dk
                  <br />
                  {row.weekly_quota ?? "∞"}/hafta · {row.monthly_quota ?? "∞"}/ay
                </TD>
                <TD>
                  {row.auto_approval_enabled ? (
                    <Badge className="bg-status-approved/15 text-status-approved">
                      <BadgeCheck className="h-3 w-3" /> Otomatik
                    </Badge>
                  ) : (
                    <Badge className="bg-muted text-muted-foreground">Manuel</Badge>
                  )}
                </TD>
                <TD>
                  {row.account_email ? (
                    <div className="text-xs">
                      <div className="max-w-40 truncate">{row.account_email}</div>
                      <span
                        className={
                          row.account_active
                            ? "text-status-approved"
                            : "text-status-cancelled"
                        }
                      >
                        {row.account_active ? "Aktif hesap" : "Pasif hesap"}
                      </span>
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">Hesap yok</span>
                  )}
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
        title={drawer.editing ? "Tedarikçiyi Düzenle" : "Yeni Tedarikçi"}
        className="max-w-xl"
      >
        <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <Section title="Firma">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label>Firma Adı</Label>
                <Input {...form.register("company_name")} />
                {form.formState.errors.company_name && (
                  <p className="mt-1 text-xs text-destructive">
                    {form.formState.errors.company_name.message}
                  </p>
                )}
              </div>
              <div>
                <Label>Tedarikçi Kodu</Label>
                <Input {...form.register("code")} placeholder="SUP-004" />
                {form.formState.errors.code && (
                  <p className="mt-1 text-xs text-destructive">
                    {form.formState.errors.code.message}
                  </p>
                )}
              </div>
              <div>
                <Label>Etiket</Label>
                <Input {...form.register("category_label")} placeholder="Hammadde" />
              </div>
              <div>
                <Label>İletişim Kişisi</Label>
                <Input {...form.register("contact_name")} />
              </div>
              <div>
                <Label>Telefon</Label>
                <Input {...form.register("contact_phone")} />
              </div>
              <div className="col-span-2">
                <Label>İletişim E-postası</Label>
                <Input type="email" {...form.register("contact_email")} />
                {form.formState.errors.contact_email && (
                  <p className="mt-1 text-xs text-destructive">
                    {form.formState.errors.contact_email.message}
                  </p>
                )}
              </div>
            </div>
          </Section>

          <Section title="İzinler / Kategoriler">
            <MultiSelectField
              options={(categories.data ?? [])
                .filter((c) => c.is_active)
                .map((c) => ({ value: c.id, label: c.display_name }))}
              value={allowedCategories}
              onChange={setAllowedCategories}
              searchPlaceholder="Ürün kategorisi ara…"
            />
            <p className="text-xs text-muted-foreground">
              Bu tedarikçi yalnızca seçili kategorilerden randevu oluşturabilir.
            </p>
            <Switch
              checked={autoApprove}
              onChange={setAutoApprove}
              label="Otomatik onay — talepler beklemeden onaylanır"
            />
          </Section>

          <Section title="Teslimat Tipleri">
            <div className="flex items-center gap-2 text-sm">
              <Badge className="bg-muted text-muted-foreground">Standart</Badge>
              <span className="text-xs text-muted-foreground">
                her tedarikçide açıktır, kapatılamaz.
              </span>
            </div>
            <Switch
              checked={cargoEnabled}
              onChange={setCargoEnabled}
              label="Kargo teslimatı — varış saati belirsiz gönderiler"
            />
            <p className="text-xs text-muted-foreground">
              Kapalıyken tedarikçi portalında &quot;Kargo&quot; seçeneği hiç görünmez; tedarikçi
              yalnızca standart randevu oluşturabilir. Mevcut kargo randevuları etkilenmez.
            </p>
          </Section>

          <Section title="Blokaj & Kota">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Min. Süre (dk)</Label>
                <Input type="number" min={1} {...form.register("min_block_minutes")} />
              </div>
              <div>
                <Label>Maks. Süre (dk)</Label>
                <Input type="number" min={1} {...form.register("max_block_minutes")} />
                {form.formState.errors.max_block_minutes && (
                  <p className="mt-1 text-xs text-destructive">
                    {form.formState.errors.max_block_minutes.message}
                  </p>
                )}
              </div>
              <div>
                <Label>Haftalık Kota</Label>
                <Input type="number" min={0} {...form.register("weekly_quota")} />
              </div>
              <div>
                <Label>Aylık Kota</Label>
                <Input type="number" min={0} {...form.register("monthly_quota")} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Boş bırakılan limitler uygulanmaz. Bu ayarlar randevu uygunluğunu etkiler.
            </p>
          </Section>

          <Section title="Portal Hesabı">
            {drawer.editing ? (
              drawer.editing.account_email ? (
                <div className="flex flex-col gap-3">
                  <div className="text-sm">
                    Giriş e-postası:{" "}
                    <span className="font-mono">{drawer.editing.account_email}</span>
                  </div>
                  <Switch
                    checked={accountActive}
                    onChange={onToggleAccount}
                    label="Hesap aktif"
                  />
                  <div className="flex items-end gap-2">
                    <div className="flex-1">
                      <Label>Yeni Parola</Label>
                      <Input
                        type="password"
                        placeholder="En az 6 karakter"
                        {...form.register("account_password")}
                      />
                    </div>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={onResetPassword}
                      disabled={account.resetPassword.isPending}
                    >
                      <KeyRound className="h-4 w-4" /> Sıfırla
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Bu tedarikçinin portal hesabı yok.
                </p>
              )
            ) : (
              <div className="flex flex-col gap-3">
                <Switch
                  checked={createAccount}
                  onChange={setCreateAccount}
                  label="Portal hesabı oluştur"
                />
                {createAccount && (
                  <>
                    <div>
                      <Label>Giriş E-postası</Label>
                      <Input
                        type="email"
                        placeholder="Boşsa iletişim e-postası kullanılır"
                        {...form.register("account_email")}
                      />
                    </div>
                    <div>
                      <Label>Geçici Parola</Label>
                      <Input
                        type="password"
                        placeholder="Boşsa rastgele üretilir"
                        {...form.register("account_password")}
                      />
                    </div>
                  </>
                )}
              </div>
            )}
          </Section>

          <Section title="Notlar">
            <Input {...form.register("notes")} placeholder="Opsiyonel iç not" />
          </Section>

          {drawer.editing && (
            <Switch checked={editActive} onChange={setEditActive} label="Tedarikçi aktif" />
          )}
          {!editActive && (
            <p className="rounded-md bg-status-rejected/10 px-3 py-2 text-xs text-status-rejected">
              Pasif tedarikçi portala giriş yapamaz ve yeni randevu oluşturamaz; geçmiş
              randevuları korunur.
            </p>
          )}

          {formError && <p className="text-sm text-destructive">{formError}</p>}
          <div className="flex justify-end gap-2">
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
        title="Tedarikçiyi pasifleştir"
        message={`"${confirmTarget?.company_name}" pasifleştirilecek. Portal girişi ve yeni randevu oluşturma engellenir; geçmiş randevular korunur.`}
        loading={deactivate.isPending}
        onConfirm={onDeactivate}
        onClose={() => setConfirmTarget(null)}
      />
    </ConfigPageShell>
  );
}
