/**
 * Denetim izi listesi — web admin/settings/audit-logs ve platform/audit-logs
 * sayfalarının ortak mobil karşılığı. Filtre + sayfalama + before/after detayı.
 */

import { useState } from "react";
import { FlatList, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import type { UseQueryResult } from "@tanstack/react-query";
import type { AuditEntryDto, AuditListDto } from "@/api/types";
import {
  AppModal,
  Badge,
  Button,
  Card,
  Chip,
  EmptyState,
  ErrorState,
  Field,
  LoadingState,
} from "@/components/ui";
import { useTheme } from "@/theme/theme";
import { spacing } from "@/theme/tokens";

const ACTOR_LABELS: Record<string, string> = {
  tenant_user: "Hesap kullanıcısı",
  supplier_user: "Tedarikçi",
  platform_user: "Platform",
  system: "Sistem",
};

const ENTITY_OPTIONS = [
  ["", "Tümü"],
  ["appointment", "Randevu"],
  ["appointment_series", "Seri"],
  ["supplier", "Tedarikçi"],
  ["tenant_user", "Kullanıcı"],
  ["role", "Rol"],
  ["email_log", "E-posta"],
] as const;

export interface AuditFilterState {
  entityType: string;
  search: string;
  offset: number;
}

export function AuditLogList({
  query,
  filters,
  onFilters,
}: {
  query: UseQueryResult<AuditListDto>;
  filters: AuditFilterState;
  onFilters: (next: AuditFilterState) => void;
}) {
  const { colors } = useTheme();
  const [detail, setDetail] = useState<AuditEntryDto | null>(null);

  if (query.isLoading)
    return (
      <View style={{ flex: 1, justifyContent: "center", backgroundColor: colors.background }}>
        <LoadingState />
      </View>
    );
  if (query.isError || !query.data)
    return (
      <View style={{ flex: 1, justifyContent: "center", backgroundColor: colors.background }}>
        <ErrorState message="Denetim izleri yüklenemedi." onRetry={() => query.refetch()} />
      </View>
    );

  const data = query.data;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <FlatList
        data={data.items}
        keyExtractor={(e) => e.id}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 64 }}
        refreshControl={
          <RefreshControl
            refreshing={query.isRefetching}
            onRefresh={() => void query.refetch()}
            tintColor={colors.accent}
          />
        }
        ListHeaderComponent={
          <View style={{ gap: spacing.md, marginBottom: spacing.sm }}>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {ENTITY_OPTIONS.map(([value, label]) => (
                <Chip
                  key={value || "all"}
                  label={label}
                  selected={filters.entityType === value}
                  onPress={() => onFilters({ ...filters, entityType: value, offset: 0 })}
                />
              ))}
            </View>
            <Field
              value={filters.search}
              onChangeText={(t) => onFilters({ ...filters, search: t, offset: 0 })}
              placeholder="Özet/aksiyon ara…"
              autoCapitalize="none"
            />
          </View>
        }
        ListEmptyComponent={
          <EmptyState title="Kayıt yok" description="Filtrelerle eşleşen denetim izi yok." />
        }
        ListFooterComponent={
          data.total > 50 ? (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                marginTop: spacing.md,
              }}
            >
              <Button
                title="← Önceki"
                variant="secondary"
                disabled={filters.offset === 0}
                onPress={() =>
                  onFilters({ ...filters, offset: Math.max(0, filters.offset - 50) })
                }
                style={{ height: 40, paddingHorizontal: 16 }}
              />
              <Text style={{ color: colors.mutedText, fontSize: 12 }}>
                {filters.offset + 1}–{Math.min(filters.offset + 50, data.total)} / {data.total}
              </Text>
              <Button
                title="Sonraki →"
                variant="secondary"
                disabled={filters.offset + 50 >= data.total}
                onPress={() => onFilters({ ...filters, offset: filters.offset + 50 })}
                style={{ height: 40, paddingHorizontal: 16 }}
              />
            </View>
          ) : null
        }
        renderItem={({ item: entry }) => (
          <Pressable onPress={() => setDetail(entry)}>
            <Card style={{ gap: 4 }}>
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  gap: spacing.sm,
                }}
              >
                <Text style={{ color: colors.text, fontSize: 13, flex: 1 }}>{entry.summary}</Text>
                <Badge label={entry.action} color={colors.accent} />
              </View>
              <Text style={{ color: colors.faintText, fontSize: 11 }}>
                {new Date(entry.created_at).toLocaleString("tr-TR")} ·{" "}
                {ACTOR_LABELS[entry.actor_type] ?? entry.actor_type}
                {entry.actor_name ? ` (${entry.actor_name})` : ""}
                {entry.entity_type ? ` · ${entry.entity_type}` : ""}
              </Text>
            </Card>
          </Pressable>
        )}
      />

      <AppModal visible={detail !== null} onClose={() => setDetail(null)} title="Denetim Detayı">
        {detail && (
          <View style={{ gap: spacing.md }}>
            <Text style={{ color: colors.text, fontSize: 14 }}>{detail.summary}</Text>
            <Text style={{ color: colors.mutedText, fontSize: 12 }}>
              {new Date(detail.created_at).toLocaleString("tr-TR")} ·{" "}
              {ACTOR_LABELS[detail.actor_type] ?? detail.actor_type}
              {detail.actor_name ? ` (${detail.actor_name})` : ""}
            </Text>
            <JsonBlock title="Önce" value={detail.before} />
            <JsonBlock title="Sonra" value={detail.after} />
            <JsonBlock title="Metadata" value={detail.metadata} />
          </View>
        )}
      </AppModal>
    </View>
  );
}

function JsonBlock({
  title,
  value,
}: {
  title: string;
  value: Record<string, unknown> | null;
}) {
  const { colors } = useTheme();
  if (!value || Object.keys(value).length === 0) return null;
  return (
    <View style={{ gap: 4 }}>
      <Text
        style={{
          color: colors.mutedText,
          fontSize: 11,
          fontWeight: "700",
          textTransform: "uppercase",
          letterSpacing: 0.6,
        }}
      >
        {title}
      </Text>
      <ScrollView
        horizontal
        style={{
          maxHeight: 220,
          borderRadius: 10,
          backgroundColor: `${colors.mutedText}14`,
        }}
        contentContainerStyle={{ padding: spacing.md }}
      >
        <Text style={{ color: colors.text, fontSize: 11, fontFamily: "Courier" }}>
          {JSON.stringify(value, null, 2)}
        </Text>
      </ScrollView>
    </View>
  );
}
