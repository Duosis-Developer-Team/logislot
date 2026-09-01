"use client";

/**
 * Denetim izleri (audit) sayfasi — Sprint 11.
 * `audit.view` izni gerekir (sistem yoneticisi). Hassas alanlar backend'de
 * maskelenir; bu ekran tesis icindeki yonetim islemlerinin izlerini gosterir.
 */

import { ScrollText } from "lucide-react";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { EmptyState, ErrorState, LoadingState } from "@/components/config/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Input, Label, Select } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { apiRequest } from "@/lib/api/client";
import { useSession } from "@/lib/auth/session";
import type { Dictionary } from "@/lib/i18n/dictionaries/tr";
import { useT } from "@/lib/i18n/provider";

interface AuditEntryDto {
  id: string;
  created_at: string;
  actor_type: string;
  actor_name: string | null;
  action: string;
  summary: string;
  entity_type: string | null;
  entity_id: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
}

interface AuditListDto {
  items: AuditEntryDto[];
  total: number;
  limit: number;
  offset: number;
}

function actorLabels(t: Dictionary): Record<string, string> {
  return {
    platform_user: "Platform",
    tenant_user: t.admin.auditLogs.actorTenantUser,
    supplier_user: t.platform.auditLogs.actorSupplierUser,
    system: "System",
  };
}

function filterOptions(t: Dictionary): [string, string][] {
  return [
    ["", t.common.all],
    ["appointment", "Appointment"],
    ["supplier", t.platform.auditLogs.actorSupplierUser],
    ["tenant_user", t.platform.auditLogs.actorUser],
  ];
}

function JsonBlock({ title, value }: { title: string; value: Record<string, unknown> | null }) {
  const [open, setOpen] = useState(true);
  if (!value || Object.keys(value).length === 0) return null;
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
      >
        {title} {open ? "▾" : "▸"}
      </button>
      {open && (
        <pre className="mt-1 max-h-64 overflow-auto rounded-lg bg-muted/60 p-3 text-[11px] leading-relaxed">
          {JSON.stringify(value, null, 2)}
        </pre>
      )}
    </div>
  );
}

export default function AuditLogsPage() {
  const t = useT();
  const { activeFacilityId } = useSession();
  const [action, setAction] = useState("");
  const [entityType, setEntityType] = useState("");
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [detail, setDetail] = useState<AuditEntryDto | null>(null);

  const params = new URLSearchParams();
  if (action) params.set("action", action);
  if (entityType) params.set("entity_type", entityType);
  if (search) params.set("search", search);
  params.set("limit", "50");
  params.set("offset", String(offset));

  const list = useQuery({
    queryKey: ["audit-logs", activeFacilityId ?? "none", params.toString()],
    queryFn: () =>
      apiRequest<AuditListDto>(
        `/facilities/${activeFacilityId}/audit-logs?${params.toString()}`,
      ),
    enabled: activeFacilityId !== null,
  });

  if (list.isLoading) return <LoadingState />;
  if (list.isError)
    return (
      <ErrorState
        message={t.admin.auditLogs.loadError}
        onRetry={() => list.refetch()}
      />
    );

  const data = list.data!;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-bold">{t.admin.auditLogs.title}</h1>
        <p className="text-sm text-muted-foreground">
          {t.admin.auditLogs.description}
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-52">
          <Label>Aksiyon</Label>
          <Input
            value={action}
            onChange={(e) => { setAction(e.target.value); setOffset(0); }}
            placeholder={t.platform.auditLogs.actionPlaceholder}
          />
        </div>
        <div>
          <Label>{t.platform.auditLogs.entity}</Label>
          <Select
            value={entityType}
            onChange={(e) => { setEntityType(e.target.value); setOffset(0); }}
          >
            {filterOptions(t).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </div>
        <div className="min-w-56 flex-1">
          <Label>Ara</Label>
          <Input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setOffset(0); }}
            placeholder={t.platform.auditLogs.searchPlaceholder}
          />
        </div>
      </div>

      {data.items.length === 0 ? (
        <EmptyState
          title={t.platform.auditLogs.emptyTitle}
          description={t.platform.auditLogs.emptyDescription}
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Tarih</TH>
              <TH>{t.platform.auditLogs.colAction}</TH>
              <TH>Aksiyon</TH>
              <TH>{t.platform.auditLogs.colActor}</TH>
              <TH>{t.platform.auditLogs.entity}</TH>
              <TH className="text-right">Detay</TH>
            </TR>
          </THead>
          <TBody>
            {data.items.map((entry) => (
              <TR key={entry.id} className="cursor-pointer" onClick={() => setDetail(entry)}>
                <TD className="whitespace-nowrap text-xs text-muted-foreground">
                  {new Date(entry.created_at).toLocaleString("tr-TR", {
                    day: "2-digit",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </TD>
                <TD className="text-sm font-medium">{entry.summary}</TD>
                <TD>
                  <Badge className="bg-muted font-mono text-[10px] text-muted-foreground">
                    {entry.action}
                  </Badge>
                </TD>
                <TD className="text-xs">
                  {entry.actor_name ?? actorLabels(t)[entry.actor_type] ?? entry.actor_type}
                </TD>
                <TD className="text-xs text-muted-foreground">{entry.entity_type ?? "—"}</TD>
                <TD className="text-right" onClick={(e) => e.stopPropagation()}>
                  <Button size="sm" variant="ghost" onClick={() => setDetail(entry)}>
                    <ScrollText className="h-4 w-4" />
                  </Button>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{t.platform.auditLogs.total(data.total)}</span>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="secondary"
            disabled={offset === 0}
            onClick={() => setOffset(Math.max(0, offset - 50))}
          >
            {t.platform.auditLogs.previous}
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

      <Drawer open={detail !== null} onClose={() => setDetail(null)} title={t.platform.auditLogs.detailTitle}>
        {detail && (
          <div className="flex flex-col gap-4">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-lg border border-border p-3 text-sm">
              <dt className="text-muted-foreground">{t.platform.auditLogs.colAction}</dt>
              <dd className="font-medium">{detail.summary}</dd>
              <dt className="text-muted-foreground">Aksiyon</dt>
              <dd className="font-mono text-xs">{detail.action}</dd>
              <dt className="text-muted-foreground">{t.platform.auditLogs.colActor}</dt>
              <dd>
                {detail.actor_name ?? "—"}{" "}
                <span className="text-xs text-muted-foreground">
                  ({actorLabels(t)[detail.actor_type] ?? detail.actor_type})
                </span>
              </dd>
              <dt className="text-muted-foreground">Tarih</dt>
              <dd>{new Date(detail.created_at).toLocaleString("tr-TR")}</dd>
              {detail.entity_type && (
                <>
                  <dt className="text-muted-foreground">{t.platform.auditLogs.entity}</dt>
                  <dd className="text-xs">
                    {detail.entity_type}
                    {detail.entity_id && (
                      <span className="ml-1 font-mono text-muted-foreground">
                        {detail.entity_id.slice(0, 8)}…
                      </span>
                    )}
                  </dd>
                </>
              )}
            </dl>
            <JsonBlock title={t.platform.auditLogs.before} value={detail.before} />
            <JsonBlock title="Sonra" value={detail.after} />
            <JsonBlock title="Ek Bilgi" value={detail.metadata} />
          </div>
        )}
      </Drawer>
    </div>
  );
}
