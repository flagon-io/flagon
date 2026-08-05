import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, FlaskConical } from "lucide-react";
import { getSession } from "@/lib/auth";
import { canManageOrg, getMembershipBySlug } from "@/lib/org";
import {
  getFlag,
  getFlagImpact,
  getFlagUsage,
  listMembers,
  listSegments,
} from "@/lib/flags-api";
import { listExperiments, listMetrics } from "@/lib/experiments-api";
import { ArchivedNotice } from "./archived-notice";
import { EnvCard } from "./env-controls";
import { EvaluationsAside } from "./evaluations-aside";
import { FlagActions } from "./flag-actions";
import { FlagImpactPanel } from "./flag-impact";
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

  const impactEnv = "production";
  const [detail, segments, members, usage, experiments, metricsLibrary, impact] =
    await Promise.all([
      getFlag(slug, key),
      listSegments(slug),
      listMembers(slug),
      getFlagUsage(slug, key),
      listExperiments(slug),
      listMetrics(slug),
      getFlagImpact(slug, key, impactEnv),
    ]);
  if (!detail) notFound();

  const isBoolean = detail.flag.type === "boolean";
  const archived = Boolean(detail.flag.archivedAt);
  // Experiments measuring THIS flag — running ones lock the flag's targeting.
  const flagExperiments = experiments.filter((e) => e.flag === detail.flag.key);
  const runningExperiments = flagExperiments.filter((e) => e.status === "running");

  return (
    <div className="flex flex-col gap-6">
      <Link
        href={`/${slug}/flags`}
        className="inline-flex w-fit items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-300"
      >
        <ArrowLeft className="size-4" /> Flags
      </Link>

      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="font-mono text-xl font-semibold tracking-tight text-zinc-100">
              {detail.flag.key}
            </h1>
            <span className="rounded-full border border-white/10 px-2 py-0.5 text-xs text-zinc-400 capitalize">
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

      {runningExperiments.length > 0 ? (
        <div className="flex items-start gap-3 rounded-xl border border-teal-500/20 bg-teal-500/6 px-4 py-3">
          <FlaskConical className="mt-0.5 size-4 shrink-0 text-teal-300" />
          <div className="min-w-0 text-sm">
            <p className="text-zinc-200">
              Measured by{" "}
              {runningExperiments.map((e, i) => (
                <span key={e.key}>
                  {i > 0 ? ", " : ""}
                  <Link
                    href={`/${slug}/experiments/${e.key}`}
                    className="font-medium text-teal-300 hover:text-teal-200"
                  >
                    {e.name}
                  </Link>
                  <span className="text-zinc-500"> ({e.environment})</span>
                </span>
              ))}
              .
            </p>
            <p className="mt-0.5 text-zinc-500">
              This flag&apos;s targeting is locked while the experiment runs so the arms
              stay fixed. Stop the experiment to reallocate traffic.
            </p>
          </div>
        </div>
      ) : null}

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
                  allEnvironments={detail.environments.map((e) => ({
                    key: e.key,
                    name: e.name,
                  }))}
                />
              ))}
            </div>
          </section>

          {/* Always-on impact: watched metrics measured vs the default variant. */}
          <FlagImpactPanel
            slug={slug}
            flagKey={detail.flag.key}
            environments={detail.environments.map((e) => ({ key: e.key, name: e.name }))}
            initialImpact={impact}
            initialEnvironment={impactEnv}
            metricsLibrary={metricsLibrary.map((m) => ({ key: m.key, name: m.name }))}
            canManage={canManageOrg(membership.role)}
          />
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
