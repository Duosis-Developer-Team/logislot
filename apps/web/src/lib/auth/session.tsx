"use client";

/**
 * Oturum + aktif facility context'i.
 *
 * login -> /auth/me -> facilities -> aktif facility secimi.
 * Aktif facility localStorage'da korunur; tum config API cagrilari
 * bu facility_id ile path uzerinden gider ve backend membership dogrular.
 */

import { useQuery } from "@tanstack/react-query";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { ApiError, apiRequest, clearSession, getStoredToken } from "@/lib/api/client";
import type { FacilitySummaryDto, MeDto } from "@/lib/api/types";

const ACTIVE_FACILITY_KEY = "logislot.active_facility";

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
  const [hasToken, setHasToken] = useState<boolean | null>(null);
  useEffect(() => setHasToken(getStoredToken() !== null), []);

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
          : "Oturum bilgisi alinamadi"
        : null,
    activeFacilityId,
    activeFacility: me?.facilities.find((f) => f.id === activeFacilityId) ?? null,
    permissions,
    can: (permission: string) => permissions.includes(permission),
    setActiveFacilityId,
    logout: () => {
      clearSession();
      window.location.href = "/login";
    },
  };

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionState {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession, SessionProvider icinde kullanilmali");
  return ctx;
}
