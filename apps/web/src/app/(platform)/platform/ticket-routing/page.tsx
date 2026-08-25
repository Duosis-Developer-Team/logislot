"use client";

/**
 * Platform Yonetimi — Hermes Ticket Yonlendirmesi.
 *
 * URUN KARARI: bir tenant icin TEK aktif hedef grup secilir (multi-select yok)
 * ve TOPLU atama yoktur; yanlis tenantlara toplu route atamanin maliyeti,
 * kazandirdigi hizdan yuksektir.
 *
 * Bu ekranda ticket BASLIGI, TALEP SAHIBI veya MESAJ gosterilmez; platform
 * rolu yonlendirmeyi yonetir, icerige erisim VERMEZ.
 */

import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Search,
  Settings2,
  XCircle,
} from "lucide-react";
import { useMemo, useState } from "react";
import { ErrorState, LoadingState } from "@/components/config/states";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Drawer } from "@/components/ui/drawer";
import { Input, Label, Select } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import {
  useHermesGroups,
  useTicketIntegrationHealth,
  useTicketRoute,
  useTicketRoutes,
  useTicketRoutingMutations,
} from "@/lib/api/platform-ticketing";
import type { TicketRouteStatus } from "@/lib/api/types";
import { cn, formatDateTime, normalizeSearch } from "@/lib/utils";

const STATUS_META: Record<
  TicketRouteStatus,
  { label: string; className: string }
> = {
  ready: { label: "Hazır", className: "bg-status-approved/15 text-status-approved" },
  unconfigured: {
    label: "Yapılandırılmadı",
    className: "bg-status-cancelled/15 text-status-cancelled",
  },
  needs_verification: {
    label: "Doğrulama gerekli",
    className: "bg-status-pending/15 text-status-pending",
  },
  disabled: { label: "Devre dışı", className: "bg-muted text-muted-foreground" },
  error: { label: "Hata", className: "bg-status-rejected/15 text-status-rejected" },
};

export default function TicketRoutingPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [drawerTenantId, setDrawerTenantId] = useState<string | null>(null);

  // Arama ve durum filtresi SUNUCUDA uygulanir: uc nokta sayfalidir ve
  // istemcide filtrelemek, ilk sayfanin disinda kalan bir musteriyi
  // "yok" gibi gosterirdi.
  const routes = useTicketRoutes({ search, status: statusFilter });
  const health = useTicketIntegrationHealth();

  const rows = useMemo(() => routes.data?.items ?? [], [routes.data]);
  const truncated = (routes.data?.total ?? 0) > rows.length;

  if (routes.isLoading) return <LoadingState />;
  if (routes.isError) {
    return (
      <ErrorState
        message="Yönlendirme listesi yüklenemedi. Bu ekran için platform ticket yetkisi gerekir."
        onRetry={() => routes.refetch()}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-bold">Ticket Yönlendirmesi</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Her müşteri hesabının destek talepleri, burada seçtiğiniz tek Hermes
          ekibine iletilir. Son kullanıcı ekip seçmez; formda yalnızca hedef
          ekibin adını görür.
        </p>
      </div>

      {health.data && <IntegrationHealthCards health={health.data} />}

      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search
            className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            className="pl-9"
            placeholder="Müşteri hesabı ara…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Müşteri hesabı ara"
          />
        </div>
        <Select
          className="sm:w-56"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          aria-label="Durum filtresi"
        >
          <option value="all">Tüm durumlar</option>
          {Object.entries(STATUS_META).map(([key, meta]) => (
            <option key={key} value={key}>
              {meta.label}
            </option>
          ))}
        </Select>
      </div>

      {truncated && (
        <p className="text-xs text-muted-foreground">
          Toplam {routes.data?.total} müşteri hesabından ilk {rows.length} tanesi
          gösteriliyor. Aramayı daraltarak aradığınız hesaba ulaşabilirsiniz.
        </p>
      )}

      <Table>
        <THead>
          <TR>
            <TH>Müşteri</TH>
            <TH>Yönlendirme</TH>
            <TH>Hedef ekip</TH>
            <TH>Son doğrulama</TH>
            <TH>Teslimat</TH>
            <TH className="text-right">İşlem</TH>
          </TR>
        </THead>
        <TBody>
          {rows.map((row) => {
            const meta = STATUS_META[row.status];
            const problem = row.delivery.failed + row.delivery.dead;
            return (
              <TR key={row.tenant_id}>
                <TD>
                  <span className="font-medium">{row.tenant_name}</span>
                  <span className="block text-xs text-muted-foreground">
                    {row.tenant_slug}
                  </span>
                </TD>
                <TD>
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold",
                      meta.className,
                    )}
                  >
                    {meta.label}
                  </span>
                  {row.last_error_code && (
                    <span className="mt-0.5 block font-mono text-[11px] text-status-rejected">
                      {row.last_error_code}
                    </span>
                  )}
                </TD>
                <TD>{row.hermes_group_name ?? "—"}</TD>
                <TD className="text-xs text-muted-foreground">
                  {row.last_verified_at ? formatDateTime(row.last_verified_at) : "—"}
                  {row.route_version > 0 && (
                    <span className="block">sürüm {row.route_version}</span>
                  )}
                </TD>
                <TD className="text-xs">
                  <span className={cn(problem > 0 && "font-semibold text-status-rejected")}>
                    {row.delivery.pending} bekleyen · {row.delivery.failed} hatalı ·{" "}
                    {row.delivery.dead} ölü
                  </span>
                </TD>
                <TD className="text-right">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setDrawerTenantId(row.tenant_id)}
                  >
                    <Settings2 className="h-4 w-4" aria-hidden /> Yapılandır
                  </Button>
                </TD>
              </TR>
            );
          })}
          {rows.length === 0 && (
            <TR>
              <TD colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                Filtreye uyan müşteri hesabı yok.
              </TD>
            </TR>
          )}
        </TBody>
      </Table>

      {/* `key` ile tenant basina REMOUNT: drawer kalici olarak mount edildigi
          icin, kaydedilmemis bir secim ayni tenant yeniden acildiginda ekranda
          kalir ve canli route sanilirdi. */}
      <RouteDrawer
        key={drawerTenantId ?? "closed"}
        tenantId={drawerTenantId}
        onClose={() => setDrawerTenantId(null)}
      />
    </div>
  );
}

