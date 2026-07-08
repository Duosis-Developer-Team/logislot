"use client";

import { useEffect, useState } from "react";
import { ConfirmDialog } from "@/components/config/confirm-dialog";
import { useFlash } from "@/components/config/page-shell";
import { ErrorState, LoadingState } from "@/components/config/states";
import { StatusBadge } from "@/components/domain/status-badge";
import { CargoBadge } from "@/components/domain/cargo-badge";
import { hexToHslTriplet } from "@/components/domain/apply-branding";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/input";
import { ApiError } from "@/lib/api/client";
import { DEFAULT_BRANDING, useBranding, useBrandingMutations } from "@/lib/api/branding";
import { useSession } from "@/lib/auth/session";
import { cn } from "@/lib/utils";

const HEX = /^#[0-9a-fA-F]{6}$/;

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const valid = HEX.test(value);
  return (
    <div>
      <Label>{label}</Label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={valid ? value : "#000000"}
          onChange={(e) => onChange(e.target.value)}
          className="h-10 w-12 cursor-pointer rounded-lg border border-border bg-card p-1"
          aria-label={`${label} renk seçici`}
        />
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="#2563EB"
          className="font-mono"
        />
      </div>
      {!valid && value && (
        <p className="mt-1 text-xs text-destructive">#RRGGBB formatında olmalı</p>
      )}
    </div>
  );
}

