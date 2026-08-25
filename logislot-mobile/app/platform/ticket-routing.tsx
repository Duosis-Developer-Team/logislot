/**
 * Platform — Hermes ticket yönlendirmesi (mobil).
 *
 * Web ile aynı ürün kararları: tenant başına TEK aktif grup, toplu atama yok,
 * ticket İÇERİĞİ gösterilmez (yalnızca durum ve sayaç).
 */

import { useMemo, useState } from "react";
import { Text, View } from "react-native";
import {
  useHermesGroups,
  useTicketIntegrationHealth,
  useTicketRoute,
  useTicketRoutes,
  useTicketRoutingMutations,
} from "@/api/platform-ticketing";
import type { TicketRouteStatus } from "@/api/types";
import {
  AppModal,
  Badge,
  Button,
  Card,
  Chip,
  EmptyState,
  ErrorState,
  Field,
  KeyValueRow,
  LoadingState,
  MetricCard,
  Screen,
  SectionTitle,
  SwitchRow,
} from "@/components/ui";
import { useTheme } from "@/theme/theme";
import { spacing, type ThemeColors } from "@/theme/tokens";

const STATUS_LABELS: Record<TicketRouteStatus, string> = {
  ready: "Hazır",
  unconfigured: "Yapılandırılmadı",
  needs_verification: "Doğrulama gerekli",
  disabled: "Devre dışı",
  error: "Hata",
};

function statusColor(status: TicketRouteStatus, colors: ThemeColors): string {
  switch (status) {
    case "ready":
      return colors.status.approved;
    case "error":
      return colors.status.rejected;
    case "needs_verification":
      return colors.status.pending;
    default:
      return colors.status.cancelled;
  }
}

export default function TicketRoutingScreen() {
  const { colors } = useTheme();
  const [search, setSearch] = useState("");
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);

  // Arama SUNUCUDA uygulanır (uç nokta sayfalıdır).
  const routes = useTicketRoutes({ search });
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
    <Screen>
      <View style={{ gap: spacing.md }}>
        <Text style={{ color: colors.mutedText, fontSize: 13 }}>
          Her müşteri hesabının destek talepleri, seçtiğiniz tek Hermes ekibine
          iletilir. Son kullanıcı ekip seçmez.
        </Text>

        {health.data && (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
            <MetricCard
              label="Yönlendirmesiz"
              value={health.data.unconfigured_tenant_count}
              icon="git-branch-outline"
            />
            <MetricCard
              label="Bekleyen gönderim"
              value={health.data.outgoing.pending}
              icon="paper-plane-outline"
            />
            <MetricCard
              label="Hatalı / ölü"
              value={health.data.outgoing.failed + health.data.outgoing.dead}
              icon="alert-circle-outline"
              tone={
                health.data.outgoing.failed + health.data.outgoing.dead > 0
                  ? colors.destructive
                  : undefined
              }
            />
          </View>
        )}

        {health.data && !health.data.hermes_configured && (
          <Card style={{ borderColor: colors.status.pending }}>
            <Text style={{ color: colors.status.pending, fontWeight: "700" }}>
              Hermes bağlantısı yapılandırılmamış
            </Text>
            <Text style={{ color: colors.mutedText, fontSize: 13, marginTop: 4 }}>
              Talepler yerelde kaydedilir ve kuyrukta bekler; bağlantı tanımlandığında
              otomatik gönderilir. Hiçbir kayıt kaybolmaz.
            </Text>
          </Card>
        )}

        <Field
          label="Müşteri hesabı ara"
          value={search}
          onChangeText={setSearch}
          placeholder="Hesap adı…"
        />

        {truncated && (
          <Text style={{ color: colors.faintText, fontSize: 12 }}>
            Toplam {routes.data?.total} hesaptan ilk {rows.length} tanesi
            gösteriliyor; aramayı daraltın.
          </Text>
        )}

        {rows.length === 0 ? (
          <EmptyState
            title="Sonuç yok"
            description="Aramaya uyan müşteri hesabı bulunamadı."
          />
        ) : (
          <View style={{ gap: spacing.sm }}>
            {rows.map((row) => (
              <Card key={row.tenant_id} onPress={() => setSelectedTenantId(row.tenant_id)}>
                <View
                  style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}
                >
                  <Text
                    style={{ color: colors.text, fontSize: 15, fontWeight: "600", flex: 1 }}
                    numberOfLines={1}
                  >
                    {row.tenant_name}
                  </Text>
                  <Badge
                    label={STATUS_LABELS[row.status]}
                    color={statusColor(row.status, colors)}
                  />
                </View>
                <Text style={{ color: colors.mutedText, fontSize: 12, marginTop: 4 }}>
                  {row.hermes_group_name ?? "Hedef ekip seçilmedi"}
                  {row.route_version > 0 ? ` · sürüm ${row.route_version}` : ""}
                </Text>
                <Text style={{ color: colors.faintText, fontSize: 12, marginTop: 2 }}>
                  {row.delivery.pending} bekleyen · {row.delivery.failed} hatalı ·{" "}
                  {row.delivery.dead} ölü
                </Text>
              </Card>
            ))}
          </View>
        )}
      </View>

      {/* `key` ile tenant basina REMOUNT: modal kalici mount edildigi icin,
          kaydedilmemis bir secim ayni tenant yeniden acildiginda ekranda
          kalir ve canli route sanilirdi. */}
      <RouteModal
        key={selectedTenantId ?? "closed"}
        tenantId={selectedTenantId}
        onClose={() => setSelectedTenantId(null)}
      />
    </Screen>
  );
}

