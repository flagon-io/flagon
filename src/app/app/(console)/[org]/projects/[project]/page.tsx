import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { roleAtLeast } from "@/lib/project-access";
import {
  listProjectOwners,
  ownerCandidates,
} from "@/lib/project-ownership.server";
import { resolveProjectContext } from "./resolve-project";
import { replaceProjectOwnersAction, saveProjectOverviewAction } from "./actions";
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

/**
 * Project overview: the README, with the facts about the project beside it.
 *
 * The sidebar carries METADATA only - ownership, dates, the identifiers people
 * paste into a terminal. Navigation lives in the tab bar overhead, so the
 * Access card that used to sit here was a second, worse route to a tab that
 * was already one click away, dressed up as content.
 */
export default async function ProjectOverviewPage({ params }: Params) {
  const { org: orgSlug, project: projectSlug } = await params;
  const ctx = await resolveProjectContext(orgSlug, projectSlug);
  if (!ctx) notFound();

  const [owners, candidates] = await Promise.all([
    listProjectOwners(ctx.org.id, ctx.project.id),
    ownerCandidates(ctx.org.id),
  ]);

  return (
    <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_260px]">
      <OverviewEditor
        initial={ctx.project.overviewMarkdown}
        canEdit={roleAtLeast(ctx.role, "write")}
        save={saveProjectOverviewAction.bind(null, orgSlug, projectSlug)}
      />

      {/* A metadata rail, not a stack of cards: one hairline separates it from
          the README and the groups separate from each other by space alone.
          Boxing each fact made three of them look like three features. */}
      <aside className="space-y-6 lg:border-l lg:border-white/10 lg:pl-8">
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

        <section>
          <h2 className="text-sm font-medium text-zinc-300">Details</h2>
          <dl className="mt-3 space-y-2.5 text-xs">
            <Detail label="Identifier">
              <code className="font-mono text-zinc-300">{ctx.project.slug}</code>
            </Detail>
            <Detail label="Your role">
              <span className="capitalize text-zinc-300">{ctx.role}</span>
            </Detail>
            <Detail label="Created">
              <span className="text-zinc-300">
                {dateFormat.format(ctx.project.createdAt)}
              </span>
            </Detail>
          </dl>
        </section>
      </aside>
    </div>
  );
}

function Detail({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-zinc-600">{label}</dt>
      <dd className="min-w-0 truncate text-right">{children}</dd>
    </div>
  );
}
