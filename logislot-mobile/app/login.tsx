import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Animated, Easing, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LogiSlotIcon, LogiSlotLogo } from "@/components/brand";
import { useTheme } from "@/theme/theme";
import { spacing } from "@/theme/tokens";

/**
 * Public giriş — web landing'in mobil eşleniği: büyük marka ikonu (temaya
 * uygun asset, hafif float animasyonu) + ürün mesajı + KOMPAKT ikonlu portal
 * geçişi (yalnızca Tedarikçi + Yönetim; uzun liste yerine web'deki eski
 * seçici gibi yan yana kartlar).
 *
 * Platform Yönetimi mobile'da BİLİNÇLİ olarak yoktur (hidden internal web
 * portalı; public discovery yapılmaz — bkz. docs/PORTAL_ISOLATION_AND_ROUTING.md).
 */

const HIGHLIGHTS = [
  "Tesis bazlı kurallar",
  "Akıllı rampa yönlendirme",
  "Gerçek müsaitlik",
  "Tedarikçi portalı",
];

const PORTALS: {
  key: "supplier" | "admin";
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  route: string;
}[] = [
  { key: "supplier", title: "Tedarikçi Portalı", icon: "car-outline", route: "/supplier-login" },
  { key: "admin", title: "Yönetim Paneli", icon: "business-outline", route: "/admin-login" },
];

export default function PortalSelection() {
  const { colors, resolved, setMode } = useTheme();
  const insets = useSafeAreaInsets();
  // Büyük ikon için hafif yüzme animasyonu (reduced-motion eşleniği yok;
  // amplitüt küçük tutuldu, performans için native driver kullanılır).
  const [floatY] = useState(() => new Animated.Value(0));

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(floatY, {
          toValue: -8,
          duration: 2600,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(floatY, {
          toValue: 0,
          duration: 2600,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [floatY]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: "center",
          padding: spacing.xl,
          paddingTop: insets.top + spacing.lg,
          paddingBottom: insets.bottom + spacing.xl,
        }}
      >
        {/* Tema anahtarı */}
        <Pressable
          onPress={() => setMode(resolved === "dark" ? "light" : "dark")}
          style={{ position: "absolute", top: insets.top + 8, right: 16, padding: 8, zIndex: 10 }}
          accessibilityLabel={resolved === "dark" ? "Aydınlık moda geç" : "Karanlık moda geç"}
        >
          <Ionicons
            name={resolved === "dark" ? "moon" : "sunny"}
            size={22}
            color={colors.mutedText}
          />
        </Pressable>

        {/* Büyük marka ikonu — glow zemin + float */}
        <View style={{ alignItems: "center" }}>
          <View style={{ alignItems: "center", justifyContent: "center" }}>
            <View
              style={{
                position: "absolute",
                width: 210,
                height: 210,
                borderRadius: 105,
                backgroundColor: `${colors.accent}14`,
              }}
            />
            <View
              style={{
                position: "absolute",
                width: 160,
                height: 160,
                borderRadius: 80,
                borderWidth: 1,
                borderStyle: "dashed",
                borderColor: `${colors.accent}45`,
              }}
            />
            <Animated.View style={{ transform: [{ translateY: floatY }] }}>
              <LogiSlotIcon size={132} />
            </Animated.View>
          </View>

          <View style={{ marginTop: spacing.lg }}>
            <LogiSlotLogo height={34} />
          </View>

          <Text
            style={{
              color: colors.text,
              fontSize: 21,
              fontWeight: "800",
              marginTop: spacing.lg,
              textAlign: "center",
              lineHeight: 28,
            }}
          >
            Akıllı mal kabul ve rampa{"\n"}randevu platformu
          </Text>
          <Text
            style={{
              color: colors.mutedText,
              fontSize: 13,
              marginTop: 8,
              textAlign: "center",
              lineHeight: 19,
            }}
          >
            Tedarikçi randevularını, rampa uygunluğunu ve teslimat akışını tek
            akışta yönetin.
          </Text>

          {/* Değer rozetleri */}
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              justifyContent: "center",
              gap: 6,
              marginTop: spacing.md,
            }}
          >
            {HIGHLIGHTS.map((item) => (
              <View
                key={item}
                style={{
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: colors.card,
                  borderRadius: 999,
                  paddingHorizontal: 10,
                  paddingVertical: 4,
                }}
              >
                <Text style={{ color: colors.mutedText, fontSize: 11, fontWeight: "500" }}>
                  {item}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* Kompakt portal seçimi — ikonlu yan yana kartlar */}
        <View style={{ marginTop: spacing.xl }}>
          <Text
            style={{
              color: colors.faintText,
              fontSize: 11,
              fontWeight: "700",
              letterSpacing: 1.2,
              textTransform: "uppercase",
              textAlign: "center",
              marginBottom: spacing.md,
            }}
          >
            Portalınızı seçin
          </Text>
          <View style={{ flexDirection: "row", gap: spacing.md }}>
            {PORTALS.map((portal) => (
              <Pressable
                key={portal.key}
                onPress={() => router.push(portal.route as never)}
                accessibilityRole="button"
                accessibilityLabel={portal.title}
                style={({ pressed }) => ({
                  flex: 1,
                  alignItems: "center",
                  gap: spacing.sm,
                  paddingVertical: spacing.xl,
                  paddingHorizontal: spacing.md,
                  borderRadius: 20,
                  borderWidth: 1.5,
                  borderColor: pressed ? colors.accent : colors.border,
                  backgroundColor: pressed ? `${colors.accent}0D` : colors.card,
                  transform: [{ scale: pressed ? 0.97 : 1 }],
                })}
              >
                <View
                  style={{
                    width: 58,
                    height: 58,
                    borderRadius: 18,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: colors.primary,
                  }}
                >
                  <Ionicons name={portal.icon} size={28} color={colors.primaryText} />
                </View>
                <Text
                  style={{
                    color: colors.text,
                    fontSize: 14,
                    fontWeight: "700",
                    textAlign: "center",
                  }}
                >
                  {portal.title}
                </Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                  <Text style={{ color: colors.accent, fontSize: 12, fontWeight: "600" }}>
                    Devam et
                  </Text>
                  <Ionicons name="arrow-forward" size={13} color={colors.accent} />
                </View>
              </Pressable>
            ))}
          </View>
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
