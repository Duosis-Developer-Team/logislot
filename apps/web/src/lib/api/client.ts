/**
 * Typed API istemcisi.
 *
 * Standart zarf: {"success", "data", "error"}.
 * Aktif facility, her istekte X-Facility-Id header'i ile gider ve backend
 * membership dogrulamasi yapar (korlemesine guvenilmez).
 *
 * 401 yenileme akisi (Sprint 8):
 * - Access token 401 dondugunde refresh token ile TEK-UCUS (single-flight)
 *   yenileme yapilir: es zamanli istekler ayni refresh Promise'ini bekler,
 *   ikinci bir /auth/refresh cagrisi ASLA acilmaz (rotation ile uyum).
 * - Orijinal istek yalnizca BIR kez tekrarlanir; tekrar da 401 ise dongusuz
 *   sekilde oturum temizlenir ve /login'e yonlendirilir.
 */

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8010";

export interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  error: { code: string; message: string; details?: unknown } | null;
}

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  token?: string | null;
  facilityId?: string | null;
}

/** Refresh denenmeyecek auth yollari (sonsuz dongu koruması). */
const AUTH_PATHS = ["/auth/login", "/auth/supplier-login", "/auth/platform-login", "/auth/refresh"];

async function rawRequest(path: string, options: RequestOptions, token: string | null) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (options.facilityId) headers["X-Facility-Id"] = options.facilityId;

  return fetch(`${BASE_URL}${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
}

export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  let token = options.token ?? getStoredToken();
  let response = await rawRequest(path, options, token);

  // 401: tek-ucus refresh + orijinal istegi BIR kez tekrarla.
  if (
    response.status === 401 &&
    typeof window !== "undefined" &&
    !AUTH_PATHS.some((p) => path.startsWith(p))
  ) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      token = options.token ?? newToken;
      response = await rawRequest(path, options, token);
      if (response.status === 401) {
        // Yenilenen token da reddedildi: dongusuz cikis.
        redirectToLogin();
      }
    }
  }

  const envelope = (await response.json()) as ApiEnvelope<T>;
  if (!response.ok || !envelope.success) {
    const err = envelope.error ?? { code: "UNKNOWN", message: "Bilinmeyen hata" };
    // Gecici parola guard'i: kullaniciyi parola degistirme sayfasina tasi.
    if (
      err.code === "PASSWORD_CHANGE_REQUIRED" &&
      typeof window !== "undefined" &&
      !window.location.pathname.startsWith("/change-password")
    ) {
      window.location.href = "/change-password";
    }
    throw new ApiError(err.code, err.message, err.details);
  }
  return envelope.data;
}

const TOKEN_KEY = "logislot.access_token";
const REFRESH_KEY = "logislot.refresh_token";
const PORTAL_KEY = "logislot.portal";

/** Es zamanli 401'lerde tek refresh cagrisini paylastiran modul-seviyesi kilit. */
let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = performRefresh().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

async function performRefresh(): Promise<string | null> {
  const refreshToken = getStoredRefreshToken();
  if (!refreshToken) {
    redirectToLogin();
    return null;
  }
  try {
    const response = await fetch(`${BASE_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    const envelope = (await response.json()) as ApiEnvelope<{
      access_token: string;
      refresh_token: string;
    }>;
    if (!response.ok || !envelope.success) {
      redirectToLogin();
      return null;
    }
    // Rotation: eski refresh jti sunucuda dusuruldu; yeni cifti sakla.
    window.localStorage.setItem(TOKEN_KEY, envelope.data.access_token);
    window.localStorage.setItem(REFRESH_KEY, envelope.data.refresh_token);
    return envelope.data.access_token;
  } catch {
    redirectToLogin();
    return null;
  }
}

function redirectToLogin() {
  clearSession();
  if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
    window.location.href = "/login";
  }
}

export function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function getStoredRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(REFRESH_KEY);
}

export function getStoredPortal(): "supplier" | "admin" | "platform" | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(PORTAL_KEY) as "supplier" | "admin" | "platform" | null;
}

export function storeSession(
  token: string,
  portal: "supplier" | "admin" | "platform",
  refreshToken?: string,
) {
  window.localStorage.setItem(TOKEN_KEY, token);
  window.localStorage.setItem(PORTAL_KEY, portal);
  if (refreshToken) window.localStorage.setItem(REFRESH_KEY, refreshToken);
}

export function clearSession() {
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(REFRESH_KEY);
  window.localStorage.removeItem(PORTAL_KEY);
}

export const authApi = {
  login: (portal: "supplier" | "admin" | "platform", email: string, password: string) => {
    const endpoint =
      portal === "supplier"
        ? "/auth/supplier-login"
        : portal === "platform"
          ? "/auth/platform-login"
          : "/auth/login";
    return apiRequest<{
      access_token: string;
      refresh_token: string;
      must_change_password: boolean;
    }>(endpoint, {
      method: "POST",
      // portal: backend'de opsiyonel portal-aware dogrulama (backward-compat).
      body: { email, password, portal },
    });
  },
  changePassword: (currentPassword: string, newPassword: string) =>
    apiRequest<{
      access_token: string;
      refresh_token: string;
      must_change_password: boolean;
    }>("/auth/change-password", {
      method: "POST",
      body: { current_password: currentPassword, new_password: newPassword },
    }),
  me: () => apiRequest<unknown>("/auth/me"),
  /** Sunucu tarafi oturum iptali (logout-everywhere). En iyi caba; hata firlatabilir. */
  logout: () => apiRequest<{ logged_out: boolean }>("/auth/logout", { method: "POST" }),
};

/** Token'li CSV indirme: yaniti blob olarak alir ve tarayicida kaydettirir. */
export async function downloadCsv(path: string, filename: string): Promise<void> {
  const token = getStoredToken();
  const response = await fetch(`${BASE_URL}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) {
    throw new ApiError("DOWNLOAD_FAILED", "Dosya indirilemedi");
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
