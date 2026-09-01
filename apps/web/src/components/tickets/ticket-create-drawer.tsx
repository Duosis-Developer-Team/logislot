"use client";

/**
 * Yeni ticket formu.
 *
 * URUN KARARI: kullanici HEDEF EKIP SECMEZ. Yonlendirme Platform Yonetimi'nde
 * tanimlidir; form yalnizca degistirilemez bir bilgi kutusu gosterir. Route
 * hazir degilse gonderim KAPALIDIR — sessizce varsayilan bir gruba dusmek,
 * talebin kimsenin kuyruguna girmemesi demek olurdu.
 */

import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle, Info, Loader2, Send, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import {
  TICKET_CATEGORIES,
  TICKET_CATEGORY_HINTS,
  TICKET_CATEGORY_LABELS,
  TICKET_IMPACTS,
  TICKET_IMPACT_LABELS,
} from "@logislot/shared";
import {
  AttachmentDropzone,
  type PendingAttachment,
} from "@/components/tickets/attachment-dropzone";
import {
  collectDiagnostics,
  describeDiagnostics,
} from "@/components/tickets/diagnostics";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Input, Label, Select } from "@/components/ui/input";
import type { TicketApi } from "@/lib/api/tickets";
import type { TicketConfigDto, TicketDetailDto } from "@/lib/api/types";
import { cn } from "@/lib/utils";
import type { Dictionary } from "@/lib/i18n/dictionaries/tr";
import { useT } from "@/lib/i18n/provider";

//: Destek merkezinin (Hermes) sunucu tarafi alt sinirlari. Burada tutulur ki
//: hem dogrulama hem sayac ayni sayiyi kullansin ve karsi taraf sinirlari
//: degistirdiginde tek yerden guncellensin.
const TITLE_MIN = 8;
const DESCRIPTION_MIN = 20;

/** "N karakter daha" ipucu — sinir surprizle submit aninda carpmasin. */
function RemainingHint({ value, min }: { value: string; min: number }) {
  const t = useT();
  const left = min - value.trim().length;
  if (left <= 0) return null;
  return (
    <p className="mt-1 text-xs text-muted-foreground">{t.tickets.create.remaining(left)}</p>
  );
}

