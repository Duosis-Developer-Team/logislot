/**
 * Portal-specific login ekranı — PORTAL SWITCHER YOKTUR.
 * Mobile'da yalnızca supplier + admin portalları vardır; Platform Yönetimi
 * mobile'da BİLİNÇLİ olarak yoktur (hidden internal web portalı — bkz.
 * docs/PORTAL_ISOLATION_AND_ROUTING.md).
 *
 * Login sonrası client rol doğrulaması: /auth/me user_type portal ile
 * uyuşmazsa oturum temizlenir ve net hata gösterilir (backend endpoint
 * ayrımı zaten cross-portal login'i engeller; bu savunma derinliğidir).
 */

import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { authApi } from "@/api/auth";
import { clearSession, storeSession, type Portal } from "@/api/client";
import { useSession } from "@/auth/session";
import { LogiSlotLogo } from "@/components/brand";
import { Button, Card, Field } from "@/components/ui";
import { useTheme } from "@/theme/theme";
import { spacing } from "@/theme/tokens";

interface PortalScreenConfig {
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  demo: string;
  target: string;
  expectedUserType: "supplier" | "tenant";
  wrongRoleMessage: string;
}

const CONFIGS: Record<"supplier" | "admin", PortalScreenConfig> = {
  supplier: {
    title: "Tedarikçi Portalı",
    subtitle:
      "Teslimat randevularınızı oluşturun, takip edin ve güncel durumları görüntüleyin.",
    icon: "car-outline",
    demo: "tedarikci@anadoluun.com",
    target: "/supplier/appointments",
    expectedUserType: "supplier",
    wrongRoleMessage:
      "Bu hesap Tedarikçi Portalı için yetkili değil. Lütfen doğru portal üzerinden giriş yapın.",
  },
  admin: {
    title: "Yönetim Paneli",
    subtitle: "Rampa takvimini, onay süreçlerini ve tesis operasyonlarını yönetin.",
    icon: "business-outline",
    demo: "admin@cakesbakes.com",
    target: "/admin/dashboard",
    expectedUserType: "tenant",
    wrongRoleMessage:
      "Bu hesap Yönetim Paneli için yetkili değil. Lütfen doğru portal üzerinden giriş yapın.",
  },
};

export function PortalLoginScreen({ portal }: { portal: "supplier" | "admin" }) {
  const { colors, resolved, setMode } = useTheme();
  const session = useSession();
  const insets = useSafeAreaInsets();
  const config = CONFIGS[portal];
  const [email, setEmail] = useState(config.demo);
  const [password, setPassword] = useState("Demo123!");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    setError(null);
    setLoading(true);
    try {
      const tokens = await authApi.login(portal as Portal, email.trim(), password);
      await storeSession(tokens.access_token, portal as Portal, tokens.refresh_token);
      if (tokens.must_change_password) {
        session.refresh();
        router.replace("/change-password");
        return;
      }
      // Rol doğrulaması: bu portal için yetkili değilse oturumu düşür.
      const me = await session.reloadMe();
      if (!me || me.user_type !== config.expectedUserType) {
        await clearSession();
        session.refresh();
        setError(config.wrongRoleMessage);
        return;
      }
      router.replace(config.target as never);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Giriş başarısız — API'ye ulaşılamadı.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: "center",
          padding: spacing.xl,
          paddingTop: insets.top + spacing.xl,
          paddingBottom: insets.bottom + spacing.xl,
        }}
        keyboardShouldPersistTaps="handled"
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

        <View style={{ alignItems: "center", marginBottom: spacing.xl }}>
          <LogiSlotLogo height={52} />
        </View>

        <Card style={{ gap: spacing.lg }}>
          <View style={{ alignItems: "center", gap: spacing.sm }}>
            <View
              style={{
                width: 52,
                height: 52,
                borderRadius: 16,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: `${colors.accent}18`,
              }}
            >
              <Ionicons name={config.icon} size={26} color={colors.accent} />
            </View>
            <Text style={{ color: colors.text, fontSize: 22, fontWeight: "700" }}>
              {config.title}
            </Text>
            <Text
              style={{
                color: colors.mutedText,
                fontSize: 13,
                textAlign: "center",
                lineHeight: 19,
              }}
            >
              {config.subtitle}
            </Text>
          </View>

          <Field
            label="E-posta"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
          />
          <View>
            <Field
              label="Parola"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
            />
            <Pressable
              onPress={() => setShowPassword((v) => !v)}
              style={{ position: "absolute", right: 12, bottom: 13 }}
              accessibilityLabel={showPassword ? "Parolayı gizle" : "Parolayı göster"}
            >
              <Ionicons
                name={showPassword ? "eye-off-outline" : "eye-outline"}
                size={20}
                color={colors.mutedText}
              />
            </Pressable>
          </View>

          {error && (
            <View
              style={{
                flexDirection: "row",
                gap: 8,
                padding: 12,
                borderRadius: 12,
                backgroundColor: `${colors.destructive}15`,
              }}
            >
              <Ionicons name="alert-circle" size={18} color={colors.destructive} />
              <Text style={{ color: colors.destructive, fontSize: 13, flex: 1 }}>
                {error}
              </Text>
            </View>
          )}

          <Button title="Giriş Yap" onPress={() => void handleSubmit()} loading={loading} />

          <Text style={{ color: colors.faintText, fontSize: 12, textAlign: "center" }}>
            Demo hesap: {config.demo} / Demo123!
          </Text>
        </Card>

        <Pressable
          onPress={() => router.replace("/login")}
          style={{ marginTop: spacing.lg, alignItems: "center" }}
          accessibilityRole="link"
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Ionicons name="arrow-back" size={15} color={colors.mutedText} />
            <Text style={{ color: colors.mutedText, fontSize: 13 }}>
              Portal seçimine geri dön
            </Text>
          </View>
        </Pressable>

        <Text
          style={{
            color: colors.faintText,
            fontSize: 11,
            textAlign: "center",
            marginTop: spacing.xl,
          }}
        >
          © 2026 LogiSlot · Kurumsal lojistik operasyon platformu
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
