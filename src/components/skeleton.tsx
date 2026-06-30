/** Theme-aware skeleton placeholder. Use instead of spinners or "Loading…" text. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-foreground/10 ${className ?? ''}`} />;
}
