import { notFound } from "next/navigation";
import { getFlag } from "@/lib/flags.server";
import { listSegments } from "@/lib/segments.server";
import type { FlagType, TargetingRule, Variant } from "@/lib/flags";
import {
  flagUsageDetail,
  orgEmitsExposures,
  recentExposureSamples,
} from "@/lib/flag-usage.server";
import {
  assessFlag,
  checksPerHour,
  dailyBuckets,
  passRate,
} from "@/lib/flag-metrics";
import { formatQuantity } from "@/lib/meters";
import { resolveOrg } from "../../resolve-org";
import { deleteFlagAction, saveFlagDefinitionAction } from "../actions";
import { FlagDefinitionEditor } from "../flag-definition-editor";
import { DeleteFlagModal } from "../delete-flag-modal";
import {
  ChecksChart,
  ExposureStream,
  StatTile,
  StaleAssessment,
  TargetingMix,
  VariantBreakdown,
} from "../flag-usage-ui";

const dateFmt = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

export default async function FlagPage({
  params,
}: {
  params: Promise<{ org: string; key: string }>;
}) {
  const { org: slug, key } = await params;
  const org = await resolveOrg(slug);
  if (!org) notFound();
  const [flag, segments, usage, samples, emitsExposures] = await Promise.all([
    getFlag(org.id, key),
    listSegments(org.id),
    flagUsageDetail(org.id, key),
    recentExposureSamples(org.id, key),
    orgEmitsExposures(org.id),
  ]);
  if (!flag) notFound();

  const now = new Date();
  const assessment = assessFlag(flag, {
    now,
    // Staleness uses real app access (exposures), not billed evaluations.
    lastCheckedAt: usage.exposedLastAt ? new Date(usage.exposedLastAt) : null,
    orgEmitsExposures: emitsExposures,
  });
  const perHour = checksPerHour(usage.series, now);
  const rate = passRate(usage.byVariant, flag.type as FlagType);
  const daily = dailyBuckets(usage.series, now, 30);

  return (
    <div>
      <p className="text-xs uppercase tracking-[0.2em] text-teal-400/80">
        Feature flag
      </p>
      {/* The key is the heading: it is the identity, it cannot change, and it
        is what the code that reads this flag says. A name is shown underneath
        only once someone has given the flag one that differs. */}
      <h1 className="mt-3 font-mono text-2xl font-semibold text-zinc-100">
        {flag.key}
      </h1>
      <div className="mt-2 flex items-center gap-2">
        {flag.name !== flag.key ? (
          <span className="text-sm text-zinc-400">{flag.name}</span>
        ) : null}
        <span className="rounded-full border border-white/10 bg-white/4 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-zinc-400">
          {flag.type === "object" ? "JSON" : flag.type}
        </span>
      </div>
      {/* Keyed on updatedAt so a successful save re-seeds the editor from what
        was actually stored. The editor holds a draft in local state, and React
        resets a form once its action resolves - which put the DOM and React's
        state out of step without re-rendering to reconcile them, so the
        default-outcome select showed the pre-save value until a manual
        refresh. `updateFlag` stamps updatedAt on every write, so the key
        changes exactly when the server data does: saves remount with fresh
        values, and a rejected save leaves the draft untouched. */}
      <FlagDefinitionEditor
        key={flag.updatedAt.toISOString()}
        action={saveFlagDefinitionAction.bind(null, slug, key)}
        flag={{
          ...flag,
          variants: flag.variants as Variant[],
          rules: flag.rules as TargetingRule[],
        }}
        segments={segments.map(({ key: segmentKey, name }) => ({
          key: segmentKey,
          name,
        }))}
      />
      {/* Usage: the "events view" for this flag. Everything but the sampled
          stream comes from the exposure rollups; a flag with no exposures shows
          honest empty states rather than a faked line. */}
      <section className="mt-12">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-lg font-semibold text-zinc-100">Usage</h2>
          <p className="text-xs text-zinc-500">
            Created {dateFmt.format(flag.createdAt)} · Last modified{" "}
            {dateFmt.format(flag.updatedAt)}
          </p>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile
            label="Checks (30d)"
            value={formatQuantity(usage.totalChecks)}
          />
          <StatTile
            label="Checks / hr"
            value={
              perHour >= 1
                ? formatQuantity(Math.round(perHour))
                : perHour > 0
                  ? perHour.toFixed(2)
                  : "0"
            }
          />
          <StatTile
            label="Pass rate"
            value={rate === null ? "n/a" : `${Math.round(rate * 100)}%`}
            sub={rate === null ? "boolean flags only" : undefined}
          />
          <StatTile
            label="Last checked"
            value={
              usage.lastCheckedAt
                ? dateFmt.format(new Date(usage.lastCheckedAt))
                : "Never"
            }
          />
        </div>

        <div className="mt-4 border border-white/10 bg-white/2 p-5">
          <h3 className="text-sm font-semibold text-zinc-100">
            Checks over time
          </h3>
          <p className="mt-0.5 text-xs text-zinc-500">Daily, last 30 days.</p>
          <div className="mt-4">
            <ChecksChart daily={daily} />
          </div>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="border border-white/10 bg-white/2 p-5">
            <h3 className="text-sm font-semibold text-zinc-100">
              Variant distribution
            </h3>
            <div className="mt-4">
              <VariantBreakdown byVariant={usage.byVariant} />
            </div>
          </div>
          <div className="border border-white/10 bg-white/2 p-5">
            <h3 className="text-sm font-semibold text-zinc-100">
              How it was served
            </h3>
            <div className="mt-4">
              <TargetingMix byReason={usage.byReason} />
            </div>
          </div>
        </div>

        <div className="mt-4 border border-white/10 bg-white/2 p-5">
          <h3 className="text-sm font-semibold text-zinc-100">Staleness</h3>
          <div className="mt-3">
            <StaleAssessment assessment={assessment} />
          </div>
        </div>

        <div className="mt-4 border border-white/10 bg-white/2 p-5">
          <h3 className="text-sm font-semibold text-zinc-100">Recent checks</h3>
          <p className="mt-0.5 text-xs text-zinc-500">
            A sampled diagnostic stream. Identities are hashed, never stored.
          </p>
          <div className="mt-3">
            <ExposureStream samples={samples} />
          </div>
        </div>
      </section>

      <section className="mt-12 border border-red-500/20 bg-red-500/2.5 p-5">
        <div className="flex items-center justify-between gap-6">
          <div>
            <h2 className="text-sm font-semibold text-red-300">Danger zone</h2>
            <p className="mt-1 text-sm text-zinc-500">
              Permanently delete this flag, all of its rules, and its rollout
              configuration.
            </p>
          </div>
          <DeleteFlagModal
            flagKey={key}
            action={deleteFlagAction.bind(null, slug, key)}
          />
        </div>
      </section>
    </div>
  );
}