export default function BrandingPage() {
  const { activeFacilityId, activeFacility } = useSession();
  const branding = useBranding(activeFacilityId);
  const mutations = useBrandingMutations(activeFacilityId);
  const { flash, showFlash } = useFlash();

  const [brandName, setBrandName] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [primary, setPrimary] = useState(DEFAULT_BRANDING.primary_color);
  const [accent, setAccent] = useState(DEFAULT_BRANDING.accent_color);
  const [sidebar, setSidebar] = useState("");
  const [headerStyle, setHeaderStyle] = useState<"light" | "dark">("light");
  const [footerText, setFooterText] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    if (branding.data) {
      setBrandName(branding.data.brand_name);
      setLogoUrl(branding.data.logo_url ?? "");
      setPrimary(branding.data.primary_color);
      setAccent(branding.data.accent_color);
      setSidebar(branding.data.sidebar_color ?? "");
      setHeaderStyle(branding.data.portal_header_style);
      setFooterText(branding.data.custom_footer_text ?? "");
    }
  }, [branding.data]);

  async function onSave() {
    setFormError(null);
    for (const [label, value] of [
      ["Ana renk", primary],
      ["Vurgu rengi", accent],
    ] as const) {
      if (!HEX.test(value)) {
        setFormError(`${label} #RRGGBB formatında olmalı.`);
        return;
      }
    }
    if (sidebar && !HEX.test(sidebar)) {
      setFormError("Kenar çubuğu rengi #RRGGBB formatında olmalı.");
      return;
    }
    try {
      await mutations.save.mutateAsync({
        brand_name: brandName || "LogiSlot",
        logo_url: logoUrl || null,
        primary_color: primary,
        accent_color: accent,
        sidebar_color: sidebar || null,
        portal_header_style: headerStyle,
        custom_footer_text: footerText || null,
      });
      showFlash("success", "Marka ayarları kaydedildi; tema anında uygulandı.");
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Kaydedilemedi");
    }
  }

  async function onReset() {
    try {
      await mutations.reset.mutateAsync();
      showFlash("success", "Marka LogiSlot varsayılanına sıfırlandı.");
    } finally {
      setConfirmReset(false);
    }
  }

  if (branding.isLoading) return <LoadingState />;
  if (branding.isError)
    return <ErrorState message="Marka ayarları yüklenemedi." onRetry={() => branding.refetch()} />;

  const previewPrimary = HEX.test(primary)
    ? `hsl(${hexToHslTriplet(primary)})`
    : undefined;
  const previewAccent = HEX.test(accent) ? `hsl(${hexToHslTriplet(accent)})` : undefined;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold">Marka / White-Label</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Bu ayarlar <strong>{activeFacility?.name}</strong> için geçerlidir; tedarikçi
          portalı da bu markayı kullanır. Durum ve kargo renkleri operasyonel anlam
          taşıdığı için marka renginden bağımsız korunur.
        </p>
      </div>

      {flash && (
        <div
          className={cn(
            "rounded-lg border px-3 py-2 text-sm",
            flash.kind === "success"
              ? "border-status-approved/40 bg-status-approved/10 text-status-approved"
              : "border-destructive/40 bg-destructive/10 text-destructive",
          )}
        >
          {flash.text}
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Marka Ayarları</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div>
              <Label>Marka Adı</Label>
              <Input
                value={brandName}
                onChange={(e) => setBrandName(e.target.value)}
                placeholder="Cakes & Bakes"
                maxLength={100}
              />
            </div>
            <div>
              <Label>Logo URL</Label>
              <Input
                value={logoUrl}
                onChange={(e) => setLogoUrl(e.target.value)}
                placeholder="https://... (opsiyonel)"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Dosya yükleme sonraki sürümde; şimdilik URL yeterli.
              </p>
            </div>
            <ColorField label="Ana Renk (primary)" value={primary} onChange={setPrimary} />
            <ColorField label="Vurgu Rengi (accent)" value={accent} onChange={setAccent} />
            <div>
              <Label>Kenar Çubuğu Rengi (opsiyonel)</Label>
              <Input
                value={sidebar}
                onChange={(e) => setSidebar(e.target.value)}
                placeholder="Boş = tema varsayılanı"
                className="font-mono"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Portal Başlık Stili</Label>
                <Select
                  value={headerStyle}
                  onChange={(e) => setHeaderStyle(e.target.value as "light" | "dark")}
                >
                  <option value="light">Açık</option>
                  <option value="dark">Koyu</option>
                </Select>
              </div>
              <div>
                <Label>Alt Bilgi Metni</Label>
                <Input
                  value={footerText}
                  onChange={(e) => setFooterText(e.target.value)}
                  placeholder="Cakes & Bakes Mal Kabul Portalı"
                  maxLength={200}
                />
              </div>
            </div>
            {formError && <p className="text-sm text-destructive">{formError}</p>}
            <div className="flex justify-end gap-2">
              <Button
                variant="secondary"
                onClick={() => setConfirmReset(true)}
                disabled={!branding.data?.is_customized}
              >
                Varsayılana Sıfırla
              </Button>
              <Button onClick={onSave} disabled={mutations.save.isPending}>
                {mutations.save.isPending ? "Kaydediliyor…" : "Kaydet"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Canli onizleme */}
        <Card>
          <CardHeader>
            <CardTitle>Canlı Önizleme</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {/* Mini sidebar + header */}
            <div className="overflow-hidden rounded-lg border border-border">
              <div className="flex">
                <div
                  className="w-24 shrink-0 p-3"
                  style={{ backgroundColor: sidebar || undefined }}
                >
                  <div className="flex items-center gap-1.5">
                    <span
                      className="flex h-6 w-6 items-center justify-center rounded-md text-[10px] font-black text-white"
                      style={{ backgroundColor: previewPrimary }}
                    >
                      {(brandName || "LS").slice(0, 2).toUpperCase()}
                    </span>
                  </div>
                  <div className="mt-3 space-y-1.5">
                    {[3, 2.5, 3.5].map((w, i) => (
                      <div
                        key={i}
                        className="h-1.5 rounded bg-muted-foreground/20"
                        style={{ width: `${w}rem` }}
                      />
                    ))}
                  </div>
                </div>
                <div className="flex-1 bg-background p-3">
                  <div className="mb-2 text-sm font-semibold">
                    {brandName || "LogiSlot"}
                  </div>
                  <button
                    className="rounded-lg px-3 py-1.5 text-xs font-medium text-white"
                    style={{ backgroundColor: previewPrimary }}
                  >
                    Birincil Buton
                  </button>
                  <button
                    className="ml-2 rounded-lg px-3 py-1.5 text-xs font-medium text-white"
                    style={{ backgroundColor: previewAccent }}
                  >
                    Vurgu
                  </button>
                </div>
              </div>
            </div>

            {/* Mini supplier header */}
            <div
              className={cn(
                "flex items-center justify-between rounded-lg border border-border px-3 py-2",
                headerStyle === "dark" ? "bg-slate-900 text-white" : "bg-card",
              )}
            >
              <span className="text-sm font-bold">{brandName || "LogiSlot"}</span>
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                Tedarikçi
              </span>
            </div>

            {/* Statu/kargo renkleri: markadan BAGIMSIZ */}
            <div>
              <p className="mb-2 text-xs text-muted-foreground">
                Durum ve kargo rozetleri markadan etkilenmez:
              </p>
              <div className="flex flex-wrap gap-1.5">
                <StatusBadge status="pending" />
                <StatusBadge status="approved" />
                <StatusBadge status="revision_pending" />
                <CargoBadge window="morning" />
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              {footerText || "Alt bilgi metni burada görünür."}
            </p>
          </CardContent>
        </Card>
      </div>

      <ConfirmDialog
        open={confirmReset}
        title="Varsayılana sıfırla"
        message="Marka ayarları LogiSlot varsayılanına dönecek. Bu işlem geri alınabilir (yeniden kaydederek)."
        confirmLabel="Sıfırla"
        loading={mutations.reset.isPending}
        onConfirm={onReset}
        onClose={() => setConfirmReset(false)}
      />
    </div>
  );
}
