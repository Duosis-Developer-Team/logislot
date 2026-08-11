/**
 * Tedarikçi Bildirimleri (yönetim) — web
 * app/(admin)/admin/settings/supplier-notifications karşılığı.
 *
 * Tedarikçiye hangi bildirimin gideceğine YÖNETİM karar verir; tedarikçi bu
 * tercihleri kendi panelinde ne görür ne değiştirir.
 */

import { ScrollView, Text, View } from "react-native";
import { useSession } from "@/auth/session";
import { SupplierNotificationPolicyForm } from "@/components/notification-preferences";
import { useTheme } from "@/theme/theme";
import { spacing } from "@/theme/tokens";

export default function AdminSupplierNotifications() {
  const { colors } = useTheme();
  const session = useSession();

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 64 }}>
        {session.can("supplier.manage") ? (
          <View style={{ gap: spacing.md }}>
            <Text style={{ color: colors.mutedText, fontSize: 13 }}>
              Tedarikçilere hangi panel bildirimlerinin ve e-postaların gideceğini burada
              belirlersiniz. Tedarikçiler bu tercihleri kendi panellerinden göremez ve
              değiştiremez.
            </Text>
            <SupplierNotificationPolicyForm facilityId={session.activeFacilityId} />
          </View>
        ) : (
          <Text style={{ color: colors.mutedText, fontSize: 13 }}>
            Bu sayfayı görüntülemek için tedarikçi yönetimi yetkisi gerekir.
          </Text>
        )}
      </ScrollView>
    </View>
  );
}
