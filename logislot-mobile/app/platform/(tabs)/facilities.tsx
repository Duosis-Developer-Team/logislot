import { FlatList, RefreshControl, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { usePlatformFacilities, usePlatformTenants } from "@/api/platform";
import { Badge, Card, EmptyState, ErrorState, LoadingState } from "@/components/ui";
import { useTheme } from "@/theme/theme";
import { spacing } from "@/theme/tokens";

/** Platform — Tesis dizini (web platform/facilities karşılığı). */
export default function PlatformFacilities() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const facilities = usePlatformFacilities();
  const tenants = usePlatformTenants();

  const tenantName = (id: string) =>
    tenants.data?.find((t) => t.id === id)?.display_name ?? "—";

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <FlatList
        data={facilities.data ?? []}
        keyExtractor={(f) => f.id}
        contentContainerStyle={{
          padding: spacing.lg,
          paddingTop: insets.top + spacing.md,
          gap: spacing.md,
          paddingBottom: spacing.xl * 2,
        }}
        refreshControl={
          <RefreshControl
            refreshing={facilities.isRefetching}
            onRefresh={() => void facilities.refetch()}
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
            Tesisler
          </Text>
        }
        renderItem={({ item }) => (
          <Card style={{ gap: 6 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
              <Text style={{ color: colors.text, fontSize: 15, fontWeight: "700", flex: 1 }}>
                {item.name}
              </Text>
              <Badge
                label={item.status === "active" ? "Aktif" : item.status}
                color={item.status === "active" ? colors.status.approved : colors.status.cancelled}
              />
            </View>
            <Text style={{ color: colors.mutedText, fontSize: 13 }}>
              {tenantName(item.tenant_id)} · {item.timezone}
            </Text>
            {item.address && (
              <Text style={{ color: colors.faintText, fontSize: 12 }}>{item.address}</Text>
            )}
          </Card>
        )}
        ListEmptyComponent={
          facilities.isLoading ? (
            <LoadingState />
          ) : facilities.isError ? (
            <ErrorState message="Tesisler yüklenemedi." onRetry={() => facilities.refetch()} />
          ) : (
            <EmptyState title="Tesis yok" />
          )
        }
      />
    </View>
  );
}
