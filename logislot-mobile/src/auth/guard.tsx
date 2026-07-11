/** Rol koruması — yanlış user_type bu portala girerse login'e yönlenir. */

import { Redirect } from "expo-router";
import { View } from "react-native";
import { useSession } from "@/auth/session";
import { LoadingState } from "@/components/ui";
import { useTheme } from "@/theme/theme";

export function RoleGuard({
  userType,
  children,
}: {
  userType: "supplier" | "tenant" | "platform";
  children: React.ReactNode;
}) {
  const session = useSession();
  const { colors } = useTheme();

  if (session.isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", backgroundColor: colors.background }}>
        <LoadingState label="Oturum doğrulanıyor…" />
      </View>
    );
  }
  if (session.isUnauthorized || !session.me || session.me.user_type !== userType) {
    return <Redirect href="/login" />;
  }
  return <>{children}</>;
}
