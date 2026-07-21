/**
 * Loading placeholders shaped like the content they stand in for.
 *
 * Skeletons everywhere, never a spinner and never the word "Loading". A
 * spinner says "something is happening" and nothing else; a skeleton says what
 * is about to appear and where, so the layout does not jump when it lands and
 * the wait reads as shorter than it is. It also keeps the page from being a
 * blank rectangle, which is what a spinner in a large empty region amounts to.
 *
 * The pulse is on the container, not each bar, so a group of bars breathes
 * together instead of shimmering out of phase.
 */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`rounded bg-white/6 ${className}`} aria-hidden />;
}

/** A block of stacked text lines, last one short like a real paragraph. */
export function SkeletonText({
  lines = 3,
  className = "",
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div className={`animate-pulse space-y-2 ${className}`}>
      {Array.from({ length: lines }, (_, index) => (
        <Skeleton
          key={index}
          className={`h-3 ${index === lines - 1 ? "w-2/5" : "w-full"}`}
        />
      ))}
    </div>
  );
}

/**
 * Rows inside a bordered list, matching the real list's padding and dividers
 * so nothing shifts when the data arrives.
 */
export function SkeletonRows({
  rows = 3,
  className = "",
}: {
  rows?: number;
  className?: string;
}) {
  return (
    <div className={`animate-pulse divide-y divide-white/5 border border-white/10 ${className}`}>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex items-center gap-3 px-4 py-3.5">
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-3.5 w-40" />
            <Skeleton className="h-3 w-64" />
          </div>
          <Skeleton className="h-8 w-16 shrink-0" />
        </div>
      ))}
    </div>
  );
}

/** The standard console page header: eyebrow, title, supporting line. */
export function SkeletonPageHeader() {
  return (
    <div className="animate-pulse">
      <Skeleton className="h-3 w-28" />
      <Skeleton className="mt-4 h-7 w-56" />
      <Skeleton className="mt-3 h-3.5 w-80" />
    </div>
  );
}

/** A grid of cards, for surfaces like the project list. */
export function SkeletonCards({ cards = 6 }: { cards?: number }) {
  return (
    <div className="grid animate-pulse gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: cards }, (_, index) => (
        <div key={index} className="border border-white/10 bg-white/2 p-4">
          <div className="flex items-start gap-3">
            <Skeleton className="h-9 w-9 shrink-0" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-3.5 w-32" />
              <Skeleton className="h-3 w-20" />
            </div>
          </div>
          <div className="mt-4 border-t border-white/5 pt-3">
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
      ))}
    </div>
  );
}
