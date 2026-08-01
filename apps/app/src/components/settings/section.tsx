import type { ReactNode } from "react";

/** A titled settings card. The consistent container for every settings block. */
export function SettingsSection({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-white/10 bg-white/2">
      <div className="flex items-start justify-between gap-4 border-b border-white/8 px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold text-zinc-100">{title}</h2>
          {description ? (
            <p className="mt-0.5 text-xs text-zinc-500">{description}</p>
          ) : null}
        </div>
        {action}
      </div>
      {children ? <div className="px-5 py-4">{children}</div> : null}
    </section>
  );
}

/**
 * The flush action bar for the bottom of a settings card: a full-width top border
 * with actions right-aligned, mirroring the design system's ModalFooter "house
 * shape". Render it as the LAST child of a SettingsSection body — the negative
 * margins bleed it to the card edges (kept in sync with the body's `px-5 py-4`
 * padding above), and the parent's own gap provides the space above it. Put any
 * left-aligned status or hint first with `mr-auto`; the primary button goes last.
 */
export function SettingsFooter({ children }: { children: ReactNode }) {
  return (
    <div className="-mx-5 -mb-4 flex flex-wrap items-center justify-end gap-3 border-t border-white/8 px-5 py-3">
      {children}
    </div>
  );
}

/** The page heading above a group of settings sections. */
export function SettingsHeader({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="mb-6">
      <h1 className="text-xl font-semibold tracking-tight text-zinc-100">
        {title}
      </h1>
      {description ? (
        <p className="mt-1 text-sm text-zinc-500">{description}</p>
      ) : null}
    </div>
  );
}
