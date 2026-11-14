"use client";

/**
 * Islem suresi kurallari (yonetim ekrani). Algoritma: docs/SURE_HESAPLAMA.md.
 */

import { DurationRulesManager } from "@/components/duration/duration-rules-manager";
import { useSession } from "@/lib/auth/session";
import { useT } from "@/lib/i18n/provider";

export default function DurationRulesPage() {
  const t = useT();
  const copy = t.admin.durationRules;
  const { activeFacilityId, can } = useSession();

  if (!can("category.manage"))
    return <p className="text-sm text-muted-foreground">{copy.needsPermission}</p>;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-bold">{copy.title}</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">{copy.description}</p>
      </div>
      <DurationRulesManager facilityId={activeFacilityId} />
    </div>
  );
}
