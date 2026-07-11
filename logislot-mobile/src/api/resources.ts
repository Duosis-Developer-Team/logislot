/**
 * Facility-scoped konfigürasyon kaynakları için CRUD hook fabrikası.
 * KAYNAK CONTRACT: apps/web/src/lib/api/resources.ts ile birebir aynı.
 * Her mutasyon sonrası liste invalidate/refetch edilir (optimistic update yok).
 */

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from "@tanstack/react-query";
import { apiRequest } from "./client";
import type {
  ConflictGroupDto,
  DockDto,
  FacilityUserDto,
  OverrideDto,
  ProductCategoryDto,
  RoleDto,
  SupplierDto,
  VehicleCategoryDto,
} from "./types";

function makeResource<TDto>(segment: string) {
  const key = (facilityId: string) => ["config", segment, facilityId];

  function useList(facilityId: string | null): UseQueryResult<TDto[]> {
    return useQuery({
      queryKey: key(facilityId ?? "none"),
      queryFn: () => apiRequest<TDto[]>(`/facilities/${facilityId}/${segment}`),
      enabled: facilityId !== null,
    });
  }

  function useSave(facilityId: string | null) {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: ({ id, body }: { id?: string; body: unknown }) =>
        apiRequest<TDto>(
          id
            ? `/facilities/${facilityId}/${segment}/${id}`
            : `/facilities/${facilityId}/${segment}`,
          { method: id ? "PATCH" : "POST", body },
        ),
      onSuccess: () =>
        queryClient.invalidateQueries({ queryKey: key(facilityId ?? "none") }),
    });
  }

  function useDeactivate(facilityId: string | null) {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: (id: string) =>
        apiRequest<TDto>(`/facilities/${facilityId}/${segment}/${id}`, {
          method: "DELETE",
        }),
      onSuccess: () =>
        queryClient.invalidateQueries({ queryKey: key(facilityId ?? "none") }),
    });
  }

  return { useList, useSave, useDeactivate };
}

export const productCategories = makeResource<ProductCategoryDto>("categories");
export const vehicleCategories = makeResource<VehicleCategoryDto>("vehicle-categories");
export const docks = makeResource<DockDto>("docks");
export const conflictGroups = makeResource<ConflictGroupDto>("dock-conflict-groups");
export const dockOverrides = makeResource<OverrideDto>("dock-overrides");
export const suppliers = makeResource<SupplierDto>("suppliers");

/** Tedarikçi portal hesabı aksiyonları (reset / aktif-pasif). */
export function useSupplierAccountActions(facilityId: string | null) {
  const queryClient = useQueryClient();
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["config", "suppliers", facilityId ?? "none"] });

  const resetPassword = useMutation({
    mutationFn: ({ id, password }: { id: string; password: string }) =>
      apiRequest(`/facilities/${facilityId}/suppliers/${id}/reset-password`, {
        method: "POST",
        body: { new_password: password },
      }),
  });
  const setAccountStatus = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      apiRequest(`/facilities/${facilityId}/suppliers/${id}/user-status`, {
        method: "PATCH",
        body: { is_active: isActive },
      }),
    onSuccess: invalidate,
  });
  return { resetPassword, setAccountStatus };
}

export function useFacilityUsers(facilityId: string | null) {
  return useQuery({
    queryKey: ["config", "users", facilityId ?? "none"],
    queryFn: () => apiRequest<FacilityUserDto[]>(`/facilities/${facilityId}/users`),
    enabled: facilityId !== null,
  });
}

export function useFacilityRoles(facilityId: string | null) {
  return useQuery({
    queryKey: ["config", "roles", facilityId ?? "none"],
    queryFn: () => apiRequest<RoleDto[]>(`/facilities/${facilityId}/roles`),
    enabled: facilityId !== null,
  });
}

export function usePermissionCatalog(facilityId: string | null) {
  return useQuery({
    queryKey: ["config", "permission-catalog", facilityId ?? "none"],
    queryFn: () =>
      apiRequest<{ permissions: string[] }>(`/facilities/${facilityId}/permission-catalog`),
    enabled: facilityId !== null,
  });
}

/** Kullanıcı CRUD + parola reset. auth/me da invalidate edilir:
 *  aktif kullanıcının kendi rolü değişirse nav/izinler tazelensin. */
export function useUserMutations(facilityId: string | null) {
  const queryClient = useQueryClient();
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["config", "users", facilityId ?? "none"] });
    queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
  };

  const save = useMutation({
    mutationFn: ({ id, body }: { id?: string; body: unknown }) =>
      apiRequest<FacilityUserDto>(
        id ? `/facilities/${facilityId}/users/${id}` : `/facilities/${facilityId}/users`,
        { method: id ? "PATCH" : "POST", body },
      ),
    onSuccess: invalidate,
  });
  const deactivate = useMutation({
    mutationFn: (id: string) =>
      apiRequest<FacilityUserDto>(`/facilities/${facilityId}/users/${id}`, {
        method: "DELETE",
      }),
    onSuccess: invalidate,
  });
  const resetPassword = useMutation({
    mutationFn: ({ id, password }: { id: string; password: string }) =>
      apiRequest(`/facilities/${facilityId}/users/${id}/reset-password`, {
        method: "POST",
        body: { new_password: password },
      }),
  });
  return { save, deactivate, resetPassword };
}

/** Rol CRUD. Rol izinleri değişince auth/me de tazelenir. */
export function useRoleMutations(facilityId: string | null) {
  const queryClient = useQueryClient();
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["config", "roles", facilityId ?? "none"] });
    queryClient.invalidateQueries({ queryKey: ["config", "users", facilityId ?? "none"] });
    queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
  };

  const save = useMutation({
    mutationFn: ({ id, body }: { id?: string; body: unknown }) =>
      apiRequest<RoleDto>(
        id ? `/facilities/${facilityId}/roles/${id}` : `/facilities/${facilityId}/roles`,
        { method: id ? "PATCH" : "POST", body },
      ),
    onSuccess: invalidate,
  });
  const deactivate = useMutation({
    mutationFn: (id: string) =>
      apiRequest<RoleDto>(`/facilities/${facilityId}/roles/${id}`, { method: "DELETE" }),
    onSuccess: invalidate,
  });
  return { save, deactivate };
}
