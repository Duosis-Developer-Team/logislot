"use client";

/** White-label branding hook'lari. */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api/client";

export interface BrandingDto {
  brand_name: string;
  logo_url: string | null;
  primary_color: string;
  accent_color: string;
  sidebar_color: string | null;
  portal_header_style: "light" | "dark";
  custom_footer_text: string | null;
  is_customized: boolean;
}

export const DEFAULT_BRANDING: BrandingDto = {
  brand_name: "LogiSlot",
  logo_url: null,
  primary_color: "#4F46E5",
  accent_color: "#F97316",
  sidebar_color: null,
  portal_header_style: "light",
  custom_footer_text: null,
  is_customized: false,
};

export function useBranding(facilityId: string | null) {
  return useQuery({
    queryKey: ["branding", facilityId ?? "none"],
    queryFn: () => apiRequest<BrandingDto>(`/facilities/${facilityId}/branding`),
    enabled: facilityId !== null,
    staleTime: 60_000,
  });
}

export function useBrandingMutations(facilityId: string | null) {
  const queryClient = useQueryClient();
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["branding", facilityId ?? "none"] });

  const save = useMutation({
    mutationFn: (body: Partial<BrandingDto>) =>
      apiRequest<BrandingDto>(`/facilities/${facilityId}/branding`, {
        method: "PATCH",
        body,
      }),
    onSuccess: invalidate,
  });
  const reset = useMutation({
    mutationFn: () =>
      apiRequest<BrandingDto>(`/facilities/${facilityId}/branding`, {
        method: "DELETE",
      }),
    onSuccess: invalidate,
  });
  return { save, reset };
}
