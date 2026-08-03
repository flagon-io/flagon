import Link from "next/link";
import { RELATION_TYPES, labelFor, relationInboundLabel } from "@/lib/catalog";
import type { ProjectRelation } from "@/lib/projects-api";
import { Card, CardHead } from "./cards";

const TYPE_OPTIONS = RELATION_TYPES.map((r) => ({ value: r.value, label: r.label }));

function monogram(name: string): string {
  return name.trim().slice(0, 1).toUpperCase() || "?";
}

/** A related-project node pill (links to that project). */
function Node({
  slug,
  rel,
  typeLabel,
}: {
  slug: string;
  rel: ProjectRelation;
  typeLabel: string;
}) {
  return (
    <Link
      href={`/${slug}/projects/${rel.project.key}`}
      className="group flex items-center gap-2 rounded-lg border border-white/10 bg-white/3 px-2.5 py-1.5 transition-colors hover:border-white/20 hover:bg-white/5"
    >
      <span className="grid size-6 shrink-0 place-items-center rounded bg-white/5 text-[10px] font-medium text-zinc-400">
        {monogram(rel.project.name)}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm text-zinc-200 group-hover:text-zinc-100">
          {rel.project.name}
        </span>
        <span className="block text-[10px] tracking-wide text-zinc-500 uppercase">{typeLabel}</span>
      </span>
    </Link>
  );
}

/**
 * A hub-and-spoke visual of a project's relationships: the project itself in the
 * center, the projects it points at branching right (outgoing), and the projects
 * that point at it branching left (incoming). Static, server-rendered; the
 * connectors are CSS spines + stubs, so it needs no measurement.
 */
export function RelationshipGraph({
  slug,
  projectName,
  outgoing,
  incoming,
  href,
  canManage,
}: {
  slug: string;
  projectName: string;
  outgoing: ProjectRelation[];
  incoming: ProjectRelation[];
  href: string;
  canManage: boolean;
}) {
  const empty = outgoing.length === 0 && incoming.length === 0;
  return (
    <Card>
      <CardHead
        title="Relationships"
        action={
          <Link href={href} className="text-xs text-zinc-400 hover:text-zinc-200">
            {canManage && !empty ? "Manage" : "View"}
          </Link>
        }
      />
      {empty ? (
        <div className="flex items-center justify-between gap-2 px-4 py-8">
          <p className="text-sm text-zinc-500">
            No relationships yet. Map what this project depends on and what uses it.
          </p>
          {canManage ? (
            <Link href={href} className="shrink-0 text-sm text-teal-400 hover:text-teal-300">
              Add
            </Link>
          ) : null}
        </div>
      ) : (
        <div className="flex items-center justify-center gap-0 overflow-x-auto px-4 py-6">
          {/* Incoming (left) */}
          {incoming.length > 0 ? (
            <>
              <ul className="flex flex-col justify-around gap-3">
                {incoming.map((r) => (
                  <li key={r.id} className="flex items-center">
                    <Node slug={slug} rel={r} typeLabel={relationInboundLabel(r.type)} />
                    <span className="w-6 border-t border-white/12" />
                  </li>
                ))}
              </ul>
              <div className="self-stretch border-r border-white/12" />
              <span className="w-6 border-t border-white/12" />
            </>
          ) : null}

          {/* Hub: this project */}
          <div className="flex shrink-0 items-center gap-2 rounded-lg border border-teal-400/30 bg-teal-400/10 px-3 py-2">
            <span className="grid size-6 shrink-0 place-items-center rounded bg-teal-400/15 text-[10px] font-medium text-teal-200">
              {monogram(projectName)}
            </span>
            <span className="max-w-36 truncate text-sm font-medium text-zinc-100">
              {projectName}
            </span>
          </div>

          {/* Outgoing (right) */}
          {outgoing.length > 0 ? (
            <>
              <span className="w-6 border-t border-white/12" />
              <div className="self-stretch border-l border-white/12" />
              <ul className="flex flex-col justify-around gap-3">
                {outgoing.map((r) => (
                  <li key={r.id} className="flex items-center">
                    <span className="w-6 border-t border-white/12" />
                    <Node slug={slug} rel={r} typeLabel={labelFor(TYPE_OPTIONS, r.type) ?? r.type} />
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
      )}
    </Card>
  );
}
