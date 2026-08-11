import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSession } from "@/auth/session";
import { ThemeAndLogoutSection } from "@/components/settings";
import { Card, Screen, SectionTitle } from "@/components/ui";
import { useTheme } from "@/theme/theme";
import { spacing } from "@/theme/tokens";

/** Platform — Menü: hesap + platform araçları + tema + çıkış. */

const ENTRIES: { title: string; icon: keyof typeof Ionicons.glyphMap; route: string }[] = [
  { title: "Planlar", icon: "layers-outline", route: "/platform/plans" },
  { title: "Pilot Destek", icon: "medkit-outline", route: "/platform/support" },
  { title: "Denetim İzleri", icon: "document-text-outline", route: "/platform/audit-logs" },
];

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

        <SectionTitle title="Platform Araçları" />
        <Card style={{ padding: 0, overflow: "hidden" }}>
          {ENTRIES.map((entry, i) => (
            <Pressable
              key={entry.route}
              onPress={() => router.push(entry.route as never)}
              style={({ pressed }) => ({
                flexDirection: "row",
                alignItems: "center",
                gap: spacing.md,
                paddingHorizontal: spacing.lg,
                paddingVertical: 14,
                borderTopWidth: i > 0 ? 1 : 0,
                borderTopColor: colors.border,
                backgroundColor: pressed ? `${colors.mutedText}12` : "transparent",
              })}
            >
              <Ionicons name={entry.icon} size={20} color={colors.accent} />
              <Text style={{ color: colors.text, fontSize: 15, fontWeight: "500", flex: 1 }}>
                {entry.title}
              </Text>
              <Ionicons name="chevron-forward" size={17} color={colors.faintText} />
            </Pressable>
          ))}
        </Card>

        <ThemeAndLogoutSection />
      </View>
    </Screen>
  );
}
