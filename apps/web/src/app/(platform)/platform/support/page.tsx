"use client";

/**
 * Pilot destek paneli (Sprint 11) — aksiyon bekleyenlerin agregat ozeti.
 * PII icermez; operasyonel detay icin ilgili ekranlara link verir.
 */

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ErrorState, LoadingState } from "@/components/config/states";
import { Card, CardContent } from "@/components/ui/card";
import { apiRequest } from "@/lib/api/client";
import { cn } from "@/lib/utils";

interface SchedulerJobStatus {
  last_status: string;
  last_finished_at: string | null;
  processed_count: number;
  error_message: string | null;
}

interface SupportHealthDto {
  failed_email_count: number;
  due_email_retry_count: number;
  unread_critical_notification_count: number;
  pending_appointment_count: number;
  revision_pending_appointment_count: number;
  tenant_count: number;
  active_facility_count: number;
  plan_warning_count: number;
  scheduler: Record<string, SchedulerJobStatus | null>;
  config: {
    environment: string;
    email_provider: string;
    docs_enabled: boolean;
    rate_limit_enabled: boolean;
    scheduler_enabled: boolean;
  };
}

export default function SupportPage() {
  const health = useQuery({
    queryKey: ["platform", "support-health"],
    queryFn: () => apiRequest<SupportHealthDto>("/platform/support/health"),
    refetchInterval: 60_000,
  });

  if (health.isLoading) return <LoadingState />;
  if (health.isError)
    return <ErrorState message="Destek verileri yüklenemedi." onRetry={() => health.refetch()} />;

  const data = health.data!;
  const cards: {
    label: string;
    value: number;
    alertWhenPositive?: boolean;
    hint?: string;
  }[] = [
    {
      label: "Başarısız e-posta",
      value: data.failed_email_count,
      alertWhenPositive: true,
      hint: "Tesis yönetimindeki E-posta Logları ekranından yeniden gönderilebilir",
    },
    {
      label: "Retry bekleyen e-posta",
      value: data.due_email_retry_count,
      alertWhenPositive: true,
      hint: "Scheduler 5 dakikada bir otomatik dener",
    },
    {
      label: "Okunmamış kritik bildirim",
      value: data.unread_critical_notification_count,
      alertWhenPositive: true,
    },
    { label: "Onay bekleyen randevu", value: data.pending_appointment_count },
    { label: "Revize bekleyen randevu", value: data.revision_pending_appointment_count },
    { label: "Plan kullanım uyarısı", value: data.plan_warning_count, alertWhenPositive: true },
    { label: "Tenant", value: data.tenant_count },
    { label: "Aktif tesis", value: data.active_facility_count },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-bold">Pilot Destek</h1>
        <p className="text-sm text-muted-foreground">
          Platform genel sağlık ve aksiyon bekleyenler (yalnızca agregat; operasyonel
          detay/PII içermez). Her dakika yenilenir.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {cards.map((card) => (
          <Card key={card.label}>
            <CardContent className="p-4 text-center">
              <div
                className={cn(
                  "text-2xl font-bold",
                  card.alertWhenPositive && card.value > 0
                    ? "text-status-rejected"
                    : "text-foreground",
                )}
              >
                {card.value}
              </div>
              <div className="mt-0.5 text-[11px] text-muted-foreground">{card.label}</div>
              {card.hint && card.value > 0 && (
                <div className="mt-1 text-[10px] text-muted-foreground">{card.hint}</div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">Scheduler</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {Object.entries(data.scheduler).map(([job, run]) => (
            <div key={job} className="rounded-lg border border-border p-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-medium">
                  {job === "email_retry" ? "E-posta retry" : "Bildirim temizliği"}
                </span>
                {run ? (
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[11px] font-medium",
                      run.last_status === "success"
                        ? "bg-status-approved/15 text-status-approved"
                        : run.last_status === "skipped_locked"
                          ? "bg-status-pending/15 text-status-pending"
                          : "bg-status-rejected/15 text-status-rejected",
                    )}
                  >
                    {run.last_status === "success"
                      ? "başarılı"
                      : run.last_status === "skipped_locked"
                        ? "kilitli atlandı"
                        : "hata"}
                  </span>
                ) : (
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                    henüz koşmadı
                  </span>
                )}
              </div>
              {run && (
                <div className="mt-1 text-xs text-muted-foreground">
                  Son koşum:{" "}
                  {run.last_finished_at
                    ? new Date(run.last_finished_at).toLocaleString("tr-TR")
                    : "—"}{" "}
                  · {run.processed_count} kayıt
                  {run.error_message && (
                    <div className="mt-0.5 text-status-rejected">{run.error_message}</div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Ortam: {data.config.environment} · e-posta: {data.config.email_provider} ·
          docs: {data.config.docs_enabled ? "açık" : "kapalı"} · rate limit:{" "}
          {data.config.rate_limit_enabled ? "açık" : "kapalı"}
        </p>
      </div>

      <div className="flex flex-wrap gap-2 text-sm">
        <Link href="/platform/usage" className="text-primary underline-offset-2 hover:underline">
          Kullanım &amp; plan uyarıları →
        </Link>
        <Link href="/platform/tenants" className="text-primary underline-offset-2 hover:underline">
          Tenant dizini →
        </Link>
      </div>
    </div>
  );
}
