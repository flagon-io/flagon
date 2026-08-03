import Link from "next/link";

/**
 * URL-driven tab nav for the experiment surface (Results / Diagnostics / Setup).
 * Server-rendered links, so each tab is a real, shareable, bookmarkable URL and
 * the panels render on the server. "Results" is the bare path; the others carry
 * `?tab=`. Keep this in sync with the panels in page.tsx.
 */
export const EXPERIMENT_TABS = [
  { id: "results", label: "Results" },
  { id: "diagnostics", label: "Diagnostics" },
  { id: "setup", label: "Setup" },
] as const;

export type ExperimentTab = (typeof EXPERIMENT_TABS)[number]["id"];

export function resolveTab(value: string | undefined): ExperimentTab {
  return EXPERIMENT_TABS.some((t) => t.id === value) ? (value as ExperimentTab) : "results";
}

export function ExperimentTabs({
  slug,
  experimentKey,
  active,
}: {
  slug: string;
  experimentKey: string;
  active: ExperimentTab;
}) {
  const base = `/${slug}/experiments/${experimentKey}`;
  return (
    <div className="flex items-center gap-1 border-b border-white/8" role="tablist">
      {EXPERIMENT_TABS.map((t) => {
        const isActive = t.id === active;
        return (
          <Link
            key={t.id}
            href={t.id === "results" ? base : `${base}?tab=${t.id}`}
            role="tab"
            aria-selected={isActive}
            className={
              "-mb-px border-b-2 px-3 py-2 text-sm transition-colors " +
              (isActive
                ? "border-teal-400 font-medium text-zinc-100"
                : "border-transparent text-zinc-400 hover:text-zinc-200")
            }
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
