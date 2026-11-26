import { apiRequest } from "@/lib/api/client";

/**
 * Self-servis hesap kurtarma uçları (kimlik doğrulamasız).
 * İstek uçları HER ZAMAN aynı genel yanıtı döner (hesap keşfi yok); token
 * yalnızca e-postayla gider, API yanıtında asla yoktur.
 */
export type RecoveryPortal = "supplier" | "admin";

export const accountRecoveryApi = {
  requestPasswordReset: (email: string, portal: RecoveryPortal) =>
    apiRequest<{ accepted: boolean; message: string }>("/auth/password-reset/request", {
      method: "POST",
      body: { email, portal },
    }),
  confirmPasswordReset: (token: string, newPassword: string, portal: RecoveryPortal) =>
    apiRequest<{ reset: boolean }>("/auth/password-reset/confirm", {
      method: "POST",
      body: { token, new_password: newPassword, portal },
    }),
  requestUsernameReminder: (email: string) =>
    apiRequest<{ accepted: boolean; message: string }>("/auth/username-reminder/request", {
      method: "POST",
      body: { email },
    }),
};
