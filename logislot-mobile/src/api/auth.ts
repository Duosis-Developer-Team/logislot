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
  me: () => apiRequest<MeDto>("/auth/me"),
  /** Sunucu tarafı oturum iptali (logout-everywhere). Best-effort. */
  logout: () => apiRequest<{ logged_out: boolean }>("/auth/logout", { method: "POST" }),
};
