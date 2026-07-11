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
import { storeSession, type Portal } from "@/api/client";
import { useSession } from "@/auth/session";
import { LogiSlotLogo } from "@/components/brand";
import { Button, Card, Field } from "@/components/ui";
import { useTheme } from "@/theme/theme";
import { spacing } from "@/theme/tokens";

/** Portal seçimi + giriş — web (auth)/login ile aynı davranış ve demo hesaplar. */

const PORTALS: {
  key: Portal;
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  demo: string;
  target: string;
}[] = [
  {
    key: "supplier",
    title: "Tedarikçi",
    icon: "car-outline",
    demo: "tedarikci@anadoluun.com",
    target: "/supplier/appointments",
  },
  {
    key: "admin",
    title: "Yönetim",
    icon: "business-outline",
    demo: "admin@cakesbakes.com",
    target: "/admin/dashboard",
  },
  {
    key: "platform",
    title: "Platform",
    icon: "globe-outline",
    demo: "admin@logislot.com",
    target: "/platform/overview",
  },
];

export default function LoginScreen() {
  const { colors, resolved, setMode } = useTheme();
  const session = useSession();
  const insets = useSafeAreaInsets();
  const [portal, setPortal] = useState<Portal>("supplier");
  const [email, setEmail] = useState(PORTALS[0].demo);
  const [password, setPassword] = useState("Demo123!");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const active = PORTALS.find((p) => p.key === portal)!;

  function selectPortal(next: Portal) {
    const cfg = PORTALS.find((p) => p.key === next)!;
    setPortal(next);
    setEmail(cfg.demo);
    setError(null);
  }

  async function handleSubmit() {
    setError(null);
    setLoading(true);
    try {
      const tokens = await authApi.login(portal, email.trim(), password);
      await storeSession(tokens.access_token, portal, tokens.refresh_token);
      session.refresh();
      if (tokens.must_change_password) {
        router.replace("/change-password");
      } else {
        router.replace(active.target as never);
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Giriş başarısız — API'ye ulaşılamadı.",
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
          <Text style={{ color: colors.mutedText, fontSize: 13, marginTop: 10 }}>
            Akıllı Mal Kabul & Rampa Randevu Platformu
          </Text>
        </View>

        <Card style={{ gap: spacing.lg }}>
          <View>
            <Text style={{ color: colors.text, fontSize: 22, fontWeight: "700" }}>
              Giriş yap
            </Text>
            <Text style={{ color: colors.mutedText, fontSize: 13, marginTop: 4 }}>
              Portalınızı seçin ve hesabınızla devam edin.
            </Text>
          </View>

          {/* Portal seçici */}
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            {PORTALS.map((p) => {
              const selected = portal === p.key;
              return (
                <Pressable
                  key={p.key}
                  onPress={() => selectPortal(p.key)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  style={{
                    flex: 1,
                    alignItems: "center",
                    gap: 8,
                    paddingVertical: 14,
                    borderRadius: 14,
                    borderWidth: 1.5,
                    borderColor: selected ? colors.accent : colors.border,
                    backgroundColor: selected ? `${colors.accent}14` : colors.card,
                  }}
                >
                  <View
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: 12,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: selected ? colors.primary : `${colors.mutedText}1A`,
                    }}
                  >
                    <Ionicons
                      name={p.icon}
                      size={19}
                      color={selected ? colors.primaryText : colors.mutedText}
                    />
                  </View>
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: "600",
                      color: selected ? colors.accent : colors.text,
                    }}
                  >
                    {p.title}
                  </Text>
                </Pressable>
              );
            })}
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

          <Button
            title={`${active.title} Girişi`}
            onPress={() => void handleSubmit()}
            loading={loading}
          />

          <Text style={{ color: colors.faintText, fontSize: 12, textAlign: "center" }}>
            Demo hesap: {active.demo} / Demo123!
          </Text>
        </Card>

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
