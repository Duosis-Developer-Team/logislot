"use client";

/**
 * Ticket detayi: talep ozeti, PUBLIC konusma, cozum karti ve aksiyonlar.
 *
 * Bu ekranda Hermes'in IC NOTLARI hicbir kosulda gorunmez — backend zaten
 * yalnizca public mesaj dondurur, projeksiyon tablosunda da veritabani
 * kisitiyla korunur. Buradaki bilesen o sozlesmeye guvenir ve ek bir
 * "gorunurluk" filtresi TASIMAZ; boyle bir filtre olsaydi asil korumanin
 * nerede oldugu belirsizlesirdi.
 */

import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Download,
  Loader2,
  MessageCircleQuestion,
  Paperclip,
  RotateCcw,
  Send,
  Users,
} from "lucide-react";
import { useState } from "react";
import {
  TICKET_RESOLUTION_CODE_LABELS,
  ticketCategoryLabel,
  ticketImpactLabel,
} from "@logislot/shared";
import { LoadingState } from "@/components/config/states";
import {
  AttachmentDropzone,
  type PendingAttachment,
} from "@/components/tickets/attachment-dropzone";
import {
  TicketDeliveryBadge,
  TicketStatusBadge,
} from "@/components/tickets/ticket-status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { TicketApi } from "@/lib/api/tickets";
import type { TicketConfigDto, TicketDetailDto } from "@/lib/api/types";
import { cn, formatDateTime } from "@/lib/utils";
import { useLabels } from "@/lib/i18n/labels";
import { useFormat, useT } from "@/lib/i18n/provider";

interface TicketDetailProps {
  ticketId: string;
  api: TicketApi;
  config: TicketConfigDto;
  onBack: () => void;
  onCreateNew: () => void;
}

