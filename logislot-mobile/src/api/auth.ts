/** Auth endpoint'leri — web ile aynı contract. */

import { apiRequest, type Portal } from "./client";
import type { MeDto } from "./types";

export interface TokenPairDto {
  access_token: string;
  refresh_token: string;
  must_change_password: boolean;
}

const LOGIN_ENDPOINTS: Record<Portal, string> = {
  supplier: "/auth/supplier-login",
  admin: "/auth/login",
  platform: "/auth/platform-login",
};

export const authApi = {
  login: (portal: Portal, email: string, password: string) =>
    apiRequest<TokenPairDto>(LOGIN_ENDPOINTS[portal], {
      method: "POST",
      // portal: backend'de opsiyonel portal-aware dogrulama (backward-compat).
      body: { email, password, portal },
    }),
  changePassword: (currentPassword: string, newPassword: string) =>
    apiRequest<TokenPairDto>("/auth/change-password", {
      method: "POST",
      body: { current_password: currentPassword, new_password: newPassword },
    }),
  /**
   * Self-servis hesap kurtarma (web ile aynı contract). Yanıt HER ZAMAN
   * aynıdır — hesap var/yok bilgisi dönmez; bağlantı e-postayla gider ve
   * web'deki /reset-password sayfasında tamamlanır. Platform YOK.
   */
  requestPasswordReset: (email: string, portal: "supplier" | "admin") =>
    apiRequest<{ accepted: boolean; message: string }>("/auth/password-reset/request", {
      method: "POST",
      body: { email, portal },
    }),
  requestUsernameReminder: (email: string) =>
    apiRequest<{ accepted: boolean; message: string }>("/auth/username-reminder/request", {
      method: "POST",
      body: { email },
    }),
  me: () => apiRequest<MeDto>("/auth/me"),
  /** Sunucu tarafı oturum iptali (logout-everywhere). Best-effort. */
  logout: () => apiRequest<{ logged_out: boolean }>("/auth/logout", { method: "POST" }),
};
