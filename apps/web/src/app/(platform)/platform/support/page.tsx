"use client";

/**
 * Sistem sagligi paneli — aksiyon bekleyenlerin agregat ozeti.
 * PII icermez; operasyonel detay icin ilgili ekranlara link verir.
 *
 * AD KARARI: eskiden "Pilot Destek" idi. Musteri ticketlari geldiginden bu
 * ad iki farkli seyi cagristiriyordu; sayfa SISTEM SAGLIGI, ticket kuyrugu
 * DEGILDIR. Ticket icerigi bu ekrana hicbir kosulda tasinmaz — buradaki
 * entegrasyon kartlari yalnizca SAYAC gosterir
 * (00_SHARED_PLATFORM/06, bolum 8).
 */

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ErrorState, LoadingState } from "@/components/config/states";
import { Card, CardContent } from "@/components/ui/card";
import { apiRequest } from "@/lib/api/client";
import { useT } from "@/lib/i18n/provider";
import { useTicketIntegrationHealth } from "@/lib/api/platform-ticketing";
import { cn, formatDateTime } from "@/lib/utils";

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
  const t = useT();
  const health = useQuery({
    queryKey: ["platform", "support-health"],
    queryFn: () => apiRequest<SupportHealthDto>("/platform/support/health"),
    refetchInterval: 60_000,
  });
  // Ticket entegrasyonu AYRI bir platform izni ister; yetkisi olmayan
  // kullanicida kartlar gizlenir, sayfa kirilmaz.
  const ticketHealth = useTicketIntegrationHealth();

  if (health.isLoading) return <LoadingState />;
  if (health.isError)
    return <ErrorState message={t.platform.support.loadError} onRetry={() => health.refetch()} />;

  const data = health.data!;
  const cards: {
    label: string;
    value: number;
    alertWhenPositive?: boolean;
    hint?: string;
  }[] = [
    {
      label: t.platform.support.failedEmail,
      value: data.failed_email_count,
      alertWhenPositive: true,
      hint: t.platform.support.failedEmailHint,
    },
    {
      label: "Retry bekleyen e-posta",
      value: data.due_email_retry_count,
      alertWhenPositive: true,
      hint: "Scheduler 5 dakikada bir otomatik dener",
    },
    {
      label: t.platform.support.unreadCritical,
      value: data.unread_critical_notification_count,
      alertWhenPositive: true,
    },
    { label: "Onay bekleyen randevu", value: data.pending_appointment_count },
    { label: "Revize bekleyen randevu", value: data.revision_pending_appointment_count },
    {
      label: t.platform.support.planWarning,
      value: data.plan_warning_count,
      alertWhenPositive: true,
    },
    { label: "Tenant", value: data.tenant_count },
    { label: "Aktif tesis", value: data.active_facility_count },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-bold">{t.platform.support.title}</h1>
        <p className="text-sm text-muted-foreground">
          {t.platform.support.description}
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

      {ticketHealth.data && (
        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold">Ticket Entegrasyonu</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              {
                label: t.platform.support.unroutedTenant,
                value: ticketHealth.data.unconfigured_tenant_count,
                alert: ticketHealth.data.unconfigured_tenant_count > 0,
              },
              {
                label: t.platform.support.pendingDelivery,
                value: ticketHealth.data.outgoing.pending,
                alert: false,
              },
              {
                label: t.platform.support.failedDelivery,
                value:
                  ticketHealth.data.outgoing.failed + ticketHealth.data.outgoing.dead,
                alert:
                  ticketHealth.data.outgoing.failed + ticketHealth.data.outgoing.dead > 0,
              },
              {
                label: t.platform.support.unprocessedWebhook,
                value:
                  (ticketHealth.data.webhook_inbox.received ?? 0) +
                  (ticketHealth.data.webhook_inbox.failed ?? 0),
                alert: (ticketHealth.data.webhook_inbox.failed ?? 0) > 0,
              },
            ].map((card) => (
              <Card key={card.label}>
                <CardContent className="p-4 text-center">
                  <div
                    className={cn(
                      "text-2xl font-bold",
                      card.alert ? "text-status-rejected" : "text-foreground",
                    )}
                  >
                    {card.value}
                  </div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground">
                    {card.label}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            {t.platform.support.hermesConnection}{" "}
            {ticketHealth.data.hermes_configured
              ? t.platform.support.configured
              : t.platform.support.notConfigured}{" "}
            {t.platform.support.catalogLastFetch}{" "}
            {ticketHealth.data.catalog_last_fetched_at
              ? formatDateTime(ticketHealth.data.catalog_last_fetched_at)
              : "—"}
            {ticketHealth.data.catalog_stale && " (eski)"} · son mutabakat:{" "}
            {ticketHealth.data.jobs.ticket_reconciliation?.last_finished_at
              ? formatDateTime(
                  ticketHealth.data.jobs.ticket_reconciliation.last_finished_at,
                )
              : t.platform.support.neverRan}
          </p>
          <Link
            href="/platform/ticket-routing"
            className="text-sm text-primary underline-offset-2 hover:underline"
          >
            {t.platform.support.manageRouting}
          </Link>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">Scheduler</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {Object.entries(data.scheduler).map(([job, run]) => (
            <div key={job} className="rounded-lg border border-border p-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-medium">
                  {job === "email_retry"
                    ? t.platform.support.jobEmailRetry
                    : t.platform.support.jobNotificationCleanup}
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
                      ? t.platform.support.jobOk
                      : run.last_status === "skipped_locked"
                        ? t.platform.support.jobLockSkipped
                        : "hata"}
                  </span>
                ) : (
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                    {t.platform.support.neverRan}
                  </span>
                )}
              </div>
              {run && (
                <div className="mt-1 text-xs text-muted-foreground">
                  {t.platform.support.lastRun}{" "}
                  {run.last_finished_at
                    ? new Date(run.last_finished_at).toLocaleString("tr-TR")
                    : "—"}{" "}
                  {t.platform.support.recordCount(run.processed_count)}
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
          {t.platform.support.docsLabel}{" "}
          {data.config.docs_enabled ? t.platform.support.on : t.platform.support.off}{" "}
          {t.platform.support.rateLimitLabel}{" "}
          {data.config.rate_limit_enabled ? t.platform.support.on : t.platform.support.off}
        </p>
      </div>

      <div className="flex flex-wrap gap-2 text-sm">
        <Link href="/platform/usage" className="text-primary underline-offset-2 hover:underline">
          {t.platform.support.usageLink}
        </Link>
        <Link href="/platform/tenants" className="text-primary underline-offset-2 hover:underline">
          Tenant dizini →
        </Link>
      </div>
    </div>
  );
}
