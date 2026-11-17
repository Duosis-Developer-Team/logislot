import { useLocalSearchParams } from "expo-router";
import { AccountRecoveryScreen, parseRecoveryPortal } from "@/components/account-recovery";

/** Kullanıcı adımı unuttum — tedarikçi: e-posta hatırlatma; yönetim: bilgi. */
export default function ForgotUsername() {
  const { portal } = useLocalSearchParams<{ portal?: string }>();
  return <AccountRecoveryScreen kind="username" portal={parseRecoveryPortal(portal)} />;
}
