import type { ReactNode } from "react";
import { cn } from "@flagon-io/ui";

// Shared max width for a page's header text and its content, so they align in a
// centered column while the header's bottom border still spans
// the full width.
const COLUMN = "mx-auto w-full max-w-6xl px-6 lg:px-8";

/**
 * Full-width page heading: the bar and its bottom border span the whole content
 * area, but the title/actions sit in the same centered column as <PageBody>, so
 * everything lines up. Pair with <PageBody>.
 */
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="border-b border-hairline">
      <div className={cn(COLUMN, "flex flex-wrap items-center justify-between gap-3 py-6")}>
        <div className="min-w-0">
          <h1 className="flex items-center gap-2.5 text-2xl font-semibold tracking-tight text-foreground">
            {title}
          </h1>
          {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}

/** The centered content column below a <PageHeader> (or standalone). `narrow`
 *  keeps a readable width for config/forms, left-aligned within the column. */
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
