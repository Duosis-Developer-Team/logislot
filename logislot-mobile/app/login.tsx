import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LogiSlotLogo } from "@/components/brand";
import { useTheme } from "@/theme/theme";
import { spacing } from "@/theme/tokens";

/**
 * Public portal seçimi — email/parola YOKTUR; yalnızca kullanıcı portalları
 * listelenir: Tedarikçi Portalı + Yönetim Paneli.
 *
 * Platform Yönetimi mobile'da BİLİNÇLİ olarak yoktur (hidden internal web
 * portalı; public discovery yapılmaz — bkz. docs/PORTAL_ISOLATION_AND_ROUTING.md).
 */

const PORTALS: {
  key: "supplier" | "admin";
  title: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  route: string;
}[] = [
  {
    key: "supplier",
    title: "Tedarikçi Portalı",
    description: "Tesise teslimat randevusu oluşturun ve takip edin.",
    icon: "car-outline",
    route: "/supplier-login",
  },
  {
    key: "admin",
    title: "Yönetim Paneli",
    description: "Rampa takvimi, onaylar ve operasyon yönetimi.",
    icon: "business-outline",
    route: "/admin-login",
  },
];

export default function PortalSelection() {
  const { colors, resolved, setMode } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: "center",
          padding: spacing.xl,
          paddingTop: insets.top + spacing.xl,
          paddingBottom: insets.bottom + spacing.xl,
        }}
      >
        {/* Tema anahtarı */}
        <Pressable
          onPress={() => setMode(resolved === "dark" ? "light" : "dark")}
          style={{ position: "absolute", top: insets.top + 8, right: 16, padding: 8 }}
          accessibilityLabel={resolved === "dark" ? "Aydınlık moda geç" : "Karanlık moda geç"}
        >
          <Ionicons
            name={resolved === "dark" ? "moon" : "sunny"}
            size={22}
            color={colors.mutedText}
          />
        </Pressable>

        <View style={{ alignItems: "center", marginBottom: spacing.xl * 1.5 }}>
          <LogiSlotLogo height={56} />
          <Text
            style={{
              color: colors.text,
              fontSize: 22,
              fontWeight: "800",
              marginTop: spacing.lg,
              textAlign: "center",
            }}
          >
            LogiSlot&apos;a hoş geldiniz
          </Text>
          <Text
            style={{
              color: colors.mutedText,
              fontSize: 14,
              marginTop: 6,
              textAlign: "center",
              lineHeight: 20,
            }}
          >
            Devam etmek istediğiniz portalı seçin.
          </Text>
        </View>

        <View style={{ gap: spacing.md }}>
          {PORTALS.map((portal) => (
            <Pressable
              key={portal.key}
              onPress={() => router.push(portal.route as never)}
              accessibilityRole="button"
              style={({ pressed }) => ({
                flexDirection: "row",
                alignItems: "center",
                gap: spacing.lg,
                padding: spacing.xl,
                borderRadius: 20,
                borderWidth: 1.5,
                borderColor: pressed ? colors.accent : colors.border,
                backgroundColor: pressed ? `${colors.accent}0D` : colors.card,
                transform: [{ scale: pressed ? 0.98 : 1 }],
              })}
            >
              <View
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 18,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: colors.primary,
                }}
              >
                <Ionicons name={portal.icon} size={26} color={colors.primaryText} />
              </View>
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={{ color: colors.text, fontSize: 17, fontWeight: "700" }}>
                  {portal.title}
                </Text>
                <Text style={{ color: colors.mutedText, fontSize: 13, lineHeight: 18 }}>
                  {portal.description}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.faintText} />
            </Pressable>
          ))}
        </View>

        <Text
          style={{
            color: colors.faintText,
            fontSize: 11,
            textAlign: "center",
            marginTop: spacing.xl * 1.5,
          }}
        >
          © 2026 LogiSlot · Kurumsal lojistik operasyon platformu
        </Text>
      </ScrollView>
    </View>
  );
}
