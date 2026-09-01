"use client";

import { useState } from "react";
import { ConfirmDialog } from "@/components/config/confirm-dialog";
import { OverrideDrawer } from "@/components/config/override-drawer";
import {
  ConfigPageShell,
  filterRows,
  useFlash,
  type ActiveFilter,
} from "@/components/config/page-shell";
import { ActiveBadge, EmptyState, ErrorState, LoadingState } from "@/components/config/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { ApiError } from "@/lib/api/client";
import { dockOverrides, docks } from "@/lib/api/resources";
import type { OverrideDto } from "@/lib/api/types";
import { useSession } from "@/lib/auth/session";
import { useApiErrorMessage } from "@/lib/i18n/api-error";
import { useT } from "@/lib/i18n/provider";

export default function OverridesPage() {
  const t = useT();
  const errorMessage = useApiErrorMessage();
  const { activeFacilityId } = useSession();
  const list = dockOverrides.useList(activeFacilityId);
  const dockList = docks.useList(activeFacilityId);
  const deactivate = dockOverrides.useDeactivate(activeFacilityId);
  const { flash, showFlash } = useFlash();

  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>("all");
  const [drawer, setDrawer] = useState<{ open: boolean; editing: OverrideDto | null }>({
    open: false,
    editing: null,
  });
  const [confirmTarget, setConfirmTarget] = useState<OverrideDto | null>(null);

  const dockName = (id: string) => dockList.data?.find((d) => d.id === id)?.name ?? "?";

  function openCreate() {
    setDrawer({ open: true, editing: null });
  }

  function openEdit(row: OverrideDto) {
    setDrawer({ open: true, editing: row });
  }

  async function onDeactivate() {
    if (!confirmTarget) return;
    try {
      await deactivate.mutateAsync(confirmTarget.id);
      showFlash("success", t.admin.overrides.deactivated);
    } catch (err) {
      showFlash("error", errorMessage(err, t.admin.config.actionFailed));
    } finally {
      setConfirmTarget(null);
    }
  }

  const rows = filterRows(
    list.data ?? [],
    search,
    activeFilter,
    (r) => `${dockName(r.dock_id)} ${r.date} ${r.reason ?? ""}`,
  );

  return (
    <ConfigPageShell
      title={t.admin.overrides.title}
      description={t.admin.overrides.pageDescription}
      createLabel={t.admin.overrides.create}
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
        <ErrorState message={t.admin.overrides.loadError} onRetry={() => list.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState
          title={t.admin.overrides.emptyTitle}
          description={t.admin.overrides.emptyDescription}
          actionLabel={t.admin.overrides.emptyAction}
          onAction={openCreate}
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Tarih</TH>
              <TH>Rampa</TH>
              <TH>Tip</TH>
              <TH>{t.admin.overrides.colHours}</TH>
              <TH>Sebep</TH>
              <TH>Durum</TH>
              <TH className="text-right">{t.common.actions}</TH>
            </TR>
          </THead>
          <TBody>
            {rows.map((row) => (
              <TR key={row.id}>
                <TD className="whitespace-nowrap font-medium">
                  {new Date(row.date).toLocaleDateString("tr-TR", {
                    day: "2-digit",
                    month: "short",
                    weekday: "short",
                  })}
                </TD>
                <TD>{dockName(row.dock_id)}</TD>
                <TD>
                  {row.type === "closed" ? (
                    <Badge className="bg-status-rejected/15 text-status-rejected">
                      {t.admin.overrides.closed}
                    </Badge>
                  ) : (
                    <Badge className="bg-status-approved/15 text-status-approved">
                      {t.admin.overrides.hoursChange}
                    </Badge>
                  )}
                </TD>
                <TD className="text-sm text-muted-foreground">
                  {row.start_time && row.end_time
                    ? `${row.start_time.slice(0, 5)}–${row.end_time.slice(0, 5)}`
                    : t.admin.overrides.allDay}
                </TD>
                <TD className="max-w-56 truncate text-sm text-muted-foreground">
                  {row.reason ?? "—"}
                </TD>
                <TD>
                  <ActiveBadge active={row.is_active} />
                </TD>
                <TD className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button size="sm" variant="secondary" onClick={() => openEdit(row)}>
                      {t.common.edit}
                    </Button>
                    {row.is_active && (
                      <Button size="sm" variant="ghost" onClick={() => setConfirmTarget(row)}>
                        {t.admin.config.deactivate}
                      </Button>
                    )}
                  </div>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}

      <OverrideDrawer
        open={drawer.open}
        editing={drawer.editing}
        onClose={() => setDrawer({ open: false, editing: null })}
        onSaved={(message) => showFlash("success", message)}
      />

      <ConfirmDialog
        open={confirmTarget !== null}
        title={t.admin.overrides.deactivateTitle}
        message={t.admin.overrides.deactivateMessage}
        loading={deactivate.isPending}
        onConfirm={onDeactivate}
        onClose={() => setConfirmTarget(null)}
      />
    </ConfigPageShell>
  );
}
