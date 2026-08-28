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
  /** Sayfalama gibi yan bilgiler (`{"total": 128}`); tum uclarda bulunmaz. */
  meta?: Record<string, unknown>;
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
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  token?: string | null;
  facilityId?: string | null;
}

/** Refresh denenmeyecek auth yollari (sonsuz dongu koruması). */
const AUTH_PATHS = [
  "/auth/login",
  "/auth/supplier-login",
  "/auth/platform-login",
  "/auth/refresh",
  "/auth/handoff/consume",
];

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
  return (await apiEnvelope<T>(path, options)).data;
}

/**
 * `apiRequest` ile ayni akis, fakat ZARFIN TAMAMINI dondurur.
 *
 * Sayfali uclarda `meta.total` gerekir; onu almanin tek yolu zarfa erismektir.
 * Iki ayri istek yolu yazmak yerine `apiRequest` bunun uzerine kuruludur —
 * boylece 401 yenileme mantigi TEK yerde kalir.
 */
export async function apiEnvelope<T>(
  path: string,
  options: RequestOptions = {},
): Promise<ApiEnvelope<T>> {
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
    throw new ApiError(
      err.code,
      err.code === "VALIDATION_ERROR" ? describeValidation(err.message, err.details) : err.message,
      err.details,
    );
  }
  return envelope;
}

/**
 * 422 gövdesindeki alan bilgisini kullanıcıya taşır.
 *
 * Backend `VALIDATION_ERROR` için yalnızca genel bir mesaj döndürür; hangi
 * alanın reddedildiği `details` içindedir. Bunu göstermezsek kullanıcı formda
 * neyi düzelteceğini bilemez (ör. geçersiz e-posta alan adı).
 */
function describeValidation(message: string, details: unknown): string {
  if (!Array.isArray(details) || details.length === 0) return message;
  const fields = details
    .map((d) => {
      const loc = Array.isArray((d as { loc?: unknown[] }).loc)
        ? (d as { loc: unknown[] }).loc.filter((p) => p !== "body")
        : [];
      return loc.join(".");
    })
    .filter(Boolean);
  if (fields.length === 0) return message;
  const unique = [...new Set(fields)];
  const shown = unique.slice(0, 3).join(", ");
  return `${message}: ${shown}${unique.length > 3 ? ` (+${unique.length - 3})` : ""}`;
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
      /** Tenant'a ozel alan adi (orn. cknb.logislot.io); tanimsizsa null. */
      branded_host: string | null;
    }>(endpoint, {
      method: "POST",
      // portal: backend'de opsiyonel portal-aware dogrulama (backward-compat).
      body: { email, password, portal },
    });
  },
  /** Markali alan adina gecis icin tek kullanimlik devir kodu (oturum gerekir). */
  issueHandoff: () =>
    apiRequest<{ code: string; host: string; expires_in: number }>(
      "/auth/handoff/issue",
      { method: "POST" },
    ),
  /** Devir kodunu YENI bir oturumla takas eder (hedef alan adindan cagrilir). */
  consumeHandoff: (code: string) =>
    apiRequest<{ access_token: string; refresh_token: string }>(
      "/auth/handoff/consume",
      // Hedef origin'de oturum YOK: token gonderilmez, 401 refresh denenmez
      // (asagidaki AUTH_PATHS listesine bu yol da dahildir).
      { method: "POST", body: { code } },
    ),
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

/**
 * Authorization basligiyla ham fetch — 401'de TEK-UCUS yenilemeyi kullanir.
 *
 * `apiRequest` JSON zarfi bekler; ikili icerik (dosya indirme) icin uygun
 * degildir. Bu yardimci olmadan indirmeler kendi `fetch`'lerini yazar ve
 * yenileme akisini ATLAR — sekmeyi bir sure acik birakmis kullanicinin
 * indirmesi sessizce 401 alirdi.
 */
export async function authorizedFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const withAuth = (token: string | null): RequestInit => ({
    ...init,
    headers: {
      ...(init.headers ?? {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  let response = await fetch(`${BASE_URL}${path}`, withAuth(getStoredToken()));
  if (response.status === 401 && typeof window !== "undefined") {
    const newToken = await refreshAccessToken();
    if (newToken) response = await fetch(`${BASE_URL}${path}`, withAuth(newToken));
  }
  return response;
}

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
