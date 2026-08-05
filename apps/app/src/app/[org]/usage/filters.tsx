"use client";

import { useRouter } from "next/navigation";
import { Select } from "@flagon/design";
import type { UsageGroupBy } from "@/lib/flags-api";

/**
 * The usage filter row. Range + grouping live in the URL so the page (a server
 * component) refetches and re-renders on change — no client data fetching. Only
 * these two params exist, so we rebuild the query string from props rather than
 * reading useSearchParams (which would need a Suspense boundary).
 */
export function UsageFilters({
  base,
  range,
  groupBy,
}: {
  base: string;
  range: string;
  groupBy: UsageGroupBy;
}) {
  const router = useRouter();

  function go(next: { range?: string; groupBy?: string }) {
    const params = new URLSearchParams({
      range: next.range ?? range,
      groupBy: next.groupBy ?? groupBy,
    });
    router.push(`${base}?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        ariaLabel="Date range"
        value={range}
        onValueChange={(v) => go({ range: v })}
        fullWidth={false}
        options={[
          { value: "cycle", label: "Current cycle" },
          { value: "7", label: "Last 7 days" },
          { value: "30", label: "Last 30 days" },
          { value: "90", label: "Last 90 days" },
        ]}
      />
      <Select
        ariaLabel="Group by"
        value={groupBy}
        onValueChange={(v) => go({ groupBy: v })}
        fullWidth={false}
        options={[
          { value: "meter", label: "By Product" },
          { value: "flag", label: "By Flag" },
          { value: "environment", label: "By Environment" },
          { value: "reason", label: "By Reason" },
        ]}
      />
    </div>
  );
}
