import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  CalendarDays,
  Hash,
  Link as LinkIcon,
  ShieldCheck,
  Users,
} from "lucide-react";
import { appPath } from "@/lib/urls";
import { roleAtLeast } from "@/lib/project-access";
import { listProjectGrants } from "@/lib/project-access.server";
import {
  listProjectOwners,
  ownerCandidates,
} from "@/lib/project-ownership.server";
import { resolveProjectContext } from "./resolve-project";
import {
  replaceProjectOwnersAction,
  saveProjectDetailsAction,
  saveProjectOverviewAction,
} from "./actions";
import { ProjectDetailsDialog } from "./details-dialog";
import { OverviewEditor } from "./overview-editor";
import { OwnershipPanel } from "./ownership-panel";

type Params = { params: Promise<{ org: string; project: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { project } = await params;
  return { title: project };
}

const dateFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

/** "https://www.flagon.io/docs" reads as "www.flagon.io/docs" in a rail. */
function displayWebsite(website: string): string {
  try {
    const url = new URL(website);
    return `${url.host}${url.pathname === "/" ? "" : url.pathname}`;
  } catch {
    return website;
  }
}

/**
 * Project overview: the README, with the facts about the project beside it.
 *
 * The sidebar is modelled on a repository's About rail - a summary, then the
 * facts as icon rows, then the people. It carries METADATA only; navigation
 * lives in the tab bar overhead, so the Access card that used to sit here was
 * a second, worse route to a tab that was already one click away. The counts
 * that DO appear link to that tab rather than restating it.
 */
export default async function ProjectOverviewPage({ params }: Params) {
  const { org: orgSlug, project: projectSlug } = await params;
  const ctx = await resolveProjectContext(orgSlug, projectSlug);
  if (!ctx) notFound();

  const [owners, candidates, grants] = await Promise.all([
    listProjectOwners(ctx.org.id, ctx.project.id),
    ownerCandidates(ctx.org.id),
    listProjectGrants(ctx.org.id, ctx.project.id),
  ]);

  const canEdit = roleAtLeast(ctx.role, "write");
  const accessHref = appPath(`/${orgSlug}/projects/${projectSlug}/access`);
  const people = grants.filter((grant) => grant.subject.type === "user");
  const teamGrants = grants.filter((grant) => grant.subject.type === "team");

  return (
    <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_280px]">
      <OverviewEditor
        initial={ctx.project.overviewMarkdown}
        canEdit={canEdit}
        save={saveProjectOverviewAction.bind(null, orgSlug, projectSlug)}
      />

      {/* A metadata rail, not a stack of cards: one hairline separates it from
          the README and the groups separate from each other by space alone.
          Boxing each fact made three of them look like three features. */}
      <aside className="space-y-6 lg:border-l lg:border-white/10 lg:pl-8">
        <section>
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-zinc-200">About</h2>
            {canEdit ? (
              <ProjectDetailsDialog
                description={ctx.project.description}
                website={ctx.project.website}
                topics={ctx.project.topics}
                save={saveProjectDetailsAction.bind(null, orgSlug, projectSlug)}
              />
            ) : null}
          </div>

          {ctx.project.description ? (
            <p className="mt-2 text-sm leading-6 text-zinc-400">
              {ctx.project.description}
            </p>
          ) : (
            <p className="mt-2 text-sm leading-6 text-zinc-600">
              {canEdit
                ? "No description. Add one so this project introduces itself."
                : "No description."}
            </p>
          )}

          {ctx.project.website ? (
            <a
              href={ctx.project.website}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="mt-3 flex items-center gap-2 text-xs text-teal-400 transition hover:text-teal-300"
            >
              <LinkIcon className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span className="truncate">
                {displayWebsite(ctx.project.website)}
              </span>
            </a>
          ) : null}

          {ctx.project.topics.length ? (
            <ul className="mt-3 flex flex-wrap gap-1.5">
              {ctx.project.topics.map((topic) => (
                <li key={topic}>
                  <Link
                    href={`${appPath(`/${orgSlug}`)}?topic=${encodeURIComponent(topic)}`}
                    className="inline-block rounded-full border border-teal-400/20 bg-teal-400/10 px-2.5 py-0.5 text-xs text-teal-300 transition hover:border-teal-400/40 hover:bg-teal-400/20"
                  >
                    {topic}
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}

          <ul className="mt-4 space-y-2.5 text-xs">
            <Fact icon={Hash} label="Identifier">
              <code className="font-mono text-zinc-300">
                {ctx.project.slug}
              </code>
            </Fact>
            <Fact icon={ShieldCheck} label="Your role">
              <span className="capitalize text-zinc-300">{ctx.role}</span>
            </Fact>
            <Fact icon={Users} label="Direct access">
              {/* Counts only what was GRANTED. Organization owners and admins
                  are admins here without a grant, and every member can read,
                  so a single "N people" would be a number nobody could
                  reconcile with the Access tab. */}
              <Link
                href={accessHref}
                className="text-zinc-300 transition hover:text-teal-300"
              >
                {people.length} {people.length === 1 ? "person" : "people"}
                {teamGrants.length
                  ? `, ${teamGrants.length} ${teamGrants.length === 1 ? "team" : "teams"}`
                  : ""}
              </Link>
            </Fact>
            <Fact icon={CalendarDays} label="Created">
              <span className="text-zinc-300">
                {dateFormat.format(ctx.project.createdAt)}
              </span>
            </Fact>
          </ul>
        </section>

        <OwnershipPanel
          teams={candidates.teams}
          people={candidates.people}
          initial={owners.map((owner) => ({
            kind: owner.kind,
            id: owner.subjectId,
          }))}
          canManage={roleAtLeast(ctx.role, "admin")}
          save={replaceProjectOwnersAction.bind(null, orgSlug, projectSlug)}
        />

        {grants.length ? (
          <section>
            <Link
              href={accessHref}
              className="text-sm font-medium text-zinc-300 transition hover:text-teal-300"
            >
              Direct access
            </Link>
            {/* Faces, like a contributors strip: who is on this project is a
                recognition task, not a reading one. The names stay available
                as tooltips and on the Access tab, which is one click away. */}
            <ul className="mt-3 flex flex-wrap gap-1.5">
              {grants.slice(0, 12).map((grant) => (
                <li key={grant.id}>
                  <Link
                    href={accessHref}
                    title={`${grant.subject.name} · ${grant.role}`}
                    className="block"
                  >
                    {grant.subject.type === "team" ? (
                      <span className="flex h-7 w-7 items-center justify-center rounded bg-white/7 transition hover:bg-white/12">
                        <Users
                          className="h-3.5 w-3.5 text-zinc-400"
                          aria-hidden
                        />
                        <span className="sr-only">{grant.subject.name}</span>
                      </span>
                    ) : (
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-teal-500/15 text-[11px] font-semibold text-teal-300 transition hover:bg-teal-500/25">
                        <span aria-hidden>
                          {grant.subject.name.slice(0, 1).toUpperCase()}
                        </span>
                        <span className="sr-only">{grant.subject.name}</span>
                      </span>
                    )}
                  </Link>
                </li>
              ))}
              {grants.length > 12 ? (
                <li className="flex h-7 items-center px-1 text-xs text-zinc-500">
                  +{grants.length - 12}
                </li>
              ) : null}
            </ul>
          </section>
        ) : null}
      </aside>
    </div>
  );
}

function Fact({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof Hash;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flex items-center gap-2">
      <Icon className="h-3.5 w-3.5 shrink-0 text-zinc-600" aria-hidden />
      <span className="text-zinc-600">{label}</span>
      <span className="ml-auto min-w-0 truncate text-right">{children}</span>
    </li>
  );
}
