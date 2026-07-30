import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getSession } from "@/lib/auth";
import { canManageOrg, getMembershipBySlug } from "@/lib/org";
import {
  entityAttributeNames,
  getFlag,
  getFlagUsage,
  listEntities,
  listMembers,
  listSegments,
} from "@/lib/flags-api";
import { ArchivedNotice } from "./archived-notice";
import { EnvCard } from "./env-controls";
import { EvaluationsAside } from "./evaluations-aside";
import { FlagActions } from "./flag-actions";
import { FlagInfoPanel } from "./flag-info-panel";
import { UseInCodeButton } from "./use-in-code";
import { VariantsEditor } from "./variants-editor";

/**
 * Flag detail: the variants a flag can resolve to, and its configuration in each
 * environment (on/off, default variant, targeting rules). Everything reads from
 * the API; the toggles/selects drive it back through server actions.
 */
export default async function FlagDetail({
  params,
}: {
  params: Promise<{ org: string; key: string }>;
}) {
  const { org: slug, key } = await params;
  const session = await getSession();
  if (!session) redirect("/login");
  const membership = await getMembershipBySlug(session.user.id, slug);
  if (!membership) redirect("/");

  const [detail, segments, members, usage, entities] = await Promise.all([
    getFlag(slug, key),
    listSegments(slug),
    listMembers(slug),
    getFlagUsage(slug, key),
    listEntities(slug),
  ]);
  if (!detail) notFound();

  const attributeSuggestions = entityAttributeNames(entities);
  const isBoolean = detail.flag.type === "boolean";
  const archived = Boolean(detail.flag.archivedAt);

  return (
    <div className="flex flex-col gap-6">
      <Link
        href={`/${slug}/flags`}
        className="inline-flex w-fit items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-300"
      >
        <ArrowLeft className="h-4 w-4" /> Flags
      </Link>

      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="font-mono text-xl font-semibold tracking-tight text-zinc-100">
              {detail.flag.key}
            </h1>
            <span className="rounded-full border border-white/10 px-2 py-0.5 text-xs capitalize text-zinc-400">
              {detail.flag.type}
            </span>
            {archived ? (
              <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-400/90">
                Archived
              </span>
            ) : null}
          </div>
          {detail.flag.description ? (
            <p className="mt-1 text-sm text-zinc-500">{detail.flag.description}</p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <UseInCodeButton slug={slug} flagKey={detail.flag.key} />
          <FlagActions
            slug={slug}
            flagKey={detail.flag.key}
            archived={Boolean(detail.flag.archivedAt)}
            revisions={detail.revisions ?? []}
            canManage={canManageOrg(membership.role)}
          />
        </div>
      </div>

      {archived ? <ArchivedNotice slug={slug} flagKey={detail.flag.key} /> : null}

      <div className="grid gap-8 lg:grid-cols-[1fr_280px]">
        <div className="flex min-w-0 flex-col gap-6">
          {/* Variants — only meaningful for multivariate flags (boolean is on/off). */}
          {!isBoolean ? (
            <VariantsEditor
              slug={slug}
              flagKey={detail.flag.key}
              type={detail.flag.type as "string" | "number" | "json"}
              variants={detail.variants}
              canManage={canManageOrg(membership.role)}
              readOnly={archived}
            />
          ) : null}

          {/* Environments */}
          <section>
            <h2 className="mb-2 text-sm font-medium text-zinc-300">Environments</h2>
            <div className="flex flex-col gap-3">
              {detail.environments.map((env) => (
                <EnvCard
                  key={env.key}
                  slug={slug}
                  flagKey={detail.flag.key}
                  env={env}
                  variants={detail.variants}
                  segments={segments}
                  isBoolean={isBoolean}
                  readOnly={archived}
                  attributeSuggestions={attributeSuggestions}
                />
              ))}
            </div>
          </section>
        </div>

        <aside className="flex flex-col gap-5 lg:border-l lg:border-white/8 lg:pl-6">
          {usage ? <EvaluationsAside usage={usage} /> : null}
          <FlagInfoPanel
            slug={slug}
            flag={detail.flag}
            members={members}
            readOnly={archived}
          />
        </aside>
      </div>
    </div>
  );
}
