import { FlatList, RefreshControl, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { usePlatformTenants } from "@/api/platform";
import { Badge, Card, EmptyState, ErrorState, LoadingState } from "@/components/ui";
import { useTheme } from "@/theme/theme";
import { spacing } from "@/theme/tokens";

/** Platform — Tenant dizini (web platform/tenants karşılığı, card/list pattern). */
export default function PlatformTenants() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const tenants = usePlatformTenants();

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <FlatList
        data={tenants.data ?? []}
        keyExtractor={(t) => t.id}
        contentContainerStyle={{
          padding: spacing.lg,
          paddingTop: insets.top + spacing.md,
          gap: spacing.md,
          paddingBottom: spacing.xl * 2,
        }}
        refreshControl={
          <RefreshControl
            refreshing={tenants.isRefetching}
            onRefresh={() => void tenants.refetch()}
            tintColor={colors.accent}
          />
        }
        ListHeaderComponent={
          <Text
            style={{
              color: colors.text,
              fontSize: 24,
              fontWeight: "800",
              marginBottom: spacing.sm,
            }}
          >
            Tenant Dizini
          </Text>
        }
        renderItem={({ item }) => (
          <Card style={{ gap: 6 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
              <Text style={{ color: colors.text, fontSize: 15, fontWeight: "700", flex: 1 }}>
                {item.display_name}
              </Text>
              <Badge
                label={item.status === "active" ? "Aktif" : item.status}
                color={item.status === "active" ? colors.status.approved : colors.status.cancelled}
              />
            </View>
            <Text style={{ color: colors.mutedText, fontSize: 13 }}>
              {item.commercial_name}
            </Text>
            {item.primary_contact_email && (
              <Text style={{ color: colors.faintText, fontSize: 12 }}>
                {item.primary_contact_name ?? ""} · {item.primary_contact_email}
              </Text>
            )}
          </Card>
        )}
        ListEmptyComponent={
          tenants.isLoading ? (
            <LoadingState />
          ) : tenants.isError ? (
            <ErrorState message="Tenantlar yüklenemedi." onRetry={() => tenants.refetch()} />
          ) : (
            <EmptyState title="Tenant yok" />
          )
        }
      />
    </View>
  );
}