function RouteModal({
  tenantId,
  onClose,
}: {
  tenantId: string | null;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const detail = useTicketRoute(tenantId);
  const groups = useHermesGroups(!!tenantId);
  const { save, test, refreshGroups } = useTicketRoutingMutations();

  const [groupId, setGroupId] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
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
  }

  const items = useMemo(
    () => (groups.data?.items ?? detail.data?.groups ?? []).filter((g) => g.is_active),
    [groups.data, detail.data],
  );
  const stale = groups.data?.stale ?? detail.data?.catalog_stale ?? false;

  return (
    <AppModal
      visible={!!tenantId}
      onClose={onClose}
      title={detail.data?.tenant_name ?? "Ticket Yönlendirmesi"}
    >
      {detail.isLoading || !detail.data ? (
        <LoadingState />
      ) : (
        <>
          <Card>
            <KeyValueRow label="Hesap" value={detail.data.tenant_name} />
            <KeyValueRow label="Durum" value={STATUS_LABELS[detail.data.status]} />
            <KeyValueRow
              label="Teslimat"
              value={`${detail.data.delivery.pending} bekleyen · ${detail.data.delivery.failed} hatalı · ${detail.data.delivery.dead} ölü`}
            />
          </Card>

          {stale && (
            <Text style={{ color: colors.status.pending, fontSize: 12 }}>
              Ekip listesi güncel olmayabilir; kaydetmeden önce yenilemeniz önerilir.
              Mevcut yönlendirme çalışmaya devam eder.
            </Text>
          )}

          <SectionTitle title="Hedef Hermes ekibi" />
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
            {items.map((group) => (
              <Chip
                key={group.id}
                label={group.name}
                selected={groupId === group.id}
                onPress={() => setGroupId(group.id)}
              />
            ))}
            {items.length === 0 && (
              <Text style={{ color: colors.faintText, fontSize: 12 }}>
                Hermes ekip listesi henüz alınamadı.
              </Text>
            )}
          </View>

          <Button
            title="Listeyi yenile"
            variant="ghost"
            loading={refreshGroups.isPending}
            onPress={async () => {
              try {
                await refreshGroups.mutateAsync();
                setMessage({ ok: true, text: "Ekip listesi yenilendi." });
              } catch (e) {
                setMessage({
                  ok: false,
                  text: e instanceof Error ? e.message : "Yenilenemedi",
                });
              }
            }}
          />

          <SwitchRow
            label="Yönlendirme aktif"
            hint="Kapalıyken bu müşteri yeni talep açamaz; mevcut talepler etkilenmez."
            value={isActive}
            onValueChange={setIsActive}
          />

          {message && (
            <Text
              style={{
                color: message.ok ? colors.status.approved : colors.destructive,
                fontSize: 13,
              }}
            >
              {message.text}
            </Text>
          )}

          <Button
            title="Bağlantıyı Test Et"
            variant="secondary"
            disabled={!groupId || test.isPending}
            loading={test.isPending}
            onPress={async () => {
              try {
                const result = await test.mutateAsync({
                  tenantId: detail.data!.tenant_id,
                  groupId,
                });
                setMessage({
                  ok: result.ok,
                  text: result.ok
                    ? `Bağlantı doğrulandı: ${result.group_name ?? "ekip aktif"}.`
                    : (result.message ?? "Bağlantı doğrulanamadı."),
                });
              } catch (e) {
                // 403 veya Hermes kesintisi: sessiz kalirsa operator
                // "test hicbir sey yapmadi" sanir.
                setMessage({
                  ok: false,
                  text:
                    e instanceof Error ? e.message : "Bağlantı testi tamamlanamadı",
                });
              }
            }}
          />
          <Button
            title="Kaydet"
            disabled={!groupId || save.isPending}
            loading={save.isPending}
            onPress={async () => {
              try {
                const saved = await save.mutateAsync({
                  tenantId: detail.data!.tenant_id,
                  groupId,
                  isActive,
                  expectedRouteVersion: detail.data!.route_version || null,
                });
                setMessage({
                  ok: true,
                  text: `Kaydedildi · sürüm ${saved.route_version} · ${saved.hermes_group_name}`,
                });
              } catch (e) {
                setMessage({
                  ok: false,
                  text: e instanceof Error ? e.message : "Kaydedilemedi",
                });
              }
            }}
          />
        </>
      )}
    </AppModal>
  );
}
