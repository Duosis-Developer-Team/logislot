/**
 * Raporlar + e-posta logları + plan uyarıları hook'ları.
 * KAYNAK CONTRACT: apps/web/src/lib/api/reports.ts ile birebir aynı.
 */

import { useQuery } from "@tanstack/react-query";
import { apiRequest, apiRequestText } from "./client";
import type {
  EmailLogListDto,
  FacilityPlanWarningsDto,
  ReportsSummaryDto,
} from "./types";

export function useReportsSummary(
  facilityId: string | null,
  dateFrom: string,
  dateTo: string,
) {
  return useQuery({
    queryKey: ["reports", facilityId ?? "none", dateFrom, dateTo],
    queryFn: () =>
      apiRequest<ReportsSummaryDto>(
        `/facilities/${facilityId}/reports/summary?date_from=${dateFrom}&date_to=${dateTo}`,
      ),
    enabled: facilityId !== null,
  });
}

/** CSV raporunu düz metin olarak indirir (paylaşım için). */
export function fetchReportCsv(
  facilityId: string,
  kind: "summary" | "appointments",
  dateFrom: string,
  dateTo: string,
): Promise<string> {
  return apiRequestText(
    `/facilities/${facilityId}/reports/${kind}.csv?date_from=${dateFrom}&date_to=${dateTo}`,
  );
}

export interface EmailLogFilters {
  status?: string;
  provider?: string;
  template_key?: string;
  recipient_email?: string;
  date_from?: string;
  date_to?: string;
  has_error?: boolean;
  limit?: number;
  offset?: number;
}

export function useEmailLogsPage(facilityId: string | null, filters: EmailLogFilters) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== null && value !== "") {
      params.set(key, String(value));
    }
  }
  return useQuery({
    queryKey: ["email-logs", facilityId ?? "none", "page", params.toString()],
    queryFn: () =>
      apiRequest<EmailLogListDto>(
        `/facilities/${facilityId}/email-logs?${params.toString()}`,
      ),
    enabled: facilityId !== null,
  });
}

/** Tesisin kendi plan kullanım uyarıları (bilgilendirme; engel değil). */
export function useFacilityPlanWarnings(facilityId: string | null) {
  return useQuery({
    queryKey: ["plan-warnings", facilityId ?? "none"],
    queryFn: () =>
      apiRequest<FacilityPlanWarningsDto>(`/facilities/${facilityId}/plan/warnings`),
    enabled: facilityId !== null,
    staleTime: 300_000,
  });
}
