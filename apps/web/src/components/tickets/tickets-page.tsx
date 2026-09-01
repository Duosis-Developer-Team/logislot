"use client";

/**
 * Ortak destek talepleri ekrani — yonetim ve tedarikci portallari AYNI
 * bileseni kullanir. Portal farki yalnizca `api` (yol oneki) ve baslik
 * metnindedir; gorunurluk/yetki karari backend'dedir.
 */

import { AlertTriangle, Plus, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { TICKET_STATUS_GROUPS } from "@logislot/shared";
import { EmptyState, ErrorState, LoadingState } from "@/components/config/states";
import { TicketCreateDrawer } from "@/components/tickets/ticket-create-drawer";
import { TicketDetail } from "@/components/tickets/ticket-detail";
import {
  TicketDeliveryBadge,
  TicketStatusBadge,
} from "@/components/tickets/ticket-status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, InteractiveCard } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { TicketApi } from "@/lib/api/tickets";
import type { TicketRowDto } from "@/lib/api/types";
import { cn, formatDateTime } from "@/lib/utils";
import { useLabels } from "@/lib/i18n/labels";
import { useFormat, useT } from "@/lib/i18n/provider";

/** Degeri belirtilen gecikmeyle geciren kucuk yardimci. */
function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

interface TicketsPageProps {
  api: TicketApi;
  title: string;
  description: string;
  /** Yonetim listesinde talep sahibi kolonu gosterilir. */
  showRequester?: boolean;
}

export function TicketsPage({
  api,
  title,
  description,
  showRequester = false,
}: TicketsPageProps) {
  const t = useT();
  const fmt = useFormat();
  const labels = useLabels();
  const params = useSearchParams();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [statusGroup, setStatusGroup] = useState<string>("open");
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  // Drawer kapandiginda acilacak talep. Olusturur olusturmaz `selectedId`
  // vermek, drawer'i (detay ekrani erken donuste render edildigi icin)
  // ANINDA unmount eder ve TKT numarasini gosteren basari paneli hic
  // cizilmezdi; ustelik `createOpen` acik kalip listeye donunce bos bir form
  // acardi.
  const [createdId, setCreatedId] = useState<string | null>(null);

  const config = api.useConfig();
  // Arama sunucu tarafindadir; her tusa basista istek atmak hem gereksiz yuk
  // hem de her seferinde listenin yerini yukleme durumuna birakmasi demekti.
  const debouncedSearch = useDebounced(search, 300);
  const list = api.useList({ statusGroup, search: debouncedSearch });

  // Bildirimden gelen derin baglanti (?ticketId=…) dogrudan detayi acar.
  useEffect(() => {
    const fromQuery = params.get("ticketId");
    if (fromQuery) setSelectedId(fromQuery);
  }, [params]);

  if (config.isLoading) return <LoadingState />;
  if (config.isError || !config.data) {
    return (
      <ErrorState
        message={t.tickets.loadError}
        onRetry={() => config.refetch()}
      />
    );
  }

  if (!config.data.enabled) {
    return (
      <EmptyState
        title={t.tickets.disabledTitle}
        description={t.tickets.disabledDescription}
      />
    );
  }

  if (selectedId) {
    return (
      <TicketDetail
        ticketId={selectedId}
        api={api}
        config={config.data}
        onBack={() => setSelectedId(null)}
        onCreateNew={() => {
          setSelectedId(null);
          setCreateOpen(true);
        }}
      />
    );
  }

  const rows = list.data ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">{title}</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">{description}</p>
        </div>
        {config.data.can_create && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" aria-hidden /> {t.tickets.newTicket}
          </Button>
        )}
      </div>

      {!config.data.routing.ready && (
        <Card className="border-status-pending/40 bg-status-pending/10">
          <CardContent className="flex items-start gap-2 p-4 text-sm text-status-pending">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>
              <strong className="font-semibold">
                {t.tickets.routeNotReadyTitle}
              </strong>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                {t.tickets.routeNotReadyText}
              </span>
            </span>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div
          role="tablist"
          aria-label={t.tickets.statusTabsLabel}
          className="flex flex-wrap gap-1 rounded-xl bg-muted/50 p-1"
        >
          {TICKET_STATUS_GROUPS.map((group) => (
            <button
              key={group.key}
              role="tab"
              aria-selected={statusGroup === group.key}
              onClick={() => setStatusGroup(group.key)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm transition-colors",
                statusGroup === group.key
                  ? "bg-card font-semibold text-foreground shadow-soft"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {labels.ticketStatusGroup[group.key as keyof typeof labels.ticketStatusGroup] ?? group.label}
            </button>
          ))}
        </div>
        <div className="relative flex-1">
          <Search
            className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            className="pl-9"
            placeholder={t.tickets.searchPlaceholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label={t.tickets.searchLabel}
          />
        </div>
      </div>

      {list.isPending ? (
        <LoadingState />
      ) : list.isError ? (
        <ErrorState message={t.tickets.listError} onRetry={() => list.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState
          title={t.tickets.emptyTab}
          description={
            search
              ? t.tickets.noResults(search)
              : t.tickets.emptyHint
          }
          actionLabel={config.data.can_create ? t.tickets.newTicket : undefined}
          onAction={config.data.can_create ? () => setCreateOpen(true) : undefined}
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((ticket) => (
            <li key={ticket.id}>
              <TicketRow
                ticket={ticket}
                showRequester={showRequester}
                onOpen={() => setSelectedId(ticket.id)}
              />
            </li>
          ))}
        </ul>
      )}

      <TicketCreateDrawer
        open={createOpen}
        onClose={() => {
          setCreateOpen(false);
          if (createdId) {
            setSelectedId(createdId);
            setCreatedId(null);
          }
        }}
        api={api}
        config={config.data}
        onCreated={(ticket) => setCreatedId(ticket.id)}
      />
    </div>
  );
}

function TicketRow({
  ticket,
  showRequester,
  onOpen,
}: {
  ticket: TicketRowDto;
  showRequester: boolean;
  onOpen: () => void;
}) {
  const t = useT();
  const fmt = useFormat();
  const labels = useLabels();
  const resolved = ticket.status === "resolved";
  const closed = ticket.status === "closed" || ticket.status === "cancelled";
  return (
    <InteractiveCard
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      className={cn(
        "cursor-pointer",
        // Cozulen talep YESIL sol seritle isaretlenir; baslik ustu CIZILMEZ —
        // okunabilirlik erisilebilirlik karari (07_RESEARCH_BENCHMARKS).
        resolved && "border-l-4 border-l-status-approved",
        closed && "opacity-80",
      )}
    >
      <CardContent className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 p-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-muted-foreground">
              {ticket.ticket_number ?? t.tickets.beingSent}
            </span>
            <TicketStatusBadge status={ticket.status} />
            <TicketDeliveryBadge
              deliveryStatus={ticket.delivery_status}
              syncGap={ticket.sync_gap}
            />
          </div>
          <p className="mt-1 truncate font-medium">{ticket.title}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
            <span>{labels.ticketCategoryLabel(ticket.category)}</span>
            {showRequester && ticket.requester_name && (
              <>
                <span aria-hidden>·</span>
                <span>
                  {ticket.requester_name}
                  {ticket.supplier_name ? ` (${ticket.supplier_name})` : ""}
                </span>
              </>
            )}
            {ticket.updated_at && (
              <>
                <span aria-hidden>·</span>
                <span>{t.tickets.updatedAt} {fmt.dateTime(ticket.updated_at)}</span>
              </>
            )}
          </p>
        </div>
        {resolved && ticket.resolved_at && (
          <span className="text-xs font-medium text-status-approved">
            {t.tickets.resolvedAt} · {fmt.dateTime(ticket.resolved_at)}
          </span>
        )}
      </CardContent>
    </InteractiveCard>
  );
}
