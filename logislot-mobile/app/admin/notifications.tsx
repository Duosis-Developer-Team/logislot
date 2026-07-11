import { View } from "react-native";
import { useSession } from "@/auth/session";
import { NotificationList } from "@/components/notifications";
import { useTheme } from "@/theme/theme";

/** Yönetim bildirim merkezi — web zil panelinin tam ekran karşılığı. */
export default function AdminNotifications() {
  const { colors } = useTheme();
  const session = useSession();
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <NotificationList variant="admin" facilityId={session.activeFacilityId} />
    </View>
  );
}
