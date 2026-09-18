import type { ReactNode } from "react";
import { cn } from "@flagon-io/ui";

/** A framed canvas that renders a live component example in the docs. */
export function Preview({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "flex min-h-24 flex-wrap items-center gap-3 rounded-xl border border-hairline bg-card p-6",
        className,
      )}
    >
      {children}
    </div>
  );
}
