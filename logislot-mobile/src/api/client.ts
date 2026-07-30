/**
 * Typed API istemcisi — web'deki apps/web/src/lib/api/client.ts ile AYNI contract.
 *
 * - Standart zarf: {"success", "data", "error"}.
 * - Token'lar Expo SecureStore'da saklanır (bellek cache'i ile senkron erişim).
 * - 401'de TEK-UÇUŞ (single-flight) refresh: eş zamanlı istekler aynı refresh
 *   Promise'ini bekler; rotation ile uyumludur. Orijinal istek BİR kez tekrarlanır.
 * - Refresh de başarısızsa oturum temizlenir ve kayıtlı unauthorized handler
 *   çağrılır (navigation login'e resetlenir — native'de window.location yok).
 */

import * as SecureStore from "expo-secure-store";

export const BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ?? "http://84.247.180.172:30081";

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

/**
 * 422 gövdesindeki alan bilgisini kullanıcıya taşır (web client ile aynı davranış).
 *
 * Backend `VALIDATION_ERROR` için genel bir mesaj döner; hangi alanın
 * reddedildiği `details` içindedir. Göstermezsek kullanıcı formda neyi
 * düzelteceğini bilemez.
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

export type Portal = "supplier" | "admin" | "platform";

// Bellek cache'i — SecureStore async olduğu için istek yolunda senkron erişim.
let accessToken: string | null = null;
let refreshTokenValue: string | null = null;
let portalValue: Portal | null = null;

/** Soğuk başlangıçta oturumu SecureStore'dan yükler. true = token var. */
export async function loadStoredSession(): Promise<boolean> {
  const [token, refresh, portal] = await Promise.all([
    SecureStore.getItemAsync(TOKEN_KEY),
    SecureStore.getItemAsync(REFRESH_KEY),
    SecureStore.getItemAsync(PORTAL_KEY),
  ]);
  accessToken = token;
  refreshTokenValue = refresh;
  portalValue = (portal as Portal | null) ?? null;
  return accessToken !== null;
}

export function getPortal(): Portal | null {
  return portalValue;
}

export function hasToken(): boolean {
  return accessToken !== null;
}

export async function storeSession(
  token: string,
  portal: Portal,
  refreshToken?: string,
): Promise<void> {
  accessToken = token;
  portalValue = portal;
  const writes = [
    SecureStore.setItemAsync(TOKEN_KEY, token),
    SecureStore.setItemAsync(PORTAL_KEY, portal),
  ];
  if (refreshToken) {
    refreshTokenValue = refreshToken;
    writes.push(SecureStore.setItemAsync(REFRESH_KEY, refreshToken));
  }
  await Promise.all(writes);
}

export async function clearSession(): Promise<void> {
  accessToken = null;
  refreshTokenValue = null;
  portalValue = null;
  await Promise.all([
    SecureStore.deleteItemAsync(TOKEN_KEY),
    SecureStore.deleteItemAsync(REFRESH_KEY),
    SecureStore.deleteItemAsync(PORTAL_KEY),
  ]);
}

/** Oturum düştüğünde (refresh başarısız) çağrılır — login'e resetler. */
let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: (() => void) | null): void {
  onUnauthorized = fn;
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  facilityId?: string | null;
}

/** Refresh denenmeyecek auth yolları (sonsuz döngü koruması). */
const AUTH_PATHS = [
  "/auth/login",
  "/auth/supplier-login",
  "/auth/platform-login",
  "/auth/refresh",
];

async function rawRequest(path: string, options: RequestOptions, token: string | null) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (options.facilityId) headers["X-Facility-Id"] = options.facilityId;
  return fetch(`${BASE_URL}${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
}

/** Eş zamanlı 401'lerde tek refresh çağrısını paylaştıran modül kilidi. */
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
  if (!refreshTokenValue) {
    await dropSession();
    return null;
  }
  try {
    const response = await fetch(`${BASE_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshTokenValue }),
    });
    const envelope = (await response.json()) as ApiEnvelope<{
      access_token: string;
      refresh_token: string;
    }>;
    if (!response.ok || !envelope.success) {
      await dropSession();
      return null;
    }
    // Rotation: eski refresh jti sunucuda düşürüldü; yeni çifti sakla.
    accessToken = envelope.data.access_token;
    refreshTokenValue = envelope.data.refresh_token;
    await Promise.all([
      SecureStore.setItemAsync(TOKEN_KEY, envelope.data.access_token),
      SecureStore.setItemAsync(REFRESH_KEY, envelope.data.refresh_token),
    ]);
    return accessToken;
  } catch {
    await dropSession();
    return null;
  }
}

async function dropSession(): Promise<void> {
  await clearSession();
  onUnauthorized?.();
}

export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  let token = accessToken;
  let response = await rawRequest(path, options, token);

  if (response.status === 401 && !AUTH_PATHS.some((p) => path.startsWith(p))) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      token = newToken;
      response = await rawRequest(path, options, token);
      if (response.status === 401) {
        await dropSession();
      }
    }
  }

  const envelope = (await response.json()) as ApiEnvelope<T>;
  if (!response.ok || !envelope.success) {
    const err = envelope.error ?? { code: "UNKNOWN", message: "Bilinmeyen hata" };
    throw new ApiError(
      err.code,
      err.code === "VALIDATION_ERROR" ? describeValidation(err.message, err.details) : err.message,
      err.details,
    );
  }
  return envelope.data;
}

/** Envelope'suz düz metin yanıtlar (CSV raporları) — aynı auth/refresh akışı. */
export async function apiRequestText(
  path: string,
  options: RequestOptions = {},
): Promise<string> {
  let token = accessToken;
  let response = await rawRequest(path, options, token);

  if (response.status === 401 && !AUTH_PATHS.some((p) => path.startsWith(p))) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      token = newToken;
      response = await rawRequest(path, options, token);
      if (response.status === 401) {
        await dropSession();
      }
    }
  }

  if (!response.ok) {
    throw new ApiError("HTTP_ERROR", `İndirme başarısız (HTTP ${response.status})`);
  }
  return response.text();
}
