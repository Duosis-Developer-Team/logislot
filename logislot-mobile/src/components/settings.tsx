/** Tema seçici + çıkış — tüm portallerin menü/profil ekranlarında ortak. */

import { Ionicons } from "@expo/vector-icons";
import { Alert, Text, View } from "react-native";
import { useSession } from "@/auth/session";
import { Button, Card, Chip, SectionTitle } from "@/components/ui";
import { useTheme, type ThemeMode } from "@/theme/theme";
import { spacing } from "@/theme/tokens";

const MODES: { value: ThemeMode; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { value: "light", label: "Açık", icon: "sunny-outline" },
  { value: "dark", label: "Koyu", icon: "moon-outline" },
  { value: "system", label: "Sistem", icon: "phone-portrait-outline" },
];

export function ThemeAndLogoutSection() {
  const { colors, mode, setMode } = useTheme();
  const session = useSession();

  function confirmLogout() {
    Alert.alert("Çıkış Yap", "Oturumunuz kapatılacak. Emin misiniz?", [
      { text: "Vazgeç", style: "cancel" },
      { text: "Çıkış Yap", style: "destructive", onPress: () => session.logout() },
    ]);
  }

  return (
    <View style={{ gap: spacing.md }}>
      <SectionTitle title="Görünüm" />
      <Card style={{ gap: spacing.sm }}>
        <Text style={{ color: colors.mutedText, fontSize: 13 }}>Tema</Text>
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          {MODES.map((m) => (
            <Chip
              key={m.value}
              label={m.label}
              selected={mode === m.value}
              onPress={() => setMode(m.value)}
            />
          ))}
        </View>
      </Card>
      <Button title="Çıkış Yap" variant="destructive" onPress={confirmLogout} />
    </View>
  );
}
