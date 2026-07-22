import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, Flag } from "lucide-react";
import { notFound } from "next/navigation";
import { appPath, marketingHref } from "@/lib/urls";
import { listFlags } from "@/lib/flags.server";
import {
  listClientTokens,
  serializeClientToken,
} from "@/lib/client-tokens.server";
import { flagUsageSummary, orgEmitsExposures } from "@/lib/flag-usage.server";
import {
  assessFlag,
  checksPerHour,
  passRate,
  recentBuckets,
} from "@/lib/flag-metrics";
import type { FlagType } from "@/lib/flags";
import { resolveOrg } from "../resolve-org";
import { createFlagAction } from "./actions";
import { CreateFlagModal } from "./create-flag-modal";
import { CredentialsPanel } from "./credentials-panel";
import { Sparkline, StatusPill, UsageCell } from "./flag-usage-ui";
export const metadata: Metadata = { title: "Feature Flags" };
export default async function FlagsPage({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  const { org: slug } = await params;
  const org = await resolveOrg(slug);
  if (!org) notFound();
  const [unsortedFlags, clientTokens, usage, emitsExposures] =
    await Promise.all([
      listFlags(org.id),
      listClientTokens(org.id),
      flagUsageSummary(org.id),
      orgEmitsExposures(org.id),
    ]);
  // Ordered by key, not by last-modified: toggling a flag stamps updatedAt, and
  // an updatedAt sort would make the row someone just clicked jump the list.
  const flags = [...unsortedFlags].sort((a, b) => a.key.localeCompare(b.key));
  const now = new Date();
  return (
    <div>
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-teal-400/80">
            {org.name}
          </p>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight text-zinc-100">
            Feature Flags
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            Typed organization-wide decisions, evaluated through standard OFREP.
          </p>
        </div>
        <CreateFlagModal action={createFlagAction.bind(null, slug)} />
      </div>
      {flags.length ? (
        <div className="mt-8 border border-white/10">
          {/* Column header, so the trailing cells read as intentional columns
              rather than as metrics floating at the end of each row. Widths
              match the row cells below exactly. */}
          <div className="flex items-center gap-4 border-b border-white/10 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
            <span className="h-4 w-4 shrink-0" />
            <span className="min-w-0 flex-1">Flag</span>
            <span className="hidden w-24 shrink-0 sm:block">Status</span>
            <span className="hidden w-28 shrink-0 text-right md:block">
              Usage
            </span>
            <span className="hidden w-20 shrink-0 text-right lg:block">
              24h
            </span>
          </div>
          <ul className="divide-y divide-white/5">
            {flags.map((flag) => {
              // Per-flag usage from the exposure rollups (absent = no data yet).
              const flagUsage = usage.get(flag.key);
              const assessment = assessFlag(flag, {
                now,
                // Staleness is about real APP access (exposures), not billed
                // evaluations: a flag served in every bulk fetch is not "used".
                lastCheckedAt: flagUsage?.exposedLastAt
                  ? new Date(flagUsage.exposedLastAt)
                  : null,
                orgEmitsExposures: emitsExposures,
              });
              const perHour = flagUsage
                ? checksPerHour(flagUsage.series, now)
                : 0;
              const rate = flagUsage
                ? passRate(flagUsage.byVariant, flag.type as FlagType)
                : null;
              const buckets = flagUsage
                ? recentBuckets(flagUsage.series, now, 24)
                : [];
              return (
                <li
                  key={flag.id}
                  className="flex min-h-15 items-center gap-4 px-4 py-3"
                >
                  <Flag className="h-4 w-4 shrink-0 text-zinc-500" />
                  <Link
                    href={appPath(`/${slug}/flags/${flag.key}`)}
                    className="min-w-0 flex-1"
                  >
                    {/* The KEY leads, because it is what the code says and what
                    someone scanning for a flag they just wrote actually
                    remembers. A flag created without a rename is named after
                    its key, so the name is shown only when it says something
                    the key does not. */}
                    <p className="truncate font-mono text-sm font-medium text-zinc-100">
                      {flag.key}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-zinc-500">
                      {flag.name !== flag.key ? `${flag.name} · ` : ""}
                      {flag.type} · {flag.rules.length} ordered rules
                    </p>
                  </Link>

                  {/* Status: the reliable, universal signal, so it leads the
                    usage cluster. */}
                  <div className="hidden w-24 shrink-0 sm:block">
                    <StatusPill assessment={assessment} />
                  </div>

                  {/* Checks + pass rate, always two lines so the column stays
                    aligned whether a flag has traffic or not. */}
                  <div className="hidden w-28 shrink-0 md:block">
                    <UsageCell perHour={perHour} rate={rate} />
                  </div>

                  {/* The sparkline: real hourly checks over a baseline. Never a
                    line drawn from uniform bulk data. */}
                  <div className="hidden w-20 shrink-0 items-center justify-end lg:flex">
                    <Sparkline buckets={buckets} />
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <div className="mt-8 border border-dashed border-white/10 py-12 text-center text-sm text-zinc-600">
          No flags yet.
        </div>
      )}
      <CredentialsPanel
        orgSlug={slug}
        clientTokens={clientTokens.map(serializeClientToken)}
      />
      {/* A nudge toward the docs rather than a bare endpoint. Wiring up an SDK
          is a docs-length task - providers, evaluation context, caching modes -
          not something a single URL on this page gets anyone through, and the
          guide already carries the endpoint alongside the rest. */}
      <section className="mt-10 border-t border-white/10 pt-8">
        <div className="flex flex-wrap items-start justify-between gap-4 border border-white/10 bg-white/2 p-6">
          <div className="max-w-xl">
            <h2 className="text-lg font-semibold text-zinc-100">
              Evaluate with OpenFeature
            </h2>
            <p className="mt-1 text-sm leading-6 text-zinc-500">
              Flagon speaks OFREP, so any OpenFeature SDK evaluates these flags
              with no vendor lock-in. The guide walks through the server and
              client providers, evaluation context, and caching.
            </p>
          </div>
          <a
            href={marketingHref("/docs/feature-flags")}
            target="_blank"
            rel="noreferrer"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-teal-500/40 px-3.5 py-2 text-sm font-medium text-teal-300 transition hover:border-teal-500/60 hover:text-teal-200"
          >
            Integration guide
            <ArrowUpRight className="h-4 w-4" aria-hidden />
          </a>
        </div>
      </section>
    </div>
  );
}