export function TicketDetail({
  ticketId,
  api,
  config,
  onBack,
  onCreateNew,
}: TicketDetailProps) {
  const t = useT();
  const fmt = useFormat();
  const labels = useLabels();
  const detail = api.useDetail(ticketId);
  const { reply, reopen, confirmClose } = api.useMutations();
  const [body, setBody] = useState("");
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [reopenReason, setReopenReason] = useState("");
  const [reopenOpen, setReopenOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (detail.isLoading) return <LoadingState />;
  if (detail.isError || !detail.data) {
    return (
      <div className="flex flex-col items-start gap-3">
        <Button variant="secondary" size="sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" aria-hidden /> {t.tickets.detail.backToList}
        </Button>
        <p className="text-sm text-muted-foreground">{t.tickets.detail.notFound}</p>
      </div>
    );
  }

  const ticket = detail.data;
  const closed = ticket.status === "closed" || ticket.status === "cancelled";
  const uploading = attachments.some((a) => a.uploadId === null && a.error === null);

  async function submitReply() {
    if (!body.trim()) return;
    setError(null);
    try {
      await reply.mutateAsync({
        id: ticket.id,
        body: {
          body: body.trim(),
          attachment_upload_ids: attachments
            .map((a) => a.uploadId)
            .filter((id): id is string => !!id),
        },
      });
      setBody("");
      setAttachments([]);
    } catch (e) {
      // Yazilan metin KORUNUR — yeniden yazdirmak kabul edilemez.
      setError(e instanceof Error ? e.message : t.errors.unexpected);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Button variant="ghost" size="sm" onClick={onBack} className="-ml-2 mb-1">
            <ArrowLeft className="h-4 w-4" aria-hidden /> Taleplerim
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm text-muted-foreground">
              {ticket.ticket_number ?? t.tickets.detail.pending}
            </span>
            <TicketStatusBadge status={ticket.status} />
            <TicketDeliveryBadge
              deliveryStatus={ticket.delivery_status}
              syncGap={ticket.sync_gap}
            />
          </div>
          <h1 className="mt-1 text-xl font-bold">{ticket.title}</h1>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
            <span>{ticketCategoryLabel(ticket.category)}</span>
            <span aria-hidden>·</span>
            <span>{ticketImpactLabel(ticket.impact)}</span>
            {ticket.group_name && (
              <>
                <span aria-hidden>·</span>
                <span className="inline-flex items-center gap-1">
                  <Users className="h-3 w-3" aria-hidden />
                  {ticket.group_name}
                </span>
              </>
            )}
            {ticket.created_at && (
              <>
                <span aria-hidden>·</span>
                <span>{formatDateTime(ticket.created_at)}</span>
              </>
            )}
          </p>
        </div>
      </div>

      {ticket.delivery_status === "failed" && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="flex items-start gap-2 p-4 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden />
            <span>
              <strong className="font-semibold">Talep destek merkezine iletilemedi.</strong>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                {t.tickets.detail.deliveryFailedLead}
                {ticket.last_sync_error_code
                  ? ` (kod: ${ticket.last_sync_error_code})`
                  : ""}
                .
              </span>
            </span>
          </CardContent>
        </Card>
      )}

      {ticket.status === "waiting_customer" && (
        <Card className="border-accent/50 bg-accent/10">
          <CardContent className="flex items-start gap-2 p-4 text-sm">
            <MessageCircleQuestion className="mt-0.5 h-4 w-4 shrink-0 text-accent-foreground" aria-hidden />
            <span>
              <strong className="font-semibold">Destek ekibi sizden bilgi bekliyor.</strong>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                {t.tickets.detail.waitingCustomer}
              </span>
            </span>
          </CardContent>
        </Card>
      )}

      {ticket.resolution && (
        <Card className="border-l-4 border-l-status-approved">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-status-approved" aria-hidden />
              <h2 className="font-semibold text-status-approved">{t.tickets.detail.resolution}</h2>
              {ticket.resolution.code && (
                <span className="rounded-full bg-status-approved/15 px-2 py-0.5 text-xs font-medium text-status-approved">
                  {TICKET_RESOLUTION_CODE_LABELS[ticket.resolution.code] ??
                    ticket.resolution.code}
                </span>
              )}
            </div>
            <p className="mt-2 whitespace-pre-wrap text-sm">
              {ticket.resolution.summary}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              {ticket.resolution.resolved_by_group_name}
              {ticket.resolution.resolved_at &&
                ` · ${formatDateTime(ticket.resolution.resolved_at)}`}
              {ticket.resolution.fix_version &&
                t.tickets.detail.version(ticket.resolution.fix_version)}
            </p>

            {ticket.status === "resolved" && ticket.permissions.can_reopen && (
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  onClick={async () => {
                    setError(null);
                    try {
                      await confirmClose.mutateAsync(ticket.id);
                    } catch (e) {
                      // Ticket bu arada agent tarafindan kapatilmis olabilir
                      // (yoklama henuz gelmemis). Sessizce yutulursa kullanici
                      // butona basmaya devam eder.
                      setError(
                        e instanceof Error ? e.message : t.errors.unexpected,
                      );
                    }
                  }}
                  disabled={confirmClose.isPending}
                >
                  <CheckCircle2 className="h-4 w-4" aria-hidden />{" "}
                  {t.tickets.detail.confirmClose}
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setReopenOpen((v) => !v)}
                >
                  <RotateCcw className="h-4 w-4" aria-hidden /> Sorun devam ediyor
                </Button>
              </div>
            )}

            {error && (
              <p role="alert" className="mt-2 text-xs text-destructive">
                {error}
              </p>
            )}

            {reopenOpen && (
              <div className="mt-3 flex flex-col gap-2 rounded-lg border border-border p-3">
                <label htmlFor="reopen-reason" className="text-sm font-medium">
                  {t.tickets.detail.reopenReason}
                </label>
                <textarea
                  id="reopen-reason"
                  rows={3}
                  value={reopenReason}
                  onChange={(e) => setReopenReason(e.target.value)}
                  className="w-full rounded-lg border border-border bg-card p-2.5 text-sm"
                />
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="ghost" onClick={() => setReopenOpen(false)}>
                    {t.common.cancel}
                  </Button>
                  <Button
                    size="sm"
                    disabled={reopenReason.trim().length < 5 || reopen.isPending}
                    onClick={async () => {
                      setError(null);
                      try {
                        await reopen.mutateAsync({
                          id: ticket.id,
                          reason: reopenReason.trim(),
                        });
                        setReopenOpen(false);
                        setReopenReason("");
                      } catch (e) {
                        // Gerekce KORUNUR; panel acik kalir.
                        setError(
                          e instanceof Error ? e.message : t.errors.unexpected,
                        );
                      }
                    }}
                  >
                    {t.tickets.detail.reopen}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-4">
          <h2 className="text-sm font-semibold">{t.tickets.detail.summary}</h2>
          <dl className="mt-2 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            <Field label="Kategori" value={ticketCategoryLabel(ticket.category)} />
            <Field label="Etki" value={ticketImpactLabel(ticket.impact)} />
            <Field label={t.tickets.detail.reproSteps} value={ticket.reproduction_steps} wide />
            <Field label={t.tickets.detail.expected} value={ticket.expected_result} />
            <Field label={t.tickets.detail.actual} value={ticket.actual_result} />
            <Field label="Hata kodu" value={ticket.error_code} />
            <Field
              label={t.tickets.detail.occurredAt}
              value={ticket.occurred_at ? formatDateTime(ticket.occurred_at) : null}
            />
          </dl>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">{t.tickets.detail.conversation}</h2>
        {ticket.messages.map((message) => {
          const fromAgent = message.author_type !== "requester";
          const messageAttachments = ticket.attachments.filter(
            (a) => a.message_id === message.id,
          );
          return (
            <div
              key={message.id}
              className={cn(
                "rounded-xl border px-4 py-3",
                fromAgent
                  ? "border-primary/25 bg-primary/5"
                  : "border-border bg-card",
              )}
            >
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">
                  {message.author_display_name ??
                    (fromAgent ? "Destek Ekibi" : "Siz")}
                </span>
                <span className="flex items-center gap-1.5">
                  {message.is_pending && (
                    <span className="inline-flex items-center gap-1 text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                      {t.tickets.detail.pending}
                    </span>
                  )}
                  {message.created_at && formatDateTime(message.created_at)}
                </span>
              </div>
              <p className="mt-1.5 whitespace-pre-wrap text-sm">{message.body}</p>
              {messageAttachments.length > 0 && (
                <AttachmentList
                  ticketId={ticket.id}
                  attachments={messageAttachments}
                  api={api}
                />
              )}
            </div>
          );
        })}

        {ticket.attachments.filter((a) => !a.message_id).length > 0 && (
          <div className="rounded-xl border border-border bg-card px-4 py-3">
            <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Paperclip className="h-3.5 w-3.5" aria-hidden /> Talebe eklenen dosyalar
            </p>
            <AttachmentList
              ticketId={ticket.id}
              attachments={ticket.attachments.filter((a) => !a.message_id)}
              api={api}
            />
          </div>
        )}
      </div>

      {closed ? (
        <Card className="bg-muted/40">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
            <span className="text-muted-foreground">
              {t.tickets.detail.closedNote}
            </span>
            {config.can_create && (
              <Button size="sm" onClick={onCreateNew}>
                {t.tickets.create.newTicket}
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        ticket.permissions.can_reply && (
          <Card>
            <CardContent className="flex flex-col gap-2 p-4">
              <label htmlFor="ticket-reply" className="text-sm font-semibold">
                {t.tickets.detail.reply}
              </label>
              <textarea
                id="ticket-reply"
                rows={3}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder={t.tickets.detail.replyPlaceholder}
                className="w-full rounded-lg border border-border bg-card p-3 text-sm"
              />
              {config.attachments.enabled ? (
                <AttachmentDropzone
                  attachments={attachments}
                  onChange={setAttachments}
                  upload={api.uploadAttachment}
                  maxFiles={config.attachments.max_files}
                  maxFileSizeBytes={config.attachments.max_file_size_bytes}
                  maxTotalBytes={config.attachments.max_total_bytes}
                  allowedMimeTypes={config.attachments.allowed_mime_types}
                />
              ) : (
                /* Destek merkezi ek yuklemeyi kapatmis — yanit yine gonderilebilir. */
                <p className="text-xs text-muted-foreground">
                  {t.tickets.detail.attachmentsDisabled}
                </p>
              )}
              {error && (
                <p role="alert" className="text-xs text-destructive">
                  {error} — {t.tickets.detail.draftKept}
                </p>
              )}
              <div className="flex justify-end">
                <Button
                  onClick={() => void submitReply()}
                  disabled={!body.trim() || uploading || reply.isPending}
                >
                  {reply.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <Send className="h-4 w-4" aria-hidden />
                  )}
                  {t.tickets.detail.send}
                </Button>
              </div>
            </CardContent>
          </Card>
        )
      )}

      {ticket.last_sync_at && (
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          <Clock className="h-3 w-3" aria-hidden />
          {t.tickets.detail.lastChecked} {fmt.dateTime(ticket.last_sync_at)}
        </p>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  wide,
}: {
  label: string;
  value: string | null | undefined;
  wide?: boolean;
}) {
  if (!value) return null;
  return (
    <div className={cn(wide && "sm:col-span-2")}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="whitespace-pre-wrap">{value}</dd>
    </div>
  );
}

function AttachmentList({
  ticketId,
  attachments,
  api,
}: {
  ticketId: string;
  attachments: TicketDetailDto["attachments"];
  api: TicketApi;
}) {
  const t = useT();
  const [busy, setBusy] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  return (
    <>
    {downloadError && (
      <p role="alert" className="mt-2 text-xs text-destructive">
        {downloadError}
      </p>
    )}
    <ul className="mt-2 flex flex-wrap gap-2">
      {attachments.map((attachment) => (
        <li key={attachment.id}>
          <button
            type="button"
            disabled={!attachment.downloadable || busy === attachment.id}
            onClick={async () => {
              setBusy(attachment.id);
              setDownloadError(null);
              try {
                await api.downloadAttachment(
                  ticketId,
                  attachment.id,
                  attachment.file_name,
                );
              } catch (e) {
                // Kisa omurlu adres suresi dolmus veya yetki degismis olabilir.
                setDownloadError(
                  e instanceof Error ? e.message : t.errors.unexpected,
                );
              } finally {
                setBusy(null);
              }
            }}
            title={
              attachment.downloadable
                ? t.tickets.detail.download
                : t.tickets.detail.scanPending
            }
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs transition-colors",
              attachment.downloadable
                ? "hover:border-primary/40 hover:text-primary"
                : "cursor-not-allowed opacity-60",
            )}
          >
            {busy === attachment.id ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              <Download className="h-3.5 w-3.5" aria-hidden />
            )}
            {attachment.file_name}
            {!attachment.downloadable && (
              <span className="text-muted-foreground">{t.tickets.detail.scanningShort}</span>
            )}
          </button>
        </li>
      ))}
    </ul>
    </>
  );
}
