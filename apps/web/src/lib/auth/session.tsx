"use client";

/**
 * Oturum + aktif facility context'i.
 *
 * login -> /auth/me -> facilities -> aktif facility secimi.
 * Aktif facility localStorage'da korunur; tum config API cagrilari
 * bu facility_id ile path uzerinden gider ve backend membership dogrular.
 */

import { QueryClient, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useT } from "@/lib/i18n/provider";
import { ApiError, apiRequest, authApi, clearSession, getStoredToken } from "@/lib/api/client";
import type { FacilitySummaryDto, MeDto } from "@/lib/api/types";

const ACTIVE_FACILITY_KEY = "logislot.active_facility";

/**
 * Ortak, dayanikli cikis akisi — tum portallar ayni yolu kullanir.
 *  1. Sunucuda oturumu iptal et (best-effort; logout-everywhere).
 *  2. Backend hata verse bile access/refresh token + portal bilgisini temizle.
 *  3. TanStack Query onbellegini bosalt (baska kullanicinin verisi sizmasin).
 *  4. /login'e REPLACE ile don — geri tusuyla korumali rotaya donulmez.
 */
async function performLogout(queryClient: QueryClient): Promise<void> {
  try {
    await authApi.logout();
  } catch {
    // Istemci oturumu, backend cagrisi basarisiz olsa da mutlaka temizlenir.
  }
  clearSession();
  queryClient.clear();
  if (typeof window !== "undefined") {
    window.location.replace("/login");
  }
}

interface SessionState {
  me: MeDto | null;
  isLoading: boolean;
  isUnauthorized: boolean;
  error: string | null;
  activeFacilityId: string | null;
  activeFacility: FacilitySummaryDto | null;
  /** Aktif tesisteki izinler — permission-aware nav bunun uzerinden calisir. */
  permissions: string[];
  can: (permission: string) => boolean;
  setActiveFacilityId: (id: string) => void;
  logout: () => void;
}

const SessionContext = createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const t = useT();
  const queryClient = useQueryClient();
  const [hasToken, setHasToken] = useState<boolean | null>(null);
  useEffect(() => setHasToken(getStoredToken() !== null), []);

  const logout = useCallback(() => {
    void performLogout(queryClient);
  }, [queryClient]);

  const meQuery = useQuery({
    queryKey: ["auth", "me"],
    queryFn: () => apiRequest<MeDto>("/auth/me"),
    enabled: hasToken === true,
    retry: false,
    staleTime: 60_000,
  });

  const me = meQuery.data ?? null;
  const [storedFacilityId, setStoredFacilityId] = useState<string | null>(null);
  useEffect(() => {
    setStoredFacilityId(window.localStorage.getItem(ACTIVE_FACILITY_KEY));
  }, []);

  const setActiveFacilityId = useCallback((id: string) => {
    window.localStorage.setItem(ACTIVE_FACILITY_KEY, id);
    setStoredFacilityId(id);
  }, []);

  const activeFacilityId = useMemo(() => {
    if (!me) return null;
    const ids = me.facilities.map((f) => f.id);
    if (storedFacilityId && ids.includes(storedFacilityId)) return storedFacilityId;
    return me.default_facility_id ?? ids[0] ?? null;
  }, [me, storedFacilityId]);

  const isUnauthorized =
    hasToken === false ||
    (meQuery.isError &&
      meQuery.error instanceof ApiError &&
      ["UNAUTHORIZED", "FORBIDDEN"].includes(meQuery.error.code));

  const permissions = useMemo(() => {
    if (!me) return [];
    if (me.user_type === "platform") return me.permissions;
    if (!activeFacilityId) return [];
    return me.facility_permissions?.[activeFacilityId] ?? me.permissions ?? [];
  }, [me, activeFacilityId]);

  const value: SessionState = {
    me,
    isLoading: hasToken === null || (hasToken === true && meQuery.isLoading),
    isUnauthorized,
    error:
      meQuery.isError && !isUnauthorized
        ? meQuery.error instanceof Error
          ? meQuery.error.message
          : t.states.sessionLoadFailed
        : null,
    activeFacilityId,
    activeFacility: me?.facilities.find((f) => f.id === activeFacilityId) ?? null,
    permissions,
    can: (permission: string) => permissions.includes(permission),
    setActiveFacilityId,
    logout,
  };

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionState {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession, SessionProvider icinde kullanilmali");
  return ctx;
}
