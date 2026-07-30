"use client";

/**
 * Genel e-posta loglari operasyon sayfasi (Sprint 11).
 * Tekil resend appt.view ile; TOPLU resend user.manage ister (buton
 * yalnizca yetkili kullaniciya gorunur). Resend lifecycle'i tekrar
 * CALISTIRMAZ; yalnizca kayitli icerik yeniden gonderilir.
 */

import { Mail, RefreshCcw } from "lucide-react";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useFlash } from "@/components/config/page-shell";
import { EmptyState, ErrorState, LoadingState } from "@/components/config/states";
import { AppointmentDrawer } from "@/components/appointments/appointment-drawer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { emailProviderLabel, emailStatusLabel, emailTemplateLabel } from "@/lib/email-labels";
import { ApiError, apiRequest } from "@/lib/api/client";
import {
  useEmailLogsPage,
  type BulkResendResultDto,
  type EmailLogFilters,
} from "@/lib/api/reports";
import { useSession } from "@/lib/auth/session";
import { cn } from "@/lib/utils";

const TEMPLATE_OPTIONS = [
  ["appointment_approved", "Onay"],
  ["appointment_rejected", "Red"],
  ["appointment_revised", "Revize (tedarikçi)"],
  ["appointment_revised_team", "Revize (ekip)"],
  ["appointment_cancelled", "İptal"],
  ["appointment_series_cancelled", "Seri iptal"],
  ["appointment_series_revised", "Seri revize"],
] as const;

const STATUS_BADGE: Record<string, string> = {
  sent: "bg-status-approved/15 text-status-approved",
  failed: "bg-status-rejected/15 text-status-rejected",
  queued: "bg-status-pending/15 text-status-pending",
  skipped: "bg-muted text-muted-foreground",
};

