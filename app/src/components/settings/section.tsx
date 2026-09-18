import type { ReactNode } from "react";

/** Content header: a title (and optional description) with a rule, plus an
 *  optional actions slot (e.g. a "New ..." button) aligned to the right. */
export function SettingsHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3 border-b border-hairline pb-3">
      <div className="min-w-0">
        <h2 className="text-xl font-semibold text-foreground">{title}</h2>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

/** A subheading within a page (used to separate stacked sections). */
export function SettingsSubheader({
  title,
  description,
}: {
  title: string;
  description?: ReactNode;
}) {
  return (
    <div>
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
    </div>
  );
}
