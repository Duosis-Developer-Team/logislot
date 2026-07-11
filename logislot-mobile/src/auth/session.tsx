/**
 * Oturum + aktif tesis context'i — web'deki lib/auth/session.tsx karşılığı.
 *
 * Soğuk başlangıçta SecureStore'dan token yüklenir → /auth/me → role-based
 * yönlendirme app/index.tsx'te yapılır. Logout web ile aynı dayanıklı akış:
 * backend /auth/logout (best-effort) + SecureStore temizliği + query cache
 * temizliği + login'e navigation reset.
 */

import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import * as SecureStore from "expo-secure-store";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { authApi } from "@/api/auth";
import {
  ApiError,
  clearSession,
  hasToken,
  loadStoredSession,
  setUnauthorizedHandler,
} from "@/api/client";
import type { FacilitySummaryDto, MeDto } from "@/api/types";

const ACTIVE_FACILITY_KEY = "logislot.active_facility";

interface SessionState {
  me: MeDto | null;
  isLoading: boolean;
  isUnauthorized: boolean;
  error: string | null;
  activeFacilityId: string | null;
  activeFacility: FacilitySummaryDto | null;
  permissions: string[];
  can: (permission: string) => boolean;
  setActiveFacilityId: (id: string) => void;
  logout: () => void;
  /** Login sonrası me query'sini tazeler (fire-and-forget). */
  refresh: () => void;
  /**
   * Login/parola-değişimi sonrası me'yi ZORLA tazeler ve döner. Navigasyondan
   * ÖNCE await edilir; böylece hedef portalın RoleGuard'ı güncel user_type'ı
   * anında görür (aksi halde ilk-giriş dışındaki girişlerde tokenLoaded zaten
   * true olduğundan sorgu yeniden fetch etmez ve login'e geri düşer).
   */
  reloadMe: () => Promise<MeDto | null>;
}

const SessionContext = createContext<SessionState | null>(null);

async function performLogout(queryClient: QueryClient): Promise<void> {
  try {
    await authApi.logout();
  } catch {
    // İstemci oturumu, backend çağrısı başarısız olsa da mutlaka temizlenir.
  }
  await clearSession();
  queryClient.clear();
  router.replace("/login");
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [tokenLoaded, setTokenLoaded] = useState<boolean | null>(null);
  const [storedFacilityId, setStoredFacilityId] = useState<string | null>(null);

  useEffect(() => {
    void loadStoredSession().then((has) => setTokenLoaded(has));
    void SecureStore.getItemAsync(ACTIVE_FACILITY_KEY).then(setStoredFacilityId);
    // Refresh de düşerse: cache temizle, login'e dön.
    setUnauthorizedHandler(() => {
      queryClient.clear();
      router.replace("/login");
    });
    return () => setUnauthorizedHandler(null);
  }, [queryClient]);

  const meQuery = useQuery({
    queryKey: ["auth", "me"],
    queryFn: () => authApi.me(),
    enabled: tokenLoaded === true && hasToken(),
    retry: false,
    staleTime: 60_000,
  });

  const me = meQuery.data ?? null;

  const setActiveFacilityId = useCallback((id: string) => {
    setStoredFacilityId(id);
    void SecureStore.setItemAsync(ACTIVE_FACILITY_KEY, id);
  }, []);

  const activeFacilityId = useMemo(() => {
    if (!me) return null;
    const ids = me.facilities.map((f) => f.id);
    if (storedFacilityId && ids.includes(storedFacilityId)) return storedFacilityId;
    return me.default_facility_id ?? ids[0] ?? null;
  }, [me, storedFacilityId]);

  // SADECE sunucunun token'ı reddettiği durum (401/403). "Token yok" durumu
  // burada DEĞİL — guard/index taze hasToken() ile karar verir; aksi halde
  // login sonrası context bir tık geriden geldiğinde yanlışça login'e atılır.
  const isUnauthorized =
    meQuery.isError &&
    meQuery.error instanceof ApiError &&
    ["UNAUTHORIZED", "FORBIDDEN"].includes(meQuery.error.code);

  const permissions = useMemo(() => {
    if (!me) return [];
    if (me.user_type === "platform") return me.permissions;
    if (!activeFacilityId) return [];
    return me.facility_permissions?.[activeFacilityId] ?? me.permissions ?? [];
  }, [me, activeFacilityId]);

  const logout = useCallback(() => {
    setTokenLoaded(false);
    void performLogout(queryClient);
  }, [queryClient]);

  const refresh = useCallback(() => {
    setTokenLoaded(hasToken());
    void queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
  }, [queryClient]);

  const reloadMe = useCallback(async (): Promise<MeDto | null> => {
    setTokenLoaded(hasToken());
    if (!hasToken()) return null;
    try {
      // staleTime:0 → her zaman taze fetch; önceki kullanıcının cache'ini
      // (farklı user_type) atlar. Cache'i doldurur; gözlemci re-render'da okur.
      const fresh = await queryClient.fetchQuery({
        queryKey: ["auth", "me"],
        queryFn: () => authApi.me(),
        staleTime: 0,
      });
      return fresh ?? null;
    } catch {
      return null;
    }
  }, [queryClient]);

  const value: SessionState = {
    me,
    // Token var ama profil henüz gelmedi (ve reddedilmedi) → hâlâ çözülüyor.
    isLoading:
      tokenLoaded === null || (hasToken() && !me && !isUnauthorized),
    isUnauthorized,
    error:
      meQuery.isError && !isUnauthorized
        ? meQuery.error instanceof Error
          ? meQuery.error.message
          : "Oturum bilgisi alınamadı"
        : null,
    activeFacilityId,
    activeFacility: me?.facilities.find((f) => f.id === activeFacilityId) ?? null,
    permissions,
    can: (permission: string) => permissions.includes(permission),
    setActiveFacilityId,
    logout,
    refresh,
    reloadMe,
  };

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionState {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession, SessionProvider içinde kullanılmalı");
  return ctx;
}
