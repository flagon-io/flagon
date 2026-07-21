import Link from "next/link";
import { Users } from "lucide-react";
import { appPath } from "@/lib/urls";
import { formatQuantity } from "@/lib/meters";
import type { ProjectOwner } from "@/lib/project-ownership.server";

/**
 * One project, as a card.
 *
 * Built as a card rather than a table row because a project is an OBJECT with
 * identity, not a record: it has a mark, the people responsible for it, and a
 * sense of whether anything is actually happening in it. A row can carry a
 * name and a date and nothing else without becoming a spreadsheet.
 *
 * The layout leaves deliberate room at the bottom for what lands next
 * (per-product status, a sparkline, deployment state) so adding it later is a
 * new line in the footer rather than a redesign.
 */

/**
 * Identity mark, derived from the slug.
 *
 * A project has no uploaded icon yet, and a row of identical grey squares
 * makes a list of eight projects impossible to scan. Hashing the slug to a
 * fixed palette gives every project a stable colour and initial from the
 * moment it is created, and swaps out cleanly for a real icon later.
 *
 * The classes are written out in full because Tailwind scans source text: a
 * template-built class name would not survive the build.
 */
const MARKS = [
  "bg-teal-500/15 text-teal-300",
  "bg-sky-500/15 text-sky-300",
  "bg-violet-500/15 text-violet-300",
  "bg-amber-500/15 text-amber-300",
  "bg-rose-500/15 text-rose-300",
  "bg-emerald-500/15 text-emerald-300",
];

function markFor(slug: string): string {
  let hash = 0;
  for (let i = 0; i < slug.length; i += 1) {
    hash = (hash * 31 + slug.charCodeAt(i)) >>> 0;
  }
  return MARKS[hash % MARKS.length];
}

const dateFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

export function ProjectCard({
  orgSlug,
  project,
  owners,
  evaluations,
}: {
  orgSlug: string;
  project: { slug: string; name: string; createdAt: Date };
  owners: ProjectOwner[];
  /** Evaluations this project served in the current period. */
  evaluations: number;
}) {
  const shown = owners.slice(0, 3);
  const overflow = owners.length - shown.length;

  return (
    <Link
      href={appPath(`/${orgSlug}/projects/${project.slug}`)}
      className="group flex flex-col border border-white/10 bg-white/2 p-4 transition hover:border-white/20 hover:bg-white/4"
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className={`flex h-9 w-9 shrink-0 items-center justify-center text-sm font-semibold ${markFor(project.slug)}`}
        >
          {project.name.slice(0, 1).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-zinc-100">
            {project.name}
          </div>
          <div className="mt-0.5 truncate font-mono text-xs text-zinc-500">
            {project.slug}
          </div>
        </div>

        {/* Owners, stacked like a face pile. Teams get the group glyph so a
            team never reads as a person with a one-letter name. */}
        {shown.length ? (
          <div className="flex shrink-0 -space-x-1.5">
            {shown.map((owner) => (
              <span
                key={owner.id}
                title={owner.name}
                className={`flex h-5 w-5 items-center justify-center rounded-full border border-[#0b0b0d] text-[9px] font-semibold ${
                  owner.kind === "team"
                    ? "bg-white/10 text-zinc-400"
                    : "bg-teal-500/20 text-teal-300"
                }`}
              >
                {owner.kind === "team" ? (
                  <Users className="h-2.5 w-2.5" aria-hidden />
                ) : (
                  owner.name.slice(0, 1).toUpperCase()
                )}
              </span>
            ))}
            {overflow > 0 ? (
              <span className="flex h-5 w-5 items-center justify-center rounded-full border border-[#0b0b0d] bg-white/10 text-[9px] font-medium text-zinc-400">
                +{overflow}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="mt-4 flex items-baseline justify-between gap-3 border-t border-white/5 pt-3 text-xs">
        <span className="text-zinc-500">
          {evaluations > 0 ? (
            <>
              <span className="font-medium text-zinc-300">
                {formatQuantity(evaluations)}
              </span>{" "}
              evaluations
            </>
          ) : (
            // Not "0 evaluations": a project that has never served one is
            // waiting to be wired up, which is a different state from a
            // project that went quiet.
            <span className="text-zinc-600">No usage yet</span>
          )}
        </span>
        <span className="shrink-0 text-zinc-600">
          {dateFormat.format(project.createdAt)}
        </span>
      </div>
    </Link>
  );
}
