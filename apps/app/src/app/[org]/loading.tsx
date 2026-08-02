/**
 * Content-area skeleton while a workspace page loads. The sidebar and top bar
 * from the layout stay put; only this content region streams in, so in-app
 * navigation reads as instant instead of blank.
 */
export default function Loading() {
  return (
    <div className="animate-pulse">
      <div className="h-7 w-56 rounded-md bg-white/5" />
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="h-28 rounded-xl border border-white/5 bg-white/3"
          />
        ))}
      </div>
    </div>
  );
}