export default function EmailLogsPage() {
  const { activeFacilityId, can } = useSession();
  const queryClient = useQueryClient();
  const { flash, showFlash } = useFlash();

  const [status, setStatus] = useState("");
  const [provider, setProvider] = useState("");
  const [recipient, setRecipient] = useState("");
  const [templateKey, setTemplateKey] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [onlyErrors, setOnlyErrors] = useState(false);
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [drawerId, setDrawerId] = useState<string | null>(null);

  const filters: EmailLogFilters = {
    status: status || undefined,
    provider: provider || undefined,
    recipient_email: recipient || undefined,
    template_key: templateKey || undefined,
    date_from: dateFrom ? `${dateFrom}T00:00:00Z` : undefined,
    date_to: dateTo ? `${dateTo}T23:59:59Z` : undefined,
    has_error: onlyErrors ? true : undefined,
    limit: 50,
    offset,
  };

  function clearFilters() {
    setStatus("");
    setProvider("");
    setRecipient("");
    setTemplateKey("");
    setDateFrom("");
    setDateTo("");
    setOnlyErrors(false);
    setOffset(0);
  }
  const page = useEmailLogsPage(activeFacilityId, filters);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["email-logs", activeFacilityId ?? "none"] });

  const singleResend = useMutation({
    mutationFn: (id: string) =>
      apiRequest<{ status: string; error_message: string | null }>(
        `/facilities/${activeFacilityId}/email-logs/${id}/resend`,
        { method: "POST" },
      ),
    onSuccess: invalidate,
  });
  const bulkResend = useMutation({
    mutationFn: (ids: string[]) =>
      apiRequest<BulkResendResultDto>(
        `/facilities/${activeFacilityId}/email-logs/bulk-resend`,
        { method: "POST", body: { email_log_ids: ids, only_failed: true } },
      ),
    onSuccess: invalidate,
  });

  async function onSingleResend(id: string) {
    try {
      const result = await singleResend.mutateAsync(id);
      showFlash(
        result.status === "sent" ? "success" : "error",
        result.status === "sent"
          ? "E-posta yeniden gönderildi."
          : `Gönderim yine başarısız: ${result.error_message ?? ""}`,
      );
    } catch (err) {
      showFlash("error", err instanceof ApiError ? err.message : "Gönderilemedi");
    }
  }

  async function onBulkResend() {
    try {
      const result = await bulkResend.mutateAsync([...selected]);
      const skipped = result.results.filter((r) => r.result === "skipped").length;
      const failed = result.results.filter((r) => r.result === "failed").length;
      showFlash(
        "success",
        `Toplu gönderim: ${result.sent} gönderildi, ${failed} başarısız, ${skipped} atlandı.`,
      );
      setSelected(new Set());
    } catch (err) {
      showFlash("error", err instanceof ApiError ? err.message : "Toplu gönderim başarısız");
    }
  }

  if (page.isLoading) return <LoadingState />;
  if (page.isError)
    return <ErrorState message="E-posta logları yüklenemedi." onRetry={() => page.refetch()} />;

  const data = page.data!;
  const failedSelectable = data.items.filter(
    (e) => e.status === "failed" && e.retry_count < e.max_attempts,
  );

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-bold">E-posta Logları</h1>
        <p className="text-sm text-muted-foreground">
          Giden tüm e-postalar. Yeniden gönderim randevu akışını tekrar çalıştırmaz;
          yalnızca kayıtlı içerik gönderilir (en fazla 3 deneme).
        </p>
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

      <p className="text-xs text-muted-foreground">
        Kartlar genel toplamları gösterir; tablo seçili filtrelerle
        sınırlıdır.
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(
          [
            ["Gönderilen", data.summary.sent, "text-status-approved"],
            ["Başarısız", data.summary.failed, "text-status-rejected"],
            ["Kuyrukta", data.summary.queued, "text-status-pending"],
            ["Atlanan", data.summary.skipped, "text-muted-foreground"],
          ] as const
        ).map(([label, value, color]) => (
          <Card key={label}>
            <CardContent className="p-4 text-center">
              <div className={cn("text-2xl font-bold", color)}>{value}</div>
              <div className="mt-0.5 text-[11px] text-muted-foreground">{label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <Label>Durum</Label>
          <Select value={status} onChange={(e) => { setStatus(e.target.value); setOffset(0); }}>
            <option value="">Tümü</option>
            <option value="sent">Gönderilen</option>
            <option value="failed">Başarısız</option>
            <option value="queued">Kuyrukta</option>
            <option value="skipped">Atlanan</option>
          </Select>
        </div>
        <div>
          <Label>Provider</Label>
          <Select value={provider} onChange={(e) => { setProvider(e.target.value); setOffset(0); }}>
            <option value="">Tümü</option>
            <option value="log_only">log_only</option>
            <option value="smtp">smtp</option>
          </Select>
        </div>
        <div>
          <Label>Şablon</Label>
          <Select
            value={templateKey}
            onChange={(e) => { setTemplateKey(e.target.value); setOffset(0); }}
          >
            <option value="">Tümü</option>
            {TEMPLATE_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </Select>
        </div>
        <div>
          <Label>Başlangıç</Label>
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); setOffset(0); }}
          />
        </div>
        <div>
          <Label>Bitiş</Label>
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); setOffset(0); }}
          />
        </div>
        <div className="min-w-48 flex-1">
          <Label>Alıcı</Label>
          <Input
            value={recipient}
            onChange={(e) => { setRecipient(e.target.value); setOffset(0); }}
            placeholder="E-posta ara…"
          />
        </div>
        <label className="flex items-center gap-1.5 pb-2 text-sm">
          <input
            type="checkbox"
            checked={onlyErrors}
            onChange={(e) => { setOnlyErrors(e.target.checked); setOffset(0); }}
          />
          Yalnızca hatalılar
        </label>
        <Button size="sm" variant="ghost" onClick={clearFilters}>
          Filtreleri temizle
        </Button>
        {can("user.manage") && (
          <Button
            disabled={selected.size === 0 || bulkResend.isPending}
            onClick={() => void onBulkResend()}
          >
            <RefreshCcw className="mr-1 h-4 w-4" />
            {bulkResend.isPending
              ? "Gönderiliyor…"
              : `Toplu Tekrar Gönder (${selected.size})`}
          </Button>
        )}
      </div>

      {data.items.length === 0 ? (
        <EmptyState
          title="Kayıt yok"
          description="Filtrelere uyan e-posta logu bulunamadı."
        />
      ) : (
        <Table>
          <THead>
            <TR>
              {can("user.manage") && (
                <TH className="w-8">
                  <input
                    type="checkbox"
                    checked={
                      failedSelectable.length > 0 &&
                      failedSelectable.every((e) => selected.has(e.id))
                    }
                    onChange={(e) =>
                      setSelected(
                        e.target.checked
                          ? new Set(failedSelectable.map((x) => x.id))
                          : new Set(),
                      )
                    }
                  />
                </TH>
              )}
              <TH>Tarih</TH>
              <TH>Alıcı</TH>
              <TH>Konu</TH>
              <TH>Şablon</TH>
              <TH>Provider</TH>
              <TH>Durum</TH>
              <TH>Deneme</TH>
              <TH className="text-right">İşlem</TH>
            </TR>
          </THead>
          <TBody>
            {data.items.map((log) => (
              <TR key={log.id}>
                {can("user.manage") && (
                  <TD>
                    {log.status === "failed" && log.retry_count < log.max_attempts && (
                      <input
                        type="checkbox"
                        checked={selected.has(log.id)}
                        onChange={(e) => {
                          const next = new Set(selected);
                          if (e.target.checked) next.add(log.id);
                          else next.delete(log.id);
                          setSelected(next);
                        }}
                      />
                    )}
                  </TD>
                )}
                <TD className="whitespace-nowrap text-xs text-muted-foreground">
                  {new Date(log.created_at).toLocaleString("tr-TR", {
                    day: "2-digit",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </TD>
                <TD className="text-xs">{log.recipient_email}</TD>
                <TD className="max-w-64">
                  <div className="truncate text-xs font-medium">{log.subject}</div>
                  {log.error_message && (
                    <div className="truncate text-[10px] text-status-rejected">
                      {log.error_message}
                    </div>
                  )}
                </TD>
                <TD className="text-xs text-muted-foreground">
                  {emailTemplateLabel(log.template_key)}
                </TD>
                <TD className="text-xs">{emailProviderLabel(log.provider)}</TD>
                <TD>
                  <Badge className={STATUS_BADGE[log.status] ?? ""}>
                    {emailStatusLabel(log.status)}
                  </Badge>
                </TD>
                <TD className="text-xs">
                  {log.retry_count}/{log.max_attempts}
                </TD>
                <TD className="text-right">
                  <div className="flex justify-end gap-1">
                    {log.appointment_id && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setDrawerId(log.appointment_id)}
                      >
                        <Mail className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {log.status === "failed" &&
                      (log.retry_count < log.max_attempts ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={singleResend.isPending}
                          onClick={() => void onSingleResend(log.id)}
                        >
                          Tekrar Gönder
                        </Button>
                      ) : (
                        <span className="text-[10px] text-muted-foreground">
                          Hak doldu
                        </span>
                      ))}
                  </div>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          Toplam {data.total} kayıt — {offset + 1}
          {"–"}
          {Math.min(offset + 50, data.total)} gösteriliyor
        </span>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="secondary"
            disabled={offset === 0}
            onClick={() => setOffset(Math.max(0, offset - 50))}
          >
            Önceki
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={offset + 50 >= data.total}
            onClick={() => setOffset(offset + 50)}
          >
            Sonraki
          </Button>
        </div>
      </div>

      <AppointmentDrawer appointmentId={drawerId} onClose={() => setDrawerId(null)} />
    </div>
  );
}
