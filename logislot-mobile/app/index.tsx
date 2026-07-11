import { Redirect } from "expo-router";
import { View } from "react-native";
import { hasToken } from "@/api/client";
import { useSession } from "@/auth/session";
import { LoadingState } from "@/components/ui";
import { useTheme } from "@/theme/theme";

/** Kök yönlendirme — role-based routing (web'deki login target'larının karşılığı). */
export default function Index() {
  const session = useSession();
  const { colors } = useTheme();
  const tokenPresent = hasToken();

  // Token var ama profil henüz gelmedi (ve reddedilmedi) → bekle.
  if (session.isLoading || (tokenPresent && !session.me && !session.isUnauthorized)) {
    return (
      <View style={{ flex: 1, justifyContent: "center", backgroundColor: colors.background }}>
        <LoadingState label="Oturum doğrulanıyor…" />
      </View>
    );
  }

  if (!tokenPresent || session.isUnauthorized || !session.me) {
    return <Redirect href="/login" />;
  }

  switch (session.me.user_type) {
    case "supplier":
      return <Redirect href="/supplier/appointments" />;
    case "tenant":
      return <Redirect href="/admin/dashboard" />;
    case "platform":
      return <Redirect href="/platform/overview" />;
    default:
      return <Redirect href="/login" />;
  }
}
