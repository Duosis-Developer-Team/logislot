/** Platform Denetim İzleri — web (platform)/platform/audit-logs karşılığı. */

import { useState } from "react";
import { usePlatformAuditLogs } from "@/api/platform";
import { AuditLogList, type AuditFilterState } from "@/components/audit";

export default function PlatformAuditLogs() {
  const [filters, setFilters] = useState<AuditFilterState>({
    entityType: "",
    search: "",
    offset: 0,
  });
  const query = usePlatformAuditLogs({
    entity_type: filters.entityType || undefined,
    search: filters.search || undefined,
    limit: 50,
    offset: filters.offset,
  });
  return <AuditLogList query={query} filters={filters} onFilters={setFilters} />;
}
