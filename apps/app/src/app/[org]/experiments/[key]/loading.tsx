/**
 * Route-shaped skeleton for the experiment detail page (header + tabs + results
 * column + config aside), so a slow load doesn't flash the org-home grid skeleton.
 */
export default function Loading() {
  return (
    <div className="flex animate-pulse flex-col gap-6">
      <div className="h-4 w-24 rounded bg-white/5" />
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <div className="h-7 w-64 rounded-md bg-white/8" />
          <div className="h-3 w-36 rounded bg-white/5" />
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="h-10 w-24 rounded-md bg-white/5" />
        </div>
      </div>
      <div className="flex gap-6 border-b border-white/8 pb-3">
        {["w-16", "w-24", "w-14"].map((w) => (
          <div key={w} className={`h-4 rounded bg-white/5 ${w}`} />
        ))}
      </div>
      <div className="grid gap-8 lg:grid-cols-[1fr_280px]">
        <div className="flex flex-col gap-4">
          <div className="h-4 w-40 rounded bg-white/5" />
          <div className="h-64 rounded-xl border border-white/5 bg-white/3" />
        </div>
        <div className="flex flex-col gap-4 lg:border-l lg:border-white/8 lg:pl-6">
          <div className="h-40 rounded-xl border border-white/5 bg-white/3" />
        </div>
      </div>
    </div>
  );
}
