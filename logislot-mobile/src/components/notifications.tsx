/**
 * Bildirim merkezi — web components/notifications/notification-bell.tsx
 * karşılığı. Mobilde panel yerine tam ekran liste; zil butonları bu ekrana
 * yönlendirir. Severity yalnızca görsel şiddettir.
 */

import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useState } from "react";
import { FlatList, Pressable, RefreshControl, Text, View } from "react-native";
import { adminNotifications, supplierNotifications } from "@/api/notifications";
import type { NotificationDto } from "@/api/types";
import { Button, EmptyState, ErrorState, LoadingState } from "@/components/ui";
import { useTheme } from "@/theme/theme";
import { spacing } from "@/theme/tokens";

type Variant = "admin" | "supplier";

const SEVERITY_ICON: Record<
  NotificationDto["severity"],
  { icon: keyof typeof Ionicons.glyphMap; statusKey: string }
> = {
  info: { icon: "information-circle", statusKey: "completed" },
  success: { icon: "checkmark-circle", statusKey: "approved" },
  warning: { icon: "warning", statusKey: "pending" },
  error: { icon: "close-circle", statusKey: "rejected" },
};

function timeAgo(iso: string, now: number): string {
  const minutes = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000));
  if (minutes < 1) return "şimdi";
  if (minutes < 60) return `${minutes} dk önce`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} sa önce`;
  return `${Math.round(hours / 24)} gün önce`;
}

/** Zil ikonu + okunmamış sayacı — header'lara konur, bildirim ekranına gider. */
export function NotificationBellButton({
  variant,
  facilityId,
}: {
  variant: Variant;
  facilityId: string | null;
}) {
  const { colors } = useTheme();
  const hooks = variant === "admin" ? adminNotifications : supplierNotifications;
  const unread = hooks.useUnreadCount(facilityId);
  const unreadCount = unread.data?.unread ?? 0;

  return (
    <Pressable
      onPress={() =>
        router.push(
          (variant === "admin" ? "/admin/notifications" : "/supplier/notifications") as never,
        )
      }
      hitSlop={8}
      accessibilityLabel="Bildirimler"
      style={{ padding: 6 }}
    >
      <Ionicons name="notifications-outline" size={24} color={colors.mutedText} />
      {unreadCount > 0 && (
        <View
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            minWidth: 17,
            height: 17,
            borderRadius: 9,
            paddingHorizontal: 3,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: colors.destructive,
          }}
        >
          <Text style={{ color: "#FFF", fontSize: 10, fontWeight: "700" }}>
            {unreadCount > 99 ? "99+" : unreadCount}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

/** Bildirim listesi ekran içeriği. */
export function NotificationList({
  variant,
  facilityId,
}: {
  variant: Variant;
  facilityId: string | null;
}) {
  const { colors } = useTheme();
  const hooks = variant === "admin" ? adminNotifications : supplierNotifications;
  const list = hooks.useList(facilityId);
  const unread = hooks.useUnreadCount(facilityId);
  const actions = hooks.useActions(facilityId);
  const [now] = useState(() => Date.now());

  const unreadCount = unread.data?.unread ?? 0;

  function onPressNotification(notification: NotificationDto) {
    if (!notification.is_read) {
      actions.markRead.mutate(notification.id);
    }
    if (variant === "admin") {
      const appointmentId = notification.metadata_json?.appointment_id;
      if (appointmentId) {
        router.push(`/admin/appointment/${appointmentId}` as never);
      } else {
        router.push("/admin/appointments" as never);
      }
    } else {
      router.push("/supplier/appointments" as never);
    }
  }

  if (list.isLoading) return <LoadingState label="Bildirimler yükleniyor…" />;
  if (list.isError)
    return <ErrorState message="Bildirimler yüklenemedi." onRetry={() => list.refetch()} />;

  return (
    <FlatList
      data={list.data ?? []}
      keyExtractor={(n) => n.id}
      contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm, paddingBottom: 48 }}
      refreshControl={
        <RefreshControl
          refreshing={list.isRefetching}
          onRefresh={() => void list.refetch()}
          tintColor={colors.accent}
        />
      }
      ListHeaderComponent={
        unreadCount > 0 ? (
          <Button
            title="Tümünü okundu işaretle"
            variant="secondary"
            onPress={() => actions.readAll.mutate()}
            loading={actions.readAll.isPending}
            style={{ height: 42, marginBottom: spacing.sm }}
          />
        ) : null
      }
      ListEmptyComponent={
        <EmptyState
          title="Bildirim yok"
          description="Randevu hareketleri burada görünür."
        />
      }
      renderItem={({ item }) => {
        const config = SEVERITY_ICON[item.severity] ?? SEVERITY_ICON.info;
        const isCargo = item.type === "cargo_advisory";
        const iconColor = isCargo
          ? colors.cargo
          : (colors.status[config.statusKey as keyof typeof colors.status] ??
            colors.mutedText);
        return (
          <Pressable
            onPress={() => onPressNotification(item)}
            style={({ pressed }) => ({
              flexDirection: "row",
              gap: spacing.md,
              padding: spacing.md,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: item.is_read ? colors.card : `${colors.accent}0D`,
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <Ionicons
              name={isCargo ? "cube" : config.icon}
              size={20}
              color={iconColor}
              style={{ marginTop: 1 }}
            />
            <View style={{ flex: 1, gap: 2 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Text
                  numberOfLines={1}
                  style={{
                    flex: 1,
                    color: colors.text,
                    fontSize: 14,
                    fontWeight: item.is_read ? "500" : "700",
                  }}
                >
                  {item.title}
                </Text>
                {!item.is_read && (
                  <View
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 4,
                      backgroundColor: colors.accent,
                    }}
                  />
                )}
              </View>
              {item.body && (
                <Text numberOfLines={2} style={{ color: colors.mutedText, fontSize: 12 }}>
                  {item.body}
                </Text>
              )}
              <Text style={{ color: colors.faintText, fontSize: 11 }}>
                {timeAgo(item.created_at, now)}
              </Text>
            </View>
            <Pressable
              onPress={() => actions.remove.mutate(item.id)}
              hitSlop={8}
              accessibilityLabel="Bildirimi sil"
            >
              <Ionicons name="trash-outline" size={17} color={colors.faintText} />
            </Pressable>
          </Pressable>
        );
      }}
    />
  );
}
