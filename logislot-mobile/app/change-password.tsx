import { router } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from "react-native";
import { authApi } from "@/api/auth";
import { getPortal, storeSession } from "@/api/client";
import { useSession } from "@/auth/session";
import { LogiSlotLogo } from "@/components/brand";
import { Button, Card, Field } from "@/components/ui";
import { useTheme } from "@/theme/theme";
import { spacing } from "@/theme/tokens";

/** Geçici parola akışı — web (auth)/change-password karşılığı. */
export default function ChangePasswordScreen() {
  const { colors } = useTheme();
  const session = useSession();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit() {
    setError(null);
    if (next.length < 8) {
      setError("Yeni parola en az 8 karakter olmalı.");
      return;
    }
    if (next !== confirm) {
      setError("Yeni parolalar eşleşmiyor.");
      return;
    }
    setLoading(true);
    try {
      const tokens = await authApi.changePassword(current, next);
      const portal = getPortal() ?? "admin";
      await storeSession(tokens.access_token, portal, tokens.refresh_token);
      session.refresh();
      router.replace("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Parola değiştirilemedi.");
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
        contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: spacing.xl }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ alignItems: "center", marginBottom: spacing.xl }}>
          <LogiSlotLogo height={44} />
        </View>
        <Card style={{ gap: spacing.lg }}>
          <View>
            <Text style={{ color: colors.text, fontSize: 20, fontWeight: "700" }}>
              Parola Değiştir
            </Text>
            <Text style={{ color: colors.mutedText, fontSize: 13, marginTop: 4 }}>
              Geçici parolanızı yeni bir parolayla değiştirin.
            </Text>
          </View>
          <Field
            label="Mevcut Parola"
            value={current}
            onChangeText={setCurrent}
            secureTextEntry
            autoCapitalize="none"
          />
          <Field
            label="Yeni Parola"
            value={next}
            onChangeText={setNext}
            secureTextEntry
            autoCapitalize="none"
          />
          <Field
            label="Yeni Parola (Tekrar)"
            value={confirm}
            onChangeText={setConfirm}
            secureTextEntry
            autoCapitalize="none"
          />
          {error && (
            <Text style={{ color: colors.destructive, fontSize: 13 }}>{error}</Text>
          )}
          <Button title="Parolayı Değiştir" onPress={() => void submit()} loading={loading} />
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
