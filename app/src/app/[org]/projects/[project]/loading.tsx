import { Skeleton } from "@flagon-io/ui";
import { PageBody } from "@/components/shell/page-header";

// Shown under the project header while a project section loads: roughly the
// overview's README card beside the About rail.
export default function ProjectLoading() {
  return (
    <PageBody className="max-w-6xl">
      <div aria-busy="true" aria-live="polite" className="grid gap-6 lg:grid-cols-3">
        <span className="sr-only">Loading</span>
        <div className="overflow-hidden rounded-xl border border-hairline lg:col-span-2">
          <div className="border-b border-hairline px-4 py-3">
            <Skeleton className="h-4 w-28" />
          </div>
          <div className="space-y-3 p-6">
            <Skeleton className="h-6 w-1/2" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-11/12" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        </div>
        <div className="space-y-3">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      </div>
    </PageBody>
  );
}