const schema = z.object({
  // Alt sinirlar LogiSlot'un tercihi DEGIL, destek merkezinin sunucu tarafi
  // kuralidir (title >= 8, description >= 20; canli dogrulandi). Formda
  // uygulanmasinin sebebi: kayit yerelde olusup teslimatta 422 ile
  // dead-letter'a dusmesin — musteri "acildi" sanip destek hic gormezdi.
  title: z
    .string()
    .min(TITLE_MIN, "titleMin")
    .max(160, "titleMax"),
  description: z
    .string()
    .min(
      DESCRIPTION_MIN,
      "descriptionMin",
    )
    .max(10000, "descriptionMax"),
  category: z.string().min(1, "categoryRequired"),
  impact: z.string().min(1, "impactRequired"),
  reproduction_steps: z.string().max(5000).optional(),
  expected_result: z.string().max(2000).optional(),
  actual_result: z.string().max(2000).optional(),
  error_code: z.string().max(120).optional(),
  occurred_at: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

interface TicketCreateDrawerProps {
  open: boolean;
  onClose: () => void;
  api: TicketApi;
  config: TicketConfigDto;
  onCreated: (ticket: TicketDetailDto) => void;
}


/** Zod semasi modul seviyesinde ve hook cagiramaz; mesaj ANAHTARDIR ve burada
 *  cevrilir. Uzunluk sinirlari destek merkezinin sunucu tarafi kuralidir. */
function fieldError(t: Dictionary, message: string | undefined): string | undefined {
  if (message === "titleMin") return t.tickets.create.titleMin(TITLE_MIN);
  if (message === "descriptionMin") return t.tickets.create.descriptionMin(DESCRIPTION_MIN);
  const known = t.tickets.create as unknown as Record<string, string>;
  return message && typeof known[message] === "string" ? known[message] : message;
}

export function TicketCreateDrawer({
  open,
  onClose,
  api,
  config,
  onCreated,
}: TicketCreateDrawerProps) {
  const t = useT();
  const { create } = api.useMutations();
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [created, setCreated] = useState<TicketDetailDto | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { category: "bug", impact: "single_user" },
  });

  const diagnostics = useMemo(() => (open ? collectDiagnostics() : {}), [open]);
  const routeReady = config.routing.ready;
  const uploading = attachments.some((a) => a.uploadId === null && a.error === null);

  useEffect(() => {
    if (!open) return;
    // Drawer her acilista temiz baslar; kapanirken taslak KORUNUR (asagida
    // gonderim hatasinda kapatmiyoruz).
    setSubmitError(null);
    setCreated(null);
  }, [open]);

  async function submit(values: FormValues) {
    setSubmitError(null);
    try {
      const ticket = await create.mutateAsync({
        title: values.title,
        description: values.description,
        category: values.category,
        impact: values.impact,
        reproduction_steps: values.reproduction_steps || null,
        expected_result: values.expected_result || null,
        actual_result: values.actual_result || null,
        error_code: values.error_code || null,
        occurred_at: values.occurred_at
          ? new Date(values.occurred_at).toISOString()
          : null,
        client_context: diagnostics,
        attachment_upload_ids: attachments
          .map((a) => a.uploadId)
          .filter((id): id is string => !!id),
      });
      setCreated(ticket);
      form.reset({ category: "bug", impact: "single_user" });
      setAttachments([]);
      onCreated(ticket);
    } catch (error) {
      // Form ve yuklenmis ek dosya handle'lari KORUNUR: kullanici yeniden
      // yazmak zorunda kalmaz, yalnizca "Tekrar Gönder" der.
      setSubmitError(
        error instanceof Error ? error.message : t.tickets.create.failed,
      );
    }
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={t.tickets.create.newTicket}
      description={t.tickets.create.description}
    >
      {created ? (
        <SuccessPanel ticket={created} onClose={onClose} onAnother={() => setCreated(null)} />
      ) : (
        <form onSubmit={form.handleSubmit(submit)} className="flex flex-col gap-4">
          <RouteCard config={config} />

          <div>
            <Label htmlFor="ticket-category">{t.tickets.create.category}</Label>
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {TICKET_CATEGORIES.map((category) => {
                const active = form.watch("category") === category;
                return (
                  <button
                    key={category}
                    type="button"
                    onClick={() => form.setValue("category", category)}
                    aria-pressed={active}
                    className={cn(
                      "rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                      active
                        ? "border-primary bg-primary/5 font-semibold text-primary"
                        : "border-border hover:border-primary/40",
                    )}
                  >
                    {TICKET_CATEGORY_LABELS[category]}
                    <span className="block text-xs font-normal text-muted-foreground">
                      {TICKET_CATEGORY_HINTS[category]}
                    </span>
                  </button>
                );
              })}
            </div>
            <input type="hidden" id="ticket-category" {...form.register("category")} />
          </div>

          <div>
            <Label htmlFor="ticket-title">{t.tickets.create.title}</Label>
            <Input
              id="ticket-title"
              placeholder={t.tickets.create.titlePlaceholder}
              aria-invalid={!!form.formState.errors.title}
              {...form.register("title")}
            />
            <FieldError message={fieldError(t, form.formState.errors.title?.message)} />
            <RemainingHint value={form.watch("title") ?? ""} min={TITLE_MIN} />
          </div>

          <div>
            <Label htmlFor="ticket-description">{t.tickets.create.detail}</Label>
            <textarea
              id="ticket-description"
              rows={5}
              placeholder={t.tickets.create.detailPlaceholder}
              aria-invalid={!!form.formState.errors.description}
              className="w-full rounded-lg border border-border bg-card p-3 text-sm shadow-soft focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/25"
              {...form.register("description")}
            />
            <FieldError message={fieldError(t, form.formState.errors.description?.message)} />
            <RemainingHint
              value={form.watch("description") ?? ""}
              min={DESCRIPTION_MIN}
            />
          </div>

          <div>
            <Label htmlFor="ticket-impact">Etki</Label>
            <Select id="ticket-impact" {...form.register("impact")}>
              {TICKET_IMPACTS.map((impact) => (
                <option key={impact} value={impact}>
                  {TICKET_IMPACT_LABELS[impact]}
                </option>
              ))}
            </Select>
            {form.watch("impact") === "security_or_data_risk" && (
              <p className="mt-1.5 flex items-start gap-1.5 rounded-lg bg-status-pending/10 px-3 py-2 text-xs text-status-pending">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                {t.tickets.create.impactHint}
              </p>
            )}
          </div>

          <details
            open={detailsOpen}
            onToggle={(e) => setDetailsOpen((e.target as HTMLDetailsElement).open)}
            className="rounded-lg border border-border"
          >
            <summary className="cursor-pointer px-3 py-2 text-sm font-medium">
              {t.tickets.create.optionalHint}
            </summary>
            <div className="flex flex-col gap-3 border-t border-border p-3">
              <div>
                <Label htmlFor="ticket-steps">{t.tickets.detail.reproSteps}</Label>
                <textarea
                  id="ticket-steps"
                  rows={3}
                  className="w-full rounded-lg border border-border bg-card p-3 text-sm"
                  {...form.register("reproduction_steps")}
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="ticket-expected">{t.tickets.detail.expected}</Label>
                  <Input id="ticket-expected" {...form.register("expected_result")} />
                </div>
                <div>
                  <Label htmlFor="ticket-actual">{t.tickets.detail.actual}</Label>
                  <Input id="ticket-actual" {...form.register("actual_result")} />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="ticket-error">{t.tickets.create.errorCode}</Label>
                  <Input id="ticket-error" {...form.register("error_code")} />
                </div>
                <div>
                  <Label htmlFor="ticket-occurred">{t.tickets.detail.occurredAt}</Label>
                  <Input
                    id="ticket-occurred"
                    type="datetime-local"
                    {...form.register("occurred_at")}
                  />
                </div>
              </div>
            </div>
          </details>

          {config.attachments.enabled ? (
            <div>
              <Label>{t.tickets.create.attachments}</Label>
              <AttachmentDropzone
                attachments={attachments}
                onChange={setAttachments}
                upload={api.uploadAttachment}
                maxFiles={config.attachments.max_files}
                maxFileSizeBytes={config.attachments.max_file_size_bytes}
                maxTotalBytes={config.attachments.max_total_bytes}
                allowedMimeTypes={config.attachments.allowed_mime_types}
                disabled={!routeReady}
              />
            </div>
          ) : (
            /* Destek merkezi ek yuklemeyi kapatmis. Alani gostermek kullaniciyi
               dosya secip hata almaya birakirdi; talep ek olmadan gonderilebilir. */
            <p className="rounded-xl border border-border bg-muted/50 px-3 py-2.5 text-xs text-muted-foreground">
              {t.tickets.create.attachmentsDisabled}
            </p>
          )}

          <details
            open={diagnosticsOpen}
            onToggle={(e) => setDiagnosticsOpen((e.target as HTMLDetailsElement).open)}
            className="rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground"
          >
            <summary className="cursor-pointer">
              {t.tickets.diagnostics.summary}
            </summary>
            <ul className="mt-1.5 list-disc pl-4">
              {describeDiagnostics(t, diagnostics).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <p className="mt-1.5 font-medium">
              {t.tickets.create.privacyNote}
            </p>
          </details>

          {submitError && (
            <p
              role="alert"
              className="flex items-start gap-1.5 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span>
                {submitError}
                <span className="mt-0.5 block text-xs">
                  {t.tickets.create.retryHint}
                </span>
              </span>
            </p>
          )}

          <div className="flex items-center justify-end gap-2 border-t border-border pt-3">
            <Button type="button" variant="secondary" onClick={onClose}>
              {t.common.cancel}
            </Button>
            <Button type="submit" disabled={!routeReady || uploading || create.isPending}>
              {create.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Send className="h-4 w-4" aria-hidden />
              )}
              {uploading ? t.tickets.create.uploading : t.tickets.create.submit}
            </Button>
          </div>
        </form>
      )}
    </Drawer>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="mt-1 text-xs text-destructive">
      {message}
    </p>
  );
}

