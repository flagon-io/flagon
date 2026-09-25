import type { ReactNode } from "react";
import { cn } from "@flagon-io/ui";

// Shared centered content column. Pages are content-first: a lightweight inline
// title inside <PageBody>, no full-width header bar.
const COLUMN = "mx-auto w-full max-w-6xl px-6 lg:px-8";

/** The centered content column org pages render into. `narrow` keeps a
 *  readable width for config/forms, left-aligned within the column. */
export function PageBody({
  children,
  narrow,
  className,
}: {
  children: ReactNode;
  narrow?: boolean;
  className?: string;
}) {
  return (
    <div className={cn(COLUMN, "py-8", className)}>
      {narrow ? <div className="max-w-3xl">{children}</div> : children}
    </div>
  );
}
