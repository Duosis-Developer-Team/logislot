import { Redirect } from "expo-router";
import { View } from "react-native";
import { useSession } from "@/auth/session";
import { LoadingState } from "@/components/ui";
import { useTheme } from "@/theme/theme";

/** Kök yönlendirme — role-based routing (web'deki login target'larının karşılığı). */
export default function Index() {
  const session = useSession();
  const { colors } = useTheme();

  if (session.isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", backgroundColor: colors.background }}>
        <LoadingState label="Oturum doğrulanıyor…" />
      </View>
    );
  }

  if (session.isUnauthorized || !session.me) {
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
