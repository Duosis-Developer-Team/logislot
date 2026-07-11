import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSession } from "@/auth/session";
import { ThemeAndLogoutSection } from "@/components/settings";
import { Card, Chip, Screen, SectionTitle } from "@/components/ui";
import { useTheme } from "@/theme/theme";
import { spacing } from "@/theme/tokens";

/**
 * Yönetim — Menü: tesis seçici + hesap + tema + çıkış.
 * Web'deki topbar tesis seçici ve UserMenu'nün mobile karşılığı.
 * Not: Kategoriler/rampalar/kullanıcılar gibi config CRUD ekranları backlog'da
 * (docs/FEATURE_PARITY_MATRIX.md) — mimari hazır, sıradaki sprintte eklenecek.
 */
export default function AdminMenu() {
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
        </Card>

        {(session.me?.facilities.length ?? 0) > 0 && (
          <>
            <SectionTitle title="Aktif Tesis" />
            <Card style={{ gap: spacing.sm }}>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
                {session.me!.facilities.map((f) => (
                  <Chip
                    key={f.id}
                    label={f.name}
                    selected={session.activeFacilityId === f.id}
                    onPress={() => session.setActiveFacilityId(f.id)}
                  />
                ))}
              </View>
            </Card>
          </>
        )}

        <ThemeAndLogoutSection />

        <Text style={{ color: colors.faintText, fontSize: 11, textAlign: "center" }}>
          Tesis konfigürasyonları (kategoriler, rampalar, kullanıcılar…) için web
          panelini kullanın — mobile karşılıkları sıradaki sprintte.
        </Text>
      </View>
    </Screen>
  );
}
