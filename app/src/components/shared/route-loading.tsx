// Shared route loading skeletons (loading.tsx). They mirror the content-first
// page shape: a lightweight inline title + description, then a few rows.
import { Skeleton, cn } from "@flagon-io/ui";

/** Inline title bar: a heading line and a muted description line. */
export function TitleSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("space-y-2", className)}>
      <Skeleton className="h-6 w-48" />
      <Skeleton className="h-4 w-full max-w-md" />
    </div>
  );
}

/** A bordered list of `rows` placeholder rows, shaped like the app's tables. */
export function RowsSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="overflow-hidden rounded-xl border border-hairline">
      <div className="flex h-10 items-center border-b border-hairline px-4">
        <Skeleton className="h-3 w-24" />
      </div>
      <div className="divide-y divide-hairline">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3.5">
            <Skeleton className="size-8 rounded-md" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-56 max-w-full" />
            </div>
            <Skeleton className="h-8 w-20 rounded-md" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Title + rows: the default shape for list and settings pages. */
export function PageSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div aria-busy="true" aria-live="polite" className="space-y-6">
      <span className="sr-only">Loading</span>
      <TitleSkeleton />
      <RowsSkeleton rows={rows} />
    </div>
  );
}
