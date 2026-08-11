/** Denetim İzleri — web (admin)/admin/settings/audit-logs karşılığı. */

import { useState } from "react";
import { useAuditLogs } from "@/api/admin";
import { useSession } from "@/auth/session";
import { AuditLogList, type AuditFilterState } from "@/components/audit";

export default function AdminAuditLogs() {
  const session = useSession();
  const [filters, setFilters] = useState<AuditFilterState>({
    entityType: "",
    search: "",
    offset: 0,
  });
  const query = useAuditLogs(session.activeFacilityId, {
    entity_type: filters.entityType || undefined,
    search: filters.search || undefined,
    limit: 50,
    offset: filters.offset,
  });
  return <AuditLogList query={query} filters={filters} onFilters={setFilters} />;
}
