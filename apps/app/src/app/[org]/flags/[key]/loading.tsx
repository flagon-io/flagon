/**
 * Route-shaped skeleton for the flag detail page (header + main column + aside),
 * so a slow flag load doesn't flash the org-home grid skeleton.
 */
export default function Loading() {
  return (
    <div className="flex animate-pulse flex-col gap-6">
      <div className="h-4 w-16 rounded bg-white/5" />
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-2">
          <div className="h-6 w-56 rounded-md bg-white/8" />
          <div className="h-3 w-40 rounded bg-white/5" />
        </div>
        <div className="flex gap-2">
          <div className="h-10 w-28 rounded-md bg-white/5" />
          <div className="size-10 rounded-md bg-white/5" />
        </div>
      </div>
      <div className="grid gap-8 lg:grid-cols-[1fr_280px]">
        <div className="flex flex-col gap-4">
          <div className="h-5 w-28 rounded bg-white/5" />
          <div className="h-40 rounded-xl border border-white/5 bg-white/3" />
          <div className="h-40 rounded-xl border border-white/5 bg-white/3" />
        </div>
        <div className="flex flex-col gap-4 lg:border-l lg:border-white/8 lg:pl-6">
          <div className="h-28 rounded-xl border border-white/5 bg-white/3" />
          <div className="h-40 rounded-xl border border-white/5 bg-white/3" />
        </div>
      </div>
    </div>
  );
}
