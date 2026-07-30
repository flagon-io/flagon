/**
 * A skeleton placeholder: a soft, pulsing block that stands in for content while
 * it loads. Preferred over spinners or "Loading…" text — it preserves layout and
 * reads as "loading" without motion noise. Compose several (with widths/heights)
 * to mock a row, a card, or a control that is saving.
 */
export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div aria-hidden className={`animate-pulse rounded-md bg-white/8 ${className}`} />
  );
}
