/** Rol koruması — yanlış user_type bu portala girerse login'e yönlenir. */

import { Redirect } from "expo-router";
import { View } from "react-native";
import { hasToken } from "@/api/client";
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
  // Taze (modül-seviyesi) okuma — storeSession'dan hemen sonra doğru değer.
  // Context'in me/isUnauthorized değerleri navigasyondan bir tık geriden
  // gelebildiği için, "token var" kararını buradan veriyoruz.
  const tokenPresent = hasToken();

  // 1) Token yok → kesin çıkış.
  if (!tokenPresent) {
    return <Redirect href="/login" />;
  }
  // 2) Sunucu token'ı reddetti (401/403).
  if (session.isUnauthorized) {
    return <Redirect href="/login" />;
  }
  // 3) Token var ama profil henüz gelmedi → BEKLE (login'e ATMA).
  if (!session.me) {
    return (
      <View style={{ flex: 1, justifyContent: "center", backgroundColor: colors.background }}>
        <LoadingState label="Oturum doğrulanıyor…" />
      </View>
    );
  }
  // 4) Token başka portala ait.
  if (session.me.user_type !== userType) {
    return <Redirect href="/login" />;
  }
  return <>{children}</>;
}
