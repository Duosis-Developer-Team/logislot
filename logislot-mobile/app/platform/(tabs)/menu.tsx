import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSession } from "@/auth/session";
import { ThemeAndLogoutSection } from "@/components/settings";
import { Card, Screen, SectionTitle } from "@/components/ui";
import { useTheme } from "@/theme/theme";
import { spacing } from "@/theme/tokens";

/** Platform — Menü: hesap + tema + çıkış. */
export default function PlatformMenu() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const session = useSession();

  return (
    <Screen style={{ paddingTop: insets.top }}>
      <View style={{ gap: spacing.md }}>
        <Text style={{ color: colors.text, fontSize: 24, fontWeight: "800" }}>Menü</Text>
        <SectionTitle title="Hesap" />
        <Card style={{ gap: 4 }}>
          <Text style={{ color: colors.text, fontSize: 15, fontWeight: "600" }}>
            {session.me?.name}
          </Text>
          <Text style={{ color: colors.mutedText, fontSize: 13 }}>{session.me?.email}</Text>
          <Text style={{ color: colors.faintText, fontSize: 12 }}>Platform Yöneticisi</Text>
        </Card>
        <ThemeAndLogoutSection />
        <Text style={{ color: colors.faintText, fontSize: 11, textAlign: "center" }}>
          Planlar, destek sağlığı ve denetim izleri için web panelini kullanın —
          mobile karşılıkları sıradaki sprintte.
        </Text>
      </View>
    </Screen>
  );
}
