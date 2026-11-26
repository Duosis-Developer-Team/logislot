import { useLocalSearchParams } from "expo-router";
import { AccountRecoveryScreen, parseRecoveryPortal } from "@/components/account-recovery";

/** Şifremi unuttum — tedarikçi/yönetim (platform mobile'da yok). */
export default function ForgotPassword() {
  const { portal } = useLocalSearchParams<{ portal?: string }>();
  return <AccountRecoveryScreen kind="password" portal={parseRecoveryPortal(portal)} />;
}