/** Degistirilemez hedef ekip kutusu — secici DEGIL, bilgi. */
export function RouteCard({ config }: { config: TicketConfigDto }) {
  const t = useT();
  if (!config.routing.ready) {
    return (
      <div className="flex items-start gap-2 rounded-xl border border-status-pending/40 bg-status-pending/10 px-3 py-2.5 text-sm text-status-pending">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <span>
          <strong className="font-semibold">
            {t.tickets.routeNotReadyTitle}
          </strong>
          <span className="mt-0.5 block text-xs">
            {t.tickets.routeNotReadyText}
          </span>
        </span>
      </div>
    );
  }
  return (
    <div className="flex items-start gap-2 rounded-xl border border-primary/25 bg-primary/5 px-3 py-2.5 text-sm">
      <Users className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
      <span>
        {t.tickets.create.routeLead}{" "}
        <strong className="font-semibold">{config.routing.group_display_name}</strong>{" "}
        {t.tickets.create.routeTail}
        <span className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
          <Info className="h-3 w-3" aria-hidden />
          {t.tickets.create.routeTargetPrefix}
        </span>
      </span>
    </div>
  );
}

function SuccessPanel({
  ticket,
  onClose,
  onAnother,
}: {
  ticket: TicketDetailDto;
  onClose: () => void;
  onAnother: () => void;
}) {
  const t = useT();
  return (
    <div className="flex flex-col items-start gap-3">
      <div className="w-full rounded-xl border border-status-approved/40 bg-status-approved/10 px-4 py-3">
        <p className="font-semibold text-status-approved">
          {t.tickets.create.successTitle}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {ticket.ticket_number
            ? t.tickets.create.successWithNumber(String(ticket.ticket_number))
            : t.tickets.create.successPending}
        </p>
      </div>
      <p className="text-sm text-muted-foreground">
        <strong className="font-medium text-foreground">{ticket.title}</strong> ·{" "}
        {t.tickets.create.sentToTeam(ticket.group_name ?? "")}
      </p>
      <div className="flex gap-2">
        <Button onClick={onClose}>{t.tickets.create.viewTicket}</Button>
        <Button variant="secondary" onClick={onAnother}>
          {t.tickets.create.newTicket}
        </Button>
      </div>
    </div>
  );
}
