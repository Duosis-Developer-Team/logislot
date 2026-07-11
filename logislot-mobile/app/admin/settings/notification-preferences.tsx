/** Bildirim Tercihleri (admin) — web admin layout'taki tercih formunun ekran karşılığı. */

import { ScrollView, View } from "react-native";
import { NotificationPreferencesForm } from "@/components/notification-preferences";
import { useTheme } from "@/theme/theme";
import { spacing } from "@/theme/tokens";

export default function AdminNotificationPreferences() {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 64 }}>
        <NotificationPreferencesForm />
      </ScrollView>
    </View>
  );
}
