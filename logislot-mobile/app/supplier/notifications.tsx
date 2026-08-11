import { View } from "react-native";
import { NotificationList } from "@/components/notifications";
import { useTheme } from "@/theme/theme";

/** Tedarikçi bildirim merkezi — web zil panelinin tam ekran karşılığı. */
export default function SupplierNotifications() {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <NotificationList variant="supplier" facilityId={null} />
    </View>
  );
}