function IntegrationHealthCards({
  health,
}: {
  health: NonNullable<ReturnType<typeof useTicketIntegrationHealth>["data"]>;
}) {
  const cards = [
    {
      label: "Yönlendirmesi olmayan müşteri",
      value: health.unconfigured_tenant_count,
      alert: health.unconfigured_tenant_count > 0,
    },
    { label: "Bekleyen gönderim", value: health.outgoing.pending, alert: false },
    { label: "Hatalı gönderim", value: health.outgoing.failed, alert: health.outgoing.failed > 0 },
    { label: "Ölü mektup", value: health.outgoing.dead, alert: health.outgoing.dead > 0 },
    {
      label: "Yönlendirme hatası",
      value: health.route_error_count,
      alert: health.route_error_count > 0,
    },
    {
      label: "Webhook bekleyen",
      value: (health.webhook_inbox.received ?? 0) + (health.webhook_inbox.failed ?? 0),
      alert: (health.webhook_inbox.failed ?? 0) > 0,
    },
  ];

  return (
    <div className="flex flex-col gap-2">
      {!health.hermes_configured && (
        <Card className="border-status-pending/40 bg-status-pending/10">
          <CardContent className="flex items-start gap-2 p-4 text-sm text-status-pending">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>
              <strong className="font-semibold">Hermes bağlantısı yapılandırılmamış.</strong>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                Talepler yerelde kaydedilmeye devam eder ve kuyrukta bekler; bağlantı
                tanımlandığında otomatik gönderilir. Hiçbir kayıt kaybolmaz.
              </span>
            </span>
          </CardContent>
        </Card>
      )}
      {health.hermes_configured && !health.webhook_secret_configured && (
        <Card className="border-status-rejected/40 bg-status-rejected/10">
          <CardContent className="flex items-start gap-2 p-4 text-sm text-status-rejected">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>
              Webhook imza sırrı tanımlı değil; gelen olaylar reddedilir. Durum
              güncellemeleri yalnızca periyodik senkronizasyonla gelir.
            </span>
          </CardContent>
        </Card>
      )}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {cards.map((card) => (
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
              <div className="mt-0.5 text-[11px] text-muted-foreground">{card.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function RouteDrawer({
  tenantId,
  onClose,
}: {
  tenantId: string | null;
  onClose: () => void;
}) {
  const detail = useTicketRoute(tenantId);
  const groups = useHermesGroups(!!tenantId);
  const { save, test, refreshGroups } = useTicketRoutingMutations();

  const [groupId, setGroupId] = useState<string>("");
  const [isActive, setIsActive] = useState(true);
  const [groupSearch, setGroupSearch] = useState("");
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(
    null,
  );
  const [syncedTenantId, setSyncedTenantId] = useState<string | null>(null);

  // Tenant degistiginde form alanlarini SENKRONLA. useEffect yerine
  // render sirasinda ayarlama: React'in "prop degisince state'i duzelt"
  // onerdigi desen; effect ile yapilirsa bir kare eski degerle cizilir ve
  // ardisik render zinciri olusur.
  if (detail.data && syncedTenantId !== detail.data.tenant_id) {
    setSyncedTenantId(detail.data.tenant_id);
    setGroupId(detail.data.hermes_group_id ?? "");
    setIsActive(detail.data.is_active);
    setMessage(null);
    setGroupSearch("");
  }

  // Katalog cagrisi henuz donmediyse detay yanitindaki liste kullanilir;
  // ikisi de yoksa BOS dizi. useMemo, her renderda yeni bir dizi uretip
  // asagidaki filtreyi bosuna tetiklemesin diye.
  const items = useMemo(
    () => groups.data?.items ?? detail.data?.groups ?? [],
    [groups.data, detail.data],
  );
  const visible = useMemo(() => {
    const query = normalizeSearch(groupSearch.trim());
    return items.filter(
      (group) =>
        group.is_active &&
        (!query ||
          normalizeSearch(group.name).includes(query) ||
          normalizeSearch(group.description ?? "").includes(query)),
    );
  }, [items, groupSearch]);

  const selected = items.find((g) => g.id === groupId);
  const stale = groups.data?.stale ?? detail.data?.catalog_stale ?? false;
  const catalogError = groups.data?.error_code ?? detail.data?.catalog_error_code;

  return (
    <Drawer
      open={!!tenantId}
      onClose={onClose}
      title="Ticket Yönlendirmesi"
      description={detail.data?.tenant_name}
    >
      {detail.isLoading || !detail.data ? (
        <LoadingState />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="rounded-xl border border-border bg-muted/30 px-3 py-2.5 text-sm">
            <p className="font-medium">{detail.data.tenant_name}</p>
            <p className="text-xs text-muted-foreground">
              {detail.data.tenant_slug} · hesap durumu: {detail.data.tenant_status}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Bekleyen gönderim {detail.data.delivery.pending} · hatalı{" "}
              {detail.data.delivery.failed} · ölü {detail.data.delivery.dead}
            </p>
          </div>

          {stale && (
            <p className="flex items-start gap-1.5 rounded-lg bg-status-pending/10 px-3 py-2 text-xs text-status-pending">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              <span>
                Ekip listesi güncel olmayabilir
                {catalogError ? ` (${catalogError})` : ""}. Kaydetmeden önce
                yenilemeniz önerilir; mevcut yönlendirme çalışmaya devam eder.
              </span>
            </p>
          )}

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <Label className="mb-0">Hedef Hermes ekibi</Label>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={refreshGroups.isPending}
                onClick={async () => {
                  try {
                    await refreshGroups.mutateAsync();
                    setMessage({ kind: "ok", text: "Ekip listesi yenilendi." });
                  } catch (error) {
                    setMessage({
                      kind: "error",
                      text:
                        error instanceof Error
                          ? error.message
                          : "Ekip listesi yenilenemedi",
                    });
                  }
                }}
              >
                {refreshGroups.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" aria-hidden />
                )}
                Listeyi yenile
              </Button>
            </div>

            <div className="relative mb-2">
              <Search
                className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                className="h-10 pl-9"
                placeholder="Ekip ara…"
                value={groupSearch}
                onChange={(e) => setGroupSearch(e.target.value)}
                aria-label="Hermes ekibi ara"
              />
            </div>

            <ul
              role="radiogroup"
              aria-label="Hedef Hermes ekibi"
              className="max-h-64 overflow-y-auto rounded-lg border border-border"
            >
              {visible.map((group) => (
                <li key={group.id} className="border-b border-border/60 last:border-0">
                  <button
                    type="button"
                    role="radio"
                    aria-checked={groupId === group.id}
                    onClick={() => setGroupId(group.id)}
                    className={cn(
                      "flex w-full flex-col items-start px-3 py-2 text-left transition-colors",
                      groupId === group.id ? "bg-primary/5" : "hover:bg-muted/60",
                    )}
                  >
                    <span className="flex w-full items-center justify-between gap-2">
                      <span
                        className={cn(
                          "text-sm",
                          groupId === group.id && "font-semibold text-primary",
                        )}
                      >
                        {group.name}
                      </span>
                      {group.member_count !== null && (
                        <span className="text-xs text-muted-foreground">
                          {group.member_count} üye
                        </span>
                      )}
                    </span>
                    {group.description && (
                      <span className="text-xs text-muted-foreground">
                        {group.description}
                      </span>
                    )}
                  </button>
                </li>
              ))}
              {visible.length === 0 && (
                <li className="px-3 py-6 text-center text-xs text-muted-foreground">
                  {items.length === 0
                    ? "Hermes ekip listesi henüz alınamadı."
                    : "Aramaya uyan aktif ekip yok."}
                </li>
              )}
            </ul>
          </div>

          <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5 text-sm">
            <span>
              Yönlendirme aktif
              <span className="mt-0.5 block text-xs text-muted-foreground">
                Kapalıyken bu müşteri yeni talep açamaz; mevcut talepler etkilenmez.
              </span>
            </span>
            <Switch
              checked={isActive}
              onChange={setIsActive}
              label="Yönlendirme aktif"
            />
          </div>

          {message && (
            <p
              role="status"
              className={cn(
                "rounded-lg px-3 py-2 text-sm",
                message.kind === "ok"
                  ? "bg-status-approved/10 text-status-approved"
                  : "bg-destructive/10 text-destructive",
              )}
            >
              {message.text}
            </p>
          )}

          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-3">
            <Button
              type="button"
              variant="secondary"
              disabled={!groupId || test.isPending}
              onClick={async () => {
                try {
                  const result = await test.mutateAsync({
                    tenantId: detail.data!.tenant_id,
                    groupId,
                  });
                  setMessage(
                    result.ok
                      ? {
                          kind: "ok",
                          text: `Bağlantı doğrulandı: ${result.group_name ?? "ekip aktif"}.`,
                        }
                      : {
                          kind: "error",
                          text: result.message ?? "Bağlantı doğrulanamadı.",
                        },
                  );
                } catch (error) {
                  // 403 (yalnizca goruntuleme yetkisi) veya Hermes kesintisi:
                  // sessiz kalirsa operator "test hicbir sey yapmadi" sanir.
                  setMessage({
                    kind: "error",
                    text:
                      error instanceof Error
                        ? error.message
                        : "Bağlantı testi tamamlanamadı",
                  });
                }
              }}
            >
              {test.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : test.data?.ok ? (
                <CheckCircle2 className="h-4 w-4" aria-hidden />
              ) : (
                <XCircle className="h-4 w-4" aria-hidden />
              )}
              Bağlantıyı Test Et
            </Button>
            <Button
              type="button"
              disabled={!groupId || save.isPending || !selected?.is_active}
              onClick={async () => {
                try {
                  const saved = await save.mutateAsync({
                    tenantId: detail.data!.tenant_id,
                    groupId,
                    isActive,
                    expectedRouteVersion: detail.data!.route_version || null,
                  });
                  setMessage({
                    kind: "ok",
                    text: `Kaydedildi · sürüm ${saved.route_version} · ${saved.hermes_group_name}`,
                  });
                } catch (error) {
                  setMessage({
                    kind: "error",
                    text: error instanceof Error ? error.message : "Kaydedilemedi",
                  });
                }
              }}
            >
              {save.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              Kaydet
            </Button>
          </div>
        </div>
      )}
    </Drawer>
  );
}
