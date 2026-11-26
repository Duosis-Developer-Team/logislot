/**
 * Self-servis hesap kurtarma — web (auth)/forgot-password ve
 * (auth)/forgot-username karşılığı. Mobile'da yalnızca İSTEK akışları vardır;
 * e-postadaki sıfırlama bağlantısı web'deki /reset-password sayfasını açar.
 *
 * Güvenlik: başarı mesajı her durumda AYNIDIR (hesap keşfi yok). Platform
 * portalı mobile'da hiç yoktur.
 */

import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { authApi } from "@/api/auth";
import { LogiSlotLogo } from "@/components/brand";
import { Button, Card, Field } from "@/components/ui";
import { useTheme } from "@/theme/theme";
import { spacing } from "@/theme/tokens";

export type RecoveryPortal = "supplier" | "admin";
export type RecoveryKind = "password" | "username";

export function parseRecoveryPortal(raw: string | string[] | undefined): RecoveryPortal {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value === "admin" ? "admin" : "supplier";
}

const LOGIN_ROUTES: Record<RecoveryPortal, string> = {
  supplier: "/supplier-login",
  admin: "/admin-login",
};

const COPY = {
  password: {
    title: "Şifremi Unuttum",
    subtitle:
      "Hesabınızın e-posta adresini girin; şifrenizi yenilemeniz için bir bağlantı gönderelim.",
    submit: "Sıfırlama bağlantısı gönder",
    sent: "Bu adres kayıtlıysa şifre sıfırlama bağlantısını gönderdik. Bağlantı 30 dakika geçerlidir ve yalnızca bir kez kullanılabilir.",
    icon: "key-outline",
  },
  username: {
    title: "Kullanıcı Adımı Unuttum",
    subtitle:
      "Firmanızın LogiSlot'a kayıtlı iletişim e-postalarından birini girin; portal kullanıcı adlarınızı o adrese gönderelim.",
    submit: "Kullanıcı adlarımı gönder",
    sent: "Bu adres bir tedarikçi firmasına kayıtlıysa portal kullanıcı adlarınızı bu adrese gönderdik.",
    icon: "person-outline",
  },
} as const;

const ADMIN_USERNAME_INFO =
  "Kullanıcı adınız, Yönetim Paneli'ne giriş yaptığınız e-posta adresinizdir. Hatırlamıyorsanız tesisinizin sistem yöneticisine başvurun.";

export function AccountRecoveryScreen({
  kind,
  portal,
}: {
  kind: RecoveryKind;
  portal: RecoveryPortal;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const copy = COPY[kind];
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // Yönetim portalında kullanıcı adı = e-posta; arama yapılmaz, bilgi verilir.
  const adminUsername = kind === "username" && portal === "admin";

  async function submit() {
    setError(null);
    if (!email.trim()) {
      setError("Lütfen e-posta adresinizi girin.");
      return;
    }
    setLoading(true);
    try {
      if (kind === "password") {
        await authApi.requestPasswordReset(email.trim(), portal);
      } else {
        await authApi.requestUsernameReminder(email.trim());
      }
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "İşlem tamamlanamadı; lütfen tekrar deneyin.");
    } finally {
      setLoading(false);
    }
  }

  const notice = (icon: keyof typeof Ionicons.glyphMap, tint: string, text: string) => (
    <View
      style={{
        flexDirection: "row",
        gap: 8,
        padding: 12,
        borderRadius: 12,
        backgroundColor: `${tint}15`,
      }}
    >
      <Ionicons name={icon} size={18} color={tint} />
      <Text style={{ color: colors.text, fontSize: 13, flex: 1, lineHeight: 19 }}>{text}</Text>
    </View>
  );

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
              <Ionicons name={copy.icon} size={26} color={colors.accent} />
            </View>
            <Text style={{ color: colors.text, fontSize: 22, fontWeight: "700" }}>
              {copy.title}
            </Text>
            {!adminUsername && !sent && (
              <Text
                style={{
                  color: colors.mutedText,
                  fontSize: 13,
                  textAlign: "center",
                  lineHeight: 19,
                }}
              >
                {copy.subtitle}
              </Text>
            )}
          </View>

          {adminUsername ? (
            <>
              {notice("mail-outline", colors.accent, ADMIN_USERNAME_INFO)}
              <Button
                title="Şifremi unuttum"
                variant="secondary"
                onPress={() =>
                  router.replace({ pathname: "/forgot-password", params: { portal: "admin" } })
                }
              />
            </>
          ) : sent ? (
            notice("checkmark-circle", colors.status.approved, copy.sent)
          ) : (
            <>
              <Field
                label="E-posta"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
              />
              {error && notice("alert-circle", colors.destructive, error)}
              <Button title={copy.submit} onPress={() => void submit()} loading={loading} />
            </>
          )}
        </Card>

        <Pressable
          onPress={() => router.replace(LOGIN_ROUTES[portal] as never)}
          style={{ marginTop: spacing.lg, alignItems: "center" }}
          accessibilityRole="link"
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Ionicons name="arrow-back" size={15} color={colors.mutedText} />
            <Text style={{ color: colors.mutedText, fontSize: 13 }}>Girişe dön</Text>
          </View>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
